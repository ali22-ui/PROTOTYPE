import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  closeReportingWindow,
  fetchLguOverview,
  fetchLguReportDetail,
  fetchLguReports,
  openReportingWindow,
} from '../services/api';

const colors = ['#1e3a8a', '#1d4ed8', '#f4b400'];

export default function LguPortalView() {
  const [overview, setOverview] = useState(null);
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [loadingAction, setLoadingAction] = useState(false);

  const loadData = async () => {
    const [overviewData, reportsData] = await Promise.all([fetchLguOverview(), fetchLguReports()]);
    setOverview(overviewData);
    setReports(reportsData.reports || []);
  };

  useEffect(() => {
    loadData().catch((error) => {
      console.error('Failed to load LGU portal data:', error);
    });
  }, []);

  const chartData = useMemo(() => {
    if (!selectedReport?.charts?.peak_visit_frequency_by_residence) return [];
    return selectedReport.charts.peak_visit_frequency_by_residence;
  }, [selectedReport]);

  if (!overview) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6">Loading LGU portal…</div>;
  }

  const handleWindowAction = async (action) => {
    setLoadingAction(true);
    try {
      const payload = {
        enterprise_id: overview.active_reporting_window.enterprise_id,
        period: overview.active_reporting_window.period,
      };

      if (action === 'open') {
        await openReportingWindow(payload);
      } else {
        await closeReportingWindow(payload);
      }

      await loadData();
    } finally {
      setLoadingAction(false);
    }
  };

  const handleViewReport = async (reportId) => {
    const detail = await fetchLguReportDetail(reportId);
    setSelectedReport(detail);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-2xl font-bold text-slate-800">LGU Central Portal</h3>
        <p className="text-sm text-slate-500">Aggregate view of linked enterprise reports and reporting windows.</p>
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="LGU" value={overview.name} />
        <KpiCard label="Linked Enterprises" value={overview.total_linked_enterprises} />
        <KpiCard label="Submitted Reports (Current Period)" value={overview.submitted_reports_current_period} />
        <KpiCard label="Submission Completion Rate" value={`${overview.submission_completion_rate_pct}%`} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-slate-700">Reporting Window Control</h4>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleWindowAction('open')}
                disabled={loadingAction}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                OPEN Window
              </button>
              <button
                type="button"
                onClick={() => handleWindowAction('close')}
                disabled={loadingAction}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                CLOSE Window
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-2.5"><strong>Enterprise:</strong> {overview.active_reporting_window.enterprise_id}</div>
            <div className="rounded-lg bg-slate-50 p-2.5"><strong>Period:</strong> {overview.active_reporting_window.period}</div>
            <div className="rounded-lg bg-slate-50 p-2.5"><strong>Status:</strong> {overview.active_reporting_window.status}</div>
            <div className="rounded-lg bg-slate-50 p-2.5"><strong>Opened By:</strong> {overview.active_reporting_window.opened_by}</div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-semibold text-slate-700">Linked Enterprise</h4>
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <p><strong>Enterprise:</strong> Archies</p>
            <p><strong>Enterprise ID:</strong> ent_archies_001</p>
            <p><strong>LGU ID:</strong> lgu_san_pedro_001</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h4 className="text-sm font-semibold text-slate-700">Submitted Report List</h4>
        <div className="mt-3 space-y-2 text-sm">
          {reports.map((report) => (
            <div key={report.report_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div>
                <p className="font-semibold text-slate-800">{report.report_id}</p>
                <p className="text-xs text-slate-500">{report.enterprise_name} • {report.period?.month} • {report.submitted_at}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">Received</span>
                <button
                  type="button"
                  onClick={() => handleViewReport(report.report_id)}
                  className="rounded-lg bg-primary-500 px-3 py-1 text-xs font-semibold text-white hover:bg-primary-700"
                >
                  View Detail
                </button>
              </div>
            </div>
          ))}
          {reports.length === 0 ? <p className="text-xs text-slate-500">No reports available yet.</p> : null}
        </div>
      </section>

      {selectedReport ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-slate-700">Report Detail: {selectedReport.report_id}</h4>
            <button
              type="button"
              onClick={() => setSelectedReport(null)}
              className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50"
            >
              Close
            </button>
          </div>

          <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-2.5"><strong>Enterprise:</strong> {selectedReport.enterprise_name}</div>
            <div className="rounded-lg bg-slate-50 p-2.5"><strong>Period:</strong> {selectedReport.period.month}</div>
            <div className="rounded-lg bg-slate-50 p-2.5"><strong>Total Visitors:</strong> {selectedReport.kpis.total_visitors_mtd}</div>
            <div className="rounded-lg bg-slate-50 p-2.5"><strong>Average Dwell:</strong> {selectedReport.kpis.avg_dwell}</div>
          </div>

          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="category" width={90} />
                <Tooltip />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {chartData.map((_, index) => (
                    <Cell key={`detail-bar-${index}`} fill={colors[index % colors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function KpiCard({ label, value }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-bold text-slate-800">{value}</p>
    </article>
  );
}
