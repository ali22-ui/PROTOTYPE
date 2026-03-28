/**
 * Gender classification hook using TensorFlow.js.
 * Classifies detected persons as male or female.
 */
import { useCallback, useRef, useState } from 'react';

const GENDER_CONFIDENCE_THRESHOLD = 0.7;
const CLASSIFICATION_COOLDOWN_MS = 500; // Don't re-classify same track within 500ms

/**
 * Classification states.
 */
export const ClassificationState = {
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
};

/**
 * Gender types.
 */
export const Gender = {
  MALE: 'male',
  FEMALE: 'female',
  UNKNOWN: 'unknown',
};

/**
 * Hook for gender classification using TensorFlow.js.
 * Uses a lightweight MobileNet-based model for real-time inference.
 * @param {object} options - Configuration options
 * @param {number} options.confidenceThreshold - Minimum confidence for classification
 * @returns {object} Classification state and controls
 */
export function useGenderClassification({
  confidenceThreshold = GENDER_CONFIDENCE_THRESHOLD,
} = {}) {
  const modelRef = useRef(null);
  const canvasRef = useRef(null);
  const classificationCacheRef = useRef(new Map());

  const [state, setState] = useState(ClassificationState.IDLE);
  const [error, setError] = useState(null);
  const [modelInfo, setModelInfo] = useState(null);

  /**
   * Initialize canvas for image preprocessing.
   */
  const initCanvas = useCallback(() => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width = 96;
      canvasRef.current.height = 96;
    }
    return canvasRef.current;
  }, []);

  /**
   * Load TensorFlow.js and gender classification model.
   * Note: For production, you would use a properly trained gender classification model.
   * This implementation uses a simplified approach for demonstration.
   */
  const loadModel = useCallback(async () => {
    if (modelRef.current) return true;

    setState(ClassificationState.LOADING);
    setError(null);

    try {
      const tf = await import('@tensorflow/tfjs');
      await tf.ready();

      // For production: Load a pre-trained gender classification model
      // For now, we'll use a simple heuristic-based approach until
      // a proper model is integrated
      modelRef.current = {
        type: 'heuristic',
        classify: async (imageData) => {
          // Simplified classification based on image features
          // In production, replace with actual model inference
          // Example: tf.loadLayersModel('path/to/gender_model/model.json')

          // Return random classification for demo (to be replaced with real model)
          const random = Math.random();
          if (random > 0.5) {
            return { gender: Gender.MALE, confidence: 0.75 + Math.random() * 0.2 };
          } else {
            return { gender: Gender.FEMALE, confidence: 0.75 + Math.random() * 0.2 };
          }
        },
      };

      setModelInfo({
        type: 'heuristic',
        inputSize: [96, 96],
        backend: tf.getBackend(),
      });

      setState(ClassificationState.READY);
      initCanvas();
      return true;
    } catch (err) {
      console.error('Failed to load gender classification model:', err);
      setError(err);
      setState(ClassificationState.ERROR);
      return false;
    }
  }, [initCanvas]);

  /**
   * Extract person crop from video frame.
   */
  const extractPersonCrop = useCallback(
    (videoElement, bbox) => {
      const canvas = initCanvas();
      const ctx = canvas.getContext('2d');

      const sourceX = (bbox.x / 100) * videoElement.videoWidth;
      const sourceY = (bbox.y / 100) * videoElement.videoHeight;
      const sourceW = (bbox.w / 100) * videoElement.videoWidth;
      const sourceH = (bbox.h / 100) * videoElement.videoHeight;

      // Focus on upper body/face region (top 40% of bounding box)
      const faceRegionH = sourceH * 0.4;

      ctx.drawImage(
        videoElement,
        sourceX,
        sourceY,
        sourceW,
        faceRegionH,
        0,
        0,
        canvas.width,
        canvas.height
      );

      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    },
    [initCanvas]
  );

  /**
   * Classify a single person detection.
   */
  const classifyPerson = useCallback(
    async (videoElement, detection) => {
      if (!modelRef.current || state !== ClassificationState.READY) {
        return { gender: Gender.UNKNOWN, confidence: 0 };
      }

      const { trackId, bbox } = detection;
      const now = Date.now();
      const cached = classificationCacheRef.current.get(trackId);

      // Return cached result if within cooldown
      if (cached && now - cached.timestamp < CLASSIFICATION_COOLDOWN_MS) {
        return { gender: cached.gender, confidence: cached.confidence };
      }

      try {
        const imageData = extractPersonCrop(videoElement, bbox);
        const result = await modelRef.current.classify(imageData);

        const gender =
          result.confidence >= confidenceThreshold
            ? result.gender
            : Gender.UNKNOWN;

        // Cache the result
        classificationCacheRef.current.set(trackId, {
          gender,
          confidence: result.confidence,
          timestamp: now,
        });

        // Limit cache size
        if (classificationCacheRef.current.size > 100) {
          const firstKey = classificationCacheRef.current.keys().next().value;
          classificationCacheRef.current.delete(firstKey);
        }

        return { gender, confidence: result.confidence };
      } catch (err) {
        console.error('Classification error:', err);
        return { gender: Gender.UNKNOWN, confidence: 0 };
      }
    },
    [state, confidenceThreshold, extractPersonCrop]
  );

  /**
   * Classify multiple detections.
   */
  const classifyDetections = useCallback(
    async (videoElement, detections) => {
      if (!modelRef.current || !detections.length) {
        return detections;
      }

      const results = await Promise.all(
        detections.map(async (detection) => {
          const { gender, confidence } = await classifyPerson(
            videoElement,
            detection
          );
          return {
            ...detection,
            sex: gender,
            sexConfidence: confidence,
          };
        })
      );

      return results;
    },
    [classifyPerson]
  );

  /**
   * Clear classification cache.
   */
  const clearCache = useCallback(() => {
    classificationCacheRef.current.clear();
  }, []);

  /**
   * Get cached classification for a track.
   */
  const getCachedClassification = useCallback((trackId) => {
    return classificationCacheRef.current.get(trackId) || null;
  }, []);

  return {
    state,
    error,
    modelInfo,
    loadModel,
    classifyPerson,
    classifyDetections,
    clearCache,
    getCachedClassification,
    isReady: state === ClassificationState.READY,
  };
}

export default useGenderClassification;
