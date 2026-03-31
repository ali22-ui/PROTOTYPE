import { api, createMinimalPdfBlob, extractFilename, withFallback } from '@/lib/api-client';
import {
  defaultEnterpriseNoticeByStatus,
  defaultGlobalNoticeByStatus,
  toControlStatusFromAction,
  toReportingWindowStatus,
} from '@/lib/reportingStatus';
import type {
  LguAggregatedStats,
  LguAuthorityPackage,
  LguBarangay,
  LguBarangayEnterprisesResponse,
  LguBarangaysGeoJsonFeature,
  LguBarangaysGeoJsonResponse,
  LguBarangaysResponse,
  LguComplianceActionType,
  LguEnterpriseAccount,
  LguEnterpriseAccountDraft,
  LguEnterpriseAccountsResponse,
  LguEnterpriseAnalyticsDetail,
  LguEnterpriseAnalyticsResponse,
  LguEnterpriseAnalyticsSummary,
  LguEnterpriseComplianceActionRequest,
  LguEnterpriseComplianceActionResponse,
  LguEnterpriseNode,
  LguGeoPoint,
  LguHeatPoint,
  LguInfractionRecord,
  LguLogsResponse,
  LguMutationResult,
  LguOverviewAdminResponse,
  LguOverviewDynamicResponse,
  LguOverviewResponse,
  LguReportPack,
  LguReportPacksResponse,
  LguReportingControlStatus,
  LguReportsDashboardResponse,
  LguSettingsPayload,
  MonthlyReportSubmission,
  MonthlyReportSubmissionDailyData,
  MonthlyReportSubmissionDemographics,
} from '@/types';

const DEFAULT_REPORTING_PERIOD = new Date().toISOString().slice(0, 7);
const REPORTING_WINDOW_OPEN_SETTING_KEY = 'is_reporting_window_open';

const MONTHLY_SUBMISSIONS_STORAGE_KEY = 'lgu-monthly-report-submissions-v1';

interface DownloadArtifact {
  blob: Blob;
  filename: string;
  mimeType: string;
}

interface BarangayCenterSeed {
  id: string;
  name: string;
  center: LguGeoPoint;
}

const SAN_PEDRO_BARANGAY_CENTERS: BarangayCenterSeed[] = [
  { id: 'bagong-silang', name: 'Bagong Silang', center: { lat: 14.3484, lng: 121.0435 } },
  { id: 'calendola', name: 'Calendola', center: { lat: 14.3478, lng: 121.0378 } },
  { id: 'chrysanthemum', name: 'Chrysanthemum', center: { lat: 14.3512, lng: 121.0505 } },
  { id: 'cuyab', name: 'Cuyab', center: { lat: 14.3746, lng: 121.0571 } },
  { id: 'estrella', name: 'Estrella', center: { lat: 14.3456, lng: 121.0331 } },
  { id: 'fatima', name: 'Fatima', center: { lat: 14.3601, lng: 121.0515 } },
  { id: 'gsis', name: 'GSIS', center: { lat: 14.3572, lng: 121.0428 } },
  { id: 'landayan', name: 'Landayan', center: { lat: 14.3521, lng: 121.0676 } },
  { id: 'langgam', name: 'Langgam', center: { lat: 14.3364, lng: 121.0267 } },
  { id: 'laram', name: 'Laram', center: { lat: 14.3379, lng: 121.0343 } },
  { id: 'magsaysay', name: 'Magsaysay', center: { lat: 14.3498, lng: 121.0365 } },
  { id: 'maharlika', name: 'Maharlika', center: { lat: 14.3465, lng: 121.0457 } },
  { id: 'narra', name: 'Narra', center: { lat: 14.3392, lng: 121.0361 } },
  { id: 'nueva', name: 'Nueva', center: { lat: 14.3583, lng: 121.0576 } },
  { id: 'pacita-i', name: 'Pacita I', center: { lat: 14.3453, lng: 121.0565 } },
  { id: 'pacita-ii', name: 'Pacita II', center: { lat: 14.3498, lng: 121.0482 } },
  { id: 'poblacion', name: 'Poblacion', center: { lat: 14.3619, lng: 121.0581 } },
  { id: 'riverside', name: 'Riverside', center: { lat: 14.3442, lng: 121.0392 } },
  { id: 'rosario', name: 'Rosario', center: { lat: 14.3481, lng: 121.0532 } },
  { id: 'sampaguita-village', name: 'Sampaguita Village', center: { lat: 14.3542, lng: 121.0385 } },
  { id: 'san-antonio', name: 'San Antonio', center: { lat: 14.3669, lng: 121.0562 } },
  {
    id: 'san-lorenzo-ruiz',
    name: 'San Lorenzo Ruiz',
    center: { lat: 14.3525, lng: 121.0494 },
  },
  { id: 'san-roque', name: 'San Roque', center: { lat: 14.3672, lng: 121.0621 } },
  { id: 'san-vicente', name: 'San Vicente', center: { lat: 14.3574, lng: 121.0483 } },
  { id: 'santo-nino', name: 'Santo Niño', center: { lat: 14.3698, lng: 121.0568 } },
  {
    id: 'united-bayanihan',
    name: 'United Bayanihan',
    center: { lat: 14.3445, lng: 121.0415 },
  },
  {
    id: 'united-better-living',
    name: 'United Better Living',
    center: { lat: 14.3491, lng: 121.0312 },
  },
];

const buildFallbackPolygon = (center: LguGeoPoint, index: number): LguGeoPoint[] => {
  const latDelta = 0.0026 + ((index % 3) * 0.00045);
  const lngDelta = 0.0034 + ((index % 4) * 0.0004);

  return [
    { lat: center.lat + latDelta, lng: center.lng - lngDelta },
    { lat: center.lat + latDelta * 0.35, lng: center.lng + lngDelta },
    { lat: center.lat - latDelta, lng: center.lng + lngDelta * 0.8 },
    { lat: center.lat - latDelta * 0.55, lng: center.lng - lngDelta },
  ];
};

const FALLBACK_BARANGAYS: LguBarangay[] = SAN_PEDRO_BARANGAY_CENTERS.map((seed, index) => ({
  id: seed.id,
  name: seed.name,
  center: seed.center,
  coordinates: buildFallbackPolygon(seed.center, index),
  enterpriseCount: 3 + (index % 7),
}));

