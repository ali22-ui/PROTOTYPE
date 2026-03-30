export type UserRole = 'enterprise';

export interface User {
  enterpriseId: string;
  businessPermit: string;
  companyName: string;
  linkedLguId: string;
  dashboardTitle: string;
  role: UserRole;
  token: string;
}

export interface LoginRequest {
  businessPermit: string;
  password: string;
}

export interface EnterpriseAccountPayload {
  enterprise_id: string;
  company_name: string;
  dashboard_title: string;
  linked_lgu_id: string;
  logo_url?: string;
}

export interface EnterpriseAccountsResponse {
  accounts: EnterpriseAccountPayload[];
}

export interface EnterpriseProfile {
  enterprise_id: string;
  company_name: string;
  dashboard_title: string;
  logo_url?: string;
  linked_lgu_id: string;
  reporting_window_status: 'OPEN' | 'CLOSED' | 'SUBMITTED' | string;
  timezone: string;
}

export interface ClusteredChartPoint {
  time_slot: string;
  male_total: number;
  female_total: number;
  male?: {
    tourist: number;
    local_resident: number;
    non_local_resident: number;
  };
  female?: {
    tourist: number;
    local_resident: number;
    non_local_resident: number;
  };
}

export interface DetailedDetectionRow {
  date: string;
  time_slot: string;
  male_total: number;
  female_total: number;
}

export interface EnterpriseDashboardResponse {
  enterprise_id: string;
  date: string;
  timezone: string;
  header: {
    company_name: string;
    datetime_label: string;
  };
  key_stats: {
    total_visitors_mtd: number;
    total_visitors_mtd_trend_pct: number;
    peak_visitor_hours: string[];
    clustered_chart_mode: string;
    average_dwell_time: string;
  };
  clustered_column_chart: ClusteredChartPoint[];
  detailed_detection_rows: DetailedDetectionRow[];
  visitor_residence_breakdown: {
    Foreigner?: number;
    'Non-Local Resident'?: number;
    'Local Resident'?: number;
    [key: string]: number | undefined;
  };
  peak_visit_frequency_by_residence: Array<{
    category: string;
    value: number;
  }>;
}

export interface VisitorStats {
  totalVisitorsPastMonth: number;
  trendPercentage: number;
  peakHour: string;
  peakDate: string;
  averageDwell: string;
  breakdown: {
    Foreigner: number;
    NonResident: number;
    LocalResident: number;
    Visitor: number;
    Tourist: number;
  };
  chartData: Array<{
    name: string;
    value: number;
    color: string;
  }>;
}

