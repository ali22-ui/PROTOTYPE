import {
  isSubmissionOpenStatus,
  toReportingWindowStatus,
} from '@/lib/reportingStatus';
import type {
  CameraLog,
  LguComplianceNoticeStatus,
  LguInfractionRecord,
  LguReportingControlStatus,
  LguReportingWindowStatus,
} from '@/types';

export const LGU_PORTAL_BRIDGE_STORAGE_KEY = 'lgu-enterprise-portal-bridge-v1';
export const REPORTING_STATUS_STORAGE_KEY = 'reportingStatus';
const PORTAL_BRIDGE_EVENT_NAME = 'lgu-portal-bridge-updated';
const STORAGE_B64_PREFIX = 'b64:';

export type ReportingControlScope = 'ALL' | 'ENTERPRISE';

export interface LguReportingControlState {
  status: LguReportingControlStatus;
  isOpen: boolean;
  period: string;
  message: string;
  triggeredBy: string;
  triggeredAt: string;
  scope: ReportingControlScope;
  enterpriseId?: string;
}

export interface LguEnterpriseSubmissionRecord {
  reportId: string;
  enterpriseId: string;
  enterpriseName: string;
  month: string;
  submittedAt: string;
  rowCount: number;
  totalPeopleCount: number;
  touristTaggedRows: number;
  visitorTaggedRows: number;
  status: string;
  source: 'enterprise-report-center';
}

interface LguPortalBridgeState {
  reportingControl: LguReportingControlState | null;
  submissions: LguEnterpriseSubmissionRecord[];
  infractions: Record<string, LguInfractionRecord[]>;
}

const toTimestamp = (value: string): number => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const sortInfractions = (records: LguInfractionRecord[]): LguInfractionRecord[] => {
  return records
    .slice()
    .sort((left, right) => toTimestamp(right.date) - toTimestamp(left.date));
};

const normalizeInfractionSeverity = (value: unknown): LguInfractionRecord['severity'] => {
  if (typeof value === 'string' && value.trim().toLowerCase() === 'strike') {
    return 'strike';
  }

  return 'warning';
};

const normalizeInfractionRecord = (value: unknown): LguInfractionRecord | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<LguInfractionRecord>;
  const date = typeof candidate.date === 'string' ? candidate.date : new Date().toISOString();
  const period =
    typeof candidate.period === 'string' && candidate.period.trim()
      ? candidate.period
      : date.slice(0, 7);
  const type =
    typeof candidate.type === 'string' && candidate.type.trim()
      ? candidate.type
      : 'Failed to Comply - Late Submission';
  const source =
    typeof candidate.source === 'string' && candidate.source.trim()
      ? candidate.source
      : 'LGU_CLOSE_REPORTING_WINDOW';

  return {
    id:
      typeof candidate.id === 'string' && candidate.id.trim()
        ? candidate.id
        : `${period}::${type}::${date}`,
    period,
    date,
    type,
    severity: normalizeInfractionSeverity(candidate.severity),
    source,
    note: typeof candidate.note === 'string' ? candidate.note : undefined,
  };
};

const normalizeInfractionsByEnterprise = (
  value: unknown,
): Record<string, LguInfractionRecord[]> => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const normalized: Record<string, LguInfractionRecord[]> = {};

  Object.entries(value as Record<string, unknown>).forEach(([enterpriseId, records]) => {
    if (!enterpriseId || !Array.isArray(records)) {
      return;
    }

    const normalizedRecords = sortInfractions(
      records
        .map((entry) => normalizeInfractionRecord(entry))
        .filter((entry): entry is LguInfractionRecord => Boolean(entry)),
    );

    if (normalizedRecords.length) {
      normalized[enterpriseId] = normalizedRecords;
    }
  });

  return normalized;
};

const normalizeControlStatus = (
  status: unknown,
  fallbackIsOpen: boolean,
): LguReportingControlStatus => {
  if (typeof status === 'string') {
    const normalized = status.trim().toLowerCase();

    if (normalized === 'open') {
      return 'open';
    }

    if (normalized === 'remind') {
      return 'remind';
    }

    if (normalized === 'warn' || normalized === 'warning') {
      return 'warn';
    }

    if (normalized === 'renotify' || normalized === 'notify' || normalized === 're-notify') {
      return 'renotify';
    }

    if (normalized === 'closed' || normalized === 'close') {
      return 'closed';
    }
  }

  return fallbackIsOpen ? 'open' : 'closed';
};

