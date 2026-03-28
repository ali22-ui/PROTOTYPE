import { api, withFallback } from '@/lib/api-client';

const fallbackBarangays = { barangays: [], heatmap: [] };

export const fetchBarangays = async () => withFallback(() => api.get('/barangays'), fallbackBarangays);

export const fetchBarangayEnterprises = async (barangayName) =>
  withFallback(() => api.get(`/barangays/${encodeURIComponent(barangayName)}/enterprises`), { barangay: barangayName, enterprises: [] });
