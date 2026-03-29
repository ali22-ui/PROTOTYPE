/**
 * Person detection hook using MediaPipe ObjectDetector.
 * Detects people in video frames and tracks them with unique IDs.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type {
  BBoxPercent,
  PersonTrackDetection,
  Point,
  RawPersonDetection,
} from '../types';

const DETECTION_INTERVAL_MS = 150; // ~6-7 FPS
const PERSON_CONFIDENCE_THRESHOLD = 0.6;
const TRACK_DISTANCE_THRESHOLD = 100; // pixels for centroid matching
const TRACK_EXPIRY_MS = 2000; // remove tracks not seen for 2 seconds

/**
 * Detection states.
 */
export const DetectionState = {
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  RUNNING: 'running',
  ERROR: 'error',
} as const;

export type DetectionStateValue = (typeof DetectionState)[keyof typeof DetectionState];

export interface TrackedDetection extends PersonTrackDetection {
  lastCentroid: Point;
  bbox: BBoxPercent;
}

export interface UsePersonDetectionOptions {
  videoRef?: RefObject<HTMLVideoElement | null>;
  confidenceThreshold?: number;
  detectionIntervalMs?: number;
}

interface DetectorResult {
  detections: RawPersonDetection[];
}

interface ObjectDetectorLike {
  detectForVideo(videoElement: HTMLVideoElement, timestampMs: number): DetectorResult;
}

interface VisionModule {
  ObjectDetector: {
    createFromOptions(wasmFileset: unknown, options: unknown): Promise<ObjectDetectorLike>;
  };
  FilesetResolver: {
    forVisionTasks(url: string): Promise<unknown>;
  };
}

/**
 * Calculate centroid of a bounding box.
 */
const getCentroid = (box: RawPersonDetection['boundingBox']): Point => ({
  x: box.originX + box.width / 2,
  y: box.originY + box.height / 2,
});

/**
 * Calculate Euclidean distance between two points.
 */
const getDistance = (p1: Point, p2: Point): number =>
  Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);

/**
 * Generate a unique track ID.
 */
const generateTrackId = (): string =>
  `trk_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`;

/**
 * Hook for person detection using MediaPipe.
 * @param options - Configuration options
 * @param options.videoRef - Ref to video element
 * @param options.confidenceThreshold - Minimum confidence for detection
 * @param options.detectionIntervalMs - Milliseconds between detections
 * @returns Detection state and controls
 */
