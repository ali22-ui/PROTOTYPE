/**
 * Detection API client for sending detection events to backend.
 */
import api from '../../../../lib/api-client';

/**
 * Send a batch of detection events to the backend.
 * @param {Array} events - Array of detection event objects
 * @returns {Promise<object>} Response with inserted count
 */
export async function sendDetectionBatch(events) {
  if (!events || events.length === 0) {
    return { inserted_count: 0, message: 'No events to send' };
  }

  try {
    const response = await api.post('/detections/batch', { events });
    return response.data;
  } catch (error) {
    console.error('Failed to send detection batch:', error);
    throw error;
  }
}

/**
 * Send a batch of unified (deduplicated) person events to the backend.
 * @param {Array} events - Array of unified person event objects
 * @returns {Promise<object>} Response with inserted/updated counts
 */
export async function sendUnifiedDetectionBatch(events) {
  if (!events || events.length === 0) {
    return { inserted_count: 0, updated_count: 0, message: 'No events to send' };
  }

  try {
    const response = await api.post('/detections/unified', { events });
    return response.data;
  } catch (error) {
    console.error('Failed to send unified detection batch:', error);
    throw error;
  }
}

/**
 * Convert identity registry data to unified detection events.
 * @param {Array} identities - Array of PersonIdentity objects from the registry
 * @param {string} enterpriseId - Enterprise ID
 * @param {string} cameraId - Camera ID
 * @returns {Array} Array of unified detection events for API submission
 */
export function identitiesToUnifiedEvents(identities, enterpriseId, cameraId) {
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
 * @param {string} enterpriseId - Enterprise ID
 * @param {string} date - Optional date filter (YYYY-MM-DD)
 * @param {number} hour - Optional hour filter (0-23)
 * @returns {Promise<Array>} Array of visitor statistics
 */
export async function getVisitorStatistics(enterpriseId, date = null, hour = null) {
  try {
    const params = { enterprise_id: enterpriseId };
    if (date) params.date = date;
    if (hour !== null) params.hour = hour;

    const response = await api.get('/detections/statistics', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to get visitor statistics:', error);
    throw error;
  }
}

/**
 * Get deduplication statistics for an enterprise.
 * @param {string} enterpriseId - Enterprise ID
 * @param {string} date - Optional date filter (YYYY-MM-DD)
 * @returns {Promise<object>} Deduplication statistics
 */
export async function getDeduplicationStats(enterpriseId, date = null) {
  try {
    const params = { enterprise_id: enterpriseId };
    if (date) params.date = date;

    const response = await api.get('/detections/dedup-stats', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to get deduplication stats:', error);
    throw error;
  }
}

/**
 * Trigger cleanup of old detection events.
 * @returns {Promise<object>} Response with deleted count
 */
export async function cleanupOldDetections() {
  try {
    const response = await api.post('/detections/cleanup');
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
