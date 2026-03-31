import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchGlobalReportingWindowOpenState,
  fetchLguEnterpriseAccounts,
  fetchLguLogs,
  fetchLguReportPacks,
  setGlobalReportingWindowOpenState,
} from '@/features/lgu/master/api/apiService';
import type { LguEnterpriseAccount, LguLogEntry, LguReportPack } from '@/types';

type ComplianceStatus = 'Compliant' | 'Pending' | 'Overdue';
type ComplianceAction = 'REMIND' | 'WARN' | 'RENOTIFY';

interface Enterprise {
  id: string;
  company_name: string;
  barangay: string;
  category: string;
  compliance_status: ComplianceStatus;
  reporting_window_status: string;
  has_submitted_for_period: boolean;
}

interface ActivityLogRow {
  id: string;
  time: string;
  category: string;
  enterprise: string;
  message: string;
}

const complianceBadgeClass: Record<ComplianceStatus, string> = {
  Compliant: 'bg-brand-mid/20 text-brand-dark',
  Pending: 'bg-brand-accent/20 text-brand-accent',
  Overdue: 'bg-brand-accent/20 text-brand-accent',
};

const actionFeedbackLabel: Record<ComplianceAction, string> = {
  REMIND: 'Reminder',
  WARN: 'Warning',
  RENOTIFY: 'Re-notification',
};

const normalize = (value: string): string => value.trim().toLowerCase();

const formatDateTime = (value: string | null): string => {
  if (!value) {
    return 'No submission yet';
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed).toLocaleString('en-PH');
};

const mapAccountToEnterprise = (account: LguEnterpriseAccount): Enterprise => {
  const normalizedComplianceStatus = normalize(account.compliance_status || '');
  const normalizedWindowStatus = normalize(
    account.reporting_window_status || account.window_status || 'closed',
  );

  let complianceStatus: ComplianceStatus = 'Pending';

  if (
    account.has_submitted_for_period
    || normalizedComplianceStatus === 'compliant'
    || normalizedComplianceStatus === 'submitted'
    || normalizedWindowStatus === 'submitted'
  ) {
    complianceStatus = 'Compliant';
  } else if (
    normalizedComplianceStatus === 'overdue'
    || normalizedComplianceStatus === 'warn'
    || normalizedComplianceStatus === 'warning'
    || normalizedComplianceStatus === 'renotify'
    || normalizedWindowStatus === 'warn'
    || normalizedWindowStatus === 'renotify'
  ) {
    complianceStatus = 'Overdue';
  }

  return {
    id: account.enterprise_id,
    company_name: account.company_name,
    barangay: account.barangay?.trim() || 'Unassigned Barangay',
    category: account.dashboard_title?.trim() || 'General Business',
    compliance_status: complianceStatus,
    reporting_window_status: String(account.reporting_window_status || account.window_status || 'CLOSED').toUpperCase(),
    has_submitted_for_period: account.has_submitted_for_period,
  };
};

const getLatestSubmissionLookup = (reports: LguReportPack[]): Record<string, string> => {
  const lookup: Record<string, string> = {};

  reports.forEach((report) => {
    const existing = lookup[report.enterprise_id];
    if (!existing || existing < report.submitted_at) {
      lookup[report.enterprise_id] = report.submitted_at;
    }
  });

  return lookup;
};

const getEnterpriseStatusMessage = (enterprise: Enterprise, period: string): string => {
  if (enterprise.compliance_status === 'Compliant') {
    return `${enterprise.company_name} submitted the ${period} report.`;
  }

  if (enterprise.compliance_status === 'Overdue') {
    return `${enterprise.company_name} is overdue for ${period}. Follow-up required.`;
  }

  return `${enterprise.company_name} is pending submission for ${period}.`;
};

const findEnterpriseMention = (message: string, enterprises: Enterprise[]): string => {
  const normalizedMessage = normalize(message);
  const matched = enterprises.find((enterprise) =>
    normalizedMessage.includes(normalize(enterprise.company_name)),
  );

  return matched?.company_name || 'System-wide';
};

const mapBackendLogsToActivityRows = (
  logs: LguLogEntry[],
  enterprises: Enterprise[],
): ActivityLogRow[] => {
  return logs.map((log) => ({
    id: log.id,
    time: formatDateTime(log.timestamp),
    category: log.category?.trim() || 'System',
    enterprise: findEnterpriseMention(log.message, enterprises),
    message: log.message,
  }));
};

