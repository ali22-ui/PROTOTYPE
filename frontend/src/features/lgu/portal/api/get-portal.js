import { api, withFallback } from '@/lib/api-client';

const fallbackReportingWindow = {
  enterprise_id: 'ent_archies_001',
  period: '2026-03',
  status: 'CLOSED',
  opened_at: '2026-03-26T18:00:00-08:00',
  opened_by: 'lgu_admin_01',
};

const fallbackLguOverview = {
  lgu_id: 'lgu_san_pedro_001',
  name: 'San Pedro LGU',
  total_linked_enterprises: 1,
  submitted_reports_current_period: 1,
  submission_completion_rate_pct: 100,
  active_reporting_window: fallbackReportingWindow,
};

const fallbackLguReports = {
  reports: [
    {
      report_id: 'rpt_ent_archies_001_2026_02',
      enterprise_name: 'Archies',
      period: { month: '2026-02' },
      submitted_at: '2026-02-28T23:52:33-08:00',
      kpis: { total_visitors_mtd: 8450 },
    },
  ],
};

export const fetchLguOverview = async () =>
  withFallback(() => api.get('/lgu/overview'), fallbackLguOverview);

export const fetchLguReports = async (params = {}) =>
  withFallback(() => api.get('/lgu/reports', { params }), fallbackLguReports);

export const fetchLguReportDetail = async (reportId) =>
  withFallback(() => api.get(`/lgu/reports/${reportId}`), null);

export const openReportingWindow = async (payload) =>
  withFallback(() => api.post('/lgu/reporting-window/open', payload), {
    ...fallbackReportingWindow,
    status: 'OPEN',
  });

export const closeReportingWindow = async (payload) =>
  withFallback(() => api.post('/lgu/reporting-window/close', payload), {
    ...fallbackReportingWindow,
    status: 'CLOSED',
  });
