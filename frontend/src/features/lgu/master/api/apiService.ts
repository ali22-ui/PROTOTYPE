import { api, createMinimalPdfBlob, extractFilename, withFallback } from '@/lib/api-client';
import {
  appendEnterpriseInfraction,
  getReportingWindowStatusForEnterprise,
  readAllEnterpriseInfractions,
  readSubmissionRecords,
  setEnterpriseReportingControlStatus,
  setGlobalReportingControlStatus,
  type LguEnterpriseSubmissionRecord,
} from '@/lib/portalBridge';
import {
  defaultEnterpriseNoticeByStatus,
  defaultGlobalNoticeByStatus,
  toControlStatusFromAction,
  toReportingWindowStatus,
} from '@/lib/reportingStatus';
import type {
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
  LguOverviewResponse,
  LguReportPack,
  LguReportPacksResponse,
  LguReportingControlStatus,
  LguReportsDashboardResponse,
  LguSettingsPayload,
} from '@/types';

const LGU_SETTINGS_STORAGE_KEY = 'lgu-master-settings-v1';
const LGU_ENTERPRISE_AUDIT_SNAPSHOT_KEY = 'lgu-enterprise-audit-snapshot-v1';
const DEFAULT_REPORTING_PERIOD = '2026-03';

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

interface LguEnterpriseAuditSnapshotRecord {
  enterprise_id: string;
  company_name: string;
  submissionStatus: 'submitted' | 'pending';
}