const buildDerivedActivityRows = (
  enterprises: Enterprise[],
  latestSubmissionByEnterpriseId: Record<string, string>,
  period: string,
): ActivityLogRow[] => {
  return enterprises.map((enterprise, index) => {
    const latestSubmission = latestSubmissionByEnterpriseId[enterprise.id] || null;

    return {
      id: `derived-${enterprise.id}-${index}`,
      time: latestSubmission ? formatDateTime(latestSubmission) : 'Timestamp unavailable',
      category: enterprise.compliance_status === 'Compliant' ? 'Status Update' : 'System',
      enterprise: enterprise.company_name,
      message: getEnterpriseStatusMessage(enterprise, period),
    };
  });
};

const getSeverityClass = (severity: string): string => {
  const normalizedSeverity = normalize(severity);

  if (normalizedSeverity === 'error') {
    return 'bg-rose-100 text-rose-700';
  }

  if (normalizedSeverity === 'warning') {
    return 'bg-amber-100 text-amber-700';
  }

  return 'bg-brand-mid/20 text-brand-dark';
};

export default function EnterpriseLogsView(): JSX.Element {
  const [period, setPeriod] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isWindowOpen, setIsWindowOpen] = useState<boolean>(false);
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [backendLogs, setBackendLogs] = useState<LguLogEntry[]>([]);
  const [latestSubmissionByEnterpriseId, setLatestSubmissionByEnterpriseId] =
    useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isTogglingWindow, setIsTogglingWindow] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string>('');
  const [actionFeedback, setActionFeedback] = useState<string>('');
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const loadAccounts = useCallback(async (): Promise<void> => {
    const payload = await fetchLguEnterpriseAccounts(period);
    const mappedAccounts = payload.accounts
      .map(mapAccountToEnterprise)
      .sort((left, right) => left.company_name.localeCompare(right.company_name));

    setEnterprises(mappedAccounts);

    if (!payload.accounts.length) {
      setFeedback('No enterprise account records returned for the selected period.');
    } else {
      setFeedback('');
    }
  }, [period]);

  useEffect(() => {
    setIsLoading(true);
    void loadAccounts()
      .catch((error: unknown) => {
        console.error('Failed to load enterprise management accounts for logs view:', error);
        setFeedback('Unable to load enterprise account records from backend.');
        setEnterprises([]);
        setIsWindowOpen(false);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [loadAccounts]);

  const loadGlobalWindowState = useCallback(async (): Promise<void> => {
    const state = await fetchGlobalReportingWindowOpenState();
    setIsWindowOpen(state.isOpen);
  }, []);

  useEffect(() => {
    void loadGlobalWindowState().catch((error: unknown) => {
      console.error('Failed to load global reporting window state:', error);
      setActionFeedback('Unable to read reporting window status from backend.');
    });
  }, [loadGlobalWindowState]);

  useEffect(() => {
    const loadLatestSubmissions = async (): Promise<void> => {
      try {
        const payload = await fetchLguReportPacks(period);
        setLatestSubmissionByEnterpriseId(getLatestSubmissionLookup(payload.reports));
      } catch (error: unknown) {
        console.error('Unable to load report packs for compliance timestamps:', error);
        setLatestSubmissionByEnterpriseId({});
      }
    };

    void loadLatestSubmissions();
  }, [period]);

  useEffect(() => {
    const loadLogs = async (): Promise<void> => {
      try {
        const payload = await fetchLguLogs();
        setBackendLogs(payload.logs);
      } catch (error: unknown) {
        console.error('Unable to load activity logs from backend:', error);
        setBackendLogs([]);
      }
    };

    void loadLogs();
  }, [period]);

  const filteredEnterprises = useMemo<Enterprise[]>(() => {
    const query = normalize(searchQuery);

    if (!query) {
      return enterprises;
    }

    return enterprises.filter((enterprise) => {
      return [enterprise.company_name, enterprise.barangay, enterprise.id].some((field) =>
        normalize(field).includes(query),
      );
    });
  }, [enterprises, searchQuery]);

  const enterprisesInView = filteredEnterprises;

  const groupedEnterprises = useMemo<Record<string, Enterprise[]>>(() => {
    return enterprisesInView.reduce((acc, enterprise) => {
      const barangay = enterprise.barangay || 'Unassigned';
      if (!acc[barangay]) {
        acc[barangay] = [];
      }
      acc[barangay].push(enterprise);
      return acc;
    }, {} as Record<string, Enterprise[]>);
  }, [enterprisesInView]);

  const groupedBarangayEntries = useMemo(() => {
    return Object.entries(groupedEnterprises).sort(([left], [right]) => left.localeCompare(right));
  }, [groupedEnterprises]);

  useEffect(() => {
    setExpandedSections((previous) => {
      const next: Record<string, boolean> = {};

      groupedBarangayEntries.forEach(([barangay], index) => {
        next[barangay] = previous[barangay] ?? index === 0;
      });

      return next;
    });
  }, [groupedBarangayEntries]);

  const activityRows = useMemo<ActivityLogRow[]>(() => {
    if (backendLogs.length > 0) {
      return mapBackendLogsToActivityRows(backendLogs, enterprisesInView);
    }

    return buildDerivedActivityRows(enterprisesInView, latestSubmissionByEnterpriseId, period);
  }, [backendLogs, enterprisesInView, latestSubmissionByEnterpriseId, period]);

  const compliantCount = useMemo<number>(() => {
    return enterprisesInView.filter((enterprise) => enterprise.compliance_status === 'Compliant').length;
  }, [enterprisesInView]);

  const pendingCount = enterprisesInView.length - compliantCount;

  const handleComplianceAction = (enterprise: Enterprise, action: ComplianceAction): void => {
    const actionKey = `${enterprise.id}:${action}`;
    setActiveActionKey(actionKey);
    setActionFeedback(
      `${actionFeedbackLabel[action]} prepared for ${enterprise.company_name} (${enterprise.barangay}).`,
    );

    window.setTimeout(() => {
      setActiveActionKey((current) => (current === actionKey ? null : current));
    }, 250);
  };

  const handleToggleReportingWindow = async (): Promise<void> => {
    const nextWindowState = !isWindowOpen;
    setIsTogglingWindow(true);

    try {
      const result = await setGlobalReportingWindowOpenState(nextWindowState);

      if (!result.success) {
        throw new Error(result.message);
      }

      setIsWindowOpen(nextWindowState);
      setActionFeedback(result.message);
    } catch (error: unknown) {
      console.error('Failed to toggle reporting window status:', error);
      setActionFeedback(
        error instanceof Error
          ? error.message
          : 'Unable to update reporting window status right now.',
      );
    } finally {
      setIsTogglingWindow(false);
    }
  };

  const handleMassReminder = (): void => {
    const targetCount = enterprisesInView.filter(
      (enterprise) => enterprise.compliance_status !== 'Compliant',
    ).length;

    setActionFeedback(
      targetCount > 0
        ? `Mass reminder prepared for ${targetCount} non-compliant enterprise(s).`
        : 'All enterprises are currently compliant. No mass reminder needed.',
    );
  };

  const toggleSection = (barangay: string): void => {
    setExpandedSections((previous) => ({
      ...previous,
      [barangay]: !previous[barangay],
    }));
  };

  return (
    <div className="grid min-h-full gap-4">
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-brand-dark">Enterprise Logs</h3>
            <p className="text-sm text-slate-600">
              Timeline feed sourced from backend logs, with enterprise-status fallback generation.
            </p>
          </div>
          <span className="rounded-full bg-brand-cream px-3 py-1 text-xs font-semibold text-brand-dark">
            {activityRows.length} event(s)
          </span>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-brand-cream/70 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Enterprise</th>
                <th className="px-3 py-2">Message</th>
              </tr>
            </thead>
            <tbody>
              {activityRows.map((log, index) => (
                <tr key={log.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-xs font-semibold text-brand-dark">{index + 1}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{log.time}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={`rounded-full px-2 py-1 font-semibold ${getSeverityClass(log.category)}`}>
                      {log.category}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs font-semibold text-brand-dark">{log.enterprise}</td>
                  <td className="px-3 py-2 text-xs text-slate-700">{log.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!activityRows.length ? (
          <p className="mt-3 rounded-xl bg-brand-cream px-3 py-4 text-center text-sm text-slate-600">
            No activity logs available for this period.
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-brand-dark">Compliance Monitor</h3>
            <span
              className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
                isWindowOpen
                  ? 'bg-brand-mid/20 text-brand-dark'
                  : 'bg-gray-200 text-gray-600'
              }`}
            >
              Reporting Window: {isWindowOpen ? 'OPEN' : 'CLOSED'}
            </span>
            <p className="text-sm text-slate-600">
              Command center for enterprise submissions, grouped by barangay.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="month"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-mid focus:outline-none"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search enterprise, barangay, or ID"
              className="w-72 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-mid focus:outline-none"
            />
            {isWindowOpen ? (
              <button
                type="button"
                onClick={() => {
                  void handleToggleReportingWindow();
                }}
                disabled={isTogglingWindow}
                className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isTogglingWindow ? 'Updating...' : 'CLOSE REPORTING WINDOW'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  void handleToggleReportingWindow();
                }}
                disabled={isTogglingWindow}
                className="rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isTogglingWindow ? 'Updating...' : 'OPEN REPORTING WINDOW'}
              </button>
            )}
            <button
              type="button"
              onClick={handleMassReminder}
              className="rounded-lg bg-brand-accent px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:opacity-90"
            >
              Mass Reminder
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <article className="rounded-xl bg-brand-cream/70 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Enterprises in View</p>
            <p className="mt-1 text-2xl font-black text-brand-dark">{enterprisesInView.length}</p>
          </article>
          <article className="rounded-xl bg-brand-cream/70 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Compliant</p>
            <p className="mt-1 text-2xl font-black text-brand-dark">{compliantCount}</p>
          </article>
          <article className="rounded-xl bg-brand-cream/70 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Pending / Overdue</p>
            <p className="mt-1 text-2xl font-black text-brand-accent">{pendingCount}</p>
          </article>
        </div>

        {actionFeedback ? (
          <p className="mt-3 rounded-lg bg-brand-mid/15 px-3 py-2 text-xs font-medium text-brand-dark">
            {actionFeedback}
          </p>
        ) : null}

        {feedback ? (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{feedback}</p>
        ) : null}

        <div className="mt-4">
          {groupedBarangayEntries.map(([barangayName, barangayEnterprises]) => {
            const enterpriseCount = barangayEnterprises.length;
            const isExpanded = expandedSections[barangayName] ?? false;

            return (
              <section key={barangayName} className="mb-4">
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => toggleSection(barangayName)}
                    className="flex w-full items-center justify-between gap-3 bg-gray-50 px-4 py-3 text-left transition-colors hover:bg-gray-100"
                  >
                    <h4 className="text-sm font-semibold text-brand-dark">
                      Barangay {barangayName} ({enterpriseCount} registered enterprise{enterpriseCount !== 1 ? 's' : ''})
                    </h4>
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-gray-600">
                      <svg
                        className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden="true"
                      >
                        <path
                          d="M6 9L12 15L18 9"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </button>

                  {isExpanded ? (
                    <div>
                      {barangayEnterprises.map((enterprise) => {
                        const remindKey = `${enterprise.id}:REMIND`;
                        const warnKey = `${enterprise.id}:WARN`;
                        const renotifyKey = `${enterprise.id}:RENOTIFY`;
                        const lastSubmission = latestSubmissionByEnterpriseId[enterprise.id] || null;
                        const lastSubmissionLabel =
                          lastSubmission
                            ? formatDateTime(lastSubmission)
                            : enterprise.has_submitted_for_period
                              ? 'Submitted (timestamp unavailable)'
                              : 'Pending';

                        return (
                          <div
                            key={enterprise.id}
                            className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-100 p-4"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-brand-dark">{enterprise.company_name}</p>
                              <p className="text-sm text-gray-500">{enterprise.category}</p>
                            </div>

                            <div className="min-w-[220px]">
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-semibold ${complianceBadgeClass[enterprise.compliance_status]}`}
                              >
                                {enterprise.compliance_status}
                              </span>
                              <p className="mt-1 text-xs text-gray-500">Last submission: {lastSubmissionLabel}</p>
                            </div>

                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleComplianceAction(enterprise, 'REMIND')}
                                disabled={isLoading || activeActionKey === remindKey}
                                className="rounded border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Remind
                              </button>

                              <button
                                type="button"
                                onClick={() => handleComplianceAction(enterprise, 'WARN')}
                                disabled={isLoading || activeActionKey === warnKey}
                                className="rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Warn
                              </button>

                              <button
                                type="button"
                                onClick={() => handleComplianceAction(enterprise, 'RENOTIFY')}
                                disabled={isLoading || activeActionKey === renotifyKey}
                                className="rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Re-notify
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>

        {isLoading ? (
          <p className="mt-3 rounded-xl bg-brand-cream px-3 py-4 text-center text-sm text-slate-600">
            Loading enterprise compliance logs...
          </p>
        ) : null}

        {!isLoading && !groupedBarangayEntries.length ? (
          <p className="mt-3 rounded-xl bg-brand-cream px-3 py-4 text-center text-sm text-slate-600">
            No enterprise compliance records found.
          </p>
        ) : null}
      </section>
    </div>
  );
}
