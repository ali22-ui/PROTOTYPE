/**
 * Deduplication hook that orchestrates all layers of person re-identification.
 * Combines geometric tracking, appearance matching, and face embedding for
 * accurate unique person counting.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createKalmanFilter,
  predict,
  update,
  getPosition,
  getSpeed,
} from './kalman-filter';
import {
  calculateIOU,
  nonMaxSuppression,
} from './iou-utils';
import {
  extractAppearanceFeatures,
  computeAppearanceSimilarity,
  updateRollingAverage,
} from './appearance-features';
import { useFaceEmbedding } from './use-face-embedding';
import { useIdentityRegistry, ReIdMethod } from './use-identity-registry';

/**
 * Track status enum.
 */
export const TrackStatus = {
  ACTIVE: 'active',
  DORMANT: 'dormant',
  LOST: 'lost',
};

/**
 * Default configuration.
 */
const DEFAULT_CONFIG = {
  // Geometric tracking
  baseDistanceThreshold: 100,    // Base distance threshold in pixels
  adaptiveThresholdScale: true,  // Scale threshold based on bbox size
  maxVelocityAdjustment: 50,     // Max additional distance based on velocity

  // Track memory
  dormantTimeMs: 30000,          // Time before active -> dormant (30s)
  lostTimeMs: 60000,             // Time before dormant -> lost (60s)
  maxDormantTracks: 50,          // Max dormant tracks to keep

  // Appearance matching
  enableAppearance: true,        // Enable appearance-based re-ID
  appearanceThreshold: 0.65,     // Minimum similarity for appearance match
  appearanceUpdateInterval: 5,   // Update appearance every N frames

  // Face embedding
  enableFaceEmbedding: true,     // Enable face-based re-ID
  faceExtractionInterval: 10,    // Extract face every N frames

  // IOU filtering
  iouDuplicateThreshold: 0.5,    // IOU threshold for duplicate detection

  // Performance
  maxTracksPerFrame: 20,         // Max tracks to process per frame
};

/**
 * Enhanced track data structure.
 */
function createEnhancedTrack(trackId, detection, options = {}) {
  const now = Date.now();
  const centroid = {
    x: detection.boundingBox.originX + detection.boundingBox.width / 2,
    y: detection.boundingBox.originY + detection.boundingBox.height / 2,
  };

  return {
    trackId,
    personId: null,              // Linked identity (set after registration)
    firstSeen: now,
    lastSeen: now,
    frameCount: 1,

    // Position tracking
    centroid,
    bbox: { ...detection.boundingBox },
    bboxPercent: options.bboxPercent || null,
    kalmanFilter: createKalmanFilter(centroid),

    // Appearance features
    appearance: null,
    appearanceUpdateCount: 0,

    // Face embedding
    faceEmbedding: null,
    faceExtractionCount: 0,

    // Detection confidence
    confidence: detection.categories?.[0]?.score || 0,

    // Classification
    gender: options.gender || 'unknown',
    genderConfidence: options.genderConfidence || 0,

    // Status
    status: TrackStatus.ACTIVE,
    missedFrames: 0,

    // Re-identification info
    reIdMethod: ReIdMethod.NONE,
    reIdConfidence: 0,
  };
}

/**
 * Hook for deduplicated person tracking.
 */
