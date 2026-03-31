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

const parseTimeSlotToDate = (date: string, timeSlot: string): Date => {
  const matched = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(timeSlot);
  if (!matched) {
    return new Date(`${date}T08:00:00`);
  }

  const [, hourString, minuteString, period] = matched;
  let hour = Number(hourString) % 12;
  if (period.toUpperCase() === 'PM') {
    hour += 12;
  }

  const normalizedHour = String(hour).padStart(2, '0');
  return new Date(`${date}T${normalizedHour}:${minuteString}:00`);
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

const adaptDetailedRowToCameraLog = (row: DetailedDetectionRow, index: number): CameraLog => {
  const timeInDate = parseTimeSlotToDate(row.date, row.time_slot);
  const total = row.male_total + row.female_total;
  const durationMinutes = Math.min(12 * 60, Math.max(20, 40 + total * 8));
  const timeOutDate = new Date(timeInDate.getTime() + durationMinutes * 60_000);
  const durationHours = Number((durationMinutes / 60).toFixed(2));
  const classification: CameraLog['classification'] = durationHours > 8 ? 'Tourist' : 'Visitor';

  return {
    id: `${row.date}-${row.time_slot.replace(/\s+/g, '').replace(':', '')}-${index}`,
    uniqueId: `CAM-${String(index + 1).padStart(5, '0')}`,
    timeInIso: timeInDate.toISOString(),
    timeOutIso: timeOutDate.toISOString(),
    timeIn: formatDateTime(timeInDate.toISOString()),
    timeOut: formatDateTime(timeOutDate.toISOString()),
    durationHours,
    durationLabel: formatDuration(durationHours),
    classification,
    maleCount: row.male_total,
    femaleCount: row.female_total,
    totalCount: total,
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
  const dashboard = await fetchEnterpriseDashboard(enterpriseId);
  const rows = dashboard.detailed_detection_rows || [];

  const filteredRows = month
    ? rows.filter((row) => row.date.startsWith(month))
    : rows;

  return filteredRows
    .map((row, index) => adaptDetailedRowToCameraLog(row, index))
    .sort((left, right) => right.timeInIso.localeCompare(left.timeInIso));
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
    ? 'N/A'
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

  return {
    title: dashboard.header.company_name,
    timestampLabel: dashboard.header.datetime_label,
    metrics: {
      averageVisitCountMtd,
      trendPercentage: dashboard.key_stats.total_visitors_mtd_trend_pct,
      peakDayLabel,
      peakTimeRange: dashboard.key_stats.peak_visitor_hours[0] || 'N/A',
      reportMonthLabel: formatMonthLabel(month),
      reportStatus,
    },
    weeklyDemographicSeries,
    hourlyDemographicSeries,
    residenceMixDistribution,
  };
};

export const fetchCameraMonitoringLayoutData = async (
  enterpriseId: string,
  month = getCurrentMonth(),
): Promise<CameraMonitoringLayoutData> => {
  const [stream, logs] = await Promise.all([
    fetchCameraStream(enterpriseId),
    fetchCameraLogs(enterpriseId, month),
  ]);

  const eventRows = logs.slice(0, 24).map((log, index) => ({
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
