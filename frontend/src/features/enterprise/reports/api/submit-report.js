import { api, withFallback, getSelectedEnterpriseId } from '@/lib/api-client';

const fallbackReportingWindow = {
  enterprise_id: 'ent_archies_001',
  period: '2026-03',
  status: 'CLOSED',
};

const fallbackEnterpriseProfile = {
  enterprise_id: 'ent_archies_001',
  company_name: 'Archies',
};

const fallbackEnterpriseReportHistory = {
  enterprise_id: 'ent_archies_001',
  reports: [],
};

export const fetchEnterpriseProfile = async () =>
  withFallback(
    () => api.get('/enterprise/profile', { params: { enterprise_id: getSelectedEnterpriseId() } }),
    { ...fallbackEnterpriseProfile, enterprise_id: getSelectedEnterpriseId() }
  );

export const fetchReportingWindowStatus = async () =>
  withFallback(
    () => api.get('/enterprise/reporting-window-status', { params: { enterprise_id: getSelectedEnterpriseId() } }),
    fallbackReportingWindow
  );

export const fetchEnterpriseReportHistory = async (enterpriseId = 'ent_archies_001') =>
  withFallback(
    () => api.get('/enterprise/reports/history', { params: { enterprise_id: enterpriseId || getSelectedEnterpriseId() } }),
    fallbackEnterpriseReportHistory
  );

export const submitEnterpriseReport = async (payload) =>
  withFallback(
    () => api.post('/enterprise/reports/submit', payload),
    { message: 'Fallback submit accepted.', report_id: 'rpt_fallback_001', status: 'SUBMITTED' }
  );
