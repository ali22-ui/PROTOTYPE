import { api, withFallback, getSelectedEnterpriseId } from '@/lib/api-client';

const fallbackEnterpriseRecommendations = {
  recommendations: [
    { id: 'rec_1', feature: 'Staffing Level Optimization Prediction', recommendation: 'Add 2 extra staff from 12:00 PM to 2:00 PM based on projected visitor surge.', confidence: 0.87 },
    { id: 'rec_2', feature: 'Dwell Time & Traffic Anomaly Alerts', recommendation: 'Trigger crowding alert when average dwell exceeds 95 minutes for 2 consecutive windows.', confidence: 0.81 },
    { id: 'rec_3', feature: 'Multi-Camera Path Tracing', recommendation: 'Track visitor movement across entrance and cashier zones to optimize queue routing.', confidence: 0.78 },
    { id: 'rec_4', feature: 'Customer Density Heatmapping', recommendation: 'Generate 15-minute cumulative heatmaps and auto-alert on congestion hotspots.', confidence: 0.86 },
    { id: 'rec_5', feature: 'Queue Time Estimator', recommendation: 'Predict queue build-up and suggest lane opening thresholds for better service times.', confidence: 0.8 },
    { id: 'rec_6', feature: 'Campaign Conversion Overlay', recommendation: 'Correlate promo schedule with footfall uplift and dwell-time changes.', confidence: 0.74 },
  ],
};

export const fetchEnterpriseRecommendations = async () =>
  withFallback(
    () => api.get('/enterprise/recommendations', { params: { enterprise_id: getSelectedEnterpriseId() } }),
    fallbackEnterpriseRecommendations
  );