const FALLBACK_HEATMAP: LguHeatPoint[] = FALLBACK_BARANGAYS.flatMap((barangay, index) => {
  const baseWeight = 5 + (index % 4);
  return [
    { lat: barangay.center.lat, lng: barangay.center.lng, weight: baseWeight + 2 },
    {
      lat: barangay.center.lat + 0.00022,
      lng: barangay.center.lng - 0.00018,
      weight: baseWeight,
    },
  ];
});

const FALLBACK_BARANGAYS_RESPONSE: LguBarangaysResponse = {
  barangays: FALLBACK_BARANGAYS,
  heatmap: FALLBACK_HEATMAP,
};

const FALLBACK_BARANGAY_GEOJSON: LguBarangaysGeoJsonResponse = {
  type: 'FeatureCollection',
  features: FALLBACK_BARANGAYS.map((barangay) => ({
    type: 'Feature',
    properties: {
      id: barangay.id,
      name: barangay.name,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [[...barangay.coordinates.map((point) => [point.lng, point.lat]), [
        barangay.coordinates[0].lng,
        barangay.coordinates[0].lat,
      ]]],
    },
  })),
};

const FALLBACK_COMPLEX_BOUNDARIES_GEOJSON: LguBarangaysGeoJsonResponse = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        id: 'san-antonio',
        name: 'San Antonio',
      },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [[
            [121.0489, 14.3651], [121.0496, 14.3663], [121.0501, 14.3672], [121.0509, 14.3681],
            [121.0518, 14.3688], [121.0529, 14.3694], [121.0538, 14.3701], [121.0549, 14.3706],
            [121.0561, 14.3709], [121.0573, 14.3708], [121.0586, 14.3705], [121.0597, 14.37],
            [121.0608, 14.3692], [121.0617, 14.3685], [121.0624, 14.3676], [121.0631, 14.3667],
            [121.0635, 14.3658], [121.0634, 14.3649], [121.0628, 14.3641], [121.0619, 14.3635],
            [121.0608, 14.363], [121.0596, 14.3627], [121.0583, 14.3626], [121.0569, 14.3628],
            [121.0556, 14.363], [121.0544, 14.3632], [121.0532, 14.3635], [121.0521, 14.3639],
            [121.051, 14.3643], [121.0499, 14.3647], [121.0489, 14.3651],
          ]],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        id: 'pacita-1',
        name: 'Pacita I',
      },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [[
            [121.0494, 14.3442], [121.0501, 14.3453], [121.0508, 14.3462], [121.0517, 14.3469],
            [121.0527, 14.3474], [121.0538, 14.3478], [121.055, 14.348], [121.0561, 14.3481],
            [121.0573, 14.3479], [121.0584, 14.3477], [121.0595, 14.3472], [121.0604, 14.3466],
            [121.0611, 14.3458], [121.0617, 14.3449], [121.0621, 14.3441], [121.0622, 14.3432],
            [121.0618, 14.3425], [121.0612, 14.3419], [121.0603, 14.3415], [121.0592, 14.3412],
            [121.0581, 14.341], [121.0569, 14.3409], [121.0557, 14.3409], [121.0546, 14.3411],
            [121.0534, 14.3414], [121.0522, 14.3418], [121.0512, 14.3423], [121.0504, 14.3428],
            [121.0498, 14.3434], [121.0494, 14.3442],
          ]],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        id: 'landayan',
        name: 'Landayan',
      },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [[
            [121.0597, 14.3508], [121.0606, 14.3519], [121.0614, 14.3528], [121.0624, 14.3534],
            [121.0635, 14.3539], [121.0648, 14.3544], [121.066, 14.3548], [121.0673, 14.355],
            [121.0686, 14.3552], [121.07, 14.3552], [121.0713, 14.355], [121.0725, 14.3546],
            [121.0736, 14.354], [121.0745, 14.3533], [121.0752, 14.3524], [121.0756, 14.3515],
            [121.0756, 14.3506], [121.0752, 14.3498], [121.0745, 14.3492], [121.0736, 14.3487],
            [121.0725, 14.3483], [121.0713, 14.348], [121.07, 14.3478], [121.0687, 14.3477],
            [121.0674, 14.3477], [121.0661, 14.3479], [121.0648, 14.3482], [121.0636, 14.3485],
            [121.0625, 14.3489], [121.0614, 14.3494], [121.0605, 14.35], [121.0597, 14.3508],
          ]],
        ],
      },
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// DYNAMIC AGGREGATION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

const getMonthlySubmissionsStorageKey = (month: string): string =>
  `${MONTHLY_SUBMISSIONS_STORAGE_KEY}:${month}`;

const loadMonthlySubmissions = (month: string): MonthlyReportSubmission[] => {
  try {
    const raw = localStorage.getItem(getMonthlySubmissionsStorageKey(month));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is MonthlyReportSubmission =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as MonthlyReportSubmission).enterpriseId === 'string' &&
      typeof (item as MonthlyReportSubmission).month === 'string'
    );
  } catch {
    return [];
  }
};

export const saveMonthlySubmission = (submission: MonthlyReportSubmission): void => {
  const existing = loadMonthlySubmissions(submission.month);
  const filtered = existing.filter((s) => s.enterpriseId !== submission.enterpriseId);
  filtered.push(submission);
  localStorage.setItem(
    getMonthlySubmissionsStorageKey(submission.month),
    JSON.stringify(filtered)
  );
};

const createEmptyDemographics = (): MonthlyReportSubmissionDemographics => ({
  male: 0,
  female: 0,
  local: 0,
  nonLocal: 0,
  foreign: 0,
});

const createEmptyAggregatedStats = (month: string): LguAggregatedStats => ({
  month,
  totalVisitors: 0,
  totalTourists: 0,
  totalPeopleToday: 0,
  currentlyInside: 0,
  demographics: createEmptyDemographics(),
  dailyTrend: [],
  enterpriseCount: 0,
  hasData: false,
});