const normalizeReportingControlState = (value: unknown): LguReportingControlState | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<LguReportingControlState>;
  const period = typeof candidate.period === 'string' ? candidate.period : '';
  if (!period) {
    return null;
  }

  const fallbackIsOpen = typeof candidate.isOpen === 'boolean' ? candidate.isOpen : true;
  const status = normalizeControlStatus(candidate.status, fallbackIsOpen);
  const scope: ReportingControlScope = candidate.scope === 'ENTERPRISE' ? 'ENTERPRISE' : 'ALL';

  return {
    status,
    isOpen: isSubmissionOpenStatus(status),
    period,
    message: typeof candidate.message === 'string' ? candidate.message : '',
    triggeredBy: typeof candidate.triggeredBy === 'string' ? candidate.triggeredBy : 'LGU Admin',
    triggeredAt:
      typeof candidate.triggeredAt === 'string' ? candidate.triggeredAt : new Date().toISOString(),
    scope,
    enterpriseId:
      scope === 'ENTERPRISE' && typeof candidate.enterpriseId === 'string'
        ? candidate.enterpriseId
        : undefined,
  };
};

const canUseStorage = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const encodeBase64 = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return globalThis.btoa(binary);
};

const decodeBase64 = (value: string): string | null => {
  try {
    const binary = globalThis.atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
};

const readJson = <T>(key: string, fallback: T): T => {
  if (!canUseStorage()) {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }

    const decoded = raw.startsWith(STORAGE_B64_PREFIX)
      ? decodeBase64(raw.slice(STORAGE_B64_PREFIX.length))
      : raw;
    if (!decoded) {
      return fallback;
    }

    return JSON.parse(decoded) as T;
  } catch {
    return fallback;
  }
};

const writeJson = <T>(key: string, value: T): void => {
  if (!canUseStorage()) {
    return;
  }

  const serialized = JSON.stringify(value);
  const encoded = `${STORAGE_B64_PREFIX}${encodeBase64(serialized)}`;
  window.localStorage.setItem(key, encoded);
  window.dispatchEvent(
    new CustomEvent(PORTAL_BRIDGE_EVENT_NAME, {
      detail: {
        key,
      },
    }),
  );
};

const writeLegacyReportingStatus = (status: LguReportingControlStatus | null): void => {
  if (!canUseStorage()) {
    return;
  }

  if (!status) {
    window.localStorage.removeItem(REPORTING_STATUS_STORAGE_KEY);
  } else {
    window.localStorage.setItem(
      REPORTING_STATUS_STORAGE_KEY,
      `${STORAGE_B64_PREFIX}${encodeBase64(status)}`,
    );
  }

  window.dispatchEvent(
    new CustomEvent(PORTAL_BRIDGE_EVENT_NAME, {
      detail: {
        key: REPORTING_STATUS_STORAGE_KEY,
      },
    }),
  );
};

const defaultBridgeState = (): LguPortalBridgeState => ({
  reportingControl: null,
  submissions: [],
  infractions: {},
});

const readBridgeState = (): LguPortalBridgeState => {
  const state = readJson<LguPortalBridgeState>(LGU_PORTAL_BRIDGE_STORAGE_KEY, defaultBridgeState());
  const reportingControl = normalizeReportingControlState(state.reportingControl);

  return {
    reportingControl,
    submissions: Array.isArray(state.submissions) ? state.submissions : [],
    infractions: normalizeInfractionsByEnterprise(state.infractions),
  };
};

const writeBridgeState = (state: LguPortalBridgeState): void => {
  writeJson<LguPortalBridgeState>(LGU_PORTAL_BRIDGE_STORAGE_KEY, state);
  writeLegacyReportingStatus(state.reportingControl?.status ?? null);
};

