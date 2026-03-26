import axios from 'axios';

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'}/api`,
});

export const getApiBaseUrl = () => import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

export const getCameraWebSocketUrl = (enterpriseId = getSelectedEnterpriseId()) => {
  const httpBase = getApiBaseUrl();
  const wsBase = httpBase.startsWith('https://')
    ? httpBase.replace('https://', 'wss://')
    : httpBase.replace('http://', 'ws://');
  return `${wsBase}/ws/enterprise/camera/${enterpriseId}`;
};

const getSelectedEnterpriseId = () => localStorage.getItem('enterprise-account-id') || 'ent_archies_001';

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
};

const fallbackLogs = {
  logs: [
    { id: 'LOG-F1', timestamp: '2026-03-26 10:01', source: 'System', category: 'Data Sync', message: 'Fallback log mode active. Backend is unreachable.', severity: 'Warning' },
    { id: 'LOG-F2', timestamp: '2026-03-26 10:03', source: 'UI', category: 'Client', message: 'Using mock responses for uninterrupted demo.', severity: 'Info' },
  ],
};

const fallbackReports = {
  quarterlyVisitorDemographics: [
    { name: 'Male Residents', value: 430 },
    { name: 'Female Residents', value: 390 },
    { name: 'Male Tourists', value: 170 },
    { name: 'Female Tourists', value: 150 },
  ],
  submittedReports: [
    {
      id: 'RPT-F001',
      business: 'Demo Enterprise',
      status: 'Pending',
      type: 'Quarterly Demographics',
      submittedBy: 'Demo User',
      submittedAt: '2026-03-26 09:00',
      summary: 'Fallback summary while backend is unavailable.',
    },
  ],
};

