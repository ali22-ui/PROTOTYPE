import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  downloadAuthorityPackageDocx,
  downloadAuthorityPackagePdf,
  fetchLguEnterpriseAccounts,
  fetchLguReportPackDetail,
  fetchLguReportPacks,
  generateAuthorityPackage,
} from '@/features/lgu/master/api/apiService';
import { subscribePortalBridge } from '@/lib/portalBridge';
import type { LguAuthorityPackage, LguReportPack } from '@/types';

const PRINTED_REPORT_STORAGE_KEY = 'lgu-printed-reports-v1';

interface TemplateRecord {
  id: string;
  title: string;
  description: string;
  format: 'PDF' | 'DOCX';
}

interface BarangayReportGroup {
  barangay: string;
  reports: LguReportPack[];
}

const templateRecords: TemplateRecord[] = [
  {
    id: 'tpl-traffic-summary',
    title: 'Monthly Traffic Summary Template',
    description: 'Aggregate visitors/tourists, hotspot barangays, and compliance notes.',
    format: 'PDF',
  },
  {
    id: 'tpl-demographics',
    title: 'Demographics Narrative Template',
    description: 'Foreign vs local narrative and trend commentary for internal memos.',
    format: 'DOCX',
  },
  {
    id: 'tpl-dot-ready',
    title: 'DOT Submission Prep Packet',
    description: 'LGU-only staging packet for eventual DOT filing and printing.',
    format: 'PDF',
  },
];

const triggerBrowserDownload = (blob: Blob, filename: string): void => {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
};