export const getLegacyReportingStatus = (): LguReportingControlStatus | null => {
  if (!canUseStorage()) {
    return null;
  }

  const raw = window.localStorage.getItem(REPORTING_STATUS_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  const decoded = raw.startsWith(STORAGE_B64_PREFIX)
    ? decodeBase64(raw.slice(STORAGE_B64_PREFIX.length))
    : raw;
  if (!decoded) {
    return null;
  }

  const normalizedRaw = decoded.trim();
  const isClosed = normalizedRaw.toLowerCase() === 'closed';
  return normalizeControlStatus(normalizedRaw, !isClosed);
};

export const getReportingControlState = (): LguReportingControlState | null =>
  readBridgeState().reportingControl;

export const setReportingControlState = (state: LguReportingControlState): void => {
  const normalizedState = normalizeReportingControlState(state) ?? {
    ...state,
    status: normalizeControlStatus(state.status, state.isOpen),
    isOpen: isSubmissionOpenStatus(normalizeControlStatus(state.status, state.isOpen)),
  };

  const current = readBridgeState();
  writeBridgeState({
    ...current,
    reportingControl: normalizedState,
  });
};

const buildReportingControlState = (params: {
  status: LguReportingControlStatus;
  period: string;
  message: string;
  triggeredBy: string;
  scope: ReportingControlScope;
  enterpriseId?: string;
}): LguReportingControlState => {
  const status = normalizeControlStatus(params.status, true);

  return {
    status,
    isOpen: isSubmissionOpenStatus(status),
    period: params.period,
    message: params.message,
    triggeredBy: params.triggeredBy,
    triggeredAt: new Date().toISOString(),
    scope: params.scope,
    enterpriseId: params.enterpriseId,
  };
};

export const setGlobalReportingControlStatus = (params: {
  period: string;
  message: string;
  triggeredBy: string;
  status: LguReportingControlStatus;
}): LguReportingControlState => {
  const nextState = buildReportingControlState({
    ...params,
    scope: 'ALL',
  });

  setReportingControlState(nextState);
  return nextState;
};

export const setEnterpriseReportingControlStatus = (params: {
  period: string;
  enterpriseId: string;
  message: string;
  triggeredBy: string;
  status: LguReportingControlStatus;
}): LguReportingControlState => {
  const nextState = buildReportingControlState({
    ...params,
    scope: 'ENTERPRISE',
  });

  setReportingControlState(nextState);
  return nextState;
};

export const openGlobalReportingWindow = (params: {
  period: string;
  message: string;
  triggeredBy: string;
}): LguReportingControlState => {
  return setGlobalReportingControlStatus({
    ...params,
    status: 'open',
  });
};

export const closeGlobalReportingWindow = (params: {
  period: string;
  message: string;
  triggeredBy: string;
}): LguReportingControlState => {
  return setGlobalReportingControlStatus({
    ...params,
    status: 'closed',
  });
};

export const openEnterpriseReportingWindow = (params: {
  period: string;
  enterpriseId: string;
  message: string;
  triggeredBy: string;
  status?: LguComplianceNoticeStatus;
}): LguReportingControlState => {
  return setEnterpriseReportingControlStatus({
    ...params,
    status: params.status || 'open',
  });
};

export const closeEnterpriseReportingWindow = (params: {
  period: string;
  enterpriseId: string;
  message: string;
  triggeredBy: string;
}): LguReportingControlState => {
  return setEnterpriseReportingControlStatus({
    ...params,
    status: 'closed',
  });
};

export const getReportingControlStateForEnterprise = (
  enterpriseId: string,
  month: string,
): LguReportingControlState | null => {
  const state = getReportingControlState();

  if (!state || state.period !== month) {
    return null;
  }

  if (state.scope === 'ALL') {
    return state;
  }

  return state.enterpriseId === enterpriseId ? state : null;
};

export const getReportingWindowStatusForEnterprise = (
  enterpriseId: string,
  month: string,
): LguReportingWindowStatus | null => {
  const state = getReportingControlStateForEnterprise(enterpriseId, month);
  if (!state) {
    return null;
  }

  return toReportingWindowStatus(state.status);
};

export const isReportingWindowOpenForEnterprise = (
  enterpriseId: string,
  month: string,
): boolean => {
  const state = getReportingControlStateForEnterprise(enterpriseId, month);
  if (!state) {
    return false;
  }

  return isSubmissionOpenStatus(state.status);
};

export const readSubmissionRecords = (): LguEnterpriseSubmissionRecord[] =>
  readBridgeState().submissions;

export const readAllEnterpriseInfractions = (): Record<string, LguInfractionRecord[]> => {
  return readBridgeState().infractions;
};

export const readEnterpriseInfractions = (enterpriseId: string): LguInfractionRecord[] => {
  const records = readBridgeState().infractions[enterpriseId] || [];
  return sortInfractions(records);
};

export const appendEnterpriseInfraction = (
  enterpriseId: string,
  record: LguInfractionRecord,
): LguInfractionRecord[] => {
  const normalizedRecord = normalizeInfractionRecord(record);
  if (!normalizedRecord) {
    return readEnterpriseInfractions(enterpriseId);
  }

  const bridge = readBridgeState();
  const current = bridge.infractions[enterpriseId] || [];
  const dedupeKey = `${normalizedRecord.period}::${normalizedRecord.type}::${normalizedRecord.source}`;
  const alreadyExists = current.some(
    (entry) => `${entry.period}::${entry.type}::${entry.source}` === dedupeKey,
  );

  const nextRecords = alreadyExists
    ? sortInfractions(current)
    : sortInfractions([normalizedRecord, ...current]);

  writeBridgeState({
    ...bridge,
    infractions: {
      ...bridge.infractions,
      [enterpriseId]: nextRecords,
    },
  });

  return nextRecords;
};

export const getEnterpriseInfractionCount = (enterpriseId: string): number => {
  return readEnterpriseInfractions(enterpriseId).length;
};

export const hasSubmissionRecordForEnterprisePeriod = (
  enterpriseId: string,
  month: string,
): boolean => {
  return readSubmissionRecords().some(
    (record) => record.enterpriseId === enterpriseId && record.month === month,
  );
};

const uniqueSubmissionKey = (record: Pick<LguEnterpriseSubmissionRecord, 'enterpriseId' | 'month'>): string =>
  `${record.enterpriseId}::${record.month}`;

export const upsertSubmissionRecord = (record: LguEnterpriseSubmissionRecord): void => {
  const bridge = readBridgeState();
  const current = bridge.submissions;
  const recordKey = uniqueSubmissionKey(record);

  const merged = [
    record,
    ...current.filter((entry) => uniqueSubmissionKey(entry) !== recordKey),
  ];

  writeBridgeState({
    ...bridge,
    submissions: merged,
  });
};

export const buildSubmissionRecordFromLogs = (params: {
  reportId: string;
  enterpriseId: string;
  enterpriseName: string;
  month: string;
  status: string;
  logs: CameraLog[];
}): LguEnterpriseSubmissionRecord => {
  const touristTaggedRows = params.logs.filter((log) => log.classification === 'Tourist').length;

  return {
    reportId: params.reportId,
    enterpriseId: params.enterpriseId,
    enterpriseName: params.enterpriseName,
    month: params.month,
    submittedAt: new Date().toISOString(),
    rowCount: params.logs.length,
    totalPeopleCount: params.logs.reduce((sum, row) => sum + row.totalCount, 0),
    touristTaggedRows,
    visitorTaggedRows: Math.max(params.logs.length - touristTaggedRows, 0),
    status: params.status,
    source: 'enterprise-report-center',
  };
};

export const subscribePortalBridge = (onChange: () => void): (() => void) => {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const onStorage = (event: StorageEvent): void => {
    if (!event.key) {
      onChange();
      return;
    }

    if (event.key === LGU_PORTAL_BRIDGE_STORAGE_KEY || event.key === REPORTING_STATUS_STORAGE_KEY) {
      onChange();
    }
  };

  const onCustomUpdate = (event: Event): void => {
    const customEvent = event as CustomEvent<{ key?: string }>;
    const key = customEvent.detail?.key;

    if (
      key === LGU_PORTAL_BRIDGE_STORAGE_KEY
      || key === REPORTING_STATUS_STORAGE_KEY
      || typeof key === 'undefined'
    ) {
      onChange();
    }
  };

  window.addEventListener('storage', onStorage);
  window.addEventListener(PORTAL_BRIDGE_EVENT_NAME, onCustomUpdate as EventListener);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(PORTAL_BRIDGE_EVENT_NAME, onCustomUpdate as EventListener);
  };
};
