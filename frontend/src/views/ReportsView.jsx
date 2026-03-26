import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  closeAllEnterpriseReportingWindows,
  exportAuthorityPackageDocx,
  exportAuthorityPackagePdf,
  fetchEnterpriseCameraStream,
  fetchLguEnterpriseAccounts,
  fetchLguReportDetail,
  fetchLguReports,
  generateAuthorityPackage,
  getCameraWebSocketUrl,
  notifyAllEnterprisesToSubmit,
} from '../services/api';

const pieColors = ['#1e3a8a', '#1d4ed8', '#f4b400'];

const triggerDownload = ({ blob, filename, mimeType }) => {
  const objectUrl = window.URL.createObjectURL(new Blob([blob], { type: mimeType }));
  const link = document.createElement('a');
  link.href = objectUrl;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
};

export default function ReportsView() {
  const [period, setPeriod] = useState('2026-03');
  const [reports, setReports] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [selectedReportDetail, setSelectedReportDetail] = useState(null);
  const [authorityPackage, setAuthorityPackage] = useState(null);
  const [statusFilter, setStatusFilter] = useState('All');
  const [feedback, setFeedback] = useState('');
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [modalFeedback, setModalFeedback] = useState('');
  const [lguCameraStream, setLguCameraStream] = useState(null);
  const [lguCameraMode, setLguCameraMode] = useState('idle');
  const [lguVideoSourceIndex, setLguVideoSourceIndex] = useState(0);

  const loadAll = async () => {
    const [reportsRes, accountsRes] = await Promise.all([
      fetchLguReports({ period }),
      fetchLguEnterpriseAccounts(period),
    ]);

    setReports(reportsRes.reports || []);
    setAccounts(accountsRes.accounts || []);
  };

  useEffect(() => {
    loadAll().catch((error) => {
      console.error('Failed to load LGU reports:', error);
    });
  }, [period]);

  useEffect(() => {
    if (!selectedReportDetail?.enterprise_id) return undefined;

    let socket;
    let reconnectTimer;
    let fallbackTimer;
    let isClosed = false;
    const enterpriseId = selectedReportDetail.enterprise_id;

    const pollFrame = async () => {
      const payload = await fetchEnterpriseCameraStream(enterpriseId);
      setLguCameraStream(payload);
    };

    const startFallback = () => {
      setLguCameraMode('polling-fallback');
      fallbackTimer = setInterval(() => {
        pollFrame().catch((error) => console.error('LGU camera fallback polling failed:', error));
      }, 1000);
    };

    const connect = () => {
      setLguCameraMode('connecting');
      try {
        socket = new WebSocket(getCameraWebSocketUrl(enterpriseId));
      } catch (error) {
        console.error('LGU camera websocket init failed:', error);
        startFallback();
        return;
      }

      socket.onopen = () => setLguCameraMode('websocket-live');
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          setLguCameraStream(payload);
        } catch (error) {
          console.error('Invalid LGU camera websocket payload:', error);
        }
      };

      socket.onerror = () => {
        if (!fallbackTimer) startFallback();
      };

      socket.onclose = () => {
        if (isClosed) return;
        if (!fallbackTimer) startFallback();
        reconnectTimer = setTimeout(() => {
          if (!isClosed) connect();
        }, 2000);
      };
    };

    pollFrame().catch((error) => console.error('LGU camera initial load failed:', error));
    connect();

    return () => {
      isClosed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (fallbackTimer) clearInterval(fallbackTimer);
      if (socket && socket.readyState === WebSocket.OPEN) socket.close();
    };
  }, [selectedReportDetail?.enterprise_id]);

  const submissionSummary = useMemo(() => {
    const submitted = accounts.filter((item) => item.has_submitted_for_period).length;
    const open = accounts.filter((item) => item.reporting_window_status === 'OPEN').length;
    const waiting = accounts.length - submitted;
    return { submitted, open, waiting };
  }, [accounts]);

  const chartData = useMemo(() => {
    return accounts.map((item) => ({
      enterprise: item.company_name,
      score: item.has_submitted_for_period ? 100 : item.reporting_window_status === 'OPEN' ? 60 : 20,
    }));
  }, [accounts]);

  const filteredAccounts = accounts.filter((item) => {
    if (statusFilter === 'All') return true;
    if (statusFilter === 'Submitted') return item.has_submitted_for_period;
    if (statusFilter === 'Open') return item.reporting_window_status === 'OPEN';
    if (statusFilter === 'Closed') return item.reporting_window_status === 'CLOSED';
    return true;
  });

  const handleNotifyAll = async () => {
    setIsActionLoading(true);
    setFeedback('');
    try {
      const result = await notifyAllEnterprisesToSubmit(period);
      setFeedback(result.message);
      await loadAll();
    } catch (error) {
      setFeedback(error?.response?.data?.detail || 'Failed to notify all enterprises.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCloseAll = async () => {
    setIsActionLoading(true);
    setFeedback('');
    try {
      const result = await closeAllEnterpriseReportingWindows(period);
      setFeedback(result.message);
      await loadAll();
    } catch (error) {
      setFeedback(error?.response?.data?.detail || 'Failed to close reporting windows.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleOpenReport = async (report) => {
    setSelectedReport(report);
    setAuthorityPackage(null);
    setModalFeedback('');
    const detail = await fetchLguReportDetail(report.report_id);
    setSelectedReportDetail(detail);
  };

  const handleGenerateAuthorityPackage = async () => {
    if (!selectedReport) return;
    setModalFeedback('');
    try {
      const packageData = await generateAuthorityPackage(selectedReport.report_id);
      setAuthorityPackage(packageData);
      setModalFeedback('Authority package generated successfully.');
    } catch (error) {
      setModalFeedback(error?.response?.data?.detail || 'Failed to generate authority package.');
    }
  };

  const handleDownloadAuthorityPdf = async () => {
    if (!selectedReport) return;
    setModalFeedback('');
    try {
      const payload = await exportAuthorityPackagePdf(selectedReport.report_id);
      triggerDownload(payload);
      setModalFeedback(`Downloaded: ${payload.filename}`);
    } catch (error) {
      setModalFeedback(error?.response?.data?.detail || 'Authority PDF download failed. Please ensure backend is running and try again.');
    }
  };

  const handleDownloadAuthorityDocx = async () => {
    if (!selectedReport) return;
    setModalFeedback('');
    try {
      const payload = await exportAuthorityPackageDocx(selectedReport.report_id);
      triggerDownload(payload);
      setModalFeedback(`Downloaded: ${payload.filename}`);
    } catch (error) {
      setModalFeedback(error?.response?.data?.detail || 'Authority DOCX download failed. Please ensure backend is running and try again.');
    }
  };

  const pieData = useMemo(() => {
    if (!selectedReportDetail?.charts?.visitor_residence_breakdown) return [];
    return Object.entries(selectedReportDetail.charts.visitor_residence_breakdown).map(([name, value]) => ({ name, value }));
  }, [selectedReportDetail]);

  const dailySummary = selectedReportDetail?.charts?.daily_summary || [];
  const detailedRows = selectedReportDetail?.charts?.detailed_detection_rows || [];
  const lguVideoSources = useMemo(
    () => [
      lguCameraStream?.sample_video_url,
      'https://www.w3schools.com/html/mov_bbb.mp4',
      'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    ].filter(Boolean),
    [lguCameraStream?.sample_video_url]
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[28px] font-semibold tracking-tight">Reports Control Center</h3>
            <p className="text-sm text-slate-500">LGU controls enterprise monthly submission windows and reviews complete report packs.</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-primary-600 focus:outline-none"
            />
            <button
              type="button"
              disabled={isActionLoading}
              onClick={handleNotifyAll}
              className="rounded-lg bg-primary-500 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Notify All Accounts to Submit
            </button>
            <button
              type="button"
              disabled={isActionLoading}
              onClick={handleCloseAll}
              className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Close All Submission Windows
            </button>
          </div>
        </div>
        {feedback ? <p className="mt-2 text-xs text-primary-700">{feedback}</p> : null}
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total Enterprise Accounts" value={accounts.length} />
        <SummaryCard label="Submitted for Period" value={submissionSummary.submitted} accent="text-emerald-700" />
        <SummaryCard label="Window OPEN" value={submissionSummary.open} accent="text-blue-700" />
        <SummaryCard label="Waiting Submission" value={submissionSummary.waiting} accent="text-amber-700" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="mb-3 text-sm font-semibold">Enterprise Submission Readiness</h4>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="enterprise" interval={0} angle={-18} textAnchor="end" height={70} tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} />
                <Tooltip contentStyle={{ borderRadius: 12, borderColor: '#cbd5e1' }} />
                <Area type="monotone" dataKey="score" stroke="#1d4ed8" fill="rgba(29,78,216,.2)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Enterprise Accounts</h4>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
            >
              <option>All</option>
              <option>Submitted</option>
              <option>Open</option>
              <option>Closed</option>
            </select>
          </div>

          <div className="mt-3 space-y-2 text-sm">
            {filteredAccounts.map((account) => (
              <div key={account.enterprise_id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-700">{account.company_name}</p>
                    <p className="text-xs text-slate-500">{account.enterprise_id}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      account.reporting_window_status === 'OPEN'
                        ? 'bg-blue-100 text-blue-700'
                        : account.has_submitted_for_period
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {account.has_submitted_for_period ? 'Submitted' : account.reporting_window_status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h4 className="mb-3 text-sm font-semibold">Submitted Report Packs</h4>
        <div className="space-y-2 text-sm">
          {reports.map((item) => (
            <div key={item.report_id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div>
                <p className="font-semibold text-slate-700">{item.report_id}</p>
                <p className="text-xs text-slate-500">{item.enterprise_name} • {item.period?.month} • {item.submitted_at}</p>
              </div>
              <button
                type="button"
                onClick={() => handleOpenReport(item)}
                className="rounded-lg bg-primary-500 px-3 py-1 text-xs font-semibold text-white hover:bg-primary-700"
              >
                View Rich Report
              </button>
            </div>
          ))}
          {reports.length === 0 ? <p className="text-xs text-slate-500">No report packs submitted for selected period.</p> : null}
        </div>
      </section>

      {selectedReport && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4" onClick={() => setSelectedReport(null)}>
          <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h5 className="text-lg font-bold text-slate-800">{selectedReport.report_id}</h5>
                <p className="text-sm text-slate-500">{selectedReport.enterprise_name}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleGenerateAuthorityPackage}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Generate Report
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedReport(null)}
                  className="rounded-lg border border-slate-200 px-3 py-1 text-sm hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>

            {selectedReportDetail ? (
              <>
                <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
                  <div className="rounded-lg bg-slate-50 p-3"><strong>Period:</strong> {selectedReportDetail.period?.month || 'N/A'}</div>
                  <div className="rounded-lg bg-slate-50 p-3"><strong>Total Visitors:</strong> {selectedReportDetail.kpis?.total_visitors_mtd || 'N/A'}</div>
                  <div className="rounded-lg bg-slate-50 p-3"><strong>Average Dwell:</strong> {selectedReportDetail.kpis?.avg_dwell || 'N/A'}</div>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <h6 className="text-sm font-semibold text-slate-700">Daily Summary Trend</h6>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={dailySummary}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" hide />
                          <YAxis />
                          <Tooltip />
                          <Area type="monotone" dataKey="total_visitors" stroke="#1d4ed8" fill="rgba(29,78,216,.2)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <h6 className="text-sm font-semibold text-slate-700">Residence Breakdown</h6>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={82}>
                            {pieData.map((entry, index) => (
                              <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                  <h6 className="text-sm font-semibold text-slate-700">Detailed Detection Records (Simulation Data: {detailedRows.length} rows)</h6>
                  <div className="mt-2 max-h-60 overflow-auto">
                    <table className="min-w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-2 py-1.5">Date</th>
                          <th className="px-2 py-1.5">Time Slot</th>
                          <th className="px-2 py-1.5">Male</th>
                          <th className="px-2 py-1.5">Female</th>
                          <th className="px-2 py-1.5">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailedRows.slice(0, 200).map((row, index) => (
                          <tr key={`${row.date}-${row.time_slot}-${index}`} className="border-t border-slate-100">
                            <td className="px-2 py-1.5">{row.date}</td>
                            <td className="px-2 py-1.5">{row.time_slot}</td>
                            <td className="px-2 py-1.5">{row.male_total}</td>
                            <td className="px-2 py-1.5">{row.female_total}</td>
                            <td className="px-2 py-1.5">{row.male_total + row.female_total}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                  <h6 className="text-sm font-semibold text-slate-700">LGU CCTV Panel</h6>
                  <p className="text-xs text-slate-500">Live synchronized stream from enterprise camera (same WebSocket feed).</p>
                  <div className="relative mt-2 h-64 overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
                    <video
                      className="absolute inset-0 h-full w-full object-cover opacity-65"
                      src={lguVideoSources[Math.min(lguVideoSourceIndex, lguVideoSources.length - 1)]}
                      autoPlay
                      muted
                      loop
                      playsInline
                      controls
                      onError={() => setLguVideoSourceIndex((current) => Math.min(current + 1, lguVideoSources.length - 1))}
                    />

                    <div className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-[10px] font-semibold text-white">
                      {lguCameraStream ? `LIVE • Frame ${lguCameraStream.frame}` : 'Connecting camera...'}
                    </div>
                    <div className="absolute right-2 top-2 rounded bg-black/60 px-2 py-1 text-[10px] font-semibold text-emerald-300">
                      {lguCameraMode === 'websocket-live' ? 'WS SYNCHRONIZED' : lguCameraMode === 'polling-fallback' ? 'POLLING FALLBACK' : 'CONNECTING'}
                    </div>

                    <div
                      className="absolute inset-0 opacity-25"
                      style={{
                        backgroundImage:
                          'linear-gradient(to right, rgba(255,255,255,.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.2) 1px, transparent 1px)',
                        backgroundSize: '30px 30px',
                      }}
                    />

                    {(lguCameraStream?.boxes || []).map((box) => (
                      <div
                        key={`lgu-${box.id}`}
                        className="absolute rounded border-2 border-emerald-400 bg-emerald-200/20"
                        style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}
                      >
                        <span className="absolute -top-5 left-0 rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                          {box.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {authorityPackage ? (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                    <p className="font-semibold">Authority Package Generated ✅</p>
                    <p className="mt-1">Package ID: {authorityPackage.authority_package_id}</p>
                    <p>Classification: {authorityPackage.classification}</p>
                    <p className="mt-2 font-medium">Attachments:</p>
                    <ul className="list-disc pl-5">
                      {(authorityPackage.attachments || []).map((attachment) => (
                        <li key={attachment}>{attachment}</li>
                      ))}
                    </ul>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleDownloadAuthorityPdf}
                        className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                      >
                        Download Authority PDF
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadAuthorityDocx}
                        className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"
                      >
                        Download Authority DOCX
                      </button>
                    </div>
                  </div>
                ) : null}

                {modalFeedback ? <p className="mt-3 text-xs text-primary-700">{modalFeedback}</p> : null}
              </>
            ) : (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Loading detailed report data...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, accent = 'text-slate-800' }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${accent}`}>{value}</p>
    </article>
  );
}
