import axios, { AxiosError, AxiosHeaders } from 'axios';
import type {
  ApiMutationResult,
  ArchivedReport,
  ArchivedReportTableRow,
  ArchivedLguStatus,
  CameraLog,
  CameraMonitoringLayoutData,
  CameraStream,
  DashboardHourlyAreaPoint,
  DashboardLayoutData,
  DashboardWeeklyAreaPoint,
  DetailedDetectionRow,
  EnterpriseAccountProfileSettings,
  EnterpriseAccountPayload,
  EnterpriseAccountsResponse,
  EnterpriseAccountSettingsPayload,
  EnterpriseDashboardResponse,
  EnterprisePasswordUpdatePayload,
  EnterpriseProfile,
  EnterpriseReportHistoryResponse,
  EnterpriseSystemPreferences,
  LoginRequest,
  ResidenceMixDistributionRow,
  User,
  VisitorStats,
} from '@/types';

interface DbCameraLogRecord {
  id: string;
  unique_id: string;
  time_in_iso: string;
  time_out_iso: string;
  duration_hours: number;
  classification: string;
  male_count: number;
  female_count: number;
  total_count: number;
}

interface RecentDetectionFeedEvent {
  id: string;
  time_iso: string;
  frame: number;
  details: string;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
export const ENTERPRISE_SESSION_TOKEN_KEY = 'enterprise-session-token';
export const LGU_SESSION_TOKEN_KEY = 'lgu-session-token';
const SESSION_USER_KEY = 'enterprise-session-user';
const LEGACY_ENTERPRISE_ID_KEY = 'enterprise-account-id';
const LEGACY_ENTERPRISE_NAME_KEY = 'enterprise-account-name';

const WEEKDAY_LABELS: DashboardWeeklyAreaPoint['day'][] = [
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
];

const REPORTING_WINDOW_STATUS_ENDPOINTS = [
  '/enterprise/reports/lgu-notification-status',
  '/enterprise/lgu/notification-status',
  '/enterprise/reports/request-status',
] as const;
const REPORTING_WINDOW_SETTING_ENDPOINT = '/lgu/settings/is_reporting_window_open';

const OPEN_REPORTING_STATUSES = new Set(['OPEN', 'REMIND', 'WARN', 'RENOTIFY']);

interface ReportingWindowStatusCandidatePayload {
  hasLguRequestedReports?: boolean;
  has_lgu_requested_reports?: boolean;
  requestedAt?: string | null;
  requested_at?: string | null;
  message?: string;
}

export interface EnterpriseReportingWindowState {
  status: string;
  isOpen: boolean;
  message: string;
  requestedAt?: string | null;
}

export interface GlobalReportingWindowSettingState {
  isOpen: boolean;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

const http = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 15000,
});

const sanitizeString = (value: string): string => value
  .replace(/<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script>/gi, '')
  .replace(/javascript:/gi, '')
  .replace(/\bon\w+\s*=/gi, '');

const isSanitizableObject = (value: unknown): value is Record<string, unknown> => {
  const hasBlobCtor = typeof Blob !== 'undefined';
  const hasFileCtor = typeof File !== 'undefined';
  const hasFormDataCtor = typeof FormData !== 'undefined';
  const hasUrlSearchParamsCtor = typeof URLSearchParams !== 'undefined';

  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && !(value instanceof Date)
    && !(hasBlobCtor && value instanceof Blob)
    && !(hasFileCtor && value instanceof File)
    && !(hasFormDataCtor && value instanceof FormData)
    && !(hasUrlSearchParamsCtor && value instanceof URLSearchParams);
};

export const sanitizeForTransport = <T>(value: T): T => {
  if (typeof value === 'string') {
    return sanitizeString(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForTransport(entry)) as T;
  }

  if (isSanitizableObject(value)) {
    return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, entry]) => {
      acc[key] = sanitizeForTransport(entry);
      return acc;
    }, {}) as T;
  }

  return value;
};

