import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { EnterpriseOutletContext } from '@/components/layout/EnterpriseShell';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import { fetchCameraLogs } from '@/services/api';
import type { CameraLog } from '@/types';

const PAGE_SIZE = 16;

export default function CameraLogsView(): JSX.Element {
  const { user } = useOutletContext<EnterpriseOutletContext>();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [logs, setLogs] = useState<CameraLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const loadLogs = useCallback(async (options?: { resetPage?: boolean; silent?: boolean }): Promise<void> => {
    const resetPage = options?.resetPage ?? true;
    const silent = options?.silent ?? false;

    if (!silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const rows = await fetchCameraLogs(user.enterpriseId, month);
      setLogs(rows);
      if (resetPage) {
        setPage(1);
      }
    } catch (err) {
      if (!silent) {
        const message = err instanceof Error ? err.message : 'Unable to load camera logs.';
        setError(message);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [month, user.enterpriseId]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadLogs({ resetPage: false, silent: true });
    }, 8000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadLogs]);

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return logs.slice(start, start + PAGE_SIZE);
  }, [logs, page]);

  const totalPages = Math.max(1, Math.ceil(logs.length / PAGE_SIZE));

  if (loading) {
    return <LoadingState label="Loading camera logs..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => void loadLogs()} />;
  }

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Camera Logs</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">Detection Session Ledger</h2>
          </div>

          <label className="text-sm font-medium text-slate-700">
            Month
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="ml-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      </header>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full border-collapse text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Unique ID</th>
                <th className="px-4 py-3">Time In</th>
                <th className="px-4 py-3">Time Out</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Classification</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((log) => (
                <tr key={log.id} className="border-t border-slate-200">
                  <td className="px-4 py-2.5 font-semibold text-slate-700">{log.uniqueId}</td>
                  <td className="px-4 py-2.5 text-slate-700">{log.timeIn}</td>
                  <td className="px-4 py-2.5 text-slate-700">{log.timeOut}</td>
                  <td className="px-4 py-2.5 text-slate-700">{log.durationLabel}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={[
                        'rounded-full px-2.5 py-1 text-xs font-semibold',
                        log.classification === 'Tourist'
                          ? 'bg-fuchsia-100 text-fuchsia-700'
                          : 'bg-emerald-100 text-emerald-700',
                      ].join(' ')}
                    >
                      {log.classification}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {logs.length === 0 ? (
          <div className="border-t border-slate-200 px-4 py-6 text-sm text-slate-500">No logs available for this month.</div>
        ) : null}

        <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
          <p className="text-slate-500">
            Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, logs.length)} of {logs.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((previous) => Math.max(1, previous - 1))}
              disabled={page === 1}
              className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Prev
            </button>
            <span className="text-slate-600">{page} / {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Next
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