export function useDeduplication(options = {}) {
  const config = useMemo(() => ({ ...DEFAULT_CONFIG, ...options }), [options]);

  // Track storage
  const tracksRef = useRef(new Map());     // trackId -> EnhancedTrack
  const frameCountRef = useRef(0);
  const canvasRef = useRef(null);

  // Sub-hooks
  const faceEmbedding = useFaceEmbedding({
    minConfidence: 0.5,
    matchThreshold: 0.6,
  });

  const identityRegistry = useIdentityRegistry({
    dormantExpiryMs: config.dormantTimeMs,
    appearanceMatchThreshold: config.appearanceThreshold,
  });

  // State
  const [stats, setStats] = useState({
    totalTracks: 0,
    activeTracks: 0,
    dormantTracks: 0,
    uniquePersons: 0,
    reIdRate: 0,
    avgProcessingTime: 0,
  });

  const [isInitialized, setIsInitialized] = useState(false);

  /**
   * Initialize the deduplication system.
   */
  const initialize = useCallback(async () => {
    if (isInitialized) return true;

    try {
      // Load face embedding models if enabled
      if (config.enableFaceEmbedding) {
        await faceEmbedding.loadModels();
      }

      setIsInitialized(true);
      return true;
    } catch (err) {
      console.error('Failed to initialize deduplication:', err);
      return false;
    }
  }, [config.enableFaceEmbedding, faceEmbedding, isInitialized]);

  /**
   * Calculate adaptive distance threshold based on bounding box size and velocity.
   */
  const getAdaptiveThreshold = useCallback((track) => {
    let threshold = config.baseDistanceThreshold;

    if (config.adaptiveThresholdScale && track.bbox) {
      // Scale based on bounding box diagonal
      const diagonal = Math.sqrt(
        track.bbox.width * track.bbox.width +
        track.bbox.height * track.bbox.height
      );
      const scaleFactor = diagonal / 200; // Normalize to typical person size
      threshold *= Math.max(0.5, Math.min(2.0, scaleFactor));
    }

    // Add velocity-based adjustment
    if (track.kalmanFilter) {
      const speed = getSpeed(track.kalmanFilter);
      const velocityAdjust = Math.min(speed * 0.1, config.maxVelocityAdjustment);
      threshold += velocityAdjust;
    }

    return threshold;
  }, [config]);

  /**
   * Find best matching track for a detection using geometric matching.
   */
  const findGeometricMatch = useCallback((detection, activeTracks) => {
    const detectionCentroid = {
      x: detection.boundingBox.originX + detection.boundingBox.width / 2,
      y: detection.boundingBox.originY + detection.boundingBox.height / 2,
    };

    let bestMatch = null;
    let bestScore = 0;

    for (const track of activeTracks) {
      if (track.status === TrackStatus.LOST) continue;

      // Predict position using Kalman filter
      const predictedFilter = predict(track.kalmanFilter);
      const predictedPos = getPosition(predictedFilter);

      // Calculate distance to predicted position
      const dx = detectionCentroid.x - predictedPos.x;
      const dy = detectionCentroid.y - predictedPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Get adaptive threshold for this track
      const threshold = getAdaptiveThreshold(track);

      if (distance < threshold) {
        // Also consider IOU for better matching
        const iou = calculateIOU(detection.boundingBox, track.bbox);

        // Combined score: prioritize closer matches with higher IOU
        const distanceScore = 1 - (distance / threshold);
        const score = distanceScore * 0.6 + iou * 0.4;

        if (score > bestScore) {
          bestMatch = track;
          bestScore = score;
        }
      }
    }

    return bestMatch ? { track: bestMatch, score: bestScore } : null;
  }, [getAdaptiveThreshold]);

  /**
   * Find matching dormant track using appearance and face features.
   */
  const findDormantMatch = useCallback((detection, dormantTracks, features) => {
    let bestMatch = null;
    let bestScore = 0;
    let bestMethod = ReIdMethod.NONE;

    for (const track of dormantTracks) {
      // Try face embedding first (highest accuracy)
      if (config.enableFaceEmbedding && features.faceEmbedding && track.faceEmbedding) {
        const distance = faceEmbedding.euclideanDistance(
          features.faceEmbedding,
          track.faceEmbedding
        );
        if (distance < 0.6) {
          const score = 1 - (distance / 0.6);
          if (score > bestScore) {
            bestMatch = track;
            bestScore = score;
            bestMethod = ReIdMethod.FACE;
          }
        }
      }

      // Try appearance matching
      if (config.enableAppearance && features.appearance && track.appearance) {
        const similarity = computeAppearanceSimilarity(
          features.appearance,
          track.appearance
        );
        if (similarity >= config.appearanceThreshold && similarity > bestScore) {
          bestMatch = track;
          bestScore = similarity;
          bestMethod = ReIdMethod.APPEARANCE;
        }
      }
    }

    return bestMatch ? { track: bestMatch, score: bestScore, method: bestMethod } : null;
  }, [config, faceEmbedding]);

  /**
   * Process detections for a single frame.
   * @param {Array} rawDetections - Raw detections from MediaPipe
   * @param {HTMLVideoElement} videoElement - Video element for feature extraction
   * @returns {Array} Processed detections with tracking info
   */
  const processFrame = useCallback(async (rawDetections, videoElement) => {
    const startTime = performance.now();
    const now = Date.now();
    frameCountRef.current++;

    const tracks = tracksRef.current;
    const matchedTrackIds = new Set();
    const results = [];

    // Remove duplicates using NMS
    const filteredDetections = nonMaxSuppression(rawDetections, config.iouDuplicateThreshold);

    // Get active and dormant tracks
    const activeTracks = Array.from(tracks.values())
      .filter(t => t.status === TrackStatus.ACTIVE);
    const dormantTracks = Array.from(tracks.values())
      .filter(t => t.status === TrackStatus.DORMANT);

    // Setup canvas for feature extraction
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    const canvas = canvasRef.current;
    if (videoElement) {
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoElement, 0, 0);
    }

    // Process each detection
    for (const detection of filteredDetections) {
      const centroid = {
        x: detection.boundingBox.originX + detection.boundingBox.width / 2,
        y: detection.boundingBox.originY + detection.boundingBox.height / 2,
      };

      // Convert bbox to percentage for storage
      const bboxPercent = videoElement ? {
        x: (detection.boundingBox.originX / videoElement.videoWidth) * 100,
        y: (detection.boundingBox.originY / videoElement.videoHeight) * 100,
        w: (detection.boundingBox.width / videoElement.videoWidth) * 100,
        h: (detection.boundingBox.height / videoElement.videoHeight) * 100,
      } : null;

      // Try to match with active tracks (geometric)
      let matched = false;
      const geometricMatch = findGeometricMatch(
        detection,
        activeTracks.filter(t => !matchedTrackIds.has(t.trackId))
      );

      if (geometricMatch) {
        // Update existing track
        const track = geometricMatch.track;
        matchedTrackIds.add(track.trackId);

        // Update Kalman filter
        track.kalmanFilter = update(predict(track.kalmanFilter), centroid);
        track.centroid = centroid;
        track.bbox = { ...detection.boundingBox };
        track.bboxPercent = bboxPercent;
        track.lastSeen = now;
        track.frameCount++;
        track.missedFrames = 0;
        track.confidence = detection.categories?.[0]?.score || track.confidence;
        track.status = TrackStatus.ACTIVE;

        // Update appearance periodically
        if (config.enableAppearance &&
          track.frameCount % config.appearanceUpdateInterval === 0 &&
          videoElement) {
          const newAppearance = extractAppearanceFeatures(canvas, {
            x: detection.boundingBox.originX,
            y: detection.boundingBox.originY,
            w: detection.boundingBox.width,
            h: detection.boundingBox.height,
          });
          if (newAppearance) {
            track.appearance = updateRollingAverage(track.appearance, newAppearance, 0.3);
            track.appearanceUpdateCount++;
          }
        }

        // Extract face embedding periodically
        if (config.enableFaceEmbedding &&
          faceEmbedding.isReady &&
          track.frameCount % config.faceExtractionInterval === 0 &&
          bboxPercent) {
          const faceData = await faceEmbedding.extractFaceEmbedding(
            videoElement,
            bboxPercent,
            track.trackId
          );
          if (faceData) {
            track.faceEmbedding = faceData.embedding;
            track.faceExtractionCount++;
          }
        }

        results.push({
          ...track,
          dwellSeconds: Math.floor((now - track.firstSeen) / 1000),
        });
        matched = true;
      }

      if (!matched) {
        // Try to match with dormant tracks
        let reIdentified = false;

        // Extract features for matching
        const features = {
          appearance: config.enableAppearance && videoElement ?
            extractAppearanceFeatures(canvas, {
              x: detection.boundingBox.originX,
              y: detection.boundingBox.originY,
              w: detection.boundingBox.width,
              h: detection.boundingBox.height,
            }) : null,
          faceEmbedding: null,
        };

        // Try face extraction for new detections
        if (config.enableFaceEmbedding && faceEmbedding.isReady && bboxPercent) {
          const faceData = await faceEmbedding.extractFaceEmbedding(
            videoElement,
            bboxPercent,
            `temp_${now}`
          );
          if (faceData) {
            features.faceEmbedding = faceData.embedding;
          }
        }

        const dormantMatch = findDormantMatch(detection, dormantTracks, features);

        if (dormantMatch) {
          // Re-identify: reactivate dormant track
          const track = dormantMatch.track;
          matchedTrackIds.add(track.trackId);

          track.kalmanFilter = createKalmanFilter(centroid);
          track.centroid = centroid;
          track.bbox = { ...detection.boundingBox };
          track.bboxPercent = bboxPercent;
          track.lastSeen = now;
          track.frameCount++;
          track.missedFrames = 0;
          track.status = TrackStatus.ACTIVE;
          track.reIdMethod = dormantMatch.method;
          track.reIdConfidence = dormantMatch.score;

          if (features.appearance) {
            track.appearance = updateRollingAverage(track.appearance, features.appearance, 0.3);
          }
          if (features.faceEmbedding) {
            track.faceEmbedding = features.faceEmbedding;
          }

          results.push({
            ...track,
            dwellSeconds: Math.floor((now - track.firstSeen) / 1000),
          });
          reIdentified = true;
        }

        if (!reIdentified) {
          // Create new track
          const trackId = `trk_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`;
          const newTrack = createEnhancedTrack(trackId, detection, {
            bboxPercent,
          });

          if (features.appearance) {
            newTrack.appearance = features.appearance;
          }
          if (features.faceEmbedding) {
            newTrack.faceEmbedding = features.faceEmbedding;
          }

          tracks.set(trackId, newTrack);

          // Register with identity registry
          const regResult = identityRegistry.registerDetection({
            trackId,
            bbox: bboxPercent,
            centroid,
            appearance: newTrack.appearance,
            faceEmbedding: newTrack.faceEmbedding,
          }, {
            computeAppearanceSimilarity,
            euclideanDistance: faceEmbedding.euclideanDistance,
          });

          newTrack.personId = regResult.identity.personId;

          results.push({
            ...newTrack,
            dwellSeconds: 0,
          });
        }
      }
    }

    // Update unmatched tracks
    const activeTrackIds = new Set(results.map(r => r.trackId));
    for (const track of tracks.values()) {
      if (!activeTrackIds.has(track.trackId)) {
        track.missedFrames++;

        if (track.status === TrackStatus.ACTIVE) {
          if (track.missedFrames * 150 > config.dormantTimeMs) { // Assuming ~150ms per frame
            track.status = TrackStatus.DORMANT;
          }
        } else if (track.status === TrackStatus.DORMANT) {
          if (now - track.lastSeen > config.lostTimeMs) {
            track.status = TrackStatus.LOST;
          }
        }
      }
    }

    // Update identity registry
    identityRegistry.updateDormantTracks(activeTrackIds);

    // Clean up lost tracks
    for (const [trackId, track] of tracks.entries()) {
      if (track.status === TrackStatus.LOST && now - track.lastSeen > config.lostTimeMs) {
        tracks.delete(trackId);
      }
    }

    // Enforce max dormant tracks
    const dormant = Array.from(tracks.values())
      .filter(t => t.status === TrackStatus.DORMANT)
      .sort((a, b) => a.lastSeen - b.lastSeen);

    while (dormant.length > config.maxDormantTracks) {
      const oldest = dormant.shift();
      if (oldest) {
        tracks.delete(oldest.trackId);
      }
    }

    // Update stats
    const processingTime = performance.now() - startTime;
    setStats(prev => ({
      totalTracks: tracks.size,
      activeTracks: results.length,
      dormantTracks: Array.from(tracks.values()).filter(t => t.status === TrackStatus.DORMANT).length,
      uniquePersons: identityRegistry.getUniqueCount(),
      reIdRate: identityRegistry.stats.reIdSuccessRate,
      avgProcessingTime: (prev.avgProcessingTime * 0.9) + (processingTime * 0.1),
    }));

    return results;
  }, [config, faceEmbedding, identityRegistry, findGeometricMatch, findDormantMatch]);

  /**
   * Get all active detections with deduplication info.
   */
  const getActiveDetections = useCallback(() => {
    return Array.from(tracksRef.current.values())
      .filter(t => t.status === TrackStatus.ACTIVE)
      .map(t => ({
        ...t,
        dwellSeconds: Math.floor((Date.now() - t.firstSeen) / 1000),
      }));
  }, []);

  /**
   * Reset all tracking state.
   */
  const reset = useCallback(() => {
    tracksRef.current.clear();
    frameCountRef.current = 0;
    identityRegistry.clear();
    faceEmbedding.clearCache();
    setStats({
      totalTracks: 0,
      activeTracks: 0,
      dormantTracks: 0,
      uniquePersons: 0,
      reIdRate: 0,
      avgProcessingTime: 0,
    });
  }, [identityRegistry, faceEmbedding]);

  /**
   * Cleanup on unmount.
   */
  useEffect(() => {
    const tracks = tracksRef.current;
    return () => {
      tracks.clear();
      if (canvasRef.current) {
        canvasRef.current = null;
      }
    };
  }, []);

  return {
    // State
    stats,
    isInitialized,
    identityStats: identityRegistry.stats,
    faceEmbeddingState: faceEmbedding.state,
    faceModelProgress: faceEmbedding.modelLoadProgress,

    // Actions
    initialize,
    processFrame,
    reset,
    getActiveDetections,

    // Identity access
    getIdentity: identityRegistry.getIdentity,
    getIdentityByTrackId: identityRegistry.getIdentityByTrackId,
    getAllIdentities: identityRegistry.getAllIdentities,
    getUniqueCount: identityRegistry.getUniqueCount,

    // Configuration
    config,
  };
}

export default useDeduplication;