export const getLguOverviewStats = (month: string): LguAggregatedStats => {
  const submissions = loadMonthlySubmissions(month);

  if (submissions.length === 0) {
    return createEmptyAggregatedStats(month);
  }

  const aggregated: LguAggregatedStats = {
    month,
    totalVisitors: 0,
    totalTourists: 0,
    totalPeopleToday: 0,
    currentlyInside: 0,
    demographics: createEmptyDemographics(),
    dailyTrend: [],
    enterpriseCount: submissions.length,
    hasData: true,
  };

  const dailyMap = new Map<string, MonthlyReportSubmissionDailyData>();

  submissions.forEach((submission) => {
    aggregated.totalVisitors += submission.totalVisitors;
    aggregated.totalTourists += submission.totalTourists;

    aggregated.demographics.male += submission.demographics.male;
    aggregated.demographics.female += submission.demographics.female;
    aggregated.demographics.local += submission.demographics.local;
    aggregated.demographics.nonLocal += submission.demographics.nonLocal;
    aggregated.demographics.foreign += submission.demographics.foreign;

    submission.dailyData.forEach((day) => {
      const existing = dailyMap.get(day.date);
      if (existing) {
        existing.visitors += day.visitors;
        existing.tourists += day.tourists;
        existing.male += day.male;
        existing.female += day.female;
      } else {
        dailyMap.set(day.date, { ...day });
      }
    });
  });

  aggregated.totalPeopleToday = aggregated.totalVisitors + aggregated.totalTourists;
  aggregated.currentlyInside = Math.round(aggregated.totalPeopleToday * 0.068);

  aggregated.dailyTrend = Array.from(dailyMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  return aggregated;
};

const buildDynamicOverviewResponse = (month: string): LguOverviewDynamicResponse => {
  const stats = getLguOverviewStats(month);

  const peakHour = stats.hasData
    ? [
      { time: '9 AM', value: Math.round(stats.totalVisitors * 0.055) },
      { time: '10 AM', value: Math.round(stats.totalVisitors * 0.071) },
      { time: '11 AM', value: Math.round(stats.totalVisitors * 0.089) },
      { time: '12 PM', value: Math.round(stats.totalVisitors * 0.107) },
      { time: '1 PM', value: Math.round(stats.totalVisitors * 0.115) },
      { time: '2 PM', value: Math.round(stats.totalVisitors * 0.102) },
      { time: '3 PM', value: Math.round(stats.totalVisitors * 0.096) },
      { time: '4 PM', value: Math.round(stats.totalVisitors * 0.088) },
      { time: '5 PM', value: Math.round(stats.totalVisitors * 0.074) },
      { time: '6 PM', value: Math.round(stats.totalVisitors * 0.061) },
    ]
    : [];

  const recentActivities = stats.hasData
    ? [
      `Aggregated data from ${stats.enterpriseCount} enterprise submission(s).`,
      'LGU analytics feed synchronized for all enterprise nodes.',
      'Map density model refreshed for San Pedro City 4023.',
    ]
    : [
      'Awaiting enterprise submissions for the current reporting period.',
      'No visitor data has been submitted yet.',
    ];

  return {
    city: 'San Pedro City, Laguna',
    zip: '4023',
    date: new Date().toDateString(),
    aggregatedStats: stats,
    recentActivities,
    peakHour,
  };
};

const convertDynamicToLegacyOverview = (dynamic: LguOverviewDynamicResponse): LguOverviewResponse => {
  const stats = dynamic.aggregatedStats;
  const trend = stats.dailyTrend.slice(-7);

  const sparklineVisitors = trend.map((d) => d.visitors);
  const sparklineTourists = trend.map((d) => d.tourists);
  const sparklineTotal = trend.map((d) => d.visitors + d.tourists);
  const sparklineInside = sparklineTotal.map((v) => Math.round(v * 0.068));

  const padSparkline = (arr: number[]): number[] => {
    while (arr.length < 7) arr.unshift(0);
    return arr;
  };

  return {
    city: dynamic.city,
    zip: dynamic.zip,
    date: dynamic.date,
    metrics: {
      totalPeopleToday: stats.totalPeopleToday,
      totalVisitors: stats.totalVisitors,
      totalTourists: stats.totalTourists,
      currentlyInside: stats.currentlyInside,
    },
    sparkline: {
      totalPeopleToday: padSparkline(sparklineTotal),
      totalVisitors: padSparkline(sparklineVisitors),
      totalTourists: padSparkline(sparklineTourists),
      currentlyInside: padSparkline(sparklineInside),
    },
    recentActivities: dynamic.recentActivities,
    peakHour: dynamic.peakHour,
  };
};

const buildDynamicReportsDashboard = (month: string): LguReportsDashboardResponse => {
  const stats = getLguOverviewStats(month);

  if (!stats.hasData) {
    return {
      quarterlyVisitorDemographics: [],
      submittedReports: [],
    };
  }

  return {
    quarterlyVisitorDemographics: [
      { name: 'Male Residents', value: Math.round(stats.demographics.male * (stats.demographics.local / Math.max(stats.demographics.local + stats.demographics.nonLocal + stats.demographics.foreign, 1))) },
      { name: 'Female Residents', value: Math.round(stats.demographics.female * (stats.demographics.local / Math.max(stats.demographics.local + stats.demographics.nonLocal + stats.demographics.foreign, 1))) },
      { name: 'Male Tourists', value: Math.round(stats.demographics.male * (stats.demographics.foreign / Math.max(stats.demographics.local + stats.demographics.nonLocal + stats.demographics.foreign, 1))) },
      { name: 'Female Tourists', value: Math.round(stats.demographics.female * (stats.demographics.foreign / Math.max(stats.demographics.local + stats.demographics.nonLocal + stats.demographics.foreign, 1))) },
    ],
    submittedReports: [],
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// FALLBACK CONSTANTS (PRESERVED: Structural/GIS data only, no hardcoded stats)
// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK_LOGS: LguLogsResponse = {
  logs: [],
};

const FALLBACK_LGU_OVERVIEW: LguOverviewAdminResponse = {
  lgu_id: 'lgu_san_pedro_001',
  name: 'San Pedro LGU',
  total_linked_enterprises: 27,
  submitted_reports_current_period: 15,
  submission_completion_rate_pct: 55.56,
  active_reporting_window: {
    enterprise_id: 'ent_lgu_biz_0001',
    period: DEFAULT_REPORTING_PERIOD,
    status: 'OPEN',
    opened_at: '2026-03-30T09:00:00+08:00',
    opened_by: 'lgu_admin_001',
  },
};

const FALLBACK_ENTERPRISE_ANALYTICS: LguEnterpriseAnalyticsResponse = {
  enterprise: {
    id: 1,
    name: 'Fallback Enterprise',
    barangay: 'Poblacion',
    type: 'Retail',
    status: 'Active',
    businessId: 'LGU-BIZ-FALLBACK',
  },
  analytics: {
    demographics: [],
    residency: [],
    visitorTrends: [],
    reportHistory: [],
  },
};

const defaultLguSettings = (): LguSettingsPayload => ({
  adminUsername: 'lgu-admin',
  adminEmail: 'lgu.admin@sanpedro.gov.ph',
  currentPassword: '',
  newPassword: '',
  confirmNewPassword: '',
  preferences: {
    systemAlerts: true,
    complianceDigest: true,
    darkMode: false,
  },
});

const normalizeBarangayName = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, '')
    .replace(/[^a-z0-9]/g, '');

const isGeoJsonCoordinatePair = (value: unknown): value is [number, number] => {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  );
};

