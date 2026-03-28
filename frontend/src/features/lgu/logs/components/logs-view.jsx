import { useEffect, useState } from 'react';
import { fetchLogs } from '../api/get-logs';

export default function LogsView() {
  const [logs, setLogs] = useState([]);
  const [severity, setSeverity] = useState('All');
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetchLogs()
      .then((data) => {
        setLogs(data.logs || []);
      })
      .catch((error) => {
        console.error('Failed to load logs:', error);
      });
  }, []);

  const filteredLogs = logs.filter((log) => {
    const severityMatch = severity === 'All' || log.severity === severity;
    const queryMatch =
      log.message.toLowerCase().includes(query.toLowerCase()) ||
      log.category.toLowerCase().includes(query.toLowerCase()) ||
      log.source.toLowerCase().includes(query.toLowerCase());

    return severityMatch && queryMatch;
  });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-[28px] font-semibold tracking-tight text-slate-800">
          System Logs
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Operational events for map, reports, and enterprise monitoring.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search logs"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-primary-600 focus:outline-none sm:col-span-3"
          />
          <select
            value={severity}
            onChange={(event) => setSeverity(event.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-primary-600 focus:outline-none"
          >
            <option>All</option>
            <option>Info</option>
            <option>Warning</option>
            <option>Error</option>
          </select>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="min-h-[84px] rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <p className="text-slate-500">Total Logs</p>
            <p className="text-xl font-semibold text-primary-900">
              {logs.length}
            </p>
          </div>
          <div className="min-h-[84px] rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <p className="text-slate-500">Warnings</p>
            <p className="text-xl font-semibold text-amber-700">
              {logs.filter((log) => log.severity === 'Warning').length}
            </p>
          </div>
          <div className="min-h-[84px] rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <p className="text-slate-500">Errors</p>
            <p className="text-xl font-semibold text-rose-700">
              {logs.filter((log) => log.severity === 'Error').length}
            </p>
          </div>
        </div>
      </div>

      <div className="max-h-[62vh] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2.5">Timestamp</th>
              <th className="px-3 py-2.5">Source</th>
              <th className="px-3 py-2.5">Category</th>
              <th className="px-3 py-2.5">Message</th>
              <th className="px-3 py-2.5">Severity</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((log) => (
              <tr key={log.id} className="border-t border-slate-100">
                <td className="px-3 py-2.5">{log.timestamp}</td>
                <td className="px-3 py-2.5">{log.source}</td>
                <td className="px-3 py-2.5">{log.category}</td>
                <td className="px-3 py-2.5">{log.message}</td>
                <td className="px-3 py-2.5">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      log.severity === 'Warning'
                        ? 'bg-amber-100 text-amber-700'
                        : log.severity === 'Error'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {log.severity}
                  </span>
                </td>
              </tr>
            ))}

            {filteredLogs.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-sm text-slate-500"
                >
                  No logs match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