const resolveBearerToken = (): string | null => {
  const enterpriseToken = sessionStorage.getItem(ENTERPRISE_SESSION_TOKEN_KEY);
  if (enterpriseToken) {
    return enterpriseToken;
  }

  const lguToken = sessionStorage.getItem(LGU_SESSION_TOKEN_KEY);
  if (lguToken) {
    return lguToken;
  }

  return null;
};

http.interceptors.request.use((config) => {
  const token = resolveBearerToken();
  const headers = AxiosHeaders.from(config.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  } else {
    headers.delete('Authorization');
  }
  config.headers = headers;

  if (config.params) {
    config.params = sanitizeForTransport(config.params);
  }

  const isFormDataPayload = typeof FormData !== 'undefined' && config.data instanceof FormData;
  if (config.data && !isFormDataPayload) {
    config.data = sanitizeForTransport(config.data);
  }

  return config;
});

const normalize = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, '');

const getCurrentMonth = (): string => new Date().toISOString().slice(0, 7);

const toAppError = (error: unknown, fallback = 'Something went wrong.'): Error => {
  if (error instanceof Error) {
    return error;
  }

  const axiosError = error as AxiosError<{ detail?: string; message?: string }>;
  const detail = axiosError.response?.data?.detail;
  const message = axiosError.response?.data?.message;
  const statusText = axiosError.response?.statusText;

  return new Error(detail || message || statusText || fallback);
};

const toReportingWindowStateFromCandidate = (
  payload: ReportingWindowStatusCandidatePayload | null | undefined,
): EnterpriseReportingWindowState | null => {
  if (!payload) {
    return null;
  }

  const openFlag = payload.hasLguRequestedReports ?? payload.has_lgu_requested_reports;
  if (typeof openFlag !== 'boolean') {
    return null;
  }

  return {
    status: openFlag ? 'OPEN' : 'CLOSED',
    isOpen: openFlag,
    message: payload.message || (openFlag ? 'Reporting window is open.' : 'Reporting window is currently closed.'),
    requestedAt: payload.requestedAt ?? payload.requested_at ?? null,
  };
};

const normalizeReportingWindowStatus = (rawStatus: string | null | undefined): string => {
  const status = String(rawStatus || 'CLOSED').trim().toUpperCase();
  return status || 'CLOSED';
};

const parseBooleanSetting = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'open'].includes(normalizedValue)) {
      return true;
    }

    if (['0', 'false', 'no', 'off', 'close', 'closed'].includes(normalizedValue)) {
      return false;
    }
  }

  return null;
};