export interface CameraStreamBox {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CameraStream {
  enterprise_id: string;
  frame: number;
  fps: number;
  active_tracks: number;
  status: string;
  camera_name: string;
  sample_video_url?: string;
  boxes: CameraStreamBox[];
  events: string[];
}

export interface CameraLog {
  id: string;
  uniqueId: string;
  timeInIso: string;
  timeOutIso: string;
  timeIn: string;
  timeOut: string;
  durationHours: number;
  durationLabel: string;
  classification: 'Tourist' | 'Visitor';
  maleCount: number;
  femaleCount: number;
  totalCount: number;
}

export interface DetectionStatisticsRow {
  enterprise_id: string;
  date: string;
  hour: number | null;
  male_total: number;
  female_total: number;
  unknown_total: number;
  unique_visitors: number;
  avg_dwell_seconds: number | null;
}

export interface EnterpriseReportHistoryItem {
  report_id: string;
  enterprise_id: string;
  enterprise_name: string;
  submitted_at: string;
  submitted_by_user_id?: string;
  period: {
    month: string;
    start: string;
    end: string;
  };
  audit?: {
    reporting_window_status_at_submit?: string;
  };
}

export interface EnterpriseReportHistoryResponse {
  enterprise_id: string;
  reports: EnterpriseReportHistoryItem[];
}

export interface ArchivedReport {
  reportId: string;
  reportMonth: string;
  dateSubmitted: string;
  status: string;
  submittedBy: string;
}

export type LGUFormStatus = 'DRAFT' | 'STOCKED' | 'SUBMITTED';

export type LguComplianceFormType =
  | 'tra'
  | 'dot-accreditation'
  | 'tieza'
  | 'flagt'
  | 'tpb-registration'
  | 'visitor-record-attractions';

export interface MonthlyAggregateData {
  enterpriseId: string;
  month: string;
  siteName: string;
  location: {
    region: string;
    provinceCity: string;
    barangay: string;
  };
  totalVisitors: number;
  touristCount: number;
  visitorCount: number;
  actualVisitorCount: number;
  peakDate: string;
  peakHour: string;
  averageDwellHours: number;
  generatedAt: string;
  hasLguRequestedReports: boolean;
}

export interface TRAFormData {
  siteName: string;
  region: string;
  provinceCity: string;
  barangay: string;
  latitude: string;
  longitude: string;
  climate: string;
  actualVisitorCount: number;
  assessmentDate: string;
  assessorName: string;
  keyNaturalValues: string;
  keyCulturalValues: string;
  totalAreaHectares: string;
  coreZoneHectares: string;
  bufferZoneHectares: string;
  existingFacilities: string;
}

export interface DOTAccreditationFormData {
  establishmentName: string;
  accreditationNo: string;
  reportingMonth: string;
  managingEntity: string;
  contactNumber: string;
  contactEmail: string;
  firstAidKit: boolean;
  fireExtinguishers: boolean;
  evacuationPlan: boolean;
  cctvMonitoring: boolean;
  trainedFrontliners: boolean;
  incidentLogbook: boolean;
  male: number;
  female: number;
  localResidents: number;
  nonLocalResidents: number;
  foreignGuests: number;
  miceDelegates: number;
  complianceRemarks: string;
}

export interface TIEZAFormData {
  enterpriseName: string;
  enterpriseZoneLocation: string;
  landAreaHectares: string;
  investmentPriority: string;
  infrastructureNotes: string;
  roadAccess: boolean;
  utilityConnection: boolean;
  wasteManagement: boolean;
  emergencyResponse: boolean;
  authorizedRepresentative: string;
  dateSigned: string;
}

export interface FLAgTFormData {
  proponentName: string;
  projectName: string;
  municipalityProvince: string;
  landAreaRequestedHectares: string;
  tenureInstrument: string;
  forestLandClassification: string;
  declarationAccepted: boolean;
  environmentalSafeguards: boolean;
  communityConsultation: boolean;
  signatureName: string;
  signatureDate: string;
}

export interface TPBVisitorRegistrationFormData {
  eventName: string;
  eventType: string;
  organizer: string;
  venue: string;
  eventStartDate: string;
  eventEndDate: string;
  meeting: boolean;
  incentive: boolean;
  conference: boolean;
  exhibition: boolean;
  localMale: number;
  localFemale: number;
  localTotal: number;
  nonLocalMale: number;
  nonLocalFemale: number;
  nonLocalTotal: number;
  foreignMale: number;
  foreignFemale: number;
  foreignTotal: number;
  remarks: string;
}

export interface VisitorRecordFormData {
  attractionName: string;
  reportingMonth: string;
  row1Label: string;
  row1Male: number;
  row1Female: number;
  row1Local: number;
  row1Tourist: number;
  row2Label: string;
  row2Male: number;
  row2Female: number;
  row2Local: number;
  row2Tourist: number;
  row3Label: string;
  row3Male: number;
  row3Female: number;
  row3Local: number;
  row3Tourist: number;
  row4Label: string;
  row4Male: number;
  row4Female: number;
  row4Local: number;
  row4Tourist: number;
  row5Label: string;
  row5Male: number;
  row5Female: number;
  row5Local: number;
  row5Tourist: number;
  totalMale: number;
  totalFemale: number;
  totalLocal: number;
  totalTourist: number;
  preparedBy: string;
  approvedBy: string;
  remarks: string;
}

export interface ComplianceFormDataMap {
  tra: TRAFormData;
  'dot-accreditation': DOTAccreditationFormData;
  tieza: TIEZAFormData;
  flagt: FLAgTFormData;
  'tpb-registration': TPBVisitorRegistrationFormData;
  'visitor-record-attractions': VisitorRecordFormData;
}

export interface PdfFieldCoordinate {
  page: number;
  x: number;
  y: number;
  size?: number;
  maxWidth?: number;
  lineHeight?: number;
}

export interface PdfCoordinateOffset {
  x: number;
  y: number;
}

export type PdfCoordinateMap<TData extends object> =
  Partial<Record<Extract<keyof TData, string>, PdfFieldCoordinate>>;

export type ComplianceFormCoordinateMaps = {
  [TType in LguComplianceFormType]: PdfCoordinateMap<ComplianceFormDataMap[TType]>;
};

export type ComplianceFormCoordinateOffsets = {
  [TType in LguComplianceFormType]: PdfCoordinateOffset;
};

export type ComplianceFormTemplateFiles = Record<LguComplianceFormType, string>;

export interface LguComplianceFormBase<
  TType extends LguComplianceFormType,
  TData,
> {
  id: string;
  type: TType;
  title: string;
  description: string;
  month: string;
  status: LGUFormStatus;
  data: TData;
  lastUpdated: string;
  submittedAt?: string;
}

export type TRAComplianceFormRecord = LguComplianceFormBase<'tra', TRAFormData>;
export type DOTAccreditationFormRecord =
  LguComplianceFormBase<'dot-accreditation', DOTAccreditationFormData>;
export type TIEZAFormRecord = LguComplianceFormBase<'tieza', TIEZAFormData>;
export type FLAgTFormRecord = LguComplianceFormBase<'flagt', FLAgTFormData>;
export type TPBVisitorRegistrationFormRecord =
  LguComplianceFormBase<'tpb-registration', TPBVisitorRegistrationFormData>;
export type VisitorRecordFormRecord =
  LguComplianceFormBase<'visitor-record-attractions', VisitorRecordFormData>;

export type LguComplianceFormRecord =
  | TRAComplianceFormRecord
  | DOTAccreditationFormRecord
  | TIEZAFormRecord
  | FLAgTFormRecord
  | TPBVisitorRegistrationFormRecord
  | VisitorRecordFormRecord;

export interface LguNotificationStatus {
  hasLguRequestedReports: boolean;
  requestedAt?: string | null;
  message?: string;
}

export interface LguFormSubmissionResult {
  reportId: string;
  status: string;
  message: string;
  submittedAt: string;
}

export interface DashboardMetricCardData {
  averageVisitCountMtd: number;
  trendPercentage: number;
  peakDayLabel: string;
  peakTimeRange: string;
  reportMonthLabel: string;
  reportStatus: 'ongoing' | 'submitted' | 'closed';
}

export interface DashboardWeeklyAreaPoint {
  day: 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat';
  male: number;
  female: number;
  visitors: number;
  tourist: number;
}

export interface DashboardHourlyAreaPoint {
  hourLabel: string;
  male: number;
  female: number;
  visitor: number;
  tourist: number;
}

export interface ResidenceMixDistributionRow {
  category: 'Non-Local Resident' | 'Local Resident' | 'Foreigner';
  value: number;
  percentage: number;
}

export interface DashboardLayoutData {
  title: string;
  timestampLabel: string;
  metrics: DashboardMetricCardData;
  weeklyDemographicSeries: DashboardWeeklyAreaPoint[];
  hourlyDemographicSeries: DashboardHourlyAreaPoint[];
  residenceMixDistribution: ResidenceMixDistributionRow[];
}

export interface CameraDetectionEventRow {
  id: string;
  timeLabel: string;
  frame: number;
  details: string;
}

export interface CameraTrackBreakdownItem {
  label: string;
  count: number;
}

export interface CameraGenderSplit {
  male: number;
  female: number;
}

export interface CameraMonitoringLayoutData {
  cameraTitle: string;
  timestampLabel: string;
  feedUrl: string;
  streamHealth: {
    dateLabel: string;
    fps: number;
    activeTracks: number;
    status: string;
  };
  activeTrackBreakdown: CameraTrackBreakdownItem[];
  currentContext: {
    dateLabel: string;
    timeLabel: string;
  };
  events: CameraDetectionEventRow[];
  todayVisitorData: {
    tourist: CameraGenderSplit;
    visitor: CameraGenderSplit;
  };
}

export type ArchivedLguStatus = 'Acknowledged' | 'Pending' | 'Rejected' | 'Submitted';

export interface ArchivedReportTableRow {
  reportId: string;
  periodLabel: string;
  submittedDateLabel: string;
  lguStatus: ArchivedLguStatus;
  submittedBy: string;
  downloadHref: string;
}

export interface EnterpriseAccountProfileSettings {
  businessPermit: string;
  contactEmail: string;
  businessPhone: string;
  representativeName: string;
}

export interface EnterpriseSystemPreferences {
  emailNotifications: boolean;
  themePreference: 'system' | 'light' | 'dark';
}

export interface EnterpriseAccountSettingsPayload {
  profile: EnterpriseAccountProfileSettings;
  preferences: EnterpriseSystemPreferences;
}

export interface EnterprisePasswordUpdatePayload {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

export interface ApiMutationResult {
  success: boolean;
  message: string;
}

export type LguSubmissionStatus = 'SUBMITTED' | 'PENDING';

export type LguComplianceNoticeStatus = 'open' | 'remind' | 'warn' | 'renotify';

export type LguReportingControlStatus = LguComplianceNoticeStatus | 'closed';

export type LguReportingWindowStatus =
  | 'OPEN'
  | 'REMIND'
  | 'WARN'
  | 'RENOTIFY'
  | 'CLOSED'
  | 'SUBMITTED'
  | string;

export type LguEnterpriseStatus = 'Active' | 'Under Review' | 'Pending Renewal' | string;

export type LguComplianceActionType = 'OPEN' | 'REMIND' | 'WARN' | 'RENOTIFY';

export type LguInfractionSeverity = 'warning' | 'strike';

export interface LguInfractionRecord {
  id: string;
  period: string;
  date: string;
  type: string;
  severity: LguInfractionSeverity;
  source: 'LGU_CLOSE_REPORTING_WINDOW' | string;
  note?: string;
}

export interface LguGeoPoint {
  lat: number;
  lng: number;
}

export interface LguBarangay {
  id: string;
  name: string;
  center: LguGeoPoint;
  coordinates: LguGeoPoint[];
  enterpriseCount: number;
}

export interface LguHeatPoint extends LguGeoPoint {
  weight: number;
}

export interface LguBarangaysResponse {
  barangays: LguBarangay[];
  heatmap: LguHeatPoint[];
}

export interface LguBarangaysGeoJsonFeature {
  type: 'Feature';
  properties: {
    id: string;
    name: string;
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

export interface LguBarangaysGeoJsonResponse {
  type: 'FeatureCollection';
  features: LguBarangaysGeoJsonFeature[];
}

export interface LguOverviewResponse {
  city: string;
  zip: string;
  date: string;
  metrics: {
    totalPeopleToday: number;
    totalVisitors: number;
    totalTourists: number;
    currentlyInside: number;
  };
  sparkline: {
    totalPeopleToday: number[];
    totalVisitors: number[];
    totalTourists: number[];
    currentlyInside: number[];
  };
  recentActivities: string[];
  peakHour: Array<{
    time: string;
    value: number;
  }>;
}

export interface LguLogEntry {
  id: string;
  timestamp: string;
  source: string;
  category: string;
  message: string;
  severity: 'Info' | 'Warning' | 'Error' | string;
}

export interface LguLogsResponse {
  logs: LguLogEntry[];
}

export interface LguReportsDashboardDemographic {
  name: string;
  value: number;
}

export interface LguReportDashboardItem {
  id: string;
  business: string;
  status: string;
  type: string;
  submittedBy: string;
  submittedAt: string;
  summary: string;
}

export interface LguReportsDashboardResponse {
  quarterlyVisitorDemographics: LguReportsDashboardDemographic[];
  submittedReports: LguReportDashboardItem[];
}

export interface LguEnterpriseNode {
  id: number;
  name: string;
  barangay: string;
  type: string;
  status: LguEnterpriseStatus;
  businessId: string;
}

export interface LguBarangayEnterprisesResponse {
  barangay: string;
  enterprises: LguEnterpriseNode[];
}

export interface LguEnterpriseAnalyticsResponse {
  enterprise: LguEnterpriseNode;
  analytics: {
    demographics: Array<{
      name: string;
      value: number;
    }>;
    residency: Array<{
      name: string;
      value: number;
    }>;
    visitorTrends: Array<{
      month: string;
      visitors: number;
    }>;
    reportHistory: Array<{
      date: string;
      type: string;
      status: string;
    }>;
  };
}

export interface LguEnterpriseAnalyticsSummary {
  monthlyVisitors: number;
  topDemographic: string;
  trendDirection: 'UP' | 'DOWN' | 'FLAT';
}

export interface LguEnterpriseAnalyticsDetail extends LguEnterpriseAnalyticsSummary {
  demographics: Array<{
    name: string;
    value: number;
  }>;
  totalTourists: number;
  localResidents: number;
  nonLocalResidents: number;
  maleCount: number;
  femaleCount: number;
  maleRatioPct: number;
  femaleRatioPct: number;
}

export interface LguReportWindow {
  enterprise_id: string;
  period: string;
  status: LguReportingWindowStatus;
  opened_at: string;
  opened_by: string;
}

export interface LguOverviewAdminResponse {
  lgu_id: string;
  name: string;
  total_linked_enterprises: number;
  submitted_reports_current_period: number;
  submission_completion_rate_pct: number;
  active_reporting_window: LguReportWindow;
}

export interface LguEnterpriseAccount {
  enterprise_id: string;
  company_name: string;
  linked_lgu_id: string;
  barangay?: string;
  reporting_window_status: LguReportingWindowStatus;
  has_submitted_for_period: boolean;
  infraction_count?: number;
  latest_infraction?: LguInfractionRecord | null;
  period?: string;
  dashboard_title?: string;
  logo_url?: string;
}

export interface LguEnterpriseAccountsResponse {
  period: string;
  accounts: LguEnterpriseAccount[];
}

export interface LguEnterpriseAccountDraft {
  enterprise_id: string;
  company_name: string;
  linked_lgu_id: string;
  username: string;
  temporary_password: string;
  barangay: string;
  contact_email: string;
}

export interface LguMutationResult {
  success: boolean;
  message: string;
}

export interface LguReportPack {
  report_id: string;
  enterprise_id: string;
  enterprise_name: string;
  linked_lgu_id?: string;
  period: {
    month: string;
    start?: string;
    end?: string;
  };
  submitted_at: string;
  submitted_by_user_id?: string;
  kpis?: {
    total_visitors_mtd?: number;
    trend_pct?: number;
    avg_dwell?: string;
    peak_visitor_hours?: string[];
  };
  charts?: {
    visitor_residence_breakdown?: Record<string, number>;
    daily_summary?: Array<{
      date: string;
      total_visitors: number;
      avg_dwell_minutes: number;
      peak_hour: string;
    }>;
    detailed_detection_rows?: DetailedDetectionRow[];
  };
}

export interface LguReportPacksResponse {
  reports: LguReportPack[];
}

export interface LguAuthorityPackage {
  authority_package_id: string;
  generated_at: string;
  classification: string;
  executive_summary: {
    enterprise: string;
    period: string;
    total_visitors: number;
    average_dwell: string;
    top_peak_hours: string[];
  };
  compliance_notes: string[];
  attachments: string[];
}

export interface LguEnterpriseComplianceActionRequest {
  enterpriseId: string;
  period: string;
  action: LguComplianceActionType;
  message?: string;
}

export interface LguEnterpriseComplianceActionResponse {
  success: boolean;
  message: string;
  enterpriseId: string;
  action: LguComplianceActionType;
  windowStatus: LguReportingWindowStatus;
  triggeredAt: string;
}

export interface LguSettingsPayload {
  adminUsername: string;
  adminEmail: string;
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
  preferences: {
    systemAlerts: boolean;
    complianceDigest: boolean;
    darkMode: boolean;
  };
}