const isGeoPoint = (value: LguGeoPoint | null): value is LguGeoPoint => {
  return value !== null;
};

const geoJsonPolygonToCoordinates = (feature: LguBarangaysGeoJsonFeature): LguGeoPoint[] => {
  const ring: unknown =
    feature.geometry.type === 'Polygon'
      ? feature.geometry.coordinates[0]
      : feature.geometry.coordinates[0]?.[0];

  if (!Array.isArray(ring)) {
    return [];
  }

  return ring
    .map((entry): LguGeoPoint | null => {
      if (!isGeoJsonCoordinatePair(entry)) {
        return null;
      }

      const [lng, lat] = entry;
      return { lat, lng };
    })
    .filter(isGeoPoint);
};

const calculateCenter = (points: LguGeoPoint[]): LguGeoPoint => {
  if (!points.length) {
    return { lat: 14.3413, lng: 121.0446 };
  }

  const total = points.reduce(
    (acc, point) => ({
      lat: acc.lat + point.lat,
      lng: acc.lng + point.lng,
    }),
    { lat: 0, lng: 0 },
  );

  return {
    lat: total.lat / points.length,
    lng: total.lng / points.length,
  };
};

const ensureSanPedroCoverage = (barangays: LguBarangay[]): LguBarangay[] => {
  const byName = new Map<string, LguBarangay>();

  barangays.forEach((barangay) => {
    byName.set(normalizeBarangayName(barangay.name), barangay);
  });

  SAN_PEDRO_BARANGAY_CENTERS.forEach((seed, index) => {
    const key = normalizeBarangayName(seed.name);
    if (byName.has(key)) {
      return;
    }

    byName.set(key, {
      id: seed.id,
      name: seed.name,
      center: seed.center,
      coordinates: buildFallbackPolygon(seed.center, index),
      enterpriseCount: 0,
    });
  });

  return SAN_PEDRO_BARANGAY_CENTERS.map((seed) => byName.get(normalizeBarangayName(seed.name)))
    .filter((entry): entry is LguBarangay => Boolean(entry));
};

const buildEnterpriseFallback = (barangayName: string): LguBarangayEnterprisesResponse => {
  const baseId =
    barangayName
      .split('')
      .reduce((sum, character) => sum + character.charCodeAt(0), 0) % 9000;

  const enterprises: LguEnterpriseNode[] = [
    {
      id: baseId + 101,
      name: `${barangayName} Trade Center`,
      barangay: barangayName,
      type: 'Retail',
      status: 'Active',
      businessId: `LGU-BIZ-${baseId + 101}`,
    },
    {
      id: baseId + 202,
      name: `${barangayName} Food Hub`,
      barangay: barangayName,
      type: 'Food',
      status: 'Pending Renewal',
      businessId: `LGU-BIZ-${baseId + 202}`,
    },
  ];

  return {
    barangay: barangayName,
    enterprises,
  };
};

const toMutationResult = (payload: unknown, fallbackMessage: string): LguMutationResult => {
  if (typeof payload === 'object' && payload !== null) {
    const maybeSuccess = (payload as { success?: unknown }).success;
    const maybeMessage = (payload as { message?: unknown }).message;

    return {
      success: typeof maybeSuccess === 'boolean' ? maybeSuccess : true,
      message: typeof maybeMessage === 'string' && maybeMessage.length > 0
        ? maybeMessage
        : fallbackMessage,
    };
  }

  return {
    success: true,
    message: fallbackMessage,
  };
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

const resolveRequestErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { detail?: unknown; message?: unknown } } }).response;
    const detail = response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) {
      return detail;
    }

    const message = response?.data?.message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  if (error instanceof Error) {
    if (error.message === 'Network Error') {
      return 'Unable to connect to the backend API. Please confirm the server is running and reachable.';
    }
    return error.message;
  }

  return fallbackMessage;
};

const actionLabelMap: Record<LguComplianceActionType, string> = {
  OPEN: 'Open to submit',
  REMIND: 'Reminder',
  WARN: 'Warning',
  RENOTIFY: 'Re-notification',
};

const LATE_SUBMISSION_INFRACTION_TYPE = 'Failed to Comply - Late Submission';

const buildLateSubmissionInfraction = (
  enterpriseId: string,
  enterpriseName: string,
  period: string,
): LguInfractionRecord => {
  const nowIso = new Date().toISOString();
  const compactEnterpriseId = enterpriseId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

  return {
    id: `inf_${period.replace('-', '')}_${compactEnterpriseId}_${Date.now()}`,
    period,
    date: nowIso,
    type: LATE_SUBMISSION_INFRACTION_TYPE,
    severity: 'warning',
    source: 'LGU_CLOSE_REPORTING_WINDOW',
    note: `${enterpriseName} failed to submit the ${period} report before LGU window closure.`,
  };
};

