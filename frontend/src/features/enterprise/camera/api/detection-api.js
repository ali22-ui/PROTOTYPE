/**
 * Detection API client for sending detection events to backend.
 */
import api, { getApiBaseUrl } from '../../../../lib/api-client';

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
  getVisitorStatistics,
  cleanupOldDetections,
};