export const createClientSessionToken = (): string => {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  const random = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${random}.${Date.now().toString(36)}`;
};

const formatDateTime = (isoValue: string): string =>
  new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoValue));

const formatDuration = (hours: number): string => {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
};

const formatMonthLabel = (month: string): string => {
  const date = new Date(`${month}-01T00:00:00`);
  return new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' }).format(date);
};

const formatPeriodShort = (month: string): string => {
  const date = new Date(`${month}-01T00:00:00`);
  return new Intl.DateTimeFormat('en-PH', { month: 'short', year: 'numeric' }).format(date);
};

const toArchivedStatus = (raw: string): ArchivedLguStatus => {
  const normalized = raw.trim().toLowerCase();
  if (normalized.includes('ack')) {
    return 'Acknowledged';
  }
  if (normalized.includes('reject')) {
    return 'Rejected';
  }
  if (normalized.includes('pending') || normalized.includes('ongoing') || normalized.includes('open')) {
    return 'Pending';
  }
  return 'Submitted';
};

const createDefaultAccountSettings = (
  enterpriseId: string,
  businessPermit: string,
): EnterpriseAccountSettingsPayload => {
  const fallbackEmailAlias = enterpriseId.replace(/^ent_/, '').replace(/_/g, '.');

  return {
    profile: {
      businessPermit,
      contactEmail: `${fallbackEmailAlias}@enterprise.local`,
      businessPhone: '+63 917 000 0000',
      representativeName: 'Enterprise Representative',
    },
    preferences: {
      emailNotifications: true,
      themePreference: 'system',
    },
  };
};

const resolvePeakDate = (rows: DetailedDetectionRow[]): string => {
  if (rows.length === 0) {
    return 'N/A';
  }

  const dailyTotals = new Map<string, number>();
  rows.forEach((row) => {
    const total = row.male_total + row.female_total;
    dailyTotals.set(row.date, (dailyTotals.get(row.date) ?? 0) + total);
  });

  let peakDate = rows[0].date;
  let peakValue = -1;

  dailyTotals.forEach((value, key) => {
    if (value > peakValue) {
      peakDate = key;
      peakValue = value;
    }
  });

  return peakDate;
};

const deriveTouristCount = (dashboard: EnterpriseDashboardResponse): number => {
  const fromBreakdown = dashboard.clustered_column_chart.reduce((sum, point) => {
    const maleTourist = point.male?.tourist ?? 0;
    const femaleTourist = point.female?.tourist ?? 0;
    return sum + maleTourist + femaleTourist;
  }, 0);

  if (fromBreakdown > 0) {
    return fromBreakdown;
  }

  return Math.round(dashboard.key_stats.total_visitors_mtd * 0.28);
};

const adaptDbCameraLogToCameraLog = (row: DbCameraLogRecord, index: number): CameraLog => {
  const timeInIso = row.time_in_iso;
  const timeOutIso = row.time_out_iso;
  const durationHours = Number(row.duration_hours ?? 0);
  const classification: CameraLog['classification'] =
    String(row.classification || '').toLowerCase() === 'tourist' ? 'Tourist' : 'Visitor';
  const maleCount = Number(row.male_count ?? 0);
  const femaleCount = Number(row.female_count ?? 0);
  const totalCount = Number(row.total_count ?? Math.max(1, maleCount + femaleCount));

  return {
    id: row.id || `${row.unique_id}-${index + 1}`,
    uniqueId: row.unique_id || `CAM-${String(index + 1).padStart(5, '0')}`,
    timeInIso,
    timeOutIso,
    timeIn: formatDateTime(timeInIso),
    timeOut: formatDateTime(timeOutIso),
    durationHours,
    durationLabel: formatDuration(durationHours),
    classification,
    maleCount,
    femaleCount,
    totalCount,
  };
};


export const getApiBaseUrl = (): string => API_BASE_URL;

export const getCameraRelayUrl = (enterpriseId: string): string =>
  `${API_BASE_URL}/api/enterprise/camera/relay.mjpeg?enterprise_id=${enterpriseId}`;

export const getStoredUser = (): User | null => {
  const serialized = sessionStorage.getItem(SESSION_USER_KEY);
  if (!serialized) {
    return null;
  }

  try {
    return JSON.parse(serialized) as User;
  } catch {
    sessionStorage.removeItem(SESSION_USER_KEY);
    return null;
  }
};

export const clearSession = (): void => {
  sessionStorage.clear();
  localStorage.clear();
};

export const login = async (credentials: LoginRequest): Promise<User> => {
  const permit = sanitizeForTransport(credentials.businessPermit).trim();
  const password = sanitizeForTransport(credentials.password).trim();

  if (!permit || !password) {
    throw new Error('Business Permit and Password are required.');
  }

  try {
    const accountsResponse = await http.get<EnterpriseAccountsResponse>('/enterprise/accounts');
    const accounts = accountsResponse.data.accounts;

    const normalizedPermit = normalize(permit);
    const account = accounts.find((candidate: EnterpriseAccountPayload) => {
      const aliases = [
        candidate.enterprise_id,
        candidate.company_name,
        candidate.enterprise_id.replace(/^ent_/, '').replace(/_/g, '-'),
        candidate.enterprise_id.replace(/^ent_/, '').replace(/_/g, ''),
      ];

      return aliases.some((alias) => {
        const normalizedAlias = normalize(alias);
        return normalizedAlias === normalizedPermit || normalizedAlias.includes(normalizedPermit);
      });
    });

    if (!account) {
      throw new Error('Invalid credentials. Business Permit was not recognized.');
    }

    const profileResponse = await http.get<EnterpriseProfile>('/enterprise/profile', {
      params: { enterprise_id: account.enterprise_id },
    });

    const token = createClientSessionToken();
    const user: User = {
      enterpriseId: sanitizeForTransport(account.enterprise_id),
      businessPermit: permit,
      companyName: sanitizeForTransport(account.company_name),
      linkedLguId: account.linked_lgu_id,
      dashboardTitle: sanitizeForTransport(profileResponse.data.dashboard_title),
      role: 'enterprise',
      token,
    };

    sessionStorage.setItem(ENTERPRISE_SESSION_TOKEN_KEY, token);
    sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    localStorage.setItem(LEGACY_ENTERPRISE_ID_KEY, account.enterprise_id);
    localStorage.setItem(LEGACY_ENTERPRISE_NAME_KEY, account.company_name);

    return user;
  } catch (error) {
    throw toAppError(error, 'Unable to sign in at this time.');
  }
};

export const fetchEnterpriseDashboard = async (enterpriseId: string): Promise<EnterpriseDashboardResponse> => {
  const response = await http.get<EnterpriseDashboardResponse>('/enterprise/dashboard', {
    params: { enterprise_id: enterpriseId },
  });
  return response.data;
};

export const adaptVisitorStats = (dashboard: EnterpriseDashboardResponse): VisitorStats => {
  const foreigner = Number(dashboard.visitor_residence_breakdown.Foreigner ?? 0);
  const nonResident = Number(dashboard.visitor_residence_breakdown['Non-Local Resident'] ?? 0);
  const localResident = Number(dashboard.visitor_residence_breakdown['Local Resident'] ?? 0);
  const tourist = deriveTouristCount(dashboard);
  const visitor = Math.max(dashboard.key_stats.total_visitors_mtd - tourist, 0);

  return {
    totalVisitorsPastMonth: dashboard.key_stats.total_visitors_mtd,
    trendPercentage: dashboard.key_stats.total_visitors_mtd_trend_pct,
    peakHour: dashboard.key_stats.peak_visitor_hours[0] || 'N/A',
    peakDate: resolvePeakDate(dashboard.detailed_detection_rows),
    averageDwell: dashboard.key_stats.average_dwell_time,
    breakdown: {
      Foreigner: foreigner,
      NonResident: nonResident,
      LocalResident: localResident,
      Visitor: visitor,
      Tourist: tourist,
    },
    chartData: [
      { name: 'Foreigner', value: foreigner, color: '#f97316' },
      { name: 'Non-resident', value: nonResident, color: '#8b5cf6' },
      { name: 'Local resident', value: localResident, color: '#0ea5e9' },
      { name: 'Visitor', value: visitor, color: '#22c55e' },
      { name: 'Tourist', value: tourist, color: '#f59e0b' },
    ],
  };
};

export const fetchVisitorStats = async (enterpriseId: string): Promise<VisitorStats> => {
  const dashboard = await fetchEnterpriseDashboard(enterpriseId);
  return adaptVisitorStats(dashboard);
};

export const fetchCameraStream = async (enterpriseId: string): Promise<CameraStream> => {
  const response = await http.get<CameraStream>('/enterprise/camera/stream', {
    params: { enterprise_id: enterpriseId },
  });
  return response.data;
};

export const fetchCameraLogs = async (enterpriseId: string, month?: string): Promise<CameraLog[]> => {
  try {
    const response = await http.get<DbCameraLogRecord[]>('/detections/camera-logs', {
      params: {
        enterprise_id: enterpriseId,
        month,
        limit: 1000,
      },
    });

    const dbRows = response.data || [];
    return dbRows
      .map((row, index) => adaptDbCameraLogToCameraLog(row, index))
      .sort((left, right) => right.timeInIso.localeCompare(left.timeInIso));
  } catch {
    return [];
  }
};

export const fetchGlobalReportingWindowSetting = async (): Promise<GlobalReportingWindowSettingState> => {
  const response = await http.get<{
    value?: unknown;
    setting?: {
      setting_value?: unknown;
      is_reporting_window_open?: unknown;
      updated_at?: string;
      updated_by?: string;
    };
  }>(REPORTING_WINDOW_SETTING_ENDPOINT);

  const payload = response.data;
  const isOpen =
    parseBooleanSetting(payload.value)
    ?? parseBooleanSetting(payload.setting?.setting_value)
    ?? parseBooleanSetting(payload.setting?.is_reporting_window_open)
    ?? false;

  return {
    isOpen,
    updatedAt: payload.setting?.updated_at ?? null,
    updatedBy: payload.setting?.updated_by ?? null,
  };
};

export const fetchEnterpriseReportingWindowState = async (
  enterpriseId: string,
  month = getCurrentMonth(),
): Promise<EnterpriseReportingWindowState> => {
  const safeEnterpriseId = sanitizeForTransport(enterpriseId);
  const safeMonth = sanitizeForTransport(month);

  for (const endpoint of REPORTING_WINDOW_STATUS_ENDPOINTS) {
    try {
      const response = await http.get<ReportingWindowStatusCandidatePayload>(endpoint, {
        params: {
          enterprise_id: safeEnterpriseId,
          month: safeMonth,
        },
      });

      const parsed = toReportingWindowStateFromCandidate(response.data);
      if (parsed) {
        return parsed;
      }
    } catch {
      // try the next endpoint
    }
  }

  try {
    const profileResponse = await http.get<{ reporting_window_status?: string }>('/enterprise/profile', {
      params: {
        enterprise_id: safeEnterpriseId,
      },
    });

    const normalizedStatus = normalizeReportingWindowStatus(profileResponse.data.reporting_window_status);
    const isOpen = OPEN_REPORTING_STATUSES.has(normalizedStatus);

    return {
      status: normalizedStatus,
      isOpen,
      message:
        normalizedStatus === 'SUBMITTED'
          ? 'Monthly report already submitted for this reporting window.'
          : isOpen
            ? 'Reporting window is open.'
            : 'Reporting window is currently closed.',
    };
  } catch {
    return {
      status: 'CLOSED',
      isOpen: false,
      message: 'Reporting window is currently closed.',
    };
  }
};

export const fetchCameraMonitoringEvents = async (
  enterpriseId: string,
  month = getCurrentMonth(),
  limit = 24,
): Promise<CameraMonitoringLayoutData['events']> => {
  try {
    const response = await http.get<RecentDetectionFeedEvent[]>('/detections/recent', {
      params: {
        enterprise_id: enterpriseId,
        month,
        limit,
      },
    });

    return (response.data || [])
      .sort((left, right) => right.time_iso.localeCompare(left.time_iso))
      .map((event) => ({
        id: event.id,
        timeLabel: formatDateTime(event.time_iso),
        frame: event.frame,
        details: event.details,
      }));
  } catch {
    return [];
  }
};

export const submitMonthlyReport = async (
  enterpriseId: string,
  month: string,
  logs: CameraLog[],
): Promise<{ reportId: string; status: string; message: string }> => {
  const payload = {
    source: 'frontend-report-center',
    generated_at: new Date().toISOString(),
    rows: logs.length,
    logs: logs.slice(0, 100),
  };

  try {
    const response = await http.post<{ report_id: string; status: string; message: string }>('/enterprise/reports/submit', {
      enterprise_id: enterpriseId,
      period: month,
      payload,
    });

    const result = {
      reportId: response.data.report_id,
      status: response.data.status,
      message: response.data.message,
    };

    return result;
  } catch (error) {
    throw toAppError(error, 'Unable to submit report. Please retry.');
  }
};

export const fetchArchivedReports = async (enterpriseId: string): Promise<ArchivedReport[]> => {
  try {
    const response = await http.get<EnterpriseReportHistoryResponse>('/enterprise/reports/history', {
      params: { enterprise_id: enterpriseId },
    });

    return response.data.reports.map((report) => ({
      reportId: report.report_id,
      reportMonth: report.period.month,
      dateSubmitted: formatDateTime(report.submitted_at),
      status: report.audit?.reporting_window_status_at_submit || 'Submitted',
      submittedBy: report.submitted_by_user_id || 'Enterprise User',
    }));
  } catch (error) {
    throw toAppError(error, 'Unable to load archived reports.');
  }
};

export const fetchDashboardLayoutData = async (
  enterpriseId: string,
  month = getCurrentMonth(),
): Promise<DashboardLayoutData> => {
  const [dashboard, logs] = await Promise.all([
    fetchEnterpriseDashboard(enterpriseId),
    fetchCameraLogs(enterpriseId, month),
  ]);

  const totalVisitors = dashboard.key_stats.total_visitors_mtd;
  const touristVisitors = deriveTouristCount(dashboard);
  const touristRatio = totalVisitors > 0 ? touristVisitors / totalVisitors : 0.28;

  const weeklyMap = new Map<DashboardWeeklyAreaPoint['day'], DashboardWeeklyAreaPoint>();
  WEEKDAY_LABELS.forEach((day) => {
    weeklyMap.set(day, {
      day,
      male: 0,
      female: 0,
      visitors: 0,
      tourist: 0,
    });
  });

  logs.forEach((log) => {
    const weekday = WEEKDAY_LABELS[new Date(log.timeInIso).getDay()];
    const bucket = weeklyMap.get(weekday);
    if (!bucket) {
      return;
    }

    const total = log.totalCount;
    bucket.male += log.maleCount;
    bucket.female += log.femaleCount;
    bucket.visitors += total;
    bucket.tourist += Math.round(total * touristRatio);
  });

  const weeklyDemographicSeries = WEEKDAY_LABELS.map((day) => weeklyMap.get(day) as DashboardWeeklyAreaPoint);

  const hourlyMap = new Map<number, DashboardHourlyAreaPoint>();
  for (let hour = 1; hour <= 23; hour += 2) {
    hourlyMap.set(hour, {
      hourLabel: `${hour}:00`,
      male: 0,
      female: 0,
      visitor: 0,
      tourist: 0,
    });
  }

  logs.forEach((log) => {
    const hour = new Date(log.timeInIso).getHours();
    const roundedOddHour = Math.max(1, Math.min(23, hour % 2 === 0 ? hour - 1 : hour));
    const bucket = hourlyMap.get(roundedOddHour);
    if (!bucket) {
      return;
    }

    bucket.male += log.maleCount;
    bucket.female += log.femaleCount;
    bucket.visitor += log.classification === 'Visitor' ? log.totalCount : 0;
    bucket.tourist += log.classification === 'Tourist' ? log.totalCount : Math.round(log.totalCount * touristRatio);
  });

  const hourlyDemographicSeries = Array.from(hourlyMap.values());

  const nonLocal = Number(dashboard.visitor_residence_breakdown['Non-Local Resident'] ?? 0);
  const local = Number(dashboard.visitor_residence_breakdown['Local Resident'] ?? 0);
  const foreigner = Number(dashboard.visitor_residence_breakdown.Foreigner ?? 0);
  const residenceTotal = Math.max(nonLocal + local + foreigner, 1);

  const residenceMixDistribution: ResidenceMixDistributionRow[] = [
    {
      category: 'Non-Local Resident',
      value: nonLocal,
      percentage: Number(((nonLocal / residenceTotal) * 100).toFixed(1)),
    },
    {
      category: 'Local Resident',
      value: local,
      percentage: Number(((local / residenceTotal) * 100).toFixed(1)),
    },
    {
      category: 'Foreigner',
      value: foreigner,
      percentage: Number(((foreigner / residenceTotal) * 100).toFixed(1)),
    },
  ];

  const uniqueDays = new Set(logs.map((log) => log.timeInIso.slice(0, 10))).size || 1;
  const averageVisitCountMtd = Math.round(totalVisitors / uniqueDays);

  const peakDate = resolvePeakDate(dashboard.detailed_detection_rows);
  const peakDateObj = new Date(`${peakDate}T00:00:00`);
  const peakDayLabel = Number.isNaN(peakDateObj.valueOf())
    ? null
    : `${new Intl.DateTimeFormat('en-PH', { month: 'long' }).format(peakDateObj)}-${new Intl.DateTimeFormat('en-PH', { weekday: 'long' }).format(peakDateObj)}`;

  let statusRaw = 'OPEN';
  try {
    const profileResponse = await http.get<{ reporting_window_status?: string }>('/enterprise/profile', {
      params: { enterprise_id: enterpriseId },
    });
    statusRaw = (profileResponse.data.reporting_window_status || 'OPEN').toUpperCase();
  } catch {
    statusRaw = 'OPEN';
  }

  const reportStatus: DashboardLayoutData['metrics']['reportStatus'] =
    statusRaw === 'SUBMITTED'
      ? 'submitted'
      : statusRaw === 'OPEN'
        ? 'ongoing'
        : 'closed';

  const hasWeeklyData = weeklyDemographicSeries.some(
    (point) => point.male > 0 || point.female > 0 || point.visitors > 0 || point.tourist > 0
  );
  const hasHourlyData = hourlyDemographicSeries.some(
    (point) => point.male > 0 || point.female > 0 || point.visitor > 0 || point.tourist > 0
  );
  const hasResidenceData = residenceMixDistribution.some((row) => row.value > 0);
  const hasData = totalVisitors > 0 || hasWeeklyData || hasHourlyData || hasResidenceData;

  return {
    title: dashboard.header.company_name,
    timestampLabel: dashboard.header.datetime_label,
    metrics: {
      averageVisitCountMtd,
      trendPercentage: dashboard.key_stats.total_visitors_mtd_trend_pct,
      peakDayLabel: peakDayLabel ?? 'Insufficient Data',
      peakTimeRange: dashboard.key_stats.peak_visitor_hours[0] || '',
      reportMonthLabel: formatMonthLabel(month),
      reportStatus,
    },
    weeklyDemographicSeries,
    hourlyDemographicSeries,
    residenceMixDistribution,
    hasData,
  };
};

export const fetchCameraMonitoringLayoutData = async (
  enterpriseId: string,
  month = getCurrentMonth(),
): Promise<CameraMonitoringLayoutData> => {
  const [stream, logs, recentEvents] = await Promise.all([
    fetchCameraStream(enterpriseId),
    fetchCameraLogs(enterpriseId, month),
    fetchCameraMonitoringEvents(enterpriseId, month, 24),
  ]);

  const eventRows = recentEvents.length > 0
    ? recentEvents
    : logs.slice(0, 24).map((log, index) => ({
      id: `${log.id}-${index}`,
      timeLabel: log.timeIn,
      frame: Math.max(1, stream.frame - index),
      details: `${log.maleCount} Male ${log.classification}, ${log.femaleCount} Female ${log.classification === 'Tourist' ? 'Tourist' : 'Local Resident'}`,
    }));

  const breakdownMap = new Map<string, number>();
  stream.boxes.forEach((box) => {
    const normalizedLabel = box.label.replace(/\s+/g, ' ').trim();
    breakdownMap.set(normalizedLabel, (breakdownMap.get(normalizedLabel) ?? 0) + 1);
  });

  const activeTrackBreakdown = Array.from(breakdownMap.entries()).map(([label, count]) => ({
    label,
    count,
  }));

  if (!activeTrackBreakdown.length && logs.length) {
    activeTrackBreakdown.push(
      { label: 'Male Tourist', count: Math.max(1, Math.round(logs[0].maleCount / 2)) },
      { label: 'Female Local', count: Math.max(1, Math.round(logs[0].femaleCount / 2)) },
    );
  }

  const touristSplit = logs
    .filter((log) => log.classification === 'Tourist')
    .reduce(
      (acc, log) => ({
        male: acc.male + log.maleCount,
        female: acc.female + log.femaleCount,
      }),
      { male: 0, female: 0 },
    );

  const visitorSplit = logs
    .filter((log) => log.classification === 'Visitor')
    .reduce(
      (acc, log) => ({
        male: acc.male + log.maleCount,
        female: acc.female + log.femaleCount,
      }),
      { male: 0, female: 0 },
    );

  const now = new Date();

  return {
    cameraTitle: stream.camera_name || 'Main Entrance - camera 1',
    timestampLabel: new Intl.DateTimeFormat('en-PH', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(now),
    feedUrl: getCameraRelayUrl(enterpriseId),
    streamHealth: {
      dateLabel: new Intl.DateTimeFormat('en-PH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(now),
      fps: stream.fps || 9,
      activeTracks: stream.active_tracks || activeTrackBreakdown.reduce((sum, row) => sum + row.count, 0),
      status: stream.status || 'Running',
    },
    activeTrackBreakdown,
    currentContext: {
      dateLabel: new Intl.DateTimeFormat('en-PH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(now),
      timeLabel: new Intl.DateTimeFormat('en-PH', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).format(now),
    },
    events: eventRows,
    todayVisitorData: {
      tourist: touristSplit,
      visitor: visitorSplit,
    },
  };
};

export const fetchArchivedReportsTable = async (
  enterpriseId: string,
): Promise<ArchivedReportTableRow[]> => {
  const reports = await fetchArchivedReports(enterpriseId);

  return reports.map((report) => ({
    reportId: report.reportId,
    periodLabel: formatPeriodShort(report.reportMonth),
    submittedDateLabel: report.dateSubmitted,
    lguStatus: toArchivedStatus(report.status),
    submittedBy: report.submittedBy,
    downloadHref: `${API_BASE_URL}/api/enterprise/reports/${encodeURIComponent(report.reportId)}/pdf?enterprise_id=${encodeURIComponent(enterpriseId)}`,
  }));
};

export const fetchEnterpriseAccountSettings = async (
  enterpriseId: string,
  businessPermit: string,
): Promise<EnterpriseAccountSettingsPayload> => {
  const fallback = createDefaultAccountSettings(enterpriseId, businessPermit);

  try {
    const response = await http.get<{
      profile?: Partial<EnterpriseAccountProfileSettings>;
      preferences?: Partial<EnterpriseSystemPreferences>;
    }>('/enterprise/account/settings', {
      params: {
        enterprise_id: enterpriseId,
      },
    });

    const payload: EnterpriseAccountSettingsPayload = {
      profile: {
        businessPermit,
        contactEmail: response.data.profile?.contactEmail || fallback.profile.contactEmail,
        businessPhone: response.data.profile?.businessPhone || fallback.profile.businessPhone,
        representativeName: response.data.profile?.representativeName || fallback.profile.representativeName,
      },
      preferences: {
        emailNotifications: response.data.preferences?.emailNotifications ?? fallback.preferences.emailNotifications,
        themePreference: response.data.preferences?.themePreference || fallback.preferences.themePreference,
      },
    };
    return payload;
  } catch (error) {
    throw toAppError(error, 'Unable to load account settings.');
  }
};

export const saveEnterpriseAccountProfile = async (
  enterpriseId: string,
  profile: EnterpriseAccountProfileSettings,
): Promise<ApiMutationResult> => {
  try {
    await http.post('/enterprise/account/settings/profile', {
      enterprise_id: enterpriseId,
      profile,
    });
    return {
      success: true,
      message: 'Profile settings saved successfully.',
    };
  } catch (error) {
    return {
      success: false,
      message: toAppError(error, 'Unable to save profile settings.').message,
    };
  }
};

export const updateEnterpriseAccountPassword = async (
  enterpriseId: string,
  payload: EnterprisePasswordUpdatePayload,
): Promise<ApiMutationResult> => {
  if (payload.newPassword.length < 8) {
    return {
      success: false,
      message: 'New password must be at least 8 characters long.',
    };
  }

  if (payload.newPassword !== payload.confirmNewPassword) {
    return {
      success: false,
      message: 'New password and confirmation do not match.',
    };
  }

  try {
    await http.post('/enterprise/account/settings/password', {
      enterprise_id: enterpriseId,
      current_password: payload.currentPassword,
      new_password: payload.newPassword,
    });

    return {
      success: true,
      message: 'Password updated successfully.',
    };
  } catch (error) {
    return {
      success: false,
      message: toAppError(error, 'Unable to update password.').message,
    };
  }
};

export const saveEnterpriseSystemPreferences = async (
  enterpriseId: string,
  _businessPermit: string,
  preferences: EnterpriseSystemPreferences,
): Promise<ApiMutationResult> => {
  try {
    await http.post('/enterprise/account/settings/preferences', {
      enterprise_id: enterpriseId,
      preferences,
    });
    return {
      success: true,
      message: 'System preferences saved successfully.',
    };
  } catch (error) {
    return {
      success: false,
      message: toAppError(error, 'Unable to save system preferences.').message,
    };
  }
};

export default http;