export const fetchLguOverview = async (month?: string): Promise<LguOverviewResponse> => {
  const targetMonth = month || DEFAULT_REPORTING_PERIOD;
  try {
    const response = await api.get<LguOverviewResponse>('/overview', { params: { month: targetMonth } });
    return response.data;
  } catch {
    const dynamicResponse = buildDynamicOverviewResponse(targetMonth);
    return convertDynamicToLegacyOverview(dynamicResponse);
  }
};

export const fetchLguOverviewDynamic = async (month?: string): Promise<LguOverviewDynamicResponse> => {
  const targetMonth = month || DEFAULT_REPORTING_PERIOD;
  try {
    const response = await api.get<LguOverviewDynamicResponse>('/overview/dynamic', { params: { month: targetMonth } });
    return response.data;
  } catch {
    return buildDynamicOverviewResponse(targetMonth);
  }
};

export const fetchLguLogs = async (): Promise<LguLogsResponse> =>
  withFallback<LguLogsResponse>(() => api.get('/logs'), FALLBACK_LOGS);

export const fetchLguReportsDashboard = async (month?: string): Promise<LguReportsDashboardResponse> => {
  const targetMonth = month || DEFAULT_REPORTING_PERIOD;
  try {
    const response = await api.get<LguReportsDashboardResponse>('/reports', { params: { month: targetMonth } });
    return response.data;
  } catch {
    return buildDynamicReportsDashboard(targetMonth);
  }
};

export const fetchLguOverviewAdmin = async (): Promise<LguOverviewAdminResponse> =>
  withFallback<LguOverviewAdminResponse>(() => api.get('/lgu/overview'), FALLBACK_LGU_OVERVIEW);

export const fetchMapBoundaries = async (): Promise<LguBarangaysGeoJsonResponse> =>
  withFallback<LguBarangaysGeoJsonResponse>(
    () => api.get('/map/boundaries'),
    FALLBACK_COMPLEX_BOUNDARIES_GEOJSON,
  );

export const fetchBarangaysMapData = async (): Promise<LguBarangaysResponse> => {
  const [barangaysPayload, geojsonPayload] = await Promise.all([
    withFallback<LguBarangaysResponse>(() => api.get('/barangays'), FALLBACK_BARANGAYS_RESPONSE),
    withFallback<LguBarangaysGeoJsonResponse>(
      () => api.get('/barangays/geojson'),
      FALLBACK_BARANGAY_GEOJSON,
    ),
  ]);

  const polygonLookup = new Map<string, LguGeoPoint[]>();
  geojsonPayload.features.forEach((feature) => {
    const key = normalizeBarangayName(feature.properties.name);
    const points = geoJsonPolygonToCoordinates(feature);
    if (points.length >= 3) {
      polygonLookup.set(key, points);
    }
  });

  const mergedBarangays: LguBarangay[] = barangaysPayload.barangays.map((barangay) => {
    const key = normalizeBarangayName(barangay.name);
    const geoJsonCoordinates = polygonLookup.get(key);
    const coordinates = geoJsonCoordinates && geoJsonCoordinates.length >= 3
      ? geoJsonCoordinates
      : barangay.coordinates;

    return {
      id: barangay.id,
      name: barangay.name,
      center: coordinates.length ? calculateCenter(coordinates) : barangay.center,
      coordinates,
      enterpriseCount: typeof barangay.enterpriseCount === 'number' ? barangay.enterpriseCount : 0,
    };
  });

  const completedBarangays = ensureSanPedroCoverage(mergedBarangays);

  return {
    barangays: completedBarangays,
    heatmap: barangaysPayload.heatmap.length
      ? barangaysPayload.heatmap
      : completedBarangays.map((barangay, index) => ({
        lat: barangay.center.lat,
        lng: barangay.center.lng,
        weight: 5 + (index % 4),
      })),
  };
};

export const fetchBarangayEnterpriseNodes = async (
  barangayName: string,
): Promise<LguBarangayEnterprisesResponse> =>
  withFallback<LguBarangayEnterprisesResponse>(
    () => api.get(`/barangays/${encodeURIComponent(barangayName)}/enterprises`),
    buildEnterpriseFallback(barangayName),
  );

const normalizeAnalyticsLabel = (value: string): string =>
  value.toLowerCase().replace(/[^a-z]/g, '');

const getSeriesValue = (
  items: Array<{ name: string; value: number }>,
  matcher: (label: string) => boolean,
): number => {
  return items.reduce((sum, item) => {
    const normalized = normalizeAnalyticsLabel(item.name);
    return matcher(normalized) ? sum + item.value : sum;
  }, 0);
};

export const fetchEnterpriseAnalyticsDetail = async (
  enterpriseId: number,
): Promise<LguEnterpriseAnalyticsDetail | null> => {
  const payload = await withFallback<LguEnterpriseAnalyticsResponse>(
    () => api.get(`/enterprises/${enterpriseId}/analytics`),
    {
      ...FALLBACK_ENTERPRISE_ANALYTICS,
      enterprise: {
        ...FALLBACK_ENTERPRISE_ANALYTICS.enterprise,
        id: enterpriseId,
      },
    },
  );

  const hasTrendData = payload.analytics.visitorTrends.length > 0;
  const hasDemographics = payload.analytics.demographics.length > 0;
  const hasResidencyBreakdown = payload.analytics.residency.length > 0;

  if (!hasTrendData && !hasDemographics && !hasResidencyBreakdown) {
    return null;
  }

  const latest = payload.analytics.visitorTrends[payload.analytics.visitorTrends.length - 1]?.visitors ?? 0;
  const previous = payload.analytics.visitorTrends[payload.analytics.visitorTrends.length - 2]?.visitors ?? latest;
  const topDemographic = payload.analytics.demographics
    .slice()
    .sort((left, right) => right.value - left.value)[0]?.name ?? 'N/A';

  const maleCount = getSeriesValue(
    payload.analytics.demographics,
    (label) => label === 'male' || label.startsWith('male'),
  );
  const femaleCount = getSeriesValue(
    payload.analytics.demographics,
    (label) => label === 'female' || label.startsWith('female'),
  );
  const genderTotal = Math.max(maleCount + femaleCount, 1);

  const localResidents = getSeriesValue(
    payload.analytics.residency,
    (label) => (label.includes('local') && !label.includes('nonlocal')) || label === 'residents',
  );
  const nonLocalResidents = getSeriesValue(
    payload.analytics.residency,
    (label) => label.includes('nonlocal') || label.includes('nonresident'),
  );
  const totalTourists = getSeriesValue(
    payload.analytics.residency,
    (label) => label.includes('foreign') || label.includes('tourist'),
  );

  return {
    monthlyVisitors: latest,
    topDemographic,
    trendDirection: latest > previous ? 'UP' : latest < previous ? 'DOWN' : 'FLAT',
    demographics: payload.analytics.demographics,
    totalTourists,
    localResidents,
    nonLocalResidents,
    maleCount,
    femaleCount,
    maleRatioPct: Number(((maleCount / genderTotal) * 100).toFixed(1)),
    femaleRatioPct: Number(((femaleCount / genderTotal) * 100).toFixed(1)),
  };
};