const fallbackEnterprises = { enterprises: [] };
const fallbackBarangays = { barangays: [], heatmap: [] };
const fallbackEnterpriseProfile = {
  enterprise_id: 'ent_archies_001',
  company_name: 'Archies',
  dashboard_title: 'Archies Enterprise Dashboard - Tourism Analytics Portal',
  linked_lgu_id: 'lgu_san_pedro_001',
  reporting_window_status: 'CLOSED',
  timezone: 'PST',
  cameras: [{ camera_id: 'cam_main_entrance_01', name: 'Main Entrance - Camera 1', status: 'ACTIVE' }],
};
const fallbackEnterpriseAccounts = {
  accounts: [
    { enterprise_id: 'ent_archies_001', company_name: 'Archies', dashboard_title: 'Archies Enterprise Dashboard - Tourism Analytics Portal', linked_lgu_id: 'lgu_san_pedro_001', logo_url: 'https://placehold.co/96x96/1d4ed8/FFFFFF?text=AR', theme: { sidebar: '#0f172a', accent: '#1d4ed8', surface: '#f8fafc' } },
    { enterprise_id: 'ent_lgu_biz_0001', company_name: 'Jollibee - Pacita', dashboard_title: 'Jollibee - Pacita Enterprise Dashboard - Tourism Analytics Portal', linked_lgu_id: 'lgu_san_pedro_001', logo_url: 'https://placehold.co/96x96/7c3aed/FFFFFF?text=JO', theme: { sidebar: '#111827', accent: '#7c3aed', surface: '#f8fafc' } },
    { enterprise_id: 'ent_lgu_biz_0002', company_name: 'San Pedro Public Market', dashboard_title: 'San Pedro Public Market Enterprise Dashboard - Tourism Analytics Portal', linked_lgu_id: 'lgu_san_pedro_001', logo_url: 'https://placehold.co/96x96/059669/FFFFFF?text=SP', theme: { sidebar: '#1f2937', accent: '#059669', surface: '#f8fafc' } },
    { enterprise_id: 'ent_lgu_biz_0003', company_name: 'Pacita Commercial Center', dashboard_title: 'Pacita Commercial Center Enterprise Dashboard - Tourism Analytics Portal', linked_lgu_id: 'lgu_san_pedro_001', logo_url: 'https://placehold.co/96x96/ea580c/FFFFFF?text=PC', theme: { sidebar: '#172554', accent: '#ea580c', surface: '#f8fafc' } },
    { enterprise_id: 'ent_lgu_biz_0004', company_name: 'Landayan Food Park', dashboard_title: 'Landayan Food Park Enterprise Dashboard - Tourism Analytics Portal', linked_lgu_id: 'lgu_san_pedro_001', logo_url: 'https://placehold.co/96x96/0ea5e9/FFFFFF?text=LF', theme: { sidebar: '#0c4a6e', accent: '#0ea5e9', surface: '#f8fafc' } },
    { enterprise_id: 'ent_lgu_biz_0005', company_name: 'Pacita Fresh Mart', dashboard_title: 'Pacita Fresh Mart Enterprise Dashboard - Tourism Analytics Portal', linked_lgu_id: 'lgu_san_pedro_001', logo_url: 'https://placehold.co/96x96/1d4ed8/FFFFFF?text=PF', theme: { sidebar: '#0f172a', accent: '#1d4ed8', surface: '#f8fafc' } },
    { enterprise_id: 'ent_lgu_biz_0006', company_name: 'United Bayanihan Pharmacy', dashboard_title: 'United Bayanihan Pharmacy Enterprise Dashboard - Tourism Analytics Portal', linked_lgu_id: 'lgu_san_pedro_001', logo_url: 'https://placehold.co/96x96/7c3aed/FFFFFF?text=UB', theme: { sidebar: '#111827', accent: '#7c3aed', surface: '#f8fafc' } },
    { enterprise_id: 'ent_lgu_biz_0007', company_name: 'San Vicente Hardware', dashboard_title: 'San Vicente Hardware Enterprise Dashboard - Tourism Analytics Portal', linked_lgu_id: 'lgu_san_pedro_001', logo_url: 'https://placehold.co/96x96/059669/FFFFFF?text=SV', theme: { sidebar: '#1f2937', accent: '#059669', surface: '#f8fafc' } },
    { enterprise_id: 'ent_lgu_biz_0008', company_name: 'Guevara Garden Cafe', dashboard_title: 'Guevara Garden Cafe Enterprise Dashboard - Tourism Analytics Portal', linked_lgu_id: 'lgu_san_pedro_001', logo_url: 'https://placehold.co/96x96/ea580c/FFFFFF?text=GG', theme: { sidebar: '#172554', accent: '#ea580c', surface: '#f8fafc' } },
    { enterprise_id: 'ent_lgu_biz_0009', company_name: 'San Antonio Medical Clinic', dashboard_title: 'San Antonio Medical Clinic Enterprise Dashboard - Tourism Analytics Portal', linked_lgu_id: 'lgu_san_pedro_001', logo_url: 'https://placehold.co/96x96/0ea5e9/FFFFFF?text=SA', theme: { sidebar: '#0c4a6e', accent: '#0ea5e9', surface: '#f8fafc' } },
    { enterprise_id: 'ent_lgu_biz_0010', company_name: 'Landayan Agro Supplies', dashboard_title: 'Landayan Agro Supplies Enterprise Dashboard - Tourism Analytics Portal', linked_lgu_id: 'lgu_san_pedro_001', logo_url: 'https://placehold.co/96x96/1d4ed8/FFFFFF?text=LA', theme: { sidebar: '#0f172a', accent: '#1d4ed8', surface: '#f8fafc' } },
    ...Array.from({ length: 25 }, (_, idx) => {
      const number = idx + 11;
      const suffix = String(number).padStart(4, '0');
      const accents = ['1d4ed8', '7c3aed', '059669', 'ea580c', '0ea5e9'];
      const accent = accents[idx % accents.length];
      return {
        enterprise_id: `ent_lgu_biz_${suffix}`,
        company_name: `LGU Enterprise ${number}`,
        dashboard_title: `LGU Enterprise ${number} Dashboard - Tourism Analytics Portal`,
        linked_lgu_id: 'lgu_san_pedro_001',
        logo_url: `https://placehold.co/96x96/${accent}/FFFFFF?text=E${number}`,
        theme: { sidebar: '#0f172a', accent: `#${accent}`, surface: '#f8fafc' },
      };
    }),
  ],
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
  ai_detection_stream: [
    { track_id: 'trk_77881', label: 'Female Tourist', bbox: { x: 34, y: 24, w: 21, h: 53 } },
    { track_id: 'trk_77882', label: 'Male Visitor', bbox: { x: 60, y: 20, w: 20, h: 52 } },
  ],
  recent_syncs: [
    'Sync ID: 1024 - Female Tourist | 08:29 PM PST',
    'Sync ID: 1023 - Male Local Resident | 08:27 PM PST',
    'Sync ID: 1022 - Female Non-Local Resident | 08:25 PM PST',
    'Sync ID: 1021 - Male Tourist | 08:22 PM PST',
  ],
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
const fallbackEnterpriseReportHistory = {
  enterprise_id: 'ent_archies_001',
  reports: [],
};
const fallbackEnterpriseRecommendations = {
  recommendations: [
    {
      id: 'rec_1',
      feature: 'Staffing Level Optimization Prediction',
      recommendation: 'Add 2 extra staff from 12:00 PM to 2:00 PM based on projected visitor surge.',
      confidence: 0.87,
    },
    {
      id: 'rec_2',
      feature: 'Dwell Time & Traffic Anomaly Alerts',
      recommendation: 'Trigger crowding alert when average dwell exceeds 95 minutes for 2 consecutive windows.',
      confidence: 0.81,
    },
    {
      id: 'rec_3',
      feature: 'Multi-Camera Path Tracing',
      recommendation: 'Track visitor movement across entrance and cashier zones to optimize queue routing.',
      confidence: 0.78,
    },
    {
      id: 'rec_4',
      feature: 'Customer Density Heatmapping',
      recommendation: 'Generate 15-minute cumulative heatmaps and auto-alert on congestion hotspots.',
      confidence: 0.86,
    },
    {
      id: 'rec_5',
      feature: 'Queue Time Estimator',
      recommendation: 'Predict queue build-up and suggest lane opening thresholds for better service times.',
      confidence: 0.8,
    },
    {
      id: 'rec_6',
      feature: 'Campaign Conversion Overlay',
      recommendation: 'Correlate promo schedule with footfall uplift and dwell-time changes.',
      confidence: 0.74,
    },
  ],
};

const extractFilename = (header, fallbackName) => {
  if (!header) return fallbackName;
  const matched = /filename="?([^";]+)"?/i.exec(header);
  return matched?.[1] || fallbackName;
};

