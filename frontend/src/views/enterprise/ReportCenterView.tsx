import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import LguComplianceModal from '../../components/reports/LguComplianceModal';
import type { EnterpriseOutletContext } from '@/components/layout/EnterpriseShell';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import { fetchCameraLogs, submitMonthlyReport } from '@/services/api';
import type { CameraLog } from '@/types';

const CSV_COLUMNS: Array<{ key: keyof CameraLog | 'duration_hours'; label: string }> = [
  { key: 'uniqueId', label: 'unique_id' },
  { key: 'timeIn', label: 'time_in' },
  { key: 'timeOut', label: 'time_out' },
  { key: 'duration_hours', label: 'duration_hours' },
  { key: 'classification', label: 'classification' },
  { key: 'maleCount', label: 'male_count' },
  { key: 'femaleCount', label: 'female_count' },
];

const escapeCsv = (value: string | number): string => {
  const raw = String(value ?? '');
  if (/[,"\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
};

const downloadCsv = (rows: CameraLog[], fileName: string): void => {
  const header = CSV_COLUMNS.map((column) => column.label).join(',');
  const body = rows.map((row) => {
    return CSV_COLUMNS.map((column) => {
      if (column.key === 'duration_hours') {
        return escapeCsv(row.durationHours);
      }

      return escapeCsv(row[column.key] as string | number);
    }).join(',');
  });

  const csv = [header, ...body].join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export default function ReportCenterView(): JSX.Element {
  const { user } = useOutletContext<EnterpriseOutletContext>();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [logs, setLogs] = useState<CameraLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadLogs = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const rows = await fetchCameraLogs(user.enterpriseId, month);
      setLogs(rows);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load monthly report data.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [month, user.enterpriseId]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const summary = useMemo(() => {
    const total = logs.reduce((sum, row) => sum + row.totalCount, 0);
    const tourists = logs.filter((row) => row.classification === 'Tourist').length;
    return {
      total,
      tourists,
      visitors: logs.length - tourists,
    };
  }, [logs]);

  const handleExportExcel = (): void => {
    if (logs.length === 0) {
      setSubmissionMessage('No monthly logs available to export.');
      return;
    }

    downloadCsv(logs, `enterprise_camera_logs_${month}.csv`);
    setSubmissionMessage('Excel-compatible CSV report exported successfully.');
  };

  const handleSubmitMonthlyReport = async (): Promise<void> => {
    if (logs.length === 0) {
      setSubmissionMessage('No data to submit for this month.');
      return;
    }

    setSubmitting(true);
    setSubmissionMessage(null);

    try {
      const result = await submitMonthlyReport(user.enterpriseId, month, logs);
      setSubmissionMessage(`${result.message} (${result.reportId})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit report.';
      setSubmissionMessage(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingState label="Preparing monthly report center..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => void loadLogs()} />;
  }

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Report Center</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">Monthly Report Aggregation</h2>
            <p className="mt-1 text-sm text-slate-600">Select month, review logs, export to Excel, and open LGU compliance forms.</p>
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

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Rows Included</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{logs.length}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total People Count</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{summary.total}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Tourist-tagged Rows</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{summary.tourists}</p>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
          >
            Export to Excel
          </button>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            View Monthly Reports
          </button>
          <button
            type="button"
            onClick={() => void handleSubmitMonthlyReport()}
            disabled={submitting}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? 'Submitting...' : 'Submit to LGU'}
          </button>
        </div>

        {submissionMessage ? (
          <p className="mb-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{submissionMessage}</p>
        ) : null}

        <div className="max-h-[420px] overflow-auto rounded-xl border border-slate-200">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2.5">ID</th>
                <th className="px-3 py-2.5">Time In</th>
                <th className="px-3 py-2.5">Time Out</th>
                <th className="px-3 py-2.5">Duration</th>
                <th className="px-3 py-2.5">Classification</th>
              </tr>
            </thead>
            <tbody>
              {logs.slice(0, 120).map((log) => (
                <tr key={log.id} className="border-t border-slate-200">
                  <td className="px-3 py-2">{log.uniqueId}</td>
                  <td className="px-3 py-2">{log.timeIn}</td>
                  <td className="px-3 py-2">{log.timeOut}</td>
                  <td className="px-3 py-2">{log.durationLabel}</td>
                  <td className="px-3 py-2">{log.classification}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <LguComplianceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        month={month}
        enterpriseId={user.enterpriseId}
      />
    </div>
  );
}
