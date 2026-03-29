/**
 * Identity Registry hook for managing unique person identities.
 * Handles track-to-identity mapping, identity merging, and statistics.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type {
  BBoxPercent,
  IdentityRegistryStats,
  Point,
  ReIdByMethod,
} from '../types';
import type { AppearanceFeatures } from './appearance-features';

/**
 * Identity status enum.
 */
export const IdentityStatus = {
  ACTIVE: 'active', // Currently visible
  DORMANT: 'dormant', // Not visible but may return
  EXITED: 'exited', // Left the scene
} as const;

export type IdentityStatusValue = (typeof IdentityStatus)[keyof typeof IdentityStatus];

/**
 * Re-identification method enum.
 */
export const ReIdMethod = {
  NONE: 'none',
  GEOMETRIC: 'geometric',
  APPEARANCE: 'appearance',
  FACE: 'face',
} as const;

export type ReIdMethodValue = (typeof ReIdMethod)[keyof typeof ReIdMethod];

/**
 * Generate a unique person ID.
 */
const generatePersonId = (): string =>
  `pid_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 8)}`;

/**
 * Default configuration for identity registry.
 */
const DEFAULT_CONFIG = {
  maxIdentities: 500, // Maximum identities to store
  dormantExpiryMs: 30000, // 30 seconds before dormant -> exited
  exitedRetentionMs: 60000, // Keep exited identities for 1 minute
  minConfidenceForMerge: 0.7, // Minimum confidence to merge identities
  appearanceMatchThreshold: 0.65, // Threshold for appearance-based matching
  faceMatchThreshold: 0.6, // Threshold for face-based matching (distance)
};

export interface IdentityRegistryOptions {
  maxIdentities?: number;
  dormantExpiryMs?: number;
  exitedRetentionMs?: number;
  minConfidenceForMerge?: number;
  appearanceMatchThreshold?: number;
  faceMatchThreshold?: number;
}

export interface IdentityDemographics {
  gender: string;
  genderConfidence: number;
}

export interface IdentityMatchHistory {
  trackId: string;
  method: ReIdMethodValue;
  confidence: number;
  timestamp: number;
}

export interface PersonIdentity {
  personId: string;
  trackIds: string[];
  firstSeen: number;
  lastSeen: number;
  totalDwellMs: number;
  activeStartTime: number | null;
  demographics: IdentityDemographics;
  appearance: AppearanceFeatures | null;
  faceEmbedding: number[] | null;
  lastBbox: BBoxPercent | null;
  lastCentroid: Point | null;
  status: IdentityStatusValue;
  reIdMethod: ReIdMethodValue;
  reIdConfidence: number;
  reIdCount: number;
  matchHistory: IdentityMatchHistory[];
}

export interface DetectionRegistrationInput {
  trackId: string;
  bbox?: BBoxPercent | null;
  centroid?: Point | null;
  appearance?: AppearanceFeatures | null;
  faceEmbedding?: number[] | null;
  gender?: string;
  genderConfidence?: number;
}

export interface IdentityMatcherFns {
  computeAppearanceSimilarity?: (
    features1: AppearanceFeatures,
    features2: AppearanceFeatures,
  ) => number;
  euclideanDistance?: (emb1: number[], emb2: number[]) => number;
}

/**
 * Create a new person identity.
 */
function createPersonIdentity(
  trackId: string,
  options: {
    bbox?: BBoxPercent | null;
    centroid?: Point | null;
    appearance?: AppearanceFeatures | null;
    faceEmbedding?: number[] | null;
    gender?: string;
    genderConfidence?: number;
  } = {},
): PersonIdentity {
  const now = Date.now();
  return {
    personId: generatePersonId(),
    trackIds: [trackId],
    firstSeen: now,
    lastSeen: now,
    totalDwellMs: 0,
    activeStartTime: now,

    // Demographics
    demographics: {
      gender: options.gender || 'unknown',
      genderConfidence: options.genderConfidence || 0,
    },

    // Features for matching
    appearance: options.appearance || null,
    faceEmbedding: options.faceEmbedding || null,

    // Last known position
    lastBbox: options.bbox || null,
    lastCentroid: options.centroid || null,

    // Status tracking
    status: IdentityStatus.ACTIVE,
    reIdMethod: ReIdMethod.NONE,
    reIdConfidence: 0,
    reIdCount: 0, // Number of times re-identified

    // Match history for debugging
    matchHistory: [],
  };
}

/**
 * Hook for managing person identities.
 */
