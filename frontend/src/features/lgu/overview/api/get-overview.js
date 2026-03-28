import { api, withFallback } from '@/lib/api-client';

const fallbackOverview = {
  metrics: { totalPeopleToday: 1540, totalVisitors: 820, totalTourists: 320, currentlyInside: 105 },
  sparkline: {
    totalPeopleToday: [1200, 1260, 1320, 1380, 1450, 1510, 1540],
    totalVisitors: [650, 670, 700, 740, 780, 805, 820],
    totalTourists: [210, 225, 240, 270, 285, 300, 320],
    currentlyInside: [80, 92, 88, 110, 115, 108, 105],
  },
  peakHour: [
    { time: '9 AM', value: 45 },
    { time: '10 AM', value: 58 },
    { time: '11 AM', value: 73 },
    { time: '12 PM', value: 88 },
    { time: '1 PM', value: 94 },
    { time: '2 PM', value: 84 },
    { time: '3 PM', value: 79 },
    { time: '4 PM', value: 72 },
    { time: '5 PM', value: 61 },
    { time: '6 PM', value: 50 },
  ],
  recentActivities: [
    'Fallback mode: backend temporarily unreachable.',
    'Overview metrics loaded from local defaults.',
    'Map and charts remain interactive in offline mode.',
    'Start backend to use live mock API responses.',
  ],
};

const fallbackLogs = {
  logs: [
    { id: 'LOG-F1', timestamp: '2026-03-26 10:01', source: 'System', category: 'Data Sync', message: 'Fallback log mode active. Backend is unreachable.', severity: 'Warning' },
    { id: 'LOG-F2', timestamp: '2026-03-26 10:03', source: 'UI', category: 'Client', message: 'Using mock responses for uninterrupted demo.', severity: 'Info' },
  ],
};

const fallbackBarangays = { barangays: [], heatmap: [] };

export const fetchOverview = async () => withFallback(() => api.get('/overview'), fallbackOverview);
export const fetchBarangays = async () => withFallback(() => api.get('/barangays'), fallbackBarangays);
export const fetchLogs = async () => withFallback(() => api.get('/logs'), fallbackLogs);
