/**
 * Person detection hook using MediaPipe ObjectDetector.
 * Detects people in video frames and tracks them with unique IDs.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

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
};

/**
 * Calculate centroid of a bounding box.
 */
const getCentroid = (box) => ({
  x: box.originX + box.width / 2,
  y: box.originY + box.height / 2,
});

/**
 * Calculate Euclidean distance between two points.
 */
const getDistance = (p1, p2) =>
  Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);

/**
 * Generate a unique track ID.
 */
const generateTrackId = () =>
  `trk_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`;

/**
 * Hook for person detection using MediaPipe.
 * @param {object} options - Configuration options
 * @param {React.RefObject<HTMLVideoElement>} options.videoRef - Ref to video element
 * @param {number} options.confidenceThreshold - Minimum confidence for detection
 * @param {number} options.detectionIntervalMs - Milliseconds between detections
 * @returns {object} Detection state and controls
 */
export function usePersonDetection({
  videoRef,
  confidenceThreshold = PERSON_CONFIDENCE_THRESHOLD,
  detectionIntervalMs = DETECTION_INTERVAL_MS,
} = {}) {
  const detectorRef = useRef(null);
  const tracksRef = useRef(new Map());
  const animationFrameRef = useRef(null);
  const lastDetectionTimeRef = useRef(0);

  const [state, setState] = useState(DetectionState.IDLE);
  const [error, setError] = useState(null);
  const [detections, setDetections] = useState([]);
  const [trackCount, setTrackCount] = useState(0);
  const [fps, setFps] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const fpsCounterRef = useRef({ frames: 0, lastTime: Date.now() });

  /**
   * Load MediaPipe ObjectDetector model.
   */
  const loadModel = useCallback(async () => {
    if (detectorRef.current) return true;

    setState(DetectionState.LOADING);
    setError(null);

    try {
      const vision = await import('@mediapipe/tasks-vision');
      const { ObjectDetector, FilesetResolver } = vision;

      const wasmFileset = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
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
    } catch (err) {
      console.error('Failed to load MediaPipe model:', err);
      setError(err);
      setState(DetectionState.ERROR);
      return false;
    }
  }, [confidenceThreshold]);

  /**
   * Match current detections to existing tracks using centroid distance.
   */
  const updateTracks = useCallback(
    (rawDetections, _timestamp) => {
      const videoElement = videoRef?.current;
      if (!videoElement) return [];

      const tracks = tracksRef.current;
      const currentTime = Date.now();
      const matchedTrackIds = new Set();
      const results = [];

      for (const detection of rawDetections) {
        const centroid = getCentroid(detection.boundingBox);
        let bestMatch = null;
        let bestDistance = Infinity;

        for (const [trackId, track] of tracks.entries()) {
          if (matchedTrackIds.has(trackId)) continue;

          const distance = getDistance(centroid, track.lastCentroid);
          if (distance < bestDistance && distance < TRACK_DISTANCE_THRESHOLD) {
            bestMatch = trackId;
            bestDistance = distance;
          }
        }

        let trackId;
        let firstSeen;
        if (bestMatch) {
          trackId = bestMatch;
          firstSeen = tracks.get(trackId).firstSeen;
          matchedTrackIds.add(trackId);
        } else {
          trackId = generateTrackId();
          firstSeen = currentTime;
        }

        const trackData = {
          trackId,
          firstSeen,
          lastSeen: currentTime,
          lastCentroid: centroid,
          bbox: {
            x: (detection.boundingBox.originX / videoElement.videoWidth) * 100,
            y: (detection.boundingBox.originY / videoElement.videoHeight) * 100,
            w: (detection.boundingBox.width / videoElement.videoWidth) * 100,
            h: (detection.boundingBox.height / videoElement.videoHeight) * 100,
          },
          confidence: detection.categories[0]?.score || 0,
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
    [videoRef]
  );

  /**
   * Run detection on current video frame.
   */
  const detectFrame = useCallback(
    (timestamp) => {
      const videoElement = videoRef?.current;
      if (!detectorRef.current || !videoElement || videoElement.paused || videoElement.readyState < 2) {
        return [];
      }

      const now = performance.now();
      if (now - lastDetectionTimeRef.current < detectionIntervalMs) {
        return detections;
      }
      lastDetectionTimeRef.current = now;

      try {
        const results = detectorRef.current.detectForVideo(
          videoElement,
          timestamp
        );
        const trackedDetections = updateTracks(results.detections, timestamp);
        setDetections(trackedDetections);

        // Update FPS counter
        fpsCounterRef.current.frames++;
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
    [videoRef, detectionIntervalMs, detections, updateTracks]
  );

  /**
   * Start continuous detection loop.
   */
  const startDetection = useCallback(async () => {
    const videoElement = videoRef?.current;
    if (!videoElement) {
      setError(new Error('No video element provided'));
      return false;
    }

    const modelLoaded = await loadModel();
    if (!modelLoaded) return false;

    setIsRunning(true);
    setState(DetectionState.RUNNING);
    tracksRef.current.clear();
    fpsCounterRef.current = { frames: 0, lastTime: Date.now() };

    const loop = (timestamp) => {
      detectFrame(timestamp);
      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);
    return true;
  }, [videoRef, loadModel, detectFrame]);

  /**
   * Stop detection loop.
   */
  const stopDetection = useCallback(() => {
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
  const reset = useCallback(() => {
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

  useEffect(() => {
    const videoElement = videoRef?.current;
    if (isRunning && videoElement && !videoElement.paused) {
      const loop = (timestamp) => {
        detectFrame(timestamp);
        animationFrameRef.current = requestAnimationFrame(loop);
      };
      animationFrameRef.current = requestAnimationFrame(loop);

      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
    }
  }, [isRunning, videoRef, detectFrame]);

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
