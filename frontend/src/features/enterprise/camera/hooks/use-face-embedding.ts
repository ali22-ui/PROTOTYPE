/**
 * Face embedding hook using face-api.js for high-accuracy person re-identification.
 * Extracts 128-D face descriptors that can be used to match faces across frames.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BBoxPercent } from '../types';
import { FACE_API_MODEL_BASE_URL } from '../constants/model-assets';

/**
 * Face embedding state enum.
 */
export const FaceEmbeddingState = {
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
} as const;

export type FaceEmbeddingStateValue = (typeof FaceEmbeddingState)[keyof typeof FaceEmbeddingState];

/**
 * Default configuration for face embedding.
 */
const DEFAULT_CONFIG = {
  minConfidence: 0.5, // Minimum face detection confidence
  minFaceSize: 50, // Minimum face size in pixels
  matchThreshold: 0.6, // Euclidean distance threshold for matching (lower = stricter)
  inputSize: 320, // TinyFaceDetector input size (128, 160, 224, 320, 416, 512, 608)
  scoreThreshold: 0.5, // TinyFaceDetector score threshold
  extractionCooldownMs: 200, // Minimum time between extractions for same track
};

const MODEL_RETRY_COOLDOWN_MS = 10000;

/**
 * Local URLs for face-api.js models.
 */
const MODEL_URLS = {
  base: FACE_API_MODEL_BASE_URL,
};

const toFaceModelLoadError = (err: unknown): Error => {
  const fallback = err instanceof Error ? err : new Error('Failed to load face model');
  const rawMessage = fallback.message || '';

  if (/WebAssembly\.instantiate|Content Security policy directive|unsafe-eval/i.test(rawMessage)) {
    return new Error(
      'Face model runtime blocked by Content Security Policy. Allow wasm runtime in script-src (wasm-unsafe-eval, and unsafe-eval for compatibility).',
    );
  }

  return fallback;
};

export interface UseFaceEmbeddingOptions {
  minConfidence?: number;
  minFaceSize?: number;
  matchThreshold?: number;
  inputSize?: number;
  scoreThreshold?: number;
  extractionCooldownMs?: number;
}

export interface FaceData {
  embedding: number[];
  confidence: number;
  landmarks: Array<{ x: number; y: number }>;
  bbox: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  timestamp: number;
}

interface CachedFaceData extends FaceData {}

interface StoredEmbedding {
  personId: string;
  embedding: number[];
}

type FaceApiModule = {
  nets: {
    tinyFaceDetector: { loadFromUri(uri: string): Promise<void> };
    faceLandmark68TinyNet: { loadFromUri(uri: string): Promise<void> };
    faceRecognitionNet: { loadFromUri(uri: string): Promise<void> };
  };
  TinyFaceDetectorOptions: new (options: {
    inputSize: number;
    scoreThreshold: number;
  }) => unknown;
  detectSingleFace(
    input: HTMLCanvasElement,
    options: unknown,
  ): {
    withFaceLandmarks(useTiny?: boolean): {
      withFaceDescriptor(): Promise<{
        detection: {
          score: number;
          box: { x: number; y: number; width: number; height: number };
        };
        descriptor: Float32Array;
        landmarks?: {
          positions?: Array<{ x: number; y: number }>;
        };
      } | null>;
    };
  };
};

/**
 * Hook for face embedding extraction and matching.
 * Uses face-api.js TinyFaceDetector and FaceRecognitionNet for 128-D embeddings.
 *
 * @param options - Configuration options
 * @returns Face embedding state and methods
 */
