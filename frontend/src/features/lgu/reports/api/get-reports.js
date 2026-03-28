import { api, withFallback, getSelectedEnterpriseId, getCameraWebSocketUrl, extractFilename } from '@/lib/api-client';

const fallbackLguEnterpriseAccounts = {
  period: '2026-03',
  accounts: [
    {
      enterprise_id: 'ent_archies_001',
      company_name: 'Archies',
      linked_lgu_id: 'lgu_san_pedro_001',
      reporting_window_status: 'CLOSED',
      has_submitted_for_period: false,
    },
    {
      enterprise_id: 'ent_pacita_center_002',
      company_name: 'Pacita Commercial Center',
      linked_lgu_id: 'lgu_san_pedro_001',
      reporting_window_status: 'CLOSED',
      has_submitted_for_period: false,
    },
  ],
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

export const fetchLguReports = async (params = {}) =>
  withFallback(() => api.get('/lgu/reports', { params }), fallbackLguReports);

export const fetchLguReportDetail = async (reportId) =>
  withFallback(() => api.get(`/lgu/reports/${reportId}`), null);

export const fetchLguEnterpriseAccounts = async (period = '2026-03') =>
  withFallback(() => api.get('/lgu/enterprise-accounts', { params: { period } }), fallbackLguEnterpriseAccounts);

export const notifyAllEnterprisesToSubmit = async (period) =>
  withFallback(() => api.post('/lgu/reporting-window/open-all', { period }), {
    message: 'All enterprise reporting windows are OPEN (fallback).',
    period,
    total_enterprises: fallbackLguEnterpriseAccounts.accounts.length,
  });

export const closeAllEnterpriseReportingWindows = async (period) =>
  withFallback(() => api.post('/lgu/reporting-window/close-all', { period }), {
    message: 'All enterprise reporting windows are CLOSED (fallback).',
    period,
    total_enterprises: fallbackLguEnterpriseAccounts.accounts.length,
  });

export const generateAuthorityPackage = async (reportId) =>
  withFallback(() => api.post(`/lgu/reports/${reportId}/generate-authority-package`), {
    authority_package_id: `auth_fallback_${reportId}`,
    generated_at: new Date().toISOString(),
    classification: 'READY_FOR_HIGHER_AUTHORITY_SUBMISSION',
    executive_summary: {
      enterprise: 'Fallback Enterprise',
      period: '2026-03',
      total_visitors: 12000,
      average_dwell: '1h 10m',
      top_peak_hours: ['12:00 PM - 2:00 PM'],
    },
    compliance_notes: ['Fallback authority package generated in offline mode.'],
    attachments: ['monthly_pdf', 'detailed_csv'],
  });

export const exportAuthorityPackagePdf = async (reportId) => {
  const response = await api.post(`/lgu/reports/${reportId}/authority-package/pdf`, {}, { responseType: 'blob' });
  return {
    blob: response.data,
    filename: extractFilename(response.headers?.['content-disposition'], `authority_package_${reportId}.pdf`),
    mimeType: 'application/pdf',
  };
};

export const exportAuthorityPackageDocx = async (reportId) => {
  const response = await api.post(`/lgu/reports/${reportId}/authority-package/docx`, {}, { responseType: 'blob' });
  return {
    blob: response.data,
    filename: extractFilename(response.headers?.['content-disposition'], `authority_package_${reportId}.docx`),
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
};

export const fetchEnterpriseCameraStream = async (enterpriseId) =>
  withFallback(
    () => api.get('/enterprise/camera/stream', { params: { enterprise_id: enterpriseId || getSelectedEnterpriseId() } }),
    {
      enterprise_id: enterpriseId || getSelectedEnterpriseId(),
      frame: 1,
      fps: 6,
      active_tracks: 3,
      status: 'RUNNING',
      camera_name: 'Main Entrance - Camera 1',
      boxes: [
        { id: 'trk_001', label: 'Male Tourist', x: 12, y: 23, w: 16, h: 35 },
        { id: 'trk_002', label: 'Female Local Resident', x: 41, y: 26, w: 18, h: 38 },
        { id: 'trk_003', label: 'Male Non-Local Resident', x: 69, y: 28, w: 15, h: 36 },
      ],
      events: Array.from({ length: 100 }, (_, index) => `Frame ${100 - index}: Simulated CCTV detection event`),
    }
  );

export { getCameraWebSocketUrl };