export function usePersonDetection({
  videoRef,
  confidenceThreshold = PERSON_CONFIDENCE_THRESHOLD,
  detectionIntervalMs = DETECTION_INTERVAL_MS,
}: UsePersonDetectionOptions = {}) {
  const detectorRef = useRef<ObjectDetectorLike | null>(null);
  const tracksRef = useRef<Map<string, TrackedDetection>>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const lastDetectionTimeRef = useRef(0);
  const lastTimestampRef = useRef(0); // Track last timestamp to ensure monotonic increase

  const [state, setState] = useState<DetectionStateValue>(DetectionState.IDLE);
  const [error, setError] = useState<Error | null>(null);
  const [detections, setDetections] = useState<TrackedDetection[]>([]);
  const [trackCount, setTrackCount] = useState(0);
  const [fps, setFps] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const fpsCounterRef = useRef({ frames: 0, lastTime: Date.now() });

  /**
   * Load MediaPipe ObjectDetector model.
   */
  const loadModel = useCallback(async (): Promise<boolean> => {
    if (detectorRef.current) return true;

    setState(DetectionState.LOADING);
    setError(null);

    try {
      const vision = (await import('@mediapipe/tasks-vision')) as unknown as VisionModule;
      const { ObjectDetector, FilesetResolver } = vision;

      const wasmFileset = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
      );

      detectorRef.current = await ObjectDetector.createFromOptions(wasmFileset, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite',
          delegate: 'GPU',
        },
        scoreThreshold: confidenceThreshold,
        categoryAllowlist: ['person'],
        runningMode: 'VIDEO',
      });

      setState(DetectionState.READY);
      return true;
    } catch (err: unknown) {
      console.error('Failed to load MediaPipe model:', err);
      setError(err instanceof Error ? err : new Error('Failed to load MediaPipe model'));
      setState(DetectionState.ERROR);
      return false;
    }
  }, [confidenceThreshold]);

  /**
   * Match current detections to existing tracks using centroid distance.
   */
  const updateTracks = useCallback(
    (rawDetections: RawPersonDetection[], _timestamp: number): TrackedDetection[] => {
      const videoElement = videoRef?.current;
      if (!videoElement) return [];

      const tracks = tracksRef.current;
      const currentTime = Date.now();
      const matchedTrackIds = new Set<string>();
      const results: TrackedDetection[] = [];

      for (const detection of rawDetections) {
        const centroid = getCentroid(detection.boundingBox);
        let bestMatch: string | null = null;
        let bestDistance = Number.POSITIVE_INFINITY;

        for (const [trackId, track] of tracks.entries()) {
          if (matchedTrackIds.has(trackId)) continue;

          const distance = getDistance(centroid, track.lastCentroid);
          if (distance < bestDistance && distance < TRACK_DISTANCE_THRESHOLD) {
            bestMatch = trackId;
            bestDistance = distance;
          }
        }

        let trackId: string;
        let firstSeen: number;
        if (bestMatch) {
          trackId = bestMatch;
          firstSeen = tracks.get(trackId)?.firstSeen ?? currentTime;
          matchedTrackIds.add(trackId);
        } else {
          trackId = generateTrackId();
          firstSeen = currentTime;
        }

        const safeVideoWidth = videoElement.videoWidth || 1;
        const safeVideoHeight = videoElement.videoHeight || 1;

        const trackData: TrackedDetection = {
          trackId,
          firstSeen,
          lastSeen: currentTime,
          lastCentroid: centroid,
          bbox: {
            x: (detection.boundingBox.originX / safeVideoWidth) * 100,
            y: (detection.boundingBox.originY / safeVideoHeight) * 100,
            w: (detection.boundingBox.width / safeVideoWidth) * 100,
            h: (detection.boundingBox.height / safeVideoHeight) * 100,
          },
          confidence: detection.categories?.[0]?.score || 0,
          dwellSeconds: Math.floor((currentTime - firstSeen) / 1000),
        };

        tracks.set(trackId, trackData);
        results.push(trackData);
      }

      // Remove expired tracks
      for (const [trackId, track] of tracks.entries()) {
        if (currentTime - track.lastSeen > TRACK_EXPIRY_MS) {
          tracks.delete(trackId);
        }
      }

      setTrackCount(tracks.size);
      return results;
    },
    [videoRef],
  );

  /**
   * Run detection on current video frame.
   */
  const detectFrame = useCallback(
    (_timestamp?: number): TrackedDetection[] => {
      const videoElement = videoRef?.current;
      if (
        !detectorRef.current
        || !videoElement
        || videoElement.paused
        || videoElement.readyState < 2
      ) {
        return [];
      }

      const now = performance.now();
      if (now - lastDetectionTimeRef.current < detectionIntervalMs) {
        return detections;
      }
      lastDetectionTimeRef.current = now;

      // Ensure strictly monotonically increasing timestamps for MediaPipe
      // MediaPipe requires timestamps to always increase; using performance.now()
      // and ensuring it's always greater than the last used timestamp
      const safeTimestamp = Math.max(Math.floor(now), lastTimestampRef.current + 1);
      lastTimestampRef.current = safeTimestamp;

      try {
        const results = detectorRef.current.detectForVideo(
          videoElement,
          safeTimestamp,
        );
        const trackedDetections = updateTracks(results.detections, safeTimestamp);
        setDetections(trackedDetections);

        // Update FPS counter
        fpsCounterRef.current.frames += 1;
        const fpsNow = Date.now();
        if (fpsNow - fpsCounterRef.current.lastTime >= 1000) {
          setFps(fpsCounterRef.current.frames);
          fpsCounterRef.current.frames = 0;
          fpsCounterRef.current.lastTime = fpsNow;
        }

        return trackedDetections;
      } catch (err) {
        console.error('Detection error:', err);
        return [];
      }
    },
    [videoRef, detectionIntervalMs, detections, updateTracks],
  );

  /**
   * Start continuous detection loop.
   */
  const startDetection = useCallback(async (): Promise<boolean> => {
    const videoElement = videoRef?.current;
    if (!videoElement) {
      setError(new Error('No video element provided'));
      return false;
    }

    // Cancel any existing animation frame to prevent duplicates
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const modelLoaded = await loadModel();
    if (!modelLoaded) return false;

    setIsRunning(true);
    setState(DetectionState.RUNNING);
    tracksRef.current.clear();
    fpsCounterRef.current = { frames: 0, lastTime: Date.now() };
    lastTimestampRef.current = 0; // Reset timestamp tracker

    const loop = (): void => {
      detectFrame();
      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);
    return true;
  }, [videoRef, loadModel, detectFrame]);

  /**
   * Stop detection loop.
   */
  const stopDetection = useCallback((): void => {
    setIsRunning(false);
    setState(DetectionState.READY);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  /**
   * Reset detection state.
   */
  const reset = useCallback((): void => {
    stopDetection();
    tracksRef.current.clear();
    setDetections([]);
    setTrackCount(0);
    setFps(0);
  }, [stopDetection]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Cleanup on unmount or when detection stops
  useEffect(() => {
    if (!isRunning && animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, [isRunning]);

  return {
    state,
    error,
    detections,
    trackCount,
    fps,
    isRunning,
    loadModel,
    startDetection,
    stopDetection,
    reset,
    detectFrame,
  };
}

export default usePersonDetection;