interface LguEnterpriseAuditSnapshotPayload {
  period: string;
  updatedAt: string;
  records: LguEnterpriseAuditSnapshotRecord[];
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

const FALLBACK_OVERVIEW: LguOverviewResponse = {
  city: 'San Pedro City, Laguna',
  zip: '4023',
  date: new Date().toDateString(),
  metrics: {
    totalPeopleToday: 1540,
    totalVisitors: 820,
    totalTourists: 320,
    currentlyInside: 105,
  },
  sparkline: {
    totalPeopleToday: [1200, 1260, 1320, 1380, 1450, 1510, 1540],
    totalVisitors: [650, 670, 700, 740, 780, 805, 820],
    totalTourists: [210, 225, 240, 270, 285, 300, 320],
    currentlyInside: [80, 92, 88, 110, 115, 108, 105],
  },
  recentActivities: [
    'LGU analytics feed synchronized for all enterprise nodes.',
    'Map density model refreshed for San Pedro City 4023.',
    'Compliance queue evaluated against monthly submissions.',
  ],
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

const FALLBACK_LOGS: LguLogsResponse = {
  logs: [
    {
      id: 'LOG-F001',
      timestamp: '2026-03-30 08:10',
      source: 'System',
      category: 'Data Sync',
      message: 'City-wide barangay feeds are operating in fallback mode.',
      severity: 'Warning',
    },
    {
      id: 'LOG-F002',
      timestamp: '2026-03-30 08:34',
      source: 'Compliance',
      category: 'Enterprise',
      message: '12 enterprise accounts are pending monthly report submission.',
      severity: 'Info',
    },
    {
      id: 'LOG-F003',
      timestamp: '2026-03-30 09:02',
      source: 'Map Engine',
      category: 'Map',
      message: 'San Pedro heat intensity tiles refreshed with deterministic fallback data.',
      severity: 'Info',
    },
  ],
};

const FALLBACK_REPORTS_DASHBOARD: LguReportsDashboardResponse = {
  quarterlyVisitorDemographics: [
    { name: 'Male Residents', value: 430 },
    { name: 'Female Residents', value: 390 },
    { name: 'Male Tourists', value: 170 },
    { name: 'Female Tourists', value: 150 },
  ],
  submittedReports: [
    {
      id: 'RPT-F001',
      business: 'San Pedro Community Hub',
      status: 'Pending',
      type: 'Quarterly Demographics',
      submittedBy: 'Fallback LGU User',
      submittedAt: '2026-03-30 09:30',
      summary: 'Fallback report generated while backend is unavailable.',
    },
  ],
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

const FALLBACK_ENTERPRISE_ACCOUNTS: LguEnterpriseAccount[] = SAN_PEDRO_BARANGAY_CENTERS.map(
  (barangay, index) => ({
    enterprise_id: `ent_lgu_biz_${String(index + 1).padStart(4, '0')}`,
    company_name: `${barangay.name} Enterprise Node`,
    linked_lgu_id: 'lgu_san_pedro_001',
    barangay: barangay.name,
    reporting_window_status: index % 4 === 0 ? 'OPEN' : 'CLOSED',
    has_submitted_for_period: index % 3 === 0,
    period: DEFAULT_REPORTING_PERIOD,
  }),
);

const FALLBACK_REPORT_PACKS_RESPONSE: LguReportPacksResponse = {
  reports: [
    {
      report_id: 'rpt_ent_lgu_biz_0001_2026_03',
      enterprise_id: 'ent_lgu_biz_0001',
      enterprise_name: 'San Antonio Enterprise Node',
      period: {
        month: DEFAULT_REPORTING_PERIOD,
        start: `${DEFAULT_REPORTING_PERIOD}-01`,
        end: `${DEFAULT_REPORTING_PERIOD}-31`,
      },
      submitted_at: '2026-03-30T08:30:00+08:00',
      kpis: {
        total_visitors_mtd: 8350,
        trend_pct: 7.2,
        avg_dwell: '1h 16m',
        peak_visitor_hours: ['12:00 PM - 2:00 PM'],
      },
      charts: {
        visitor_residence_breakdown: {
          Foreigner: 23,
          'Non-Local Resident': 31,
          'Local Resident': 46,
        },
      },
    },
  ],
};

const FALLBACK_AUTHORITY_PACKAGE: LguAuthorityPackage = {
  authority_package_id: 'auth_fallback_20260330',
  generated_at: new Date().toISOString(),
  classification: 'READY_FOR_HIGHER_AUTHORITY_SUBMISSION',
  executive_summary: {
    enterprise: 'Fallback Enterprise',
    period: DEFAULT_REPORTING_PERIOD,
    total_visitors: 12340,
    average_dwell: '1h 11m',
    top_peak_hours: ['12:00 PM - 2:00 PM'],
  },
  compliance_notes: [
    'Generated using fallback response path.',
    'Use backend connectivity for authoritative package data.',
  ],
  attachments: ['authority_pdf', 'authority_docx'],
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
    demographics: [
      { name: 'Male', value: 52 },
      { name: 'Female', value: 48 },
    ],
    residency: [
      { name: 'Residents', value: 71 },
      { name: 'Non-Residents', value: 20 },
      { name: 'Foreign Tourists', value: 9 },
    ],
    visitorTrends: [
      { month: 'Jan', visitors: 280 },
      { month: 'Feb', visitors: 320 },
      { month: 'Mar', visitors: 350 },
      { month: 'Apr', visitors: 375 },
    ],
    reportHistory: [
      {
        date: '2026-03-15',
        type: 'Monthly Submission',
        status: 'Submitted',
      },
    ],
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

const actionLabelMap: Record<LguComplianceActionType, string> = {
  OPEN: 'Open to submit',
  REMIND: 'Reminder',
  WARN: 'Warning',
  RENOTIFY: 'Re-notification',
};

const LATE_SUBMISSION_INFRACTION_TYPE = 'Failed to Comply - Late Submission';

const canUseStorage = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const writeEnterpriseAuditSnapshot = (
  period: string,
  accounts: LguEnterpriseAccount[],
): void => {
  if (!canUseStorage()) {
    return;
  }

  const payload: LguEnterpriseAuditSnapshotPayload = {
    period,
    updatedAt: new Date().toISOString(),
    records: accounts.map((account) => ({
      enterprise_id: account.enterprise_id,
      company_name: account.company_name,
      submissionStatus: account.has_submitted_for_period ? 'submitted' : 'pending',
    })),
  };

  window.localStorage.setItem(LGU_ENTERPRISE_AUDIT_SNAPSHOT_KEY, JSON.stringify(payload));
};

const readEnterpriseAuditSnapshot = (
  period: string,
): LguEnterpriseAuditSnapshotRecord[] => {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(LGU_ENTERPRISE_AUDIT_SNAPSHOT_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as Partial<LguEnterpriseAuditSnapshotPayload>;
    if (parsed.period !== period || !Array.isArray(parsed.records)) {
      return [];
    }

    return parsed.records.filter(
      (record): record is LguEnterpriseAuditSnapshotRecord =>
        Boolean(record)
        && typeof record.enterprise_id === 'string'
        && typeof record.company_name === 'string'
        && (record.submissionStatus === 'submitted' || record.submissionStatus === 'pending'),
    );
  } catch {
    return [];
  }
};

const buildPeriodRange = (month: string): { start: string; end: string } => {
  const fallback = {
    start: `${month}-01`,
    end: `${month}-31`,
  };

  const date = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(date.valueOf())) {
    return fallback;
  }

  const endDate = new Date(date);
  endDate.setMonth(endDate.getMonth() + 1);
  endDate.setDate(0);

  return {
    start: `${month}-01`,
    end: `${month}-${String(endDate.getDate()).padStart(2, '0')}`,
  };
};

const readBridgeSubmissions = (period?: string): LguEnterpriseSubmissionRecord[] => {
  const submissions = readSubmissionRecords();

  if (!period) {
    return submissions;
  }

  return submissions.filter((record) => record.month === period);
};

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

const getEnterpriseLabel = (enterpriseId: string, fallbackName?: string): string => {
  if (fallbackName) {
    return fallbackName;
  }

  const account = FALLBACK_ENTERPRISE_ACCOUNTS.find((item) => item.enterprise_id === enterpriseId);
  if (account?.company_name) {
    return account.company_name;
  }

  return enterpriseId;
};

const inferBarangayFromText = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }

  const normalized = normalizeBarangayName(value);
  const matched = SAN_PEDRO_BARANGAY_CENTERS
    .slice()
    .sort((left, right) => right.name.length - left.name.length)
    .find((seed) => normalized.includes(normalizeBarangayName(seed.name)));

  return matched?.name;
};

const getEnterpriseBarangay = (enterpriseId: string, fallbackName?: string): string | undefined => {
  const account = FALLBACK_ENTERPRISE_ACCOUNTS.find((item) => item.enterprise_id === enterpriseId);

  return account?.barangay || inferBarangayFromText(fallbackName);
};

const toReportPackFromBridge = (record: LguEnterpriseSubmissionRecord): LguReportPack => {
  const { start, end } = buildPeriodRange(record.month);

  return {
    report_id: record.reportId,
    enterprise_id: record.enterpriseId,
    enterprise_name: getEnterpriseLabel(record.enterpriseId, record.enterpriseName),
    linked_lgu_id: 'lgu_san_pedro_001',
    period: {
      month: record.month,
      start,
      end,
    },
    submitted_at: record.submittedAt,
    submitted_by_user_id: 'enterprise-local-bridge',
    kpis: {
      total_visitors_mtd: record.totalPeopleCount,
      trend_pct: 0,
      avg_dwell: 'N/A',
      peak_visitor_hours: ['N/A'],
    },
    charts: {
      visitor_residence_breakdown: {
        Tourist: record.touristTaggedRows,
        Visitor: record.visitorTaggedRows,
      },
    },
  };
};

const toTimestamp = (value: string): number => {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return parsed;
};

const mergeReportPacks = (
  apiReports: LguReportPack[],
  bridgeReports: LguReportPack[],
): LguReportPack[] => {
  const byEnterprisePeriod = new Map<string, LguReportPack>();

  [...apiReports, ...bridgeReports].forEach((report) => {
    const key = `${report.enterprise_id}::${report.period.month}`;
    const existing = byEnterprisePeriod.get(key);

    if (!existing || toTimestamp(report.submitted_at) >= toTimestamp(existing.submitted_at)) {
      byEnterprisePeriod.set(key, report);
    }
  });

  return Array.from(byEnterprisePeriod.values()).sort(
    (left, right) => toTimestamp(right.submitted_at) - toTimestamp(left.submitted_at),
  );
};

export const fetchLguOverview = async (): Promise<LguOverviewResponse> =>
  withFallback<LguOverviewResponse>(() => api.get('/overview'), FALLBACK_OVERVIEW);

export const fetchLguLogs = async (): Promise<LguLogsResponse> =>
  withFallback<LguLogsResponse>(() => api.get('/logs'), FALLBACK_LOGS);

export const fetchLguReportsDashboard = async (): Promise<LguReportsDashboardResponse> =>
  withFallback<LguReportsDashboardResponse>(
    () => api.get('/reports'),
    FALLBACK_REPORTS_DASHBOARD,
  );

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
): Promise<LguEnterpriseAnalyticsDetail> => {
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
): Promise<LguEnterpriseAnalyticsSummary> => {
  const detail = await fetchEnterpriseAnalyticsDetail(enterpriseId);

  return {
    monthlyVisitors: detail.monthlyVisitors,
    topDemographic: detail.topDemographic,
    trendDirection: detail.trendDirection,
  };
};