const createMinimalPdfBlob = (lines) => {
  const escape = (text) => text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const stream = [
    'BT',
    '/F1 12 Tf',
    '50 800 Td',
    ...lines.flatMap((line, idx) => (idx === 0 ? [`(${escape(line)}) Tj`] : ['0 -16 Td', `(${escape(line)}) Tj`])),
    'ET',
  ].join('\n');

  const encoder = new TextEncoder();
  const streamBytes = encoder.encode(stream);
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }

  const xrefPos = pdf.length;
  pdf += 'xref\n0 6\n0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
};

const withFallback = async (request, fallback) => {
  try {
    const response = await request();
    return response.data;
  } catch (error) {
    console.warn('API unavailable, using fallback data:', error?.message);
    return fallback;
  }
};

export const fetchOverview = async () => withFallback(() => api.get('/overview'), fallbackOverview);
export const fetchBarangays = async () => withFallback(() => api.get('/barangays'), fallbackBarangays);
export const fetchEnterprises = async () => withFallback(() => api.get('/enterprises'), fallbackEnterprises);
export const fetchBarangayEnterprises = async (barangayName) =>
  withFallback(() => api.get(`/barangays/${encodeURIComponent(barangayName)}/enterprises`), { barangay: barangayName, enterprises: [] });
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
export const fetchReports = async () => withFallback(() => api.get('/reports'), fallbackReports);
export const fetchLogs = async () => withFallback(() => api.get('/logs'), fallbackLogs);

export const fetchEnterpriseProfile = async () =>
  withFallback(
    () => api.get('/enterprise/profile', { params: { enterprise_id: getSelectedEnterpriseId() } }),
    { ...fallbackEnterpriseProfile, enterprise_id: getSelectedEnterpriseId() }
  );

export const fetchEnterpriseAccounts = async () =>
  withFallback(() => api.get('/enterprise/accounts'), fallbackEnterpriseAccounts);

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
    throw new Error(error?.response?.data?.detail || 'Unable to fetch monthly PDF report from backend. Please restart backend server and try again.');
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

export const fetchEnterpriseReportHistory = async (enterpriseId = 'ent_archies_001') =>
  withFallback(
    () => api.get('/enterprise/reports/history', { params: { enterprise_id: enterpriseId || getSelectedEnterpriseId() } }),
    fallbackEnterpriseReportHistory
  );

export const fetchEnterpriseRecommendations = async () =>
  withFallback(
    () => api.get('/enterprise/recommendations', { params: { enterprise_id: getSelectedEnterpriseId() } }),
    fallbackEnterpriseRecommendations
  );

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

export const fetchLguOverview = async () =>
  withFallback(() => api.get('/lgu/overview'), fallbackLguOverview);

export const fetchLguReports = async (params = {}) =>
  withFallback(() => api.get('/lgu/reports', { params }), fallbackLguReports);

export const fetchLguReportDetail = async (reportId) =>
  withFallback(() => api.get(`/lgu/reports/${reportId}`), null);

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

export const fetchLguEnterpriseAccounts = async (period = '2026-03') =>
  withFallback(() => api.get('/lgu/enterprise-accounts', { params: { period } }), fallbackLguEnterpriseAccounts);

export default api;