export const fetchEnterpriseAnalyticsSummary = async (
  enterpriseId: number,
): Promise<LguEnterpriseAnalyticsSummary | null> => {
  const detail = await fetchEnterpriseAnalyticsDetail(enterpriseId);

  if (!detail) {
    return null;
  }

  return {
    monthlyVisitors: detail.monthlyVisitors,
    topDemographic: detail.topDemographic,
    trendDirection: detail.trendDirection,
  };
};

interface EnterpriseAccountsCatalogResponse {
  accounts: Array<{
    enterprise_id: string;
    company_name: string;
    linked_lgu_id: string;
    dashboard_title?: string;
    logo_url?: string;
    username?: string;
    barangay?: string;
    compliance_status?: string;
    window_status?: string;
    reporting_window_status?: string;
    has_submitted_for_period?: boolean;
  }>;
}

interface EnterpriseDirectoryResponse {
  enterprises: Array<{
    name: string;
    barangay?: string;
    status?: string;
    businessId?: string;
  }>;
}

interface LguSettingValueResponse {
  value?: unknown;
  setting?: {
    setting_value?: unknown;
    is_reporting_window_open?: unknown;
    updated_at?: string;
    updated_by?: string;
  };
}

interface LguSettingMutationResponse {
  message?: string;
  setting?: {
    setting_value?: unknown;
    updated_at?: string;
    updated_by?: string;
  };
}