export const fetchLguEnterpriseAccounts = async (
  period = DEFAULT_REPORTING_PERIOD,
): Promise<LguEnterpriseAccountsResponse> => {
  const payload = await withFallback<LguEnterpriseAccountsResponse>(
    () => api.get('/lgu/enterprise-accounts', { params: { period } }),
    {
      period,
      accounts: FALLBACK_ENTERPRISE_ACCOUNTS,
    },
  );

  const submissionByEnterprise = new Map<string, LguEnterpriseSubmissionRecord>();
  readBridgeSubmissions(period).forEach((record) => {
    submissionByEnterprise.set(record.enterpriseId, record);
  });
  const infractionsByEnterprise = readAllEnterpriseInfractions();

  const merged = payload.accounts.map((account) => {
    const bridgeSubmission = submissionByEnterprise.get(account.enterprise_id);
    const bridgeWindowStatus = getReportingWindowStatusForEnterprise(account.enterprise_id, period);
    const hasSubmitted = account.has_submitted_for_period || Boolean(bridgeSubmission);
    const resolvedCompanyName = bridgeSubmission?.enterpriseName || account.company_name;
    const barangay = account.barangay || getEnterpriseBarangay(account.enterprise_id, resolvedCompanyName);
    const infractions = infractionsByEnterprise[account.enterprise_id] || [];
    const latestInfraction = infractions[0] || null;

    return {
      ...account,
      company_name: resolvedCompanyName,
      barangay,
      infraction_count: infractions.length,
      latest_infraction: latestInfraction,
      has_submitted_for_period: hasSubmitted,
      reporting_window_status: hasSubmitted
        ? 'SUBMITTED'
        : bridgeWindowStatus
          ? bridgeWindowStatus
          : account.reporting_window_status,
    };
  });

  const knownIds = new Set(merged.map((account) => account.enterprise_id));

  submissionByEnterprise.forEach((record) => {
    if (knownIds.has(record.enterpriseId)) {
      return;
    }

    merged.push({
      enterprise_id: record.enterpriseId,
      company_name: getEnterpriseLabel(record.enterpriseId, record.enterpriseName),
      linked_lgu_id: 'lgu_san_pedro_001',
      barangay: getEnterpriseBarangay(record.enterpriseId, record.enterpriseName),
      reporting_window_status: 'SUBMITTED',
      has_submitted_for_period: true,
      infraction_count: (infractionsByEnterprise[record.enterpriseId] || []).length,
      latest_infraction: (infractionsByEnterprise[record.enterpriseId] || [])[0] || null,
      period,
    });
  });

  const compareByBarangay = (left?: string, right?: string): number => {
    const leftLabel = left || 'Unassigned Barangay';
    const rightLabel = right || 'Unassigned Barangay';
    return leftLabel.localeCompare(rightLabel);
  };

  const response: LguEnterpriseAccountsResponse = {
    period,
    accounts: merged.sort(
      (left, right) =>
        compareByBarangay(left.barangay, right.barangay)
        || left.company_name.localeCompare(right.company_name),
    ),
  };

  writeEnterpriseAuditSnapshot(period, response.accounts);

  return response;
};

