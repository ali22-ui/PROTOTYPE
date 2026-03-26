import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Bell,
  ChartColumn,
  CircleUserRound,
  Download,
  FileText,
  Hammer,
  Send,
  Wrench,
  Video,
} from 'lucide-react';
import {
  exportEnterpriseCsv,
  exportEnterprisePdf,
  fetchEnterpriseDashboard,
  fetchEnterpriseProfile,
  fetchReportingWindowStatus,
  requestMaintenance,
  submitEnterpriseReport,
  submitManualLogCorrection,
} from '../services/api';

const pieColors = ['#f4b400', '#3b82f6', '#1e3a8a'];
const trendColors = ['#1e3a8a', '#f4b400'];

export default function EnterprisePortalView() {
  const [profile, setProfile] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [windowState, setWindowState] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState('');

  useEffect(() => {
    Promise.all([fetchEnterpriseProfile(), fetchEnterpriseDashboard(), fetchReportingWindowStatus()])
      .then(([profileData, dashboardData, windowData]) => {
        setProfile(profileData);
        setDashboard(dashboardData);
        setWindowState(windowData);
      })
      .catch((error) => {
        console.error('Failed to load enterprise portal data:', error);
      });
  }, []);

  const residencePieData = useMemo(() => {
    if (!dashboard?.visitor_residence_breakdown) return [];
    return Object.entries(dashboard.visitor_residence_breakdown).map(([name, value]) => ({ name, value }));
  }, [dashboard]);

  const trafficTrend = useMemo(() => {
    if (!dashboard?.clustered_column_chart) return [];
    return dashboard.clustered_column_chart.map((item) => ({
      time_slot: item.time_slot,
      male_total: item.male_total,
      female_total: item.female_total,
      total: item.male_total + item.female_total,
    }));
  }, [dashboard]);

  const radarData = useMemo(
    () =>
      (dashboard?.peak_visit_frequency_by_residence || []).map((item) => ({
        category: item.category,
        value: item.value,
      })),
    [dashboard]
  );

  if (!profile || !dashboard || !windowState) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6">Loading enterprise dashboard…</div>;
  }

  const reportingOpen = windowState.status === 'OPEN';

  const triggerDownload = (blob, filename, mimeType) => {
    const normalizedBlob = blob instanceof Blob ? blob : new Blob([blob], { type: mimeType });
    const url = URL.createObjectURL(normalizedBlob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const openPdfInNewTab = (blob, mimeType) => {
    const normalizedBlob = blob instanceof Blob ? blob : new Blob([blob], { type: mimeType });
    const url = URL.createObjectURL(normalizedBlob);
    const popup = window.open(url, '_blank', 'noopener,noreferrer');
    if (!popup) {
      URL.revokeObjectURL(url);
      throw new Error('Popup blocked. Please allow popups for this site and try again.');
    }

    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  const handleSubmitToLgu = async () => {
    setActionFeedback('');
    setIsSubmitting(true);

    try {
      const payload = {
        enterprise_id: profile.enterprise_id,
        period: windowState.period,
      };

      const response = await submitEnterpriseReport(payload);
      setActionFeedback(`${response.message} (${response.report_id})`);
      const newWindowState = await fetchReportingWindowStatus();
      setWindowState(newWindowState);
    } catch (error) {
      setActionFeedback(error?.response?.data?.detail || 'Submission failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAction = async (action) => {
    setActionFeedback('');
    try {
      if (action === 'pdf') {
        const file = await exportEnterprisePdf();
        openPdfInNewTab(file.blob, file.mimeType);
        setActionFeedback(`Monthly PDF opened: ${file.filename}`);
        return;
      }

      if (action === 'csv') {
        const file = await exportEnterpriseCsv();
        triggerDownload(file.blob, file.filename, file.mimeType);
        setActionFeedback(`CSV exported: ${file.filename}`);
        return;
      }

      if (action === 'maintenance') {
        const response = await requestMaintenance({
          enterprise_id: profile.enterprise_id,
          message: 'Camera calibration and hardware inspection requested from dashboard action panel.',
        });
        setActionFeedback(`${response.message} Ticket: ${response.ticket.ticket_id}`);
        return;
      }

      if (action === 'manual-correction') {
        const response = await submitManualLogCorrection({
          enterprise_id: profile.enterprise_id,
          message: 'Please update evening dwell cluster counts for March 26 due to entry gate overlap.',
        });
        setActionFeedback(`${response.message} Ticket: ${response.ticket.ticket_id}`);
      }
    } catch (error) {
      setActionFeedback(error?.message || 'Action failed. Please try again.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-slate-800">{dashboard.header.company_name}</h3>
            <p className="text-sm text-slate-500">{dashboard.header.datetime_label}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-slate-200 p-2 text-slate-600"><Bell size={16} /></div>
            <div className="rounded-lg border border-slate-200 p-2 text-slate-600"><CircleUserRound size={16} /></div>
          </div>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Visitors (Month-to-Date)"
          value={dashboard.key_stats.total_visitors_mtd.toLocaleString()}
          subValue={`▲ +${dashboard.key_stats.total_visitors_mtd_trend_pct}%`}
          subValueClassName="text-emerald-700"
        />
        <StatCard
          title="Peak Visitor Hours"
          value={dashboard.key_stats.peak_visitor_hours[0]}
          subValue={dashboard.key_stats.peak_visitor_hours[1]}
        />
        <StatCard
          title="Clustered Chart Mode"
          value={dashboard.key_stats.clustered_chart_mode}
          icon={<ChartColumn size={15} />}
          subValue="Current clustering interval"
        />
        <StatCard title="Average Dwell Time" value={dashboard.key_stats.average_dwell_time} subValue="Across all detections" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-slate-700">Traffic Trend (Daily AI Stream)</h4>
            <p className="mb-2 text-xs text-slate-500">Updated visual: area + line view for male/female totals and combined flow.</p>
            <div className="h-[330px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trafficTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time_slot" interval={0} angle={-32} textAnchor="end" height={65} tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip contentStyle={{ borderRadius: 12, borderColor: '#cbd5e1' }} />
                  <Area type="monotone" dataKey="male_total" stroke={trendColors[0]} fill="rgba(30,58,138,.18)" strokeWidth={2} />
                  <Area type="monotone" dataKey="female_total" stroke={trendColors[1]} fill="rgba(244,180,0,.18)" strokeWidth={2} />
                  <Line type="monotone" dataKey="total" stroke="#0f172a" strokeWidth={2.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-slate-700">Residence Mix Distribution</h4>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={residencePieData} dataKey="value" nameKey="name" outerRadius={72} label>
                      {residencePieData.map((entry, index) => (
                        <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="category" tick={{ fontSize: 11 }} />
                    <PolarRadiusAxis />
                    <Tooltip />
                    <Radar name="Peak Frequency" dataKey="value" stroke="#1d4ed8" fill="#1d4ed8" fillOpacity={0.45} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-slate-700">Camera Monitoring</h4>
            <p className="mt-2 text-sm text-slate-600">Use the dedicated <strong>Camera Monitoring</strong> tab for live simulation and animated AI detections.</p>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <p className="flex items-center gap-1"><Video size={13} /> CCTV Status: ACTIVE (Main Entrance - Camera 1)</p>
              <p className="mt-1">Recent Sync: {dashboard.recent_syncs[0]}</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-slate-700">Enterprise Actions</h4>
            <div className="mt-3 grid gap-2">
              <ActionButton icon={<FileText size={14} />} label="View Monthly PDF Report" onClick={() => handleAction('pdf')} />
              <ActionButton icon={<Download size={14} />} label="Export Data (CSV)" onClick={() => handleAction('csv')} />
              <ActionButton icon={<Wrench size={14} />} label="Request Maintenance" onClick={() => handleAction('maintenance')} />
              <ActionButton icon={<Hammer size={14} />} label="Submit Manual Log Correction" onClick={() => handleAction('manual-correction')} />
              <button
                type="button"
                disabled={!reportingOpen || isSubmitting}
                onClick={handleSubmitToLgu}
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white ${
                  reportingOpen && !isSubmitting
                    ? 'bg-primary-500 hover:bg-primary-700'
                    : 'cursor-not-allowed bg-slate-400'
                }`}
              >
                <Send size={14} />
                Submit Reports to LGU
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Reporting window for {windowState.period}: <strong>{windowState.status}</strong>
            </p>
            <p className="mt-1 text-xs text-slate-500">Button is grayed out until LGU opens the reporting window.</p>
            {actionFeedback ? <p className="mt-2 text-xs text-primary-700">{actionFeedback}</p> : null}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-slate-700">Visitor Pulse (Last 12 slots)</h4>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trafficTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time_slot" tick={{ fontSize: 10 }} />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="total" stroke="#1e3a8a" fill="rgba(30,58,138,.2)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({ title, value, subValue, subValueClassName = 'text-slate-500', icon }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{title}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-2xl font-bold text-slate-800">{value}</p>
        {icon ? <div className="rounded-full bg-slate-100 p-1.5 text-slate-600">{icon}</div> : null}
      </div>
      <p className={`mt-1 text-xs ${subValueClassName}`}>{subValue}</p>
    </article>
  );
}

function ActionButton({ icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      {icon}
      {label}
    </button>
  );
}
