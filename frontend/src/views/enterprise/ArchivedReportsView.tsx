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
    <div className="grid min-h-[calc(100vh-7rem)] grid-rows-[auto_auto_1fr] gap-4">
      <header className="rounded-2xl border border-brand-light bg-brand-cream px-5 py-4 shadow-sm">
        <h2 className="text-3xl font-bold text-brand-dark">Reports Center</h2>
        <p className="text-lg text-brand-dark/80">
          Prepare and submit monthly report packs to LGU when reporting window is open.
        </p>
      </header>

      <section className="flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-brand-light bg-white px-4 py-3 shadow-sm">
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            setPage(1);
          }}
          placeholder="Search reports..."
          className="w-full max-w-xs rounded-lg border border-brand-light px-3 py-2 text-sm outline-none focus:border-brand-mid"
        />

        <div className="flex items-center gap-1 text-sm">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page === 1}
            className="rounded-md border border-brand-light px-2 py-1 text-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
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
                  : 'border-brand-light text-brand-dark',
              ].join(' ')}
            >
              {pageNumber}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={page >= totalPages}
            className="rounded-md border border-brand-light px-2 py-1 text-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-brand-light bg-white shadow-sm">
        <div className="border-b border-brand-light px-4 py-3">
          <h3 className="text-lg font-semibold text-brand-dark">Past Submitted Reports</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-brand-dark text-left text-xs uppercase tracking-wide text-brand-cream">
              <tr>
                <th className="px-4 py-3">Report ID</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Submitted Date</th>
                <th className="px-4 py-3">LGU Status</th>
                <th className="px-4 py-3">Submitted By</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedReports.map((report) => (
                <tr key={report.reportId} className="border-t border-brand-light">
                  <td className="px-4 py-2.5 font-semibold text-brand-dark">{report.reportId}</td>
                  <td className="px-4 py-2.5 text-brand-dark">{report.periodLabel}</td>
                  <td className="px-4 py-2.5 text-brand-dark">{report.submittedDateLabel}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses[report.lguStatus]}`}>
                      [{report.lguStatus}]
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-brand-dark">{report.submittedBy}</td>
                  <td className="px-4 py-2.5">
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
              ))}
            </tbody>
          </table>
        </div>

        {paginatedReports.length === 0 ? (
          <div className="border-t border-brand-light px-4 py-6 text-sm text-brand-dark/80">No archived reports found.</div>
        ) : null}
      </section>
    </div>
  );
}
