import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Bell, Clock3, UserRound, UsersRound } from 'lucide-react';
import CityMap from '../components/CityMap';
import { fetchBarangays, fetchLogs, fetchOverview } from '../services/api';

export default function OverviewView() {
  const [overview, setOverview] = useState(null);
  const [mapData, setMapData] = useState({ barangays: [], heatmap: [] });
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    Promise.all([fetchOverview(), fetchBarangays(), fetchLogs()])
      .then(([overviewData, barangayData, logsData]) => {
        setOverview(overviewData);
        setMapData(barangayData);
        setLogs(logsData.logs || []);
      })
      .catch((error) => {
        console.error('Failed to load overview data:', error);
      });
  }, []);

  if (!overview) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6">Loading dashboard overview…</div>;
  }

  const analyticsSummary = [
    { label: 'Visitor vs. Tourist', value: '72% | 28%' },
    { label: 'Avg. Stay Duration', value: '92 mins' },
    { label: 'Foreign Visitors', value: '35%' },
    { label: 'Peak Hour', value: '1 PM' },
  ];

  const visitsToday = [
    { name: 'Mon', a: 30, b: 40 },
    { name: 'Tue', a: 44, b: 35 },
    { name: 'Wed', a: 39, b: 52 },
    { name: 'Thu', a: 58, b: 44 },
    { name: 'Fri', a: 47, b: 36 },
  ];

  const peakColors = ['#1e3a8a', '#1d4ed8', '#2563eb', '#3b82f6', '#f4b400', '#f59e0b', '#d97706'];

  const metricCards = [
    {
      title: 'Total People Today',
      value: overview.metrics.totalPeopleToday,
      delta: '+6.1%',
      color: '#1d4ed8',
      icon: UsersRound,
      trend: overview.sparkline.totalPeopleToday,
    },
    {
      title: 'Total Visitors',
      value: overview.metrics.totalVisitors,
      delta: '+4.4%',
      color: '#0ea5e9',
      icon: UserRound,
      trend: overview.sparkline.totalVisitors,
    },
    {
      title: 'Total Tourists',
      value: overview.metrics.totalTourists,
      delta: '+8.2%',
      color: '#f4b400',
      icon: Bell,
      trend: overview.sparkline.totalTourists,
    },
    {
      title: 'Currently Inside',
      value: overview.metrics.currentlyInside,
      delta: '+2.7%',
      color: '#10b981',
      icon: Clock3,
      trend: overview.sparkline.currentlyInside,
    },
  ];

  return (
    <div className="space-y-4">
      <section className="grid gap-3 lg:grid-cols-4">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="rounded-full bg-slate-100 p-2">
                  <Icon size={15} className="text-slate-700" />
                </div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">{card.title}</p>
              </div>
              <div className="mt-2 flex items-end justify-between gap-2">
                <p className="text-4xl font-bold leading-none text-primary-900">{card.value.toLocaleString()}</p>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  {card.delta}
                </span>
              </div>
              <div className="mt-2 h-9">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={card.trend.map((value, index) => ({ value, index }))}>
                    <Area type="monotone" dataKey="value" stroke={card.color} fill="transparent" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-4xl font-semibold tracking-tight text-slate-900">San Pedro Map</h3>
            <p className="mb-3 mt-1 text-sm text-slate-500">Heatmap anchored to barangay centers within San Pedro City, Laguna 4023.</p>
            <CityMap
              barangays={mapData.barangays}
              heatmap={mapData.heatmap}
              showHeatmap
              showPolygons={false}
              showBarangayMarkers
              center={{ lat: 14.3315, lng: 121.0415 }}
              zoom={12.9}
              className="h-[470px] w-full"
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-slate-700">Recent Activity</h4>
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-1.5">Entity ID</th>
                    <th className="py-1.5">Type</th>
                    <th className="py-1.5">Duration</th>
                    <th className="py-1.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.recentActivities.map((activity, index) => (
                    <tr key={activity} className="border-t border-slate-100">
                      <td className="py-1.5 font-semibold text-primary-900">E-{1023 + index * 17}</td>
                      <td className="py-1.5">{index % 2 === 0 ? 'Visitor' : 'Tourist'}</td>
                      <td className="py-1.5">{index % 2 === 0 ? '45 mins' : '1 hr 30 mins'}</td>
                      <td className="py-1.5">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${index % 2 === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {index % 2 === 0 ? 'Exited' : 'Active'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-slate-700">Peak Hour (9 AM - 6 PM)</h4>
            <div className="mt-2 h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={overview.peakHour}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" interval={1} angle={-35} textAnchor="end" height={60} tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ borderRadius: 12, borderColor: '#cbd5e1' }} />
                  <Area type="monotone" dataKey="value" stroke="#1e3a8a" fill="#dbe8ff" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-slate-700">Analytics</h4>
            <div className="mt-2 space-y-2 text-sm text-slate-700">
              {analyticsSummary.map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2">
                  <span>{item.label}</span>
                  <span className="font-semibold text-primary-900">{item.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 h-24">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={visitsToday}>
                  <Bar dataKey="a" radius={[4, 4, 0, 0]}>
                    {visitsToday.map((_, index) => (
                      <Cell key={`a-${index}`} fill={peakColors[index % peakColors.length]} />
                    ))}
                  </Bar>
                  <Bar dataKey="b" fill="#1e3a8a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-slate-700">Latest Logs</h4>
            <ul className="mt-2 space-y-2 text-xs text-slate-600">
              {logs.slice(0, 3).map((log) => (
                <li key={log.id} className="rounded-lg border border-slate-200 px-2.5 py-2">
                  <p className="font-semibold text-slate-700">{log.category}</p>
                  <p>{log.message}</p>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>
    </div>
  );
}
