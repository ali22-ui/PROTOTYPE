import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  closeReportingWindowAndAuditPenalties,
  fetchLguEnterpriseAccounts,
  fetchLguReportPacks,
  notifyAllEnterprisesToSubmit,
  notifyEnterpriseToComply,
} from '@/features/lgu/master/api/apiService';
import { getReportingControlState, subscribePortalBridge } from '@/lib/portalBridge';
import {
  COMPLIANCE_ACTION_SEQUENCE,
  defaultEnterpriseNoticeByStatus,
  defaultGlobalNoticeByStatus,
  getComplianceStatusTheme,
  getControlStatusFromAction,
  isWindowStatusOpen,
  toControlStatusFromWindowStatus,
  toReportingWindowStatus,
} from '@/lib/reportingStatus';
import type {
  LguComplianceActionType,
  LguEnterpriseAccount,
  LguReportPack,
  LguReportingControlStatus,
} from '@/types';

interface BarangayComplianceGroup {
  barangay: string;
  accounts: LguEnterpriseAccount[];
  receivedCount: number;
  pendingCount: number;
}

const normalize = (value: string): string => value.trim().toLowerCase();

const formatSubmittedAt = (value: string): string => {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed).toLocaleString('en-PH');
};

export default function EnterpriseLogsView(): JSX.Element {
  const [period, setPeriod] = useState<string>('2026-03');
  const [accounts, setAccounts] = useState<LguEnterpriseAccount[]>([]);
  const [reportPacks, setReportPacks] = useState<LguReportPack[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [feedback, setFeedback] = useState<string>('');
  const [activeEnterpriseId, setActiveEnterpriseId] = useState<string | null>(null);
  const [activeGlobalAction, setActiveGlobalAction] = useState<LguComplianceActionType | null>(null);
  const [isClosingReportingWindow, setIsClosingReportingWindow] = useState<boolean>(false);
  const [globalControlStatus, setGlobalControlStatus] = useState<LguReportingControlStatus>('closed');
  const [expandedBarangays, setExpandedBarangays] = useState<string[]>([]);

  const resolveGlobalControlStatus = useCallback((nextAccounts: LguEnterpriseAccount[]): LguReportingControlStatus => {
    const controlState = getReportingControlState();
    if (controlState && controlState.scope === 'ALL' && controlState.period === period) {
      return controlState.status;
    }

    const pendingAccounts = nextAccounts.filter((account) => !account.has_submitted_for_period);
    if (!pendingAccounts.length) {
      return 'closed';
    }

    const priority: LguReportingControlStatus[] = ['renotify', 'warn', 'remind', 'open'];
    for (const status of priority) {
      if (
        pendingAccounts.some(
          (account) => toControlStatusFromWindowStatus(account.reporting_window_status) === status,
        )
      ) {
        return status;
      }
    }

    if (pendingAccounts.every((account) => isWindowStatusOpen(account.reporting_window_status))) {
      return 'open';
    }

    return 'closed';
  }, [period]);

  const loadComplianceData = useCallback(async (): Promise<void> => {
    const [accountsPayload, reportsPayload] = await Promise.all([
      fetchLguEnterpriseAccounts(period),
      fetchLguReportPacks(period),
    ]);

    setAccounts(accountsPayload.accounts);
    setReportPacks(reportsPayload.reports);
    setGlobalControlStatus(resolveGlobalControlStatus(accountsPayload.accounts));
  }, [period, resolveGlobalControlStatus]);

  useEffect(() => {
    void loadComplianceData().catch((error: unknown) => {
      console.error('Failed to load enterprise compliance logs:', error);
    });
  }, [loadComplianceData]);

  useEffect(() => {
    return subscribePortalBridge(() => {
      void loadComplianceData().catch((error: unknown) => {
        console.error('Failed to refresh compliance logs after bridge update:', error);
      });
    });
  }, [loadComplianceData]);

  const reportPackByEnterprise = useMemo(() => {
    const lookup = new Map<string, LguReportPack>();

    reportPacks.forEach((pack) => {
      const existing = lookup.get(pack.enterprise_id);
      if (!existing || existing.submitted_at < pack.submitted_at) {
        lookup.set(pack.enterprise_id, pack);
      }
    });

    return lookup;
  }, [reportPacks]);

  const filteredAccounts = useMemo<LguEnterpriseAccount[]>(() => {
    const query = normalize(searchQuery);
    if (!query) {
      return accounts;
    }

    return accounts.filter((account) => {
      const permit = account.enterprise_id;
      const company = account.company_name;
      return [company, permit].some((value) => normalize(value).includes(query));
    });
  }, [accounts, searchQuery]);

  const totalEnterpriseCount = accounts.length;

  const receivedCount = useMemo<number>(() => {
    return filteredAccounts.filter((account) => {
      if (account.has_submitted_for_period) {
        return true;
      }

      return reportPackByEnterprise.has(account.enterprise_id);
    }).length;
  }, [filteredAccounts, reportPackByEnterprise]);

  const pendingCount = filteredAccounts.length - receivedCount;

  const groupedAccounts = useMemo<BarangayComplianceGroup[]>(() => {
    const grouped = new Map<string, LguEnterpriseAccount[]>();

    filteredAccounts.forEach((account) => {
      const key = account.barangay || 'Unassigned Barangay';
      const bucket = grouped.get(key) ?? [];
      bucket.push(account);
      grouped.set(key, bucket);
    });

    return Array.from(grouped.entries())
      .map(([barangay, groupAccounts]) => {
        const sortedAccounts = groupAccounts
          .slice()
          .sort((left, right) => left.company_name.localeCompare(right.company_name));

        const received = sortedAccounts.filter((account) => {
          if (account.has_submitted_for_period) {
            return true;
          }

          return reportPackByEnterprise.has(account.enterprise_id);
        }).length;

        return {
          barangay,
          accounts: sortedAccounts,
          receivedCount: received,
          pendingCount: sortedAccounts.length - received,
        };
      })
      .sort((left, right) => left.barangay.localeCompare(right.barangay));
  }, [filteredAccounts, reportPackByEnterprise]);

  useEffect(() => {
    setExpandedBarangays((current) => {
      const available = new Set(groupedAccounts.map((group) => group.barangay));
      const retained = current.filter((barangay) => available.has(barangay));

      if (retained.length > 0) {
        return retained;
      }

      return groupedAccounts[0] ? [groupedAccounts[0].barangay] : [];
    });
  }, [groupedAccounts]);

  const toggleBarangaySection = (barangay: string): void => {
    setExpandedBarangays((current) => {
      if (current.includes(barangay)) {
        return current.filter((name) => name !== barangay);
      }

      return [...current, barangay];
    });
  };

  const triggerComplianceAction = async (
    account: LguEnterpriseAccount,
    action: LguComplianceActionType,
  ): Promise<void> => {
    setActiveEnterpriseId(account.enterprise_id);
    setFeedback('');
    const controlStatus = getControlStatusFromAction(action);

    try {
      const response = await notifyEnterpriseToComply({
        enterpriseId: account.enterprise_id,
        period,
        action,
        message: defaultEnterpriseNoticeByStatus[controlStatus],
      });

      setFeedback(response.message);
      setAccounts((current) =>
        current.map((item) =>
          item.enterprise_id === account.enterprise_id
            ? {
                ...item,
                reporting_window_status: response.windowStatus,
              }
            : item,
        ),
      );
    } catch (error: unknown) {
      console.error('Compliance action dispatch failed:', error);
      setFeedback('Unable to dispatch compliance action right now.');
    } finally {
      setActiveEnterpriseId(null);
    }
  };

  const handleGlobalComplianceAction = async (action: LguComplianceActionType): Promise<void> => {
    setActiveGlobalAction(action);
    setFeedback('');
    const controlStatus = getControlStatusFromAction(action);
    const statusLabel = toReportingWindowStatus(controlStatus);

    try {
      const result = await notifyAllEnterprisesToSubmit({
        period,
        triggeredBy: 'LGU Admin',
        status: action,
        message: defaultGlobalNoticeByStatus[controlStatus],
      });

      setFeedback(result.message);
      setGlobalControlStatus(controlStatus);
      setAccounts((current) =>
        current.map((account) =>
          account.has_submitted_for_period
            ? account
            : {
                ...account,
                reporting_window_status: statusLabel,
              },
        ),
      );
    } catch (error: unknown) {
      console.error('Failed to dispatch global compliance status:', error);
      setFeedback('Unable to dispatch global compliance status for all enterprises at this time.');
    } finally {
      setActiveGlobalAction(null);
    }
  };

  const handleCloseReportingWindow = async (): Promise<void> => {
    setIsClosingReportingWindow(true);
    setFeedback('');

    try {
      const result = await closeReportingWindowAndAuditPenalties({
        period,
        triggeredBy: 'LGU Admin',
        message: 'Notice: The LGU has closed the monthly reporting window.',
      });

      setFeedback(result.message);
      setGlobalControlStatus('closed');
      await loadComplianceData();
    } catch (error: unknown) {
      console.error('Failed to close reporting window and run compliance audit:', error);
      setFeedback('Unable to close reporting window right now. Please try again.');
    } finally {
      setIsClosingReportingWindow(false);
    }
  };

  const globalStatusTheme = getComplianceStatusTheme(globalControlStatus);
  const isSearching = normalize(searchQuery).length > 0;

  return (
    <div className="grid min-h-full gap-4">
      <section className="grid gap-3 md:grid-cols-3">
        <article className="rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Reports Received</p>
          <p className="mt-2 text-3xl font-black text-emerald-700">{receivedCount}</p>
        </article>
        <article className="rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Reports Pending</p>
          <p className="mt-2 text-3xl font-black text-amber-700">{pendingCount}</p>
        </article>
        <article className="rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Enterprises in View</p>
          <p className="mt-2 text-3xl font-black text-brand-dark">{filteredAccounts.length}</p>
          <p className="mt-1 text-[11px] text-slate-500">Total registry: {totalEnterpriseCount}</p>
        </article>
      </section>

      <section className="rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-brand-dark">Enterprise Submission & Compliance Logs</h3>
            <p className="text-sm text-slate-600">
              Review monthly report statuses, filter enterprise logs, and trigger 4-state compliance
              notifications that sync directly to enterprise-side notice banners.
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
              placeholder="Search enterprise name or permit ID"
              className="w-72 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-mid focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                void handleCloseReportingWindow();
              }}
              disabled={Boolean(activeGlobalAction) || isClosingReportingWindow}
              className="rounded-lg border border-rose-500 bg-rose-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isClosingReportingWindow ? 'Closing…' : 'Close Reporting Window'}
            </button>
            <div className="flex flex-wrap items-center gap-1.5">
              {COMPLIANCE_ACTION_SEQUENCE.map((action) => {
                const controlStatus = getControlStatusFromAction(action);
                const theme = getComplianceStatusTheme(controlStatus);
                const isActive = globalControlStatus === controlStatus;
                const isBusy = activeGlobalAction === action;

                return (
                  <button
                    key={`global-action-${action}`}
                    type="button"
                    onClick={() => {
                      void handleGlobalComplianceAction(action);
                    }}
                    disabled={Boolean(activeGlobalAction) || isClosingReportingWindow}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      isActive ? theme.activeButtonClass : theme.buttonClass
                    }`}
                  >
                    {isBusy ? 'Applying…' : theme.buttonLabel}
                  </button>
                );
              })}
            </div>
            <span
              className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${globalStatusTheme.bannerClass}`}
            >
              Global Status: {toReportingWindowStatus(globalControlStatus)}
            </span>
          </div>
        </div>

        {isSearching ? (
          <p className="mt-2 text-[11px] text-slate-500">
            Showing {filteredAccounts.length} result(s) matching “{searchQuery.trim()}”.
          </p>
        ) : null}

        {feedback ? <p className="mt-3 text-xs font-medium text-brand-dark">{feedback}</p> : null}

        <div className="mt-4 space-y-3">
          {groupedAccounts.map((group) => {
            const isExpanded = expandedBarangays.includes(group.barangay);

            return (
              <article
                key={group.barangay}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-brand-cream/30"
              >
                <button
                  type="button"
                  onClick={() => toggleBarangaySection(group.barangay)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-brand-cream/70"
                >
                  <div>
                    <p className="text-sm font-bold text-brand-dark">{group.barangay}</p>
                    <p className="text-[11px] text-slate-600">
                      {group.accounts.length} enterprise account(s)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                      Received: {group.receivedCount}
                    </span>
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700">
                      Pending: {group.pendingCount}
                    </span>
                    <span className="text-sm font-bold text-slate-600">{isExpanded ? '−' : '+'}</span>
                  </div>
                </button>

                {isExpanded ? (
                  <div className="overflow-hidden border-t border-slate-200 bg-white">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-brand-cream text-slate-600">
                        <tr>
                          <th className="px-3 py-2">Enterprise</th>
                          <th className="px-3 py-2">Window Status</th>
                          <th className="px-3 py-2">Submission Status</th>
                          <th className="px-3 py-2">Latest Submission</th>
                          <th className="px-3 py-2">Compliance Trigger</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.accounts.map((account) => {
                          const latestPack = reportPackByEnterprise.get(account.enterprise_id);
                          const submitted = account.has_submitted_for_period || Boolean(latestPack);
                          const isRowBusy = activeEnterpriseId === account.enterprise_id;
                          const rowStatus = String(account.reporting_window_status || 'CLOSED').toUpperCase();
                          const rowControlStatus = toControlStatusFromWindowStatus(rowStatus);
                          const rowStatusTheme = getComplianceStatusTheme(rowControlStatus);

                          return (
                            <tr key={account.enterprise_id} className="border-t border-slate-100">
                              <td className="px-3 py-2.5">
                                <p className="font-semibold text-brand-dark">{account.company_name}</p>
                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                  <p className="text-xs text-slate-500">{account.enterprise_id}</p>
                                  {(account.infraction_count || 0) > 0 ? (
                                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                                      Warning • {account.infraction_count}
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-3 py-2.5">
                                <span
                                  className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                    rowStatus === 'SUBMITTED'
                                        ? 'bg-blue-100 text-blue-700'
                                      : rowStatusTheme.chipClass
                                  }`}
                                >
                                  {rowStatus === 'SUBMITTED'
                                    ? 'SUBMITTED'
                                    : toReportingWindowStatus(rowControlStatus)}
                                </span>
                              </td>
                              <td className="px-3 py-2.5">
                                <span
                                  className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                    submitted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                  }`}
                                >
                                  {submitted ? 'Received' : 'Pending'}
                                </span>
                                {account.latest_infraction ? (
                                  <p className="mt-1 text-[10px] font-medium text-rose-700">
                                    {account.latest_infraction.type}
                                  </p>
                                ) : null}
                              </td>
                              <td className="px-3 py-2.5 text-xs text-slate-600">
                                {latestPack ? formatSubmittedAt(latestPack.submitted_at) : 'No submission yet'}
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex flex-wrap gap-1.5">
                                  {COMPLIANCE_ACTION_SEQUENCE.map((action) => {
                                    const controlStatus = getControlStatusFromAction(action);
                                    const theme = getComplianceStatusTheme(controlStatus);

                                    return (
                                      <button
                                        key={`${account.enterprise_id}-${action}`}
                                        type="button"
                                        onClick={() => {
                                          void triggerComplianceAction(account, action);
                                        }}
                                        disabled={isRowBusy || submitted}
                                        className={`rounded-md border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${theme.buttonClass} disabled:cursor-not-allowed disabled:opacity-60`}
                                      >
                                        {theme.buttonLabel}
                                      </button>
                                    );
                                  })}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </article>
            );
          })}

          {!groupedAccounts.length ? (
            <p className="rounded-xl border border-brand-light/70 bg-brand-cream px-3 py-8 text-center text-sm text-slate-600">
              {isSearching
                ? 'No enterprise compliance records matched your search.'
                : 'No enterprise compliance records found.'}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