export function useIdentityRegistry(options: IdentityRegistryOptions = {}) {
  const config = useMemo(() => ({ ...DEFAULT_CONFIG, ...options }), [options]);

  // Main identity store: Map<personId, PersonIdentity>
  const identitiesRef = useRef<Map<string, PersonIdentity>>(new Map());

  // Track to identity mapping: Map<trackId, personId>
  const trackToIdentityRef = useRef<Map<string, string>>(new Map());

  // Statistics
  const [stats, setStats] = useState<IdentityRegistryStats>({
    totalUniquePersons: 0,
    activeCount: 0,
    dormantCount: 0,
    exitedCount: 0,
    reIdSuccessRate: 0,
    avgDwellSeconds: 0,
    reIdentificationCount: 0,
    reIdByMethod: {
      face: 0,
      appearance: 0,
      geometric: 0,
    },
  });

  /**
   * Update statistics based on current state.
   */
  const updateStats = useCallback((): void => {
    const identities = identitiesRef.current;
    let active = 0;
    let dormant = 0;
    let exited = 0;
    let totalDwell = 0;
    let reIdCount = 0;
    let totalIdentities = 0;

    const reIdByMethod: ReIdByMethod = {
      face: 0,
      appearance: 0,
      geometric: 0,
    };

    for (const identity of identities.values()) {
      totalIdentities += 1;
      totalDwell += identity.totalDwellMs;
      reIdCount += identity.reIdCount;

      for (const match of identity.matchHistory) {
        if (match.method === ReIdMethod.FACE) reIdByMethod.face += 1;
        else if (match.method === ReIdMethod.APPEARANCE) reIdByMethod.appearance += 1;
        else if (match.method === ReIdMethod.GEOMETRIC) reIdByMethod.geometric += 1;
      }

      switch (identity.status) {
        case IdentityStatus.ACTIVE:
          active += 1;
          break;
        case IdentityStatus.DORMANT:
          dormant += 1;
          break;
        case IdentityStatus.EXITED:
          exited += 1;
          break;
        default:
          break;
      }
    }

    setStats({
      totalUniquePersons: totalIdentities,
      activeCount: active,
      dormantCount: dormant,
      exitedCount: exited,
      reIdSuccessRate: totalIdentities > 0 ? reIdCount / totalIdentities : 0,
      avgDwellSeconds: totalIdentities > 0 ? Math.floor(totalDwell / totalIdentities / 1000) : 0,
      reIdentificationCount: reIdCount,
      reIdByMethod,
    });
  }, []);

  /**
   * Find best matching identity for a detection using all available features.
   * @param detection - Detection with bbox, appearance, faceEmbedding
   * @param matchers - Matching functions {computeAppearanceSimilarity, euclideanDistance}
   * @returns Best match {identity, method, confidence} or null
   */
  const findMatchingIdentity = useCallback(
    (
      detection: {
        centroid?: Point | null;
        appearance?: AppearanceFeatures | null;
        faceEmbedding?: number[] | null;
      },
      matchers: IdentityMatcherFns = {},
    ): { identity: PersonIdentity; method: ReIdMethodValue; confidence: number } | null => {
      const { computeAppearanceSimilarity, euclideanDistance } = matchers;
      const identities = identitiesRef.current;

      let bestMatch: PersonIdentity | null = null;
      let bestConfidence = 0;
      let bestMethod: ReIdMethodValue = ReIdMethod.NONE;

      // Only search dormant identities (active ones should already be linked via trackId)
      const dormantIdentities = Array.from(identities.values())
        .filter((id) => id.status === IdentityStatus.DORMANT);

      for (const identity of dormantIdentities) {
        let matchConfidence = 0;
        let method: ReIdMethodValue = ReIdMethod.NONE;

        // Priority 1: Face embedding (highest accuracy)
        if (detection.faceEmbedding && identity.faceEmbedding && euclideanDistance) {
          const distance = euclideanDistance(detection.faceEmbedding, identity.faceEmbedding);
          if (distance < config.faceMatchThreshold) {
            matchConfidence = 1 - distance / config.faceMatchThreshold;
            method = ReIdMethod.FACE;
          }
        }

        // Priority 2: Appearance matching (if face didn't match or wasn't available)
        if (
          method === ReIdMethod.NONE
          && detection.appearance
          && identity.appearance
          && computeAppearanceSimilarity
        ) {
          const similarity = computeAppearanceSimilarity(
            detection.appearance,
            identity.appearance,
          );
          if (similarity >= config.appearanceMatchThreshold) {
            matchConfidence = similarity;
            method = ReIdMethod.APPEARANCE;
          }
        }

        // Priority 3: Geometric (position-based, lower confidence)
        if (method === ReIdMethod.NONE && detection.centroid && identity.lastCentroid) {
          const dx = detection.centroid.x - identity.lastCentroid.x;
          const dy = detection.centroid.y - identity.lastCentroid.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          // Allow larger distance for dormant tracks (they may have moved)
          const maxDistance = 200; // pixels
          if (distance < maxDistance) {
            matchConfidence = (1 - distance / maxDistance) * 0.5; // Cap at 0.5 for geometric
            method = ReIdMethod.GEOMETRIC;
          }
        }

        // Update best match if this is better
        if (
          matchConfidence > bestConfidence
          && matchConfidence >= config.minConfidenceForMerge
        ) {
          bestMatch = identity;
          bestConfidence = matchConfidence;
          bestMethod = method;
        }
      }

      return bestMatch
        ? { identity: bestMatch, method: bestMethod, confidence: bestConfidence }
        : null;
    },
    [config],
  );

  /**
   * Register a new detection or update existing identity.
   * @param detection - Detection data
   * @param matchers - Matching functions
   * @returns { identity, isNew, reIdentified, method, confidence }
   */
  const registerDetection = useCallback(
    (
      detection: DetectionRegistrationInput,
      matchers: IdentityMatcherFns = {},
    ): {
      identity: PersonIdentity;
      isNew: boolean;
      reIdentified: boolean;
      method: ReIdMethodValue;
      confidence: number;
    } => {
      const {
        trackId,
        bbox,
        centroid,
        appearance,
        faceEmbedding,
        gender,
        genderConfidence,
      } = detection;
      const now = Date.now();

      // Check if this track is already linked to an identity
      const existingPersonId = trackToIdentityRef.current.get(trackId);
      if (existingPersonId) {
        const identity = identitiesRef.current.get(existingPersonId);
        if (identity) {
          // Update existing identity
          identity.lastSeen = now;
          identity.lastBbox = bbox || null;
          identity.lastCentroid = centroid || null;
          identity.status = IdentityStatus.ACTIVE;

          // Update dwell time
          if (identity.activeStartTime) {
            identity.totalDwellMs += now - identity.activeStartTime;
          }
          identity.activeStartTime = now;

          // Update appearance features (rolling average would be ideal)
          if (appearance) {
            identity.appearance = appearance;
          }
          if (faceEmbedding) {
            identity.faceEmbedding = faceEmbedding;
          }

          // Update demographics if better confidence
          if (gender && (genderConfidence ?? 0) > (identity.demographics.genderConfidence || 0)) {
            identity.demographics.gender = gender;
            identity.demographics.genderConfidence = genderConfidence ?? 0;
          }

          updateStats();
          return {
            identity,
            isNew: false,
            reIdentified: false,
            method: ReIdMethod.NONE,
            confidence: 1,
          };
        }
      }

      // Try to match with dormant identities
      const match = findMatchingIdentity(
        { centroid, appearance, faceEmbedding },
        matchers,
      );

      if (match) {
        // Re-identify: Link this track to existing identity
        const identity = match.identity;

        identity.trackIds.push(trackId);
        identity.lastSeen = now;
        identity.lastBbox = bbox || null;
        identity.lastCentroid = centroid || null;
        identity.status = IdentityStatus.ACTIVE;
        identity.reIdMethod = match.method;
        identity.reIdConfidence = match.confidence;
        identity.reIdCount += 1;
        identity.activeStartTime = now;

        // Update features
        if (appearance) identity.appearance = appearance;
        if (faceEmbedding) identity.faceEmbedding = faceEmbedding;

        // Add to match history
        identity.matchHistory.push({
          trackId,
          method: match.method,
          confidence: match.confidence,
          timestamp: now,
        });

        // Link track to identity
        trackToIdentityRef.current.set(trackId, identity.personId);

        updateStats();
        return {
          identity,
          isNew: false,
          reIdentified: true,
          method: match.method,
          confidence: match.confidence,
        };
      }

      // Create new identity
      const newIdentity = createPersonIdentity(trackId, {
        bbox,
        centroid,
        appearance,
        faceEmbedding,
        gender,
        genderConfidence,
      });

      identitiesRef.current.set(newIdentity.personId, newIdentity);
      trackToIdentityRef.current.set(trackId, newIdentity.personId);

      // Enforce max identities limit (remove oldest exited)
      if (identitiesRef.current.size > config.maxIdentities) {
        const sortedByLastSeen = Array.from(identitiesRef.current.entries())
          .filter(([, id]) => id.status === IdentityStatus.EXITED)
          .sort((a, b) => a[1].lastSeen - b[1].lastSeen);

        if (sortedByLastSeen.length > 0) {
          const [oldestId] = sortedByLastSeen[0];
          const oldIdentity = identitiesRef.current.get(oldestId);
          if (oldIdentity) {
            for (const tid of oldIdentity.trackIds) {
              trackToIdentityRef.current.delete(tid);
            }
          }
          identitiesRef.current.delete(oldestId);
        }
      }

      updateStats();
      return {
        identity: newIdentity,
        isNew: true,
        reIdentified: false,
        method: ReIdMethod.NONE,
        confidence: 1,
      };
    },
    [config.maxIdentities, findMatchingIdentity, updateStats],
  );

  /**
   * Mark tracks as dormant that haven't been seen recently.
   * @param activeTrackIds - Set of currently active track IDs
   */
  const updateDormantTracks = useCallback(
    (activeTrackIds: Set<string>): void => {
      const now = Date.now();
      const identities = identitiesRef.current;

      for (const identity of identities.values()) {
        // Check if any of this identity's tracks are active
        const hasActiveTracks = identity.trackIds.some((tid) => activeTrackIds.has(tid));

        if (hasActiveTracks) {
          if (identity.status !== IdentityStatus.ACTIVE) {
            identity.status = IdentityStatus.ACTIVE;
            identity.activeStartTime = now;
          }
        } else if (identity.status === IdentityStatus.ACTIVE) {
          // No active tracks, mark as dormant
          identity.status = IdentityStatus.DORMANT;
          if (identity.activeStartTime) {
            identity.totalDwellMs += now - identity.activeStartTime;
            identity.activeStartTime = null;
          }
        } else if (identity.status === IdentityStatus.DORMANT) {
          // Check if dormant for too long
          if (now - identity.lastSeen > config.dormantExpiryMs) {
            identity.status = IdentityStatus.EXITED;
          }
        } else if (identity.status === IdentityStatus.EXITED) {
          // Check if should be removed
          if (now - identity.lastSeen > config.exitedRetentionMs) {
            // Remove from registry
            for (const tid of identity.trackIds) {
              trackToIdentityRef.current.delete(tid);
            }
            identities.delete(identity.personId);
          }
        }
      }

      updateStats();
    },
    [config.dormantExpiryMs, config.exitedRetentionMs, updateStats],
  );

  /**
   * Get identity by person ID.
   */
  const getIdentity = useCallback((personId: string): PersonIdentity | null => {
    return identitiesRef.current.get(personId) || null;
  }, []);

  /**
   * Get identity by track ID.
   */
  const getIdentityByTrackId = useCallback((trackId: string): PersonIdentity | null => {
    const personId = trackToIdentityRef.current.get(trackId);
    return personId ? identitiesRef.current.get(personId) || null : null;
  }, []);

  /**
   * Get all active identities.
   */
  const getActiveIdentities = useCallback((): PersonIdentity[] => {
    return Array.from(identitiesRef.current.values())
      .filter((id) => id.status === IdentityStatus.ACTIVE);
  }, []);

  /**
   * Get all identities.
   */
  const getAllIdentities = useCallback((): PersonIdentity[] => {
    return Array.from(identitiesRef.current.values());
  }, []);

  /**
   * Merge two identities (when confirmed to be the same person).
   */
  const mergeIdentities = useCallback((keepPersonId: string, mergePersonId: string): boolean => {
    const keepIdentity = identitiesRef.current.get(keepPersonId);
    const mergeIdentity = identitiesRef.current.get(mergePersonId);

    if (!keepIdentity || !mergeIdentity) {
      return false;
    }

    // Merge track IDs
    keepIdentity.trackIds.push(...mergeIdentity.trackIds);

    // Update timestamps
    keepIdentity.firstSeen = Math.min(keepIdentity.firstSeen, mergeIdentity.firstSeen);
    keepIdentity.lastSeen = Math.max(keepIdentity.lastSeen, mergeIdentity.lastSeen);
    keepIdentity.totalDwellMs += mergeIdentity.totalDwellMs;

    // Keep better features
    if (mergeIdentity.faceEmbedding && !keepIdentity.faceEmbedding) {
      keepIdentity.faceEmbedding = mergeIdentity.faceEmbedding;
    }

    // Update track mappings
    for (const tid of mergeIdentity.trackIds) {
      trackToIdentityRef.current.set(tid, keepPersonId);
    }

    // Remove merged identity
    identitiesRef.current.delete(mergePersonId);

    updateStats();
    return true;
  }, [updateStats]);

  /**
   * Clear all identities.
   */
  const clear = useCallback((): void => {
    identitiesRef.current.clear();
    trackToIdentityRef.current.clear();
    updateStats();
  }, [updateStats]);

  /**
   * Get unique person count.
   */
  const getUniqueCount = useCallback((): number => {
    return identitiesRef.current.size;
  }, []);

  return {
    // State
    stats,

    // Registration
    registerDetection,
    updateDormantTracks,

    // Queries
    getIdentity,
    getIdentityByTrackId,
    getActiveIdentities,
    getAllIdentities,
    getUniqueCount,

    // Management
    mergeIdentities,
    clear,

    // Config
    config,
  };
}

export default useIdentityRegistry;