export const createEnterpriseAccount = async (
  payload: LguEnterpriseAccountDraft,
): Promise<LguMutationResult> => {
  try {
    const response = await api.post('/lgu/enterprise-accounts', payload);
    return toMutationResult(response.data, 'Enterprise account created successfully.');
  } catch {
    return {
      success: true,
      message: 'Enterprise account saved in LGU portal (fallback mode).',
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
  } catch {
    return {
      success: true,
      message: 'Enterprise account updated locally (fallback mode).',
    };
  }
};

export const deleteEnterpriseAccount = async (
  enterpriseId: string,
): Promise<LguMutationResult> => {
  try {
    const response = await api.delete(`/lgu/enterprise-accounts/${encodeURIComponent(enterpriseId)}`);
    return toMutationResult(response.data, 'Enterprise account deleted successfully.');
  } catch {
    return {
      success: true,
      message: 'Enterprise account removed from LGU table (fallback mode).',
    };
  }
};

export const fetchLguReportPacks = async (
  period?: string,
): Promise<LguReportPacksResponse> => {
  const payload = await withFallback<LguReportPacksResponse>(
    () => api.get('/lgu/reports', { params: period ? { period } : undefined }),
    FALLBACK_REPORT_PACKS_RESPONSE,
  );

  const bridgeReports = readBridgeSubmissions(period).map(toReportPackFromBridge);

  return {
    reports: mergeReportPacks(payload.reports, bridgeReports),
  };
};

export const fetchLguReportPackDetail = async (reportId: string): Promise<LguReportPack> => {
  const localMatch = readBridgeSubmissions().find((record) => record.reportId === reportId);
  if (localMatch) {
    return toReportPackFromBridge(localMatch);
  }

  const fallbackPack = FALLBACK_REPORT_PACKS_RESPONSE.reports[0];
  return withFallback<LguReportPack>(
    () => api.get(`/lgu/reports/${encodeURIComponent(reportId)}`),
    {
      ...fallbackPack,
      report_id: reportId,
    },
  );
};

export const generateAuthorityPackage = async (reportId: string): Promise<LguAuthorityPackage> =>
  withFallback<LguAuthorityPackage>(
    () => api.post(`/lgu/reports/${encodeURIComponent(reportId)}/generate-authority-package`),
    {
      ...FALLBACK_AUTHORITY_PACKAGE,
      authority_package_id: `auth_fallback_${reportId}`,
    },
  );

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
    const response = await api.post<{ message?: string }>(
      '/lgu/enterprise-actions/notify-submit',
      {
        enterprise_id: request.enterpriseId,
        period: request.period,
        action: request.action,
        message: request.message,
      },
    );

    const payload = response.data;
    setEnterpriseReportingControlStatus({
      enterpriseId: request.enterpriseId,
      period: request.period,
      message: payload.message || resolvedMessage,
      triggeredBy: 'LGU Admin',
      status: controlStatus,
    });

    return {
      success: true,
      message: payload.message || resolvedMessage,
      enterpriseId: request.enterpriseId,
      action: request.action,
      windowStatus,
      triggeredAt: timestamp,
    };
  } catch {
    await withFallback<{ status?: string }>(
      () =>
        api.post('/lgu/reporting-window/open', {
          enterprise_id: request.enterpriseId,
          period: request.period,
        }),
      { status: 'OPEN' },
    );

    setEnterpriseReportingControlStatus({
      enterpriseId: request.enterpriseId,
      period: request.period,
      message: resolvedMessage,
      triggeredBy: 'LGU Admin',
      status: controlStatus,
    });

    return {
      success: true,
      message: resolvedMessage,
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
  const apiAction = controlStatus === 'closed' ? 'CLOSE_ALL' : toReportingWindowStatus(controlStatus);
  const triggeredBy = normalized.triggeredBy || 'LGU Admin';

  try {
    await api.post('/lgu/enterprise-actions/notify-submit-all', {
      period: normalized.period,
      action: apiAction,
      message,
    });
  } catch {
    // Frontend-only fallback mode; local bridge state is the source of truth.
  }

  setGlobalReportingControlStatus({
    period: normalized.period,
    message,
    triggeredBy,
    status: controlStatus,
  });

  const statusLabel = toReportingWindowStatus(controlStatus);

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

  const submittedEnterpriseIds = new Set(
    readBridgeSubmissions(period).map((record) => record.enterpriseId),
  );

  const cachedSnapshot = readEnterpriseAuditSnapshot(period);
  const cachedLookup = new Map<string, LguEnterpriseAuditSnapshotRecord>(
    cachedSnapshot.map((entry) => [entry.enterprise_id, entry]),
  );

  const pendingAccounts = accountsPayload.accounts.filter((account) => {
    const cached = cachedLookup.get(account.enterprise_id);
    const isSubmitted = cached
      ? cached.submissionStatus === 'submitted'
      : account.has_submitted_for_period;

    if (isSubmitted) {
      return false;
    }

    return !submittedEnterpriseIds.has(account.enterprise_id);
  });

  const penalizedEnterpriseIds: string[] = [];

  pendingAccounts.forEach((account) => {
    appendEnterpriseInfraction(
      account.enterprise_id,
      buildLateSubmissionInfraction(account.enterprise_id, account.company_name, period),
    );
    penalizedEnterpriseIds.push(account.enterprise_id);
  });

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
  const payload = await withFallback<{ status?: string }>(
    () =>
      api.post('/lgu/reporting-window/open', {
        enterprise_id: enterpriseId,
        period,
      }),
    { status: 'OPEN' },
  );

  setEnterpriseReportingControlStatus({
    enterpriseId,
    period,
    message: defaultEnterpriseNoticeByStatus.open,
    triggeredBy: 'LGU Admin',
    status: 'open',
  });

  return {
    success: true,
    message: `Reporting window status: ${payload.status || 'OPEN'}.`,
  };
};

export const loadLguSettings = (): LguSettingsPayload => {
  const fallback = defaultLguSettings();

  try {
    const raw = localStorage.getItem(LGU_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as Partial<LguSettingsPayload>;

    return {
      ...fallback,
      ...parsed,
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
      preferences: {
        ...fallback.preferences,
        ...parsed.preferences,
      },
    };
  } catch {
    return fallback;
  }
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
    await api.post('/lgu/settings', {
      adminUsername: payload.adminUsername,
      adminEmail: payload.adminEmail,
      preferences: payload.preferences,
      currentPassword: payload.currentPassword,
      newPassword: payload.newPassword,
    });
  } catch {
    // Keep frontend persistence as fallback.
  }

  localStorage.setItem(
    LGU_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      adminUsername: payload.adminUsername,
      adminEmail: payload.adminEmail,
      preferences: payload.preferences,
    }),
  );

  return {
    success: true,
    message: 'LGU settings updated successfully.',
  };
};

export type { DownloadArtifact };
