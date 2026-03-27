import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchEnterpriseAnalytics } from '../api/get-enterprises';

const pieColors = ['#1e3a8a', '#1d4ed8', '#f4b400'];

export default function EnterpriseAnalytics() {
  const navigate = useNavigate();
  const { enterpriseId } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchEnterpriseAnalytics(enterpriseId)
      .then((result) => {
        setData(result);
      })
      .catch((error) => {
        console.error('Failed to load enterprise analytics:', error);
      });
  }, [enterpriseId]);

  if (!data) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        Loading enterprise analytics...
      </div>
    );
  }

  const { enterprise, analytics } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h3 className="text-[26px] font-semibold tracking-tight">
            {enterprise?.name || 'Enterprise'} - Analytics
          </h3>
          <p className="text-sm text-slate-500">
            {enterprise?.barangay} | {enterprise?.type} | {enterprise?.status}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/app/map')}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Back to Map View
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="mb-3 text-sm font-semibold">
            Demographics (Male vs Female)
          </h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={analytics.demographics}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={90}
                  label
                >
                  {analytics.demographics.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={pieColors[index % pieColors.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
          <h4 className="mb-3 text-sm font-semibold">Residency Status</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.residency}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip
                  contentStyle={{ borderRadius: 12, borderColor: '#cbd5e1' }}
                />
                <Bar dataKey="value" fill="#1e3a8a" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h4 className="mb-3 text-sm font-semibold">Visitor Trends</h4>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={analytics.visitorTrends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip
                contentStyle={{ borderRadius: 12, borderColor: '#cbd5e1' }}
              />
              <Line
                type="monotone"
                dataKey="visitors"
                stroke="#1d4ed8"
                strokeWidth={3}
                dot={{ r: 4, fill: '#f4b400' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h4 className="mb-3 text-sm font-semibold">Report History</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {analytics.reportHistory.map((report) => (
                <tr
                  key={`${report.date}-${report.type}`}
                  className="border-t border-slate-100"
                >
                  <td className="px-3 py-2">{report.date}</td>
                  <td className="px-3 py-2">{report.type}</td>
                  <td className="px-3 py-2">{report.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
