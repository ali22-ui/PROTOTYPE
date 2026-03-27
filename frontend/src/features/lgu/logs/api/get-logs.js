import { api, withFallback } from '@/lib/api-client';

const fallbackLogs = {
  logs: [
    { id: 'LOG-F1', timestamp: '2026-03-26 10:01', source: 'System', category: 'Data Sync', message: 'Fallback log mode active. Backend is unreachable.', severity: 'Warning' },
    { id: 'LOG-F2', timestamp: '2026-03-26 10:03', source: 'UI', category: 'Client', message: 'Using mock responses for uninterrupted demo.', severity: 'Info' },
  ],
};

export const fetchLogs = async () => withFallback(() => api.get('/logs'), fallbackLogs);