const readPrintedReports = (): string[] => {
  try {
    const raw = localStorage.getItem(PRINTED_REPORT_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
};

const fallbackBarangayFromEnterpriseName = (enterpriseName: string): string | null => {
  const stripped = enterpriseName.replace(/\s+Enterprise\s+Node$/i, '').trim();
  if (stripped.length > 0 && stripped !== enterpriseName) {
    return stripped;
  }

  return null;
};

export default function ReportsWorkspaceView(): JSX.Element {
  const [period, setPeriod] = useState<string>('2026-03');
  const [reportPacks, setReportPacks] = useState<LguReportPack[]>([]);
  const [enterpriseBarangayById, setEnterpriseBarangayById] = useState<Record<string, string>>({});
  const [expandedBarangays, setExpandedBarangays] = useState<string[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>('');
  const [selectedReportDetail, setSelectedReportDetail] = useState<LguReportPack | null>(null);
  const [authorityPackages, setAuthorityPackages] = useState<Record<string, LguAuthorityPackage>>({});
  const [printedReportIds, setPrintedReportIds] = useState<string[]>(() => readPrintedReports());
  const [feedback, setFeedback] = useState<string>('');
  const [isBusy, setIsBusy] = useState<boolean>(false);

  const loadReportPacks = useCallback(async (): Promise<void> => {
    const [reportsPayload, accountsPayload] = await Promise.all([
      fetchLguReportPacks(period),
      fetchLguEnterpriseAccounts(period),
    ]);

    setReportPacks(reportsPayload.reports);

    const barangayLookup = accountsPayload.accounts.reduce<Record<string, string>>((acc, account) => {
      if (account.barangay) {
        acc[account.enterprise_id] = account.barangay;
      }

      return acc;
    }, {});

    setEnterpriseBarangayById(barangayLookup);

    setSelectedReportId((current) => {
      if (current && reportsPayload.reports.some((report) => report.report_id === current)) {
        return current;
      }

      return reportsPayload.reports[0]?.report_id || '';
    });
  }, [period]);

  useEffect(() => {
    void loadReportPacks().catch((error: unknown) => {
      console.error('Failed to load LGU report packs:', error);
    });
  }, [loadReportPacks]);

  useEffect(() => {
    return subscribePortalBridge(() => {
      void loadReportPacks().catch((error: unknown) => {
        console.error('Failed to refresh LGU report packs after bridge update:', error);
      });
    });
  }, [loadReportPacks]);

  useEffect(() => {
    localStorage.setItem(PRINTED_REPORT_STORAGE_KEY, JSON.stringify(printedReportIds));
  }, [printedReportIds]);

  useEffect(() => {
    if (!selectedReportId) {
      setSelectedReportDetail(null);
      return;
    }

    const loadReportDetail = async (): Promise<void> => {
      const detail = await fetchLguReportPackDetail(selectedReportId);
      setSelectedReportDetail(detail);
    };

    void loadReportDetail().catch((error: unknown) => {
      console.error('Failed to load report detail:', error);
    });
  }, [selectedReportId]);

  const selectedReport = useMemo<LguReportPack | null>(() => {
    return reportPacks.find((report) => report.report_id === selectedReportId) ?? null;
  }, [reportPacks, selectedReportId]);

  const groupedReportPacks = useMemo<BarangayReportGroup[]>(() => {
    const groups = new Map<string, LguReportPack[]>();

    reportPacks.forEach((report) => {
      const fallbackBarangay = fallbackBarangayFromEnterpriseName(report.enterprise_name);
      const barangay = enterpriseBarangayById[report.enterprise_id] || fallbackBarangay || 'Unassigned Barangay';
      const bucket = groups.get(barangay) ?? [];
      bucket.push(report);
      groups.set(barangay, bucket);
    });

    return Array.from(groups.entries())
      .map(([barangay, reports]) => ({
        barangay,
        reports: reports
          .slice()
          .sort((left, right) => right.submitted_at.localeCompare(left.submitted_at)),
      }))
      .sort((left, right) => left.barangay.localeCompare(right.barangay));
  }, [enterpriseBarangayById, reportPacks]);

  useEffect(() => {
    setExpandedBarangays((current) => {
      const available = new Set(groupedReportPacks.map((group) => group.barangay));
      const retained = current.filter((barangay) => available.has(barangay));

      if (retained.length > 0) {
        return retained;
      }

      return groupedReportPacks[0] ? [groupedReportPacks[0].barangay] : [];
    });
  }, [groupedReportPacks]);

  const toggleBarangaySection = (barangay: string): void => {
    setExpandedBarangays((current) => {
      if (current.includes(barangay)) {
        return current.filter((name) => name !== barangay);
      }

      return [...current, barangay];
    });
  };

  const generatedCount = Object.keys(authorityPackages).length;
  const printedCount = printedReportIds.length;

  const markPrinted = (reportId: string): void => {
    setPrintedReportIds((current) => {
      if (current.includes(reportId)) {
        return current;
      }
      return [...current, reportId];
    });
    setFeedback(`Report ${reportId} marked as printed in LGU workspace.`);
  };

  const handleGeneratePackage = async (): Promise<void> => {
    if (!selectedReportId) {
      return;
    }

    setIsBusy(true);
    setFeedback('');
    try {
      const payload = await generateAuthorityPackage(selectedReportId);
      setAuthorityPackages((current) => ({
        ...current,
        [selectedReportId]: payload,
      }));
      setFeedback(`Authority package generated for ${selectedReportId}.`);
    } catch (error: unknown) {
      console.error('Failed to generate authority package:', error);
      setFeedback('Failed to generate authority package.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDownloadPdf = async (): Promise<void> => {
    if (!selectedReportId) {
      return;
    }

    setIsBusy(true);
    setFeedback('');
    try {
      const payload = await downloadAuthorityPackagePdf(selectedReportId);
      triggerBrowserDownload(payload.blob, payload.filename);
      setFeedback(`Downloaded PDF: ${payload.filename}`);
    } catch (error: unknown) {
      console.error('Authority PDF download failed:', error);
      setFeedback('Unable to download authority PDF right now.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDownloadDocx = async (): Promise<void> => {
    if (!selectedReportId) {
      return;
    }

    setIsBusy(true);
    setFeedback('');
    try {
      const payload = await downloadAuthorityPackageDocx(selectedReportId);
      triggerBrowserDownload(payload.blob, payload.filename);
      setFeedback(`Downloaded DOCX: ${payload.filename}`);
    } catch (error: unknown) {
      console.error('Authority DOCX download failed:', error);
      setFeedback('Unable to download authority DOCX right now.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="grid min-h-full gap-4">
      <section className="grid gap-3 md:grid-cols-3">
        <article className="rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Aggregated Files</p>
          <p className="mt-2 text-3xl font-black text-brand-dark">{reportPacks.length}</p>
        </article>
        <article className="rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Generated Packages</p>
          <p className="mt-2 text-3xl font-black text-blue-700">{generatedCount}</p>
        </article>
        <article className="rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Printed</p>
          <p className="mt-2 text-3xl font-black text-emerald-700">{printedCount}</p>
        </article>
      </section>

      <section className="grid min-h-full gap-4 xl:grid-cols-[1.2fr_1.8fr]">
        <aside className="grid gap-4">
          <article className="rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-brand-dark">Template Library</h3>
              <input
                type="month"
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
              />
            </div>
            <div className="mt-3 space-y-2">
              {templateRecords.map((template) => (
                <article key={template.id} className="rounded-xl border border-brand-light/70 bg-brand-cream p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-brand-dark">{template.title}</p>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                      {template.format}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{template.description}</p>
                </article>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
            <h3 className="text-base font-bold text-brand-dark">Aggregated Report Files</h3>
            <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {groupedReportPacks.map((group) => {
                const isExpanded = expandedBarangays.includes(group.barangay);

                return (
                  <article
                    key={group.barangay}
                    className="overflow-hidden rounded-xl border border-brand-light/70 bg-brand-cream/60"
                  >
                    <button
                      type="button"
                      onClick={() => toggleBarangaySection(group.barangay)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-brand-cream"
                    >
                      <div>
                        <p className="text-sm font-semibold text-brand-dark">{group.barangay}</p>
                        <p className="text-[11px] text-slate-600">{group.reports.length} report pack(s)</p>
                      </div>
                      <span className="text-sm font-bold text-slate-600">{isExpanded ? '−' : '+'}</span>
                    </button>

                    {isExpanded ? (
                      <div className="space-y-1.5 border-t border-brand-light/70 bg-white p-2">
                        {group.reports.map((report) => {
                          const isSelected = selectedReportId === report.report_id;
                          const isPrinted = printedReportIds.includes(report.report_id);

                          return (
                            <button
                              key={report.report_id}
                              type="button"
                              onClick={() => setSelectedReportId(report.report_id)}
                              className={`w-full rounded-lg border p-2.5 text-left transition ${
                                isSelected
                                  ? 'border-brand-dark bg-brand-light/35'
                                  : 'border-brand-light/70 bg-brand-cream hover:bg-brand-cream/70'
                              }`}
                            >
                              <p className="text-xs font-semibold text-brand-dark">{report.report_id}</p>
                              <p className="text-xs text-slate-600">{report.enterprise_name}</p>
                              <p className="mt-1 text-[11px] text-slate-500">
                                {report.period.month} • {report.submitted_at}
                              </p>
                              {isPrinted ? (
                                <span className="mt-2 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                  Printed
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </article>
                );
              })}

              {!groupedReportPacks.length ? (
                <p className="rounded-xl border border-brand-light/70 bg-brand-cream px-3 py-2 text-xs text-slate-600">
                  No report packs available for the selected month.
                </p>
              ) : null}
            </div>
          </article>
        </aside>

        <article className="rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
          <h3 className="text-base font-bold text-brand-dark">Internal LGU Document Workspace</h3>
          <p className="text-sm text-slate-600">
            This workspace is for LGU internal processing and printing only (no direct DOT account
            connection).
          </p>

          {selectedReport ? (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-brand-light/70 bg-brand-cream p-3 text-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Enterprise</p>
                  <p className="mt-1 font-semibold text-brand-dark">{selectedReport.enterprise_name}</p>
                </div>
                <div className="rounded-xl border border-brand-light/70 bg-brand-cream p-3 text-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Period</p>
                  <p className="mt-1 font-semibold text-brand-dark">{selectedReport.period.month}</p>
                </div>
                <div className="rounded-xl border border-brand-light/70 bg-brand-cream p-3 text-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Total Visitors</p>
                  <p className="mt-1 font-semibold text-brand-dark">
                    {selectedReportDetail?.kpis?.total_visitors_mtd?.toLocaleString() ?? 'N/A'}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleGeneratePackage();
                  }}
                  disabled={isBusy}
                  className="rounded-lg bg-brand-dark px-3 py-2 text-sm font-semibold text-brand-cream hover:bg-brand-mid disabled:opacity-60"
                >
                  Generate Package
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleDownloadPdf();
                  }}
                  disabled={isBusy}
                  className="rounded-lg border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                >
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleDownloadDocx();
                  }}
                  disabled={isBusy}
                  className="rounded-lg border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
                >
                  Download DOCX
                </button>
                <button
                  type="button"
                  onClick={() => markPrinted(selectedReport.report_id)}
                  className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                >
                  Mark as Printed
                </button>
              </div>

              {authorityPackages[selectedReport.report_id] ? (
                <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
                  <p className="font-semibold">Authority package ready</p>
                  <p className="mt-1">
                    Package ID: {authorityPackages[selectedReport.report_id].authority_package_id}
                  </p>
                  <p className="text-xs">
                    Generated at: {authorityPackages[selectedReport.report_id].generated_at}
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <div className="mt-4 rounded-xl border border-brand-light/70 bg-brand-cream p-4 text-sm text-slate-600">
              Select a report pack from the left panel to manage files.
            </div>
          )}

          {feedback ? (
            <p className="mt-4 rounded-lg bg-brand-cream px-3 py-2 text-xs font-medium text-brand-dark">
              {feedback}
            </p>
          ) : null}
        </article>
      </section>
    </div>
  );
}
