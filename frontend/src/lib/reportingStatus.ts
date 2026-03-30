import type {
  LguComplianceActionType,
  LguReportingControlStatus,
  LguReportingWindowStatus,
} from '@/types';

export interface ComplianceStatusTheme {
  title: string;
  buttonLabel: string;
  bannerClass: string;
  subtleTextClass: string;
  chipClass: string;
  buttonClass: string;
  activeButtonClass: string;
}

export const COMPLIANCE_ACTION_SEQUENCE: LguComplianceActionType[] = [
  'OPEN',
  'REMIND',
  'WARN',
  'RENOTIFY',
];

const ACTION_TO_CONTROL_STATUS: Record<
  LguComplianceActionType,
  Exclude<LguReportingControlStatus, 'closed'>
> = {
  OPEN: 'open',
  REMIND: 'remind',
  WARN: 'warn',
  RENOTIFY: 'renotify',
};

const CONTROL_STATUS_TO_WINDOW_STATUS: Record<LguReportingControlStatus, LguReportingWindowStatus> = {
  open: 'OPEN',
  remind: 'REMIND',
  warn: 'WARN',
  renotify: 'RENOTIFY',
  closed: 'CLOSED',
};

const CONTROL_STATUS_THEMES: Record<LguReportingControlStatus, ComplianceStatusTheme> = {
  open: {
    title: 'Open to Submit',
    buttonLabel: 'Open to Submit',
    bannerClass: 'border-emerald-300 bg-emerald-50 text-emerald-900',
    subtleTextClass: 'text-emerald-900/80',
    chipClass: 'bg-emerald-100 text-emerald-700',
    buttonClass: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50',
    activeButtonClass: 'border-emerald-600 bg-emerald-600 text-white',
  },
  remind: {
    title: 'Reminder Sent',
    buttonLabel: 'Remind',
    bannerClass: 'border-blue-300 bg-blue-50 text-blue-900',
    subtleTextClass: 'text-blue-900/80',
    chipClass: 'bg-blue-100 text-blue-700',
    buttonClass: 'border-blue-300 text-blue-700 hover:bg-blue-50',
    activeButtonClass: 'border-blue-600 bg-blue-600 text-white',
  },
  warn: {
    title: 'Warning Issued',
    buttonLabel: 'Warn',
    bannerClass: 'border-amber-300 bg-amber-50 text-amber-900',
    subtleTextClass: 'text-amber-900/80',
    chipClass: 'bg-amber-100 text-amber-700',
    buttonClass: 'border-amber-300 text-amber-700 hover:bg-amber-50',
    activeButtonClass: 'border-amber-600 bg-amber-600 text-white',
  },
  renotify: {
    title: 'Re-notification Sent',
    buttonLabel: 'Re-notify',
    bannerClass: 'border-rose-300 bg-rose-50 text-rose-900',
    subtleTextClass: 'text-rose-900/80',
    chipClass: 'bg-rose-100 text-rose-700',
    buttonClass: 'border-rose-300 text-rose-700 hover:bg-rose-50',
    activeButtonClass: 'border-rose-600 bg-rose-600 text-white',
  },
  closed: {
    title: 'Submission Locked',
    buttonLabel: 'Closed',
    bannerClass: 'border-slate-300 bg-slate-50 text-slate-900',
    subtleTextClass: 'text-slate-900/80',
    chipClass: 'bg-slate-100 text-slate-700',
    buttonClass: 'border-slate-300 text-slate-700 hover:bg-slate-50',
    activeButtonClass: 'border-slate-600 bg-slate-600 text-white',
  },
};

export const defaultGlobalNoticeByStatus: Record<LguReportingControlStatus, string> = {
  open: 'LGU request: reporting is OPEN. Please submit your monthly report now.',
  remind: 'LGU reminder: your monthly report is still pending. Please submit as soon as possible.',
  warn: 'LGU warning: your monthly report remains pending and immediate submission is required.',
  renotify: 'LGU re-notification: this is a follow-up notice to submit your pending monthly report.',
  closed: 'Notice: The LGU has closed the monthly reporting window.',
};

export const defaultEnterpriseNoticeByStatus: Record<
  Exclude<LguReportingControlStatus, 'closed'>,
  string
> = {
  open: 'LGU has opened your reporting window. You may now submit your monthly report.',
  remind: 'Friendly reminder from LGU: your monthly report submission is still pending.',
  warn: 'LGU warning: your monthly report has not been submitted and needs immediate action.',
  renotify: 'LGU re-notification: your report remains pending. Please complete submission now.',
};

const normalize = (value: string): string => value.trim().toLowerCase();

export const toControlStatusFromAction = (
  action: LguComplianceActionType | string,
): Exclude<LguReportingControlStatus, 'closed'> => {
  const normalized = normalize(action);

  if (normalized === 'remind') {
    return 'remind';
  }

  if (normalized === 'warn' || normalized === 'warning') {
    return 'warn';
  }

  if (normalized === 'renotify' || normalized === 'notify' || normalized === 're-notify') {
    return 'renotify';
  }

  return 'open';
};

export const toControlStatusFromWindowStatus = (
  status: string | null | undefined,
): LguReportingControlStatus => {
  const normalized = normalize(status || '');

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

  return 'closed';
};

export const toReportingWindowStatus = (
  status: LguReportingControlStatus,
): LguReportingWindowStatus => {
  return CONTROL_STATUS_TO_WINDOW_STATUS[status];
};

export const isSubmissionOpenStatus = (status: LguReportingControlStatus): boolean => {
  return status !== 'closed';
};

export const isWindowStatusOpen = (status: string): boolean => {
  const normalizedStatus = status.trim().toUpperCase();

  if (normalizedStatus === 'SUBMITTED' || normalizedStatus === 'CLOSED') {
    return false;
  }

  return isSubmissionOpenStatus(toControlStatusFromWindowStatus(status));
};

export const getComplianceStatusTheme = (
  status: LguReportingControlStatus | null | undefined,
): ComplianceStatusTheme => {
  if (!status) {
    return CONTROL_STATUS_THEMES.closed;
  }

  return CONTROL_STATUS_THEMES[status];
};

export const getControlStatusFromAction = (
  action: LguComplianceActionType,
): Exclude<LguReportingControlStatus, 'closed'> => {
  return ACTION_TO_CONTROL_STATUS[action];
};
