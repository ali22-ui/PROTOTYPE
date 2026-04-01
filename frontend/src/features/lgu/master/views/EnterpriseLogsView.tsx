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
  Compliant: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  Pending: 'bg-amber-50 text-amber-700 border border-amber-200',
  Overdue: 'bg-red-50 text-red-700 border border-red-200',
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
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-8">
        <div className="p-6 border-b border-gray-100">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-brand-dark">Enterprise Logs</h3>
              <p className="text-sm text-gray-500 mt-1">
                Recent activity feed — showing latest 10 entries
              </p>
            </div>
            <span className="rounded-full bg-gray-50 border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600">
              {Math.min(activityRows.length, 10)} of {activityRows.length} event(s)
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Enterprise</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activityRows.slice(0, 10).map((log, index) => (
                <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 text-xs font-semibold text-brand-dark">{index + 1}</td>
                  <td className="px-6 py-4 text-xs text-gray-600">{log.time}</td>
                  <td className="px-6 py-4 text-xs">
                    <span className={`rounded-full px-2.5 py-1 font-medium ${getSeverityClass(log.category)}`}>
                      {log.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs font-semibold text-brand-dark">{log.enterprise}</td>
                  <td className="px-6 py-4 text-xs text-gray-700">{log.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!activityRows.length ? (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-500">No activity logs available for this period.</p>
          </div>
        ) : null}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-brand-dark">Compliance Monitor</h3>
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                  isWindowOpen
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-gray-100 text-gray-600 border border-gray-200'
                }`}
              >
                Reporting Window: {isWindowOpen ? 'OPEN' : 'CLOSED'}
              </span>
              <p className="text-sm text-gray-500">
                Command center for enterprise submissions, grouped by barangay.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
            <input
              type="month"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-mid focus:outline-none focus:ring-1 focus:ring-brand-mid/30 transition-colors"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search enterprise, barangay, or ID"
              className="w-72 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-mid focus:outline-none focus:ring-1 focus:ring-brand-mid/30 transition-colors"
            />
            {isWindowOpen ? (
              <button
                type="button"
                onClick={() => {
                  void handleToggleReportingWindow();
                }}
                disabled={isTogglingWindow}
                className="rounded-lg bg-red-500 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isTogglingWindow ? 'Updating...' : 'Close Window'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  void handleToggleReportingWindow();
                }}
                disabled={isTogglingWindow}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isTogglingWindow ? 'Updating...' : 'Open Window'}
              </button>
            )}
            <button
              type="button"
              onClick={handleMassReminder}
              className="rounded-lg bg-brand-dark px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-brand-dark/90"
            >
              Mass Reminder
            </button>
            </div>
          </div>
        </div>

        <div className="p-6 pt-4 grid gap-3 md:grid-cols-3">
          <article className="rounded-lg bg-gray-50 border border-gray-100 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Enterprises in View</p>
            <p className="mt-2 text-2xl font-bold text-brand-dark">{enterprisesInView.length}</p>
          </article>
          <article className="rounded-lg bg-emerald-50 border border-emerald-100 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Compliant</p>
            <p className="mt-2 text-2xl font-bold text-emerald-700">{compliantCount}</p>
          </article>
          <article className="rounded-lg bg-amber-50 border border-amber-100 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Pending / Overdue</p>
            <p className="mt-2 text-2xl font-bold text-amber-700">{pendingCount}</p>
          </article>
        </div>

        {actionFeedback ? (
          <div className="mx-6 mb-4 rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-xs font-medium text-blue-700">
            {actionFeedback}
          </div>
        ) : null}

        {feedback ? (
          <div className="mx-6 mb-4 rounded-lg bg-rose-50 border border-rose-100 px-4 py-3 text-sm font-medium text-rose-700">
            {feedback}
          </div>
        ) : null}

        <div className="px-6 pb-6">
          {groupedBarangayEntries.map(([barangayName, barangayEnterprises]) => {
            const enterpriseCount = barangayEnterprises.length;
            const isExpanded = expandedSections[barangayName] ?? false;

            return (
              <div key={barangayName} className="mb-3">
                <div
                  onClick={() => toggleSection(barangayName)}
                  className="cursor-pointer bg-white border border-gray-200 p-4 flex justify-between items-center rounded-lg shadow-sm hover:border-brand-mid/30 transition-all"
                >
                  <h4 className="text-sm font-semibold text-brand-dark">
                    Barangay {barangayName}
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      ({enterpriseCount} enterprise{enterpriseCount !== 1 ? 's' : ''})
                    </span>
                  </h4>
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                    <svg
                      className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
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
                </div>

                {isExpanded ? (
                  <div className="bg-gray-50/50 border border-gray-200 border-t-0 rounded-b-lg -mt-1 pt-1 overflow-hidden">
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
                          className="flex justify-between items-center p-4 border-b border-gray-100 last:border-b-0 hover:bg-gray-50/80 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm text-brand-dark">{enterprise.company_name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{enterprise.category}</p>
                          </div>

                          <div className="min-w-[200px] text-right mr-4">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${complianceBadgeClass[enterprise.compliance_status]}`}
                            >
                              {enterprise.compliance_status}
                            </span>
                            <p className="mt-1 text-xs text-gray-400">Last: {lastSubmissionLabel}</p>
                          </div>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleComplianceAction(enterprise, 'REMIND')}
                              disabled={isLoading || activeActionKey === remindKey}
                              className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Remind
                            </button>

                            <button
                              type="button"
                              onClick={() => handleComplianceAction(enterprise, 'WARN')}
                              disabled={isLoading || activeActionKey === warnKey}
                              className="text-xs px-3 py-1.5 bg-amber-50 text-amber-600 rounded hover:bg-amber-100 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Warn
                            </button>

                            <button
                              type="button"
                              onClick={() => handleComplianceAction(enterprise, 'RENOTIFY')}
                              disabled={isLoading || activeActionKey === renotifyKey}
                              className="text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
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
            );
          })}
        </div>

        {isLoading ? (
          <div className="mx-6 mb-6 rounded-lg bg-gray-50 border border-gray-100 px-4 py-6 text-center">
            <p className="text-sm text-gray-500">Loading enterprise compliance logs...</p>
          </div>
        ) : null}

        {!isLoading && !groupedBarangayEntries.length ? (
          <div className="mx-6 mb-6 rounded-lg bg-gray-50 border border-gray-100 px-4 py-6 text-center">
            <p className="text-sm text-gray-500">No enterprise compliance records found.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
