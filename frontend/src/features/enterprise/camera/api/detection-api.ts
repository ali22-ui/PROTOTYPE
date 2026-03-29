/**
 * Detection API client for sending detection events to backend.
 */
import api from '@/lib/api-client';
import type { DetectionBatchEvent } from '../types';
import type { PersonIdentity } from '../hooks/use-identity-registry';

export interface DetectionBatchResponse {
  inserted_count: number;
  updated_count?: number;
  message?: string;
}

export interface VisitorStatisticsRow {
  enterprise_id: string;
  date: string;
  hour: number | null;
  male_total: number;
  female_total: number;
  unknown_total: number;
  unique_visitors: number;
  avg_dwell_seconds: number | null;
}

export interface DeduplicationStatisticsResponse {
  enterprise_id: string;
  date?: string;
  unique_persons?: number;
  reid_count?: number;
  reid_rate?: number;
  [key: string]: unknown;
}

export interface UnifiedDetectionEvent {
  enterprise_id: string;
  camera_id: string;
  person_id: string;
  track_ids: string[];
  first_seen: string;
  last_seen: string;
  total_dwell_seconds: number;
  gender: string;
  gender_confidence: number;
  reid_method: string;
  reid_confidence: number;
  last_bbox_x: number;
  last_bbox_y: number;
  last_bbox_w: number;
  last_bbox_h: number;
}

/**
 * Send a batch of detection events to the backend.
 * @param events - Array of detection event objects
 * @returns Response with inserted count
 */
export async function sendDetectionBatch(
  events: DetectionBatchEvent[],
): Promise<DetectionBatchResponse> {
  if (!events || events.length === 0) {
    return { inserted_count: 0, message: 'No events to send' };
  }

  try {
    const response = await api.post<DetectionBatchResponse>('/detections/batch', { events });
    return response.data;
  } catch (error) {
    console.error('Failed to send detection batch:', error);
    throw error;
  }
}

/**
 * Send a batch of unified (deduplicated) person events to the backend.
 * @param events - Array of unified person event objects
 * @returns Response with inserted/updated counts
 */
export async function sendUnifiedDetectionBatch(
  events: UnifiedDetectionEvent[],
): Promise<DetectionBatchResponse> {
  if (!events || events.length === 0) {
    return {
      inserted_count: 0,
      updated_count: 0,
      message: 'No events to send',
    };
  }

  try {
    const response = await api.post<DetectionBatchResponse>('/detections/unified', { events });
    return response.data;
  } catch (error) {
    console.error('Failed to send unified detection batch:', error);
    throw error;
  }
}

/**
 * Convert identity registry data to unified detection events.
 * @param identities - Array of PersonIdentity objects from the registry
 * @param enterpriseId - Enterprise ID
 * @param cameraId - Camera ID
 * @returns Array of unified detection events for API submission
 */
export function identitiesToUnifiedEvents(
  identities: PersonIdentity[],
  enterpriseId: string,
  cameraId: string,
): UnifiedDetectionEvent[] {
  return identities.map((identity) => ({
    enterprise_id: enterpriseId,
    camera_id: cameraId,
    person_id: identity.personId,
    track_ids: identity.trackIds,
    first_seen: new Date(identity.firstSeen).toISOString(),
    last_seen: new Date(identity.lastSeen).toISOString(),
    total_dwell_seconds: Math.floor(identity.totalDwellMs / 1000),
    gender: identity.demographics?.gender || 'unknown',
    gender_confidence: identity.demographics?.genderConfidence || 0,
    reid_method: identity.reIdMethod || 'none',
    reid_confidence: identity.reIdConfidence || 0,
    last_bbox_x: identity.lastBbox?.x || 0,
    last_bbox_y: identity.lastBbox?.y || 0,
    last_bbox_w: identity.lastBbox?.w || 0,
    last_bbox_h: identity.lastBbox?.h || 0,
  }));
}

/**
 * Get visitor statistics for an enterprise.
 * @param enterpriseId - Enterprise ID
 * @param date - Optional date filter (YYYY-MM-DD)
 * @param hour - Optional hour filter (0-23)
 * @returns Array of visitor statistics
 */
export async function getVisitorStatistics(
  enterpriseId: string,
  date: string | null = null,
  hour: number | null = null,
): Promise<VisitorStatisticsRow[]> {
  try {
    const params: { enterprise_id: string; date?: string; hour?: number } = {
      enterprise_id: enterpriseId,
    };
    if (date) params.date = date;
    if (hour !== null) params.hour = hour;

    const response = await api.get<VisitorStatisticsRow[]>('/detections/statistics', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to get visitor statistics:', error);
    throw error;
  }
}

/**
 * Get deduplication statistics for an enterprise.
 * @param enterpriseId - Enterprise ID
 * @param date - Optional date filter (YYYY-MM-DD)
 * @returns Deduplication statistics
 */
export async function getDeduplicationStats(
  enterpriseId: string,
  date: string | null = null,
): Promise<DeduplicationStatisticsResponse> {
  try {
    const params: { enterprise_id: string; date?: string } = {
      enterprise_id: enterpriseId,
    };
    if (date) params.date = date;

    const response = await api.get<DeduplicationStatisticsResponse>('/detections/dedup-stats', {
      params,
    });
    return response.data;
  } catch (error) {
    console.error('Failed to get deduplication stats:', error);
    throw error;
  }
}

/**
 * Trigger cleanup of old detection events.
 * @returns Response with deleted count
 */
export async function cleanupOldDetections(): Promise<DetectionBatchResponse> {
  try {
    const response = await api.post<DetectionBatchResponse>('/detections/cleanup');
    return response.data;
  } catch (error) {
    console.error('Failed to cleanup old detections:', error);
    throw error;
  }
}

export default {
  sendDetectionBatch,
  sendUnifiedDetectionBatch,
  identitiesToUnifiedEvents,
  getVisitorStatistics,
  getDeduplicationStats,
  cleanupOldDetections,
};