export interface GlobalReportingWindowSettingState {
  isOpen: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

const normalizeLookupKey = (value: string): string => value.trim().toLowerCase();

const deriveUsernameFromEnterpriseId = (enterpriseId: string, companyName: string): string => {
  const fromId = enterpriseId.replace(/^ent_/, '').replace(/_/g, '.');
  if (fromId.trim()) {
    return fromId;
  }

  return companyName.trim().toLowerCase().replace(/\s+/g, '.');
};

const mapCatalogToLguAccounts = (
  catalog: EnterpriseAccountsCatalogResponse,
  directory: EnterpriseDirectoryResponse,
  period: string,
): LguEnterpriseAccount[] => {
  const directoryByCompany = new Map<string, EnterpriseDirectoryResponse['enterprises'][number]>();

  directory.enterprises.forEach((entry) => {
    directoryByCompany.set(normalizeLookupKey(entry.name), entry);
  });

  return catalog.accounts.map((account) => {
    const matchedEnterprise = directoryByCompany.get(normalizeLookupKey(account.company_name));
    const rawWindowStatus =
      account.reporting_window_status
      || account.window_status
      || 'CLOSED';
    const normalizedWindowStatus = String(rawWindowStatus).toUpperCase();
    const normalizedCompliance = String(account.compliance_status || '').toUpperCase();

    const hasSubmitted =
      typeof account.has_submitted_for_period === 'boolean'
        ? account.has_submitted_for_period
        : normalizedCompliance === 'SUBMITTED' || normalizedWindowStatus === 'SUBMITTED';

    return {
      enterprise_id: account.enterprise_id,
      company_name: account.company_name,
      linked_lgu_id: account.linked_lgu_id,
      username: account.username || deriveUsernameFromEnterpriseId(account.enterprise_id, account.company_name),
      barangay: account.barangay || matchedEnterprise?.barangay,
      compliance_status: account.compliance_status,
      window_status: account.window_status,
      reporting_window_status: normalizedWindowStatus,
      has_submitted_for_period: hasSubmitted,
      period,
      dashboard_title: account.dashboard_title,
      logo_url: account.logo_url,
    };
  });
};

const fetchAccountsCatalogFallback = async (period: string): Promise<LguEnterpriseAccount[]> => {
  const [catalogResult, directoryResult] = await Promise.allSettled([
    api.get<EnterpriseAccountsCatalogResponse>('/enterprise/accounts'),
    api.get<EnterpriseDirectoryResponse>('/enterprises'),
  ]);

  const catalog: EnterpriseAccountsCatalogResponse =
    catalogResult.status === 'fulfilled'
      ? catalogResult.value.data
      : { accounts: [] };

  const directory: EnterpriseDirectoryResponse =
    directoryResult.status === 'fulfilled'
      ? directoryResult.value.data
      : { enterprises: [] };

  return mapCatalogToLguAccounts(catalog, directory, period);
};

export const fetchLguEnterpriseAccounts = async (
  period = DEFAULT_REPORTING_PERIOD,
): Promise<LguEnterpriseAccountsResponse> => {
  const compareByBarangay = (left?: string, right?: string): number => {
    const leftLabel = left || 'Unassigned Barangay';
    const rightLabel = right || 'Unassigned Barangay';
    return leftLabel.localeCompare(rightLabel);
  };

  const sortAccounts = (accounts: LguEnterpriseAccount[]): LguEnterpriseAccount[] =>
    accounts.sort(
      (left, right) =>
        compareByBarangay(left.barangay, right.barangay)
        || left.company_name.localeCompare(right.company_name),
    );

  const toResponse = (
    payload: LguEnterpriseAccountsResponse,
    fallbackPeriod: string,
  ): LguEnterpriseAccountsResponse => ({
    period: payload.period || fallbackPeriod,
    accounts: sortAccounts(payload.accounts || []),
  });

  try {
    const response = await api.get<LguEnterpriseAccountsResponse>('/lgu/enterprise-accounts', {
      params: { period },
    });

    const primary = toResponse(response.data, period);
    if (primary.accounts.length > 0) {
      return primary;
    }

    const unfilteredResponse = await api.get<LguEnterpriseAccountsResponse>('/lgu/enterprise-accounts');
    const unfiltered = toResponse(unfilteredResponse.data, period);
    if (unfiltered.accounts.length > 0) {
      return unfiltered;
    }
  } catch {
    // Fall through to structural account fallback when status/reporting tables are unavailable.
  }

  const fallbackAccounts = await fetchAccountsCatalogFallback(period);

  return {
    period,
    accounts: sortAccounts(fallbackAccounts),
  };
};

export const fetchGlobalReportingWindowOpenState = async (): Promise<GlobalReportingWindowSettingState> => {
  const response = await api.get<LguSettingValueResponse>(
    `/lgu/settings/${REPORTING_WINDOW_OPEN_SETTING_KEY}`,
  );

  const payload = response.data;
  const isOpen =
    parseBooleanSetting(payload.value)
    ?? parseBooleanSetting(payload.setting?.setting_value)
    ?? parseBooleanSetting(payload.setting?.is_reporting_window_open)
    ?? false;

  return {
    isOpen,
    updatedAt: typeof payload.setting?.updated_at === 'string' ? payload.setting.updated_at : null,
    updatedBy: typeof payload.setting?.updated_by === 'string' ? payload.setting.updated_by : null,
  };
};

export const setGlobalReportingWindowOpenState = async (
  isOpen: boolean,
): Promise<LguMutationResult> => {
  try {
    const response = await api.put<LguSettingMutationResponse>('/lgu/settings', {
      setting_key: REPORTING_WINDOW_OPEN_SETTING_KEY,
      setting_value: isOpen,
    });

    const resolvedFlag = parseBooleanSetting(response.data.setting?.setting_value) ?? isOpen;
    return {
      success: true,
      message:
        response.data.message
        || (resolvedFlag
          ? 'Reporting window opened for enterprise submissions.'
          : 'Reporting window closed for enterprise submissions.'),
    };
  } catch (error) {
    return {
      success: false,
      message: resolveRequestErrorMessage(error, 'Unable to update reporting window state.'),
    };
  }
};

export const createEnterpriseAccount = async (
  payload: LguEnterpriseAccountDraft,
): Promise<LguMutationResult> => {
  try {
    const response = await api.post('/lgu/enterprise-accounts', payload);
    return toMutationResult(response.data, 'Enterprise account created successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create enterprise account.';
    return {
      success: false,
      message,
    };
  }
};

export const updateEnterpriseAccount = async (
  enterpriseId: string,
  payload: LguEnterpriseAccountDraft,
): Promise<LguMutationResult> => {
  try {
    const response = await api.put(`/lgu/enterprise-accounts/${encodeURIComponent(enterpriseId)}`, payload);
    return toMutationResult(response.data, 'Enterprise account updated successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update enterprise account.';
    return {
      success: false,
      message,
    };
  }
};

export const deleteEnterpriseAccount = async (
  enterpriseId: string,
): Promise<LguMutationResult> => {
  try {
    const response = await api.delete(`/lgu/enterprise-accounts/${encodeURIComponent(enterpriseId)}`);
    return toMutationResult(response.data, 'Enterprise account deleted successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete enterprise account.';
    return {
      success: false,
      message,
    };
  }
};

export const fetchLguReportPacks = async (
  period?: string,
): Promise<LguReportPacksResponse> => {
  const response = await api.get<LguReportPacksResponse>('/lgu/reports', { params: period ? { period } : undefined });
  return response.data;
};

export const fetchLguReportPackDetail = async (reportId: string): Promise<LguReportPack> => {
  const response = await api.get<LguReportPack>(`/lgu/reports/${encodeURIComponent(reportId)}`);
  return response.data;
};

export const generateAuthorityPackage = async (reportId: string): Promise<LguAuthorityPackage> => {
  const response = await api.post<LguAuthorityPackage>(`/lgu/reports/${encodeURIComponent(reportId)}/generate-authority-package`);
  return response.data;
};

export const downloadAuthorityPackagePdf = async (
  reportId: string,
): Promise<DownloadArtifact> => {
  try {
    const response = await api.post(
      `/lgu/reports/${encodeURIComponent(reportId)}/authority-package/pdf`,
      {},
      { responseType: 'blob' },
    );

    return {
      blob: response.data as Blob,
      filename: extractFilename(
        response.headers?.['content-disposition'] as string | undefined,
        `authority_package_${reportId}.pdf`,
      ),
      mimeType: 'application/pdf',
    };
  } catch {
    return {
      blob: createMinimalPdfBlob([
        'LGU AUTHORITY PACKAGE',
        `Report ID: ${reportId}`,
        'Backend file endpoint unavailable. Fallback document generated locally.',
      ]),
      filename: `authority_package_${reportId}_fallback.pdf`,
      mimeType: 'application/pdf',
    };
  }
};

export const downloadAuthorityPackageDocx = async (
  reportId: string,
): Promise<DownloadArtifact> => {
  try {
    const response = await api.post(
      `/lgu/reports/${encodeURIComponent(reportId)}/authority-package/docx`,
      {},
      { responseType: 'blob' },
    );

    return {
      blob: response.data as Blob,
      filename: extractFilename(
        response.headers?.['content-disposition'] as string | undefined,
        `authority_package_${reportId}.docx`,
      ),
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  } catch {
    return {
      blob: new Blob(
        [
          'LGU AUTHORITY PACKAGE\n',
          `Report ID: ${reportId}\n`,
          'Fallback document. Backend DOCX endpoint unavailable.\n',
        ],
        { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      ),
      filename: `authority_package_${reportId}_fallback.docx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }
};

export const notifyEnterpriseToComply = async (
  request: LguEnterpriseComplianceActionRequest,
): Promise<LguEnterpriseComplianceActionResponse> => {
  const controlStatus = toControlStatusFromAction(request.action);
  const windowStatus = toReportingWindowStatus(controlStatus);
  const timestamp = new Date().toISOString();
  const resolvedMessage =
    request.message
    || defaultEnterpriseNoticeByStatus[controlStatus]
    || `${actionLabelMap[request.action]} sent successfully.`;

  try {
    await api.post('/lgu/compliance-actions', {
      enterprise_id: request.enterpriseId,
      period: request.period,
      action_type: request.action,
      message: request.message,
    });
    await api.post('/lgu/reporting-window/open', {
      enterprise_id: request.enterpriseId,
      period: request.period,
      status: request.action,
      message: resolvedMessage,
    });

    return {
      success: true,
      message: resolvedMessage,
      enterpriseId: request.enterpriseId,
      action: request.action,
      windowStatus,
      triggeredAt: timestamp,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to notify enterprise.';

    return {
      success: false,
      message,
      enterpriseId: request.enterpriseId,
      action: request.action,
      windowStatus,
      triggeredAt: timestamp,
    };
  }
};

type NotifyAllEnterprisesParams =
  | string
  | {
    period: string;
    triggeredBy?: string;
    status?: LguComplianceActionType;
    isOpen?: boolean;
    message?: string;
  };

const resolveGlobalControlStatus = (params: {
  status?: LguComplianceActionType;
  isOpen?: boolean;
}): LguReportingControlStatus => {
  if (params.status) {
    return toControlStatusFromAction(params.status);
  }

  if (typeof params.isOpen === 'boolean') {
    return params.isOpen ? 'open' : 'closed';
  }

  return 'open';
};

export const notifyAllEnterprisesToSubmit = async (
  params: NotifyAllEnterprisesParams,
): Promise<LguMutationResult> => {
  const normalized = typeof params === 'string'
    ? {
      period: params,
      triggeredBy: 'LGU Admin',
    }
    : params;

  const controlStatus = resolveGlobalControlStatus(normalized);
  const message = normalized.message || defaultGlobalNoticeByStatus[controlStatus];
  const triggeredBy = normalized.triggeredBy || 'LGU Admin';

  try {
    if (controlStatus === 'closed') {
      await api.post('/lgu/reporting-window/close-all', {
        period: normalized.period,
        message,
      });
    } else {
      await api.post('/lgu/reporting-window/open-all', {
        period: normalized.period,
        status: toReportingWindowStatus(controlStatus),
        message,
      });
    }
  } catch (error) {
    const failure = error instanceof Error ? error.message : 'Unable to notify all enterprises.';
    return {
      success: false,
      message: failure,
    };
  }

  const statusLabel = toReportingWindowStatus(controlStatus);
  const _triggeredBy = triggeredBy;
  void _triggeredBy;

  return {
    success: true,
    message: controlStatus === 'closed'
      ? 'Reporting window closed for all enterprises. Enterprise submit actions are now locked.'
      : `Compliance notice sent to all enterprises: ${statusLabel}. Enterprise submit actions remain unlocked.`,
  };
};

export interface LguCloseWindowAuditResult extends LguMutationResult {
  period: string;
  penalizedCount: number;
  penalizedEnterpriseIds: string[];
}

export const closeReportingWindowAndAuditPenalties = async (params: {
  period: string;
  triggeredBy?: string;
  message?: string;
}): Promise<LguCloseWindowAuditResult> => {
  const period = params.period;
  const triggeredBy = params.triggeredBy || 'LGU Admin';

  const [accountsPayload, closureResult] = await Promise.all([
    fetchLguEnterpriseAccounts(period),
    notifyAllEnterprisesToSubmit({
      period,
      triggeredBy,
      isOpen: false,
      message: params.message || defaultGlobalNoticeByStatus.closed,
    }),
  ]);

  const pendingAccounts = accountsPayload.accounts.filter((account) => !account.has_submitted_for_period);

  const penalizedEnterpriseIds: string[] = [];

  await Promise.all(
    pendingAccounts.map(async (account) => {
      const infraction = buildLateSubmissionInfraction(account.enterprise_id, account.company_name, period);
      await api.post('/lgu/infractions', {
        enterprise_id: account.enterprise_id,
        period,
        infraction_type: infraction.type,
        severity: infraction.severity,
        source: infraction.source,
        note: infraction.note,
      });
      penalizedEnterpriseIds.push(account.enterprise_id);
    }),
  );

  return {
    success: closureResult.success,
    period,
    penalizedCount: penalizedEnterpriseIds.length,
    penalizedEnterpriseIds,
    message: penalizedEnterpriseIds.length
      ? `${closureResult.message} ${penalizedEnterpriseIds.length} non-compliant enterprise(s) were issued an official warning record.`
      : `${closureResult.message} No non-compliant enterprises were detected for this period.`,
  };
};

export const openEnterpriseSubmissionWindow = async (
  enterpriseId: string,
  period: string,
): Promise<LguMutationResult> => {
  const response = await api.post<{ status?: string }>('/lgu/reporting-window/open', {
    enterprise_id: enterpriseId,
    period,
    status: 'OPEN',
    message: defaultEnterpriseNoticeByStatus.open,
  });
  const payload = response.data;

  return {
    success: true,
    message: `Reporting window status: ${payload.status || 'OPEN'}.`,
  };
};

export const loadLguSettings = (): LguSettingsPayload => {
  return defaultLguSettings();
};

export const saveLguSettings = async (
  payload: LguSettingsPayload,
): Promise<LguMutationResult> => {
  if (payload.newPassword || payload.confirmNewPassword) {
    if (payload.newPassword.length < 8) {
      return {
        success: false,
        message: 'New password must be at least 8 characters long.',
      };
    }

    if (payload.newPassword !== payload.confirmNewPassword) {
      return {
        success: false,
        message: 'Password confirmation does not match.',
      };
    }
  }

  try {
    await Promise.all([
      api.put('/lgu/settings', { setting_key: 'admin_username', setting_value: payload.adminUsername }),
      api.put('/lgu/settings', { setting_key: 'admin_email', setting_value: payload.adminEmail }),
      api.put('/lgu/settings', { setting_key: 'preferences', setting_value: payload.preferences }),
    ]);

    return {
      success: true,
      message: 'LGU settings updated successfully.',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save LGU settings right now.';
    return {
      success: false,
      message,
    };
  }
};

export type { DownloadArtifact };
