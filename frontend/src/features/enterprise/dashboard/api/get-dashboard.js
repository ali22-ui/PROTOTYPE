import { api, withFallback, getSelectedEnterpriseId, extractFilename } from '@/lib/api-client';

const fallbackEnterpriseProfile = {
  enterprise_id: 'ent_archies_001',
  company_name: 'Archies',
  dashboard_title: 'Archies Enterprise Dashboard - Tourism Analytics Portal',
  linked_lgu_id: 'lgu_san_pedro_001',
  reporting_window_status: 'CLOSED',
  timezone: 'PST',
  cameras: [{ camera_id: 'cam_main_entrance_01', name: 'Main Entrance - Camera 1', status: 'ACTIVE' }],
};

const fallbackReportingWindow = {
  enterprise_id: 'ent_archies_001',
  period: '2026-03',
  status: 'CLOSED',
  opened_at: '2026-03-26T18:00:00-08:00',
  opened_by: 'lgu_admin_01',
};

const fallbackEnterpriseDashboard = {
  enterprise_id: 'ent_archies_001',
  timezone: 'PST',
  header: {
    company_name: 'Archies Enterprise Dashboard - Tourism Analytics Portal',
    datetime_label: 'March 26, 2026 | 08:30 PM PST',
  },
  key_stats: {
    total_visitors_mtd: 8741,
    total_visitors_mtd_trend_pct: 12.3,
    peak_visitor_hours: ['12:00 PM - 2:00 PM', '6:00 PM - 8:00 PM'],
    clustered_chart_mode: '1h window',
    average_dwell_time: '1h 22m',
  },
  clustered_column_chart: [
    { time_slot: '8:00 AM', male_total: 22, female_total: 18 },
    { time_slot: '9:00 AM', male_total: 27, female_total: 24 },
    { time_slot: '10:00 AM', male_total: 35, female_total: 29 },
  ],
  detailed_detection_rows: Array.from({ length: 300 }, (_, index) => ({
    date: `2026-03-${String((index % 30) + 1).padStart(2, '0')}`,
    time_slot: `${8 + (index % 14)}:00`,
    male_total: 20 + (index % 34),
    female_total: 18 + (index % 29),
  })),
  visitor_residence_breakdown: {
    Foreigner: 24,
    'Non-Local Resident': 31,
    'Local Resident': 45,
  },
  peak_visit_frequency_by_residence: [
    { category: 'Local', value: 428 },
    { category: 'Non-Local', value: 301 },
    { category: 'Foreigner', value: 233 },
  ],
  cctv_status: 'CCTV Status: ACTIVE (Main Entrance - Camera 1)',
  ai_detection_stream: [],
  recent_syncs: [
    'Sync ID: 1024 - Female Tourist | 08:29 PM PST',
    'Sync ID: 1023 - Male Local Resident | 08:27 PM PST',
  ],
};

export const fetchEnterpriseProfile = async () =>
  withFallback(
    () => api.get('/enterprise/profile', { params: { enterprise_id: getSelectedEnterpriseId() } }),
    { ...fallbackEnterpriseProfile, enterprise_id: getSelectedEnterpriseId() }
  );

export const fetchEnterpriseDashboard = async (date) =>
  withFallback(
    () =>
      api.get('/enterprise/dashboard', {
        params: {
          enterprise_id: getSelectedEnterpriseId(),
          ...(date ? { date } : {}),
        },
      }),
    fallbackEnterpriseDashboard
  );

export const fetchReportingWindowStatus = async () =>
  withFallback(
    () => api.get('/enterprise/reporting-window-status', { params: { enterprise_id: getSelectedEnterpriseId() } }),
    fallbackReportingWindow
  );

export const submitEnterpriseReport = async (payload) =>
  withFallback(
    () => api.post('/enterprise/reports/submit', payload),
    { message: 'Fallback submit accepted.', report_id: 'rpt_fallback_001', status: 'SUBMITTED' }
  );

export const exportEnterpriseCsv = async () => {
  try {
    const response = await api.post('/enterprise/export/csv', {}, { responseType: 'blob', params: { enterprise_id: getSelectedEnterpriseId() } });
    return {
      blob: response.data,
      filename: extractFilename(response.headers?.['content-disposition'], 'archies_analytics.csv'),
      mimeType: 'text/csv',
    };
  } catch (error) {
    console.warn('CSV export fallback:', error?.message);
    return {
      blob: new Blob(['time_slot,male_total,female_total\n8:00 AM,22,18'], { type: 'text/csv' }),
      filename: 'archies_analytics_fallback.csv',
      mimeType: 'text/csv',
    };
  }
};

export const exportEnterprisePdf = async () => {
  try {
    const response = await api.post('/enterprise/export/pdf', {}, { responseType: 'blob', params: { enterprise_id: getSelectedEnterpriseId() } });
    return {
      blob: response.data,
      filename: extractFilename(response.headers?.['content-disposition'], 'archies_monthly_report.pdf'),
      mimeType: 'application/pdf',
    };
  } catch (error) {
    console.warn('PDF export failed:', error?.message);
    throw new Error(error?.response?.data?.detail || 'Unable to fetch monthly PDF report from backend.', { cause: error });
  }
};

export const requestMaintenance = async (payload) =>
  withFallback(() => api.post('/enterprise/actions/request-maintenance', payload), {
    message: 'Maintenance request submitted (fallback).',
    ticket: { ticket_id: 'mnt_fallback_001' },
  });

export const submitManualLogCorrection = async (payload) =>
  withFallback(() => api.post('/enterprise/actions/manual-log-correction', payload), {
    message: 'Manual log correction submitted (fallback).',
    ticket: { ticket_id: 'mlc_fallback_001' },
  });
