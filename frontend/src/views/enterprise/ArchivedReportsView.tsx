import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { EnterpriseOutletContext } from '@/components/layout/EnterpriseShell';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import { fetchArchivedReportsTable } from '@/services/api';
import type { ArchivedReportTableRow } from '@/types';

const PAGE_SIZE = 8;

const statusClasses: Record<ArchivedReportTableRow['lguStatus'], string> = {
  Acknowledged: 'bg-emerald-100 text-emerald-700',
  Pending: 'bg-amber-100 text-amber-700',
  Rejected: 'bg-rose-100 text-rose-700',
  Submitted: 'bg-sky-100 text-sky-700',
};

export default function ArchivedReportsView(): JSX.Element {
  const { user } = useOutletContext<EnterpriseOutletContext>();
  const [reports, setReports] = useState<ArchivedReportTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  const loadArchivedReports = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const rows = await fetchArchivedReportsTable(user.enterpriseId);
      setReports(rows);
      setPage(1);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load archived reports.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user.enterpriseId]);

  useEffect(() => {
    void loadArchivedReports();
  }, [loadArchivedReports]);

  const filteredReports = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    if (!normalized) {
      return reports;
    }

    return reports.filter((report) => {
      return (
        report.reportId.toLowerCase().includes(normalized)
        || report.periodLabel.toLowerCase().includes(normalized)
        || report.submittedBy.toLowerCase().includes(normalized)
        || report.lguStatus.toLowerCase().includes(normalized)
      );
    });
  }, [reports, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredReports.length / PAGE_SIZE));

  const paginatedReports = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredReports.slice(start, start + PAGE_SIZE);
  }, [filteredReports, page]);

  const visiblePages = useMemo(() => {
    const pages: number[] = [];
    for (let i = 1; i <= totalPages; i += 1) {
      pages.push(i);
    }
    return pages.slice(0, 5);
  }, [totalPages]);

  if (loading) {
    return <LoadingState label="Loading archived reports..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => void loadArchivedReports()} />;
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <header className="rounded-xl bg-brand-bg px-6 py-4 shadow-md">
        <h2 className="text-2xl font-bold tracking-tight text-brand-dark md:text-3xl">Reports Center</h2>
        <p className="text-sm text-brand-dark/80 md:text-base">
          Prepare and submit monthly report packs to LGU when reporting window is open.
        </p>
      </header>

      <section className="rounded-xl bg-white p-4 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-dark">Archived Reports</p>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search reports..."
              className="w-full min-w-55 max-w-xs rounded-lg border border-brand-mid/70 px-3 py-2 text-sm outline-none focus:border-brand-dark"
            />

            <div className="flex items-center gap-1 text-sm">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page === 1}
                className="rounded-md border border-brand-mid/70 px-2 py-1 text-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                Prev
              </button>

              {visiblePages.map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  onClick={() => setPage(pageNumber)}
                  className={[
                    'rounded-md border px-2 py-1',
                    page === pageNumber
                      ? 'border-brand-dark bg-brand-dark text-brand-cream'
                      : 'border-brand-mid/70 text-brand-dark hover:bg-brand-bg',
                  ].join(' ')}
                >
                  {pageNumber}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
                className="rounded-md border border-brand-mid/70 px-2 py-1 text-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl bg-white p-4 shadow-md">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-base font-semibold text-brand-dark md:text-lg">Past Submitted Reports</p>
          <span className="rounded-md bg-brand-bg px-2 py-1 text-xs font-semibold text-brand-dark">
            {filteredReports.length} total
          </span>
        </div>

        <div className="overflow-hidden rounded-xl bg-brand-bg/45">
          <div className="max-h-105 overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-20 bg-brand-dark/90 text-left text-xs uppercase tracking-wide text-white shadow-sm backdrop-blur-sm">
                <tr>
                  <th className="bg-brand-dark/90 px-4 py-2">Report ID</th>
                  <th className="bg-brand-dark/90 px-4 py-2">Period</th>
                  <th className="bg-brand-dark/90 px-4 py-2">Submitted Date</th>
                  <th className="bg-brand-dark/90 px-4 py-2">LGU Status</th>
                  <th className="bg-brand-dark/90 px-4 py-2">Submitted By</th>
                  <th className="bg-brand-dark/90 px-4 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {paginatedReports.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-brand-dark/70">
                      No archived reports found.
                    </td>
                  </tr>
                ) : (
                  paginatedReports.map((report) => (
                    <tr key={report.reportId} className="border-t border-brand-mid/25 align-top transition-colors hover:bg-brand-cream/50">
                      <td className="px-4 py-2 font-semibold text-brand-dark">{report.reportId}</td>
                      <td className="px-4 py-2 text-brand-dark">{report.periodLabel}</td>
                      <td className="px-4 py-2 text-brand-dark">{report.submittedDateLabel}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClasses[report.lguStatus]}`}>
                          [{report.lguStatus}]
                        </span>
                      </td>
                      <td className="px-4 py-2 text-brand-dark">{report.submittedBy}</td>
                      <td className="px-4 py-2">
                        <a
                          href={report.downloadHref}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-brand-dark underline decoration-brand-mid underline-offset-2 hover:text-brand-mid"
                        >
                          Download PDF
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
