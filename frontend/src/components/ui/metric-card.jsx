import { Line, LineChart, ResponsiveContainer } from 'recharts';

export default function MetricCard({
  title,
  value,
  trend = [],
  color = '#1e40af',
}) {
  const chartData = trend.map((v, i) => ({ idx: i, value: v }));
  const trendDelta = trend.length > 1 ? trend[trend.length - 1] - trend[0] : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <div className="mt-1 flex items-center justify-between">
        <p className="text-3xl font-bold text-slate-800">
          {value.toLocaleString()}
        </p>
        <span
          className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
            trendDelta >= 0
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-rose-100 text-rose-700'
          }`}
        >
          {trendDelta >= 0 ? '+' : ''}
          {trendDelta}
        </span>
      </div>
      <div className="mt-2 h-11">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
