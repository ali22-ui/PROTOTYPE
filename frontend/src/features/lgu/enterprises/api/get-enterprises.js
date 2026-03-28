import { api, withFallback } from '@/lib/api-client';

const fallbackEnterprises = { enterprises: [] };

export const fetchEnterprises = async () => withFallback(() => api.get('/enterprises'), fallbackEnterprises);

export const fetchEnterpriseAnalytics = async (enterpriseId) =>
  withFallback(() => api.get(`/enterprises/${enterpriseId}/analytics`), {
    enterprise: null,
    analytics: {
      demographics: [
        { name: 'Male', value: 50 },
        { name: 'Female', value: 50 },
      ],
      residency: [
        { name: 'Residents', value: 70 },
        { name: 'Non-Residents', value: 20 },
        { name: 'Foreign Tourists', value: 10 },
      ],
      visitorTrends: [
        { month: 'Jan', visitors: 300 },
        { month: 'Feb', visitors: 320 },
        { month: 'Mar', visitors: 350 },
        { month: 'Apr', visitors: 370 },
        { month: 'May', visitors: 395 },
        { month: 'Jun', visitors: 410 },
      ],
      reportHistory: [],
    },
  });