export function useFaceEmbedding(options: UseFaceEmbeddingOptions = {}) {
  const config = useMemo(() => ({ ...DEFAULT_CONFIG, ...options }), [options]);

  const faceapiRef = useRef<FaceApiModule | null>(null);
  const embeddingCacheRef = useRef<Map<string, CachedFaceData>>(new Map()); // trackId -> { embedding, timestamp, confidence }
  const extractionTimesRef = useRef<Map<string, number>>(new Map()); // trackId -> lastExtractionTime
  const modelLoadPromiseRef = useRef<Promise<boolean> | null>(null);
  const lastModelFailureAtRef = useRef(0);

  const [state, setState] = useState<FaceEmbeddingStateValue>(FaceEmbeddingState.IDLE);
  const [error, setError] = useState<Error | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [modelLoadProgress, setModelLoadProgress] = useState(0);

  /**
   * Load face-api.js library and models.
   */
  const loadModels = useCallback(async (): Promise<boolean> => {
    if (faceapiRef.current) {
      return true;
    }

    if (modelLoadPromiseRef.current) {
      return modelLoadPromiseRef.current;
    }

    const elapsedSinceFailure = Date.now() - lastModelFailureAtRef.current;
    if (
      lastModelFailureAtRef.current > 0
      && elapsedSinceFailure < MODEL_RETRY_COOLDOWN_MS
    ) {
      const retrySeconds = Math.ceil((MODEL_RETRY_COOLDOWN_MS - elapsedSinceFailure) / 1000);
      setError(new Error(`Face model initialization is cooling down after a failure. Retry in ${retrySeconds}s.`));
      setState(FaceEmbeddingState.ERROR);
      return false;
    }

    setState(FaceEmbeddingState.LOADING);
    setError(null);
    setModelLoadProgress(0);

    const pendingLoad = (async (): Promise<boolean> => {
      try {
        // Dynamically import face-api.js
        const faceapi = (await import('@vladmandic/face-api')) as unknown as FaceApiModule;
        faceapiRef.current = faceapi;
        setModelLoadProgress(10);

        // Load TinyFaceDetector model (fast, lightweight face detection)
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URLS.base);
        setModelLoadProgress(40);

        // Load face landmark model (required for face recognition)
        await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URLS.base);
        setModelLoadProgress(70);

        // Load face recognition model (produces 128-D embeddings)
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URLS.base);
        setModelLoadProgress(100);

        lastModelFailureAtRef.current = 0;
        setState(FaceEmbeddingState.READY);
        setIsReady(true);
        return true;
      } catch (err: unknown) {
        const modelError = toFaceModelLoadError(err);
        lastModelFailureAtRef.current = Date.now();
        console.error('Failed to load face-api.js models:', modelError);
        setError(modelError);
        setState(FaceEmbeddingState.ERROR);
        return false;
      } finally {
        modelLoadPromiseRef.current = null;
      }
    })();

    modelLoadPromiseRef.current = pendingLoad;
    return pendingLoad;
  }, []);

  /**
   * Extract face embedding from a video element within a bounding box region.
   * @param videoElement - Video element to extract from
   * @param bbox - Person bounding box {x, y, w, h} in percentage
   * @param trackId - Track ID for caching
   * @returns Face data {embedding, confidence, landmarks} or null
   */
  const extractFaceEmbedding = useCallback(
    async (
      videoElement: HTMLVideoElement,
      bbox: BBoxPercent,
      trackId: string,
    ): Promise<FaceData | null> => {
      const faceapi = faceapiRef.current;
      if (!faceapi || !videoElement || !bbox) {
        return null;
      }

      // Check extraction cooldown
      const lastExtraction = extractionTimesRef.current.get(trackId) || 0;
      const now = Date.now();
      if (now - lastExtraction < config.extractionCooldownMs) {
        return embeddingCacheRef.current.get(trackId) || null;
      }
      extractionTimesRef.current.set(trackId, now);

      try {
        // Create a canvas to extract the person region
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return null;
        }

        // Convert percentage bbox to pixels
        const videoWidth = videoElement.videoWidth;
        const videoHeight = videoElement.videoHeight;

        const pixelX = (bbox.x / 100) * videoWidth;
        const pixelY = (bbox.y / 100) * videoHeight;
        const pixelW = (bbox.w / 100) * videoWidth;
        const pixelH = (bbox.h / 100) * videoHeight;

        // Focus on upper body region where face is likely
        const faceRegionY = pixelY;
        const faceRegionH = pixelH * 0.5; // Upper half of bounding box

        canvas.width = pixelW;
        canvas.height = faceRegionH;

        ctx.drawImage(
          videoElement,
          pixelX,
          faceRegionY,
          pixelW,
          faceRegionH,
          0,
          0,
          pixelW,
          faceRegionH,
        );

        // Detect face with landmarks and descriptor
        const detectionOptions = new faceapi.TinyFaceDetectorOptions({
          inputSize: config.inputSize,
          scoreThreshold: config.scoreThreshold,
        });

        const detection = await faceapi
          .detectSingleFace(canvas, detectionOptions)
          .withFaceLandmarks(true) // Use tiny landmarks
          .withFaceDescriptor();

        if (!detection) {
          return null;
        }

        // Check minimum confidence and size
        const faceBox = detection.detection.box;
        if (
          detection.detection.score < config.minConfidence
          || faceBox.width < config.minFaceSize
          || faceBox.height < config.minFaceSize
        ) {
          return null;
        }

        const faceData: FaceData = {
          embedding: Array.from(detection.descriptor), // 128-D Float32Array
          confidence: detection.detection.score,
          landmarks:
            detection.landmarks?.positions?.map((p) => ({ x: p.x, y: p.y })) || [],
          bbox: {
            x: faceBox.x,
            y: faceBox.y,
            w: faceBox.width,
            h: faceBox.height,
          },
          timestamp: now,
        };

        // Cache the embedding
        embeddingCacheRef.current.set(trackId, faceData);

        return faceData;
      } catch (err) {
        console.warn('Face embedding extraction error:', err);
        return null;
      }
    },
    [config],
  );

  /**
   * Calculate Euclidean distance between two embeddings.
   * @param emb1 - First 128-D embedding
   * @param emb2 - Second 128-D embedding
   * @returns Euclidean distance (lower = more similar)
   */
  const euclideanDistance = useCallback((emb1: number[], emb2: number[]): number => {
    if (!emb1 || !emb2 || emb1.length !== emb2.length) {
      return Number.POSITIVE_INFINITY;
    }

    let sum = 0;
    for (let i = 0; i < emb1.length; i++) {
      const diff = emb1[i] - emb2[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }, []);

  /**
   * Match a face embedding against stored embeddings.
   * @param embedding - 128-D embedding to match
   * @param storedEmbeddings - Array of {personId, embedding, ...}
   * @returns Best match {personId, distance, confidence} or null
   */
  const matchEmbedding = useCallback(
    (
      embedding: number[] | null | undefined,
      storedEmbeddings: StoredEmbedding[] | null | undefined,
    ): { personId: string; distance: number; confidence: number } | null => {
      if (!embedding || !storedEmbeddings?.length) {
        return null;
      }

      let bestMatch: { personId: string; distance: number; confidence: number } | null = null;
      let bestDistance = config.matchThreshold;

      for (const stored of storedEmbeddings) {
        const distance = euclideanDistance(embedding, stored.embedding);
        if (distance < bestDistance) {
          bestMatch = {
            personId: stored.personId,
            distance,
            confidence: 1 - distance / config.matchThreshold, // Convert to 0-1 confidence
          };
          bestDistance = distance;
        }
      }

      return bestMatch;
    },
    [config.matchThreshold, euclideanDistance],
  );

  /**
   * Batch extract face embeddings for multiple detections.
   * @param videoElement - Video element
   * @param detections - Array of detections with {trackId, bbox}
   * @returns Map of trackId -> faceData
   */
  const extractBatch = useCallback(
    async (
      videoElement: HTMLVideoElement,
      detections: Array<{ trackId: string; bbox: BBoxPercent }> | null | undefined,
    ): Promise<Map<string, FaceData>> => {
      const results = new Map<string, FaceData>();

      if (!faceapiRef.current || !videoElement || !detections?.length) {
        return results;
      }

      // Process sequentially to avoid overwhelming the browser
      for (const detection of detections) {
        const faceData = await extractFaceEmbedding(
          videoElement,
          detection.bbox,
          detection.trackId,
        );
        if (faceData) {
          results.set(detection.trackId, faceData);
        }
      }

      return results;
    },
    [extractFaceEmbedding],
  );

  /**
   * Get cached embedding for a track.
   * @param trackId - Track ID
   * @returns Cached face data or null
   */
  const getCachedEmbedding = useCallback((trackId: string): FaceData | null => {
    return embeddingCacheRef.current.get(trackId) || null;
  }, []);

  /**
   * Clear cached embedding for a track.
   * @param trackId - Track ID to clear
   */
  const clearCache = useCallback((trackId?: string): void => {
    if (trackId) {
      embeddingCacheRef.current.delete(trackId);
      extractionTimesRef.current.delete(trackId);
    } else {
      embeddingCacheRef.current.clear();
      extractionTimesRef.current.clear();
    }
  }, []);

  /**
   * Get all cached embeddings.
   * @returns Array of {trackId, ...faceData}
   */
  const getAllCachedEmbeddings = useCallback((): Array<{ trackId: string } & FaceData> => {
    return Array.from(embeddingCacheRef.current.entries()).map(([trackId, data]) => ({
      trackId,
      ...data,
    }));
  }, []);

  /**
   * Cleanup on unmount.
   */
  useEffect(() => {
    const embeddingCache = embeddingCacheRef.current;
    const extractionTimes = extractionTimesRef.current;
    return () => {
      embeddingCache.clear();
      extractionTimes.clear();
    };
  }, []);

  return {
    // State
    state,
    error,
    isReady,
    modelLoadProgress,

    // Actions
    loadModels,
    extractFaceEmbedding,
    extractBatch,
    matchEmbedding,
    euclideanDistance,

    // Cache management
    getCachedEmbedding,
    getAllCachedEmbeddings,
    clearCache,

    // Configuration
    config,
  };
}

export default useFaceEmbedding;
