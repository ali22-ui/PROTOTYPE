import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { CalendarDays, Send, Users } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { EnterpriseOutletContext } from '@/components/layout/EnterpriseShell';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import { fetchDashboardLayoutData } from '@/services/api';
import type { DashboardLayoutData } from '@/types';

const numberFormatter = new Intl.NumberFormat('en-PH');

const CHART_COLORS = {
  male: '#346739',
  female: '#79AE6F',
  visitors: '#9FCB98',
  tourist: '#F2EDC2',
};

const RESIDENCE_COLORS = ['#79AE6F', '#346739', '#9FCB98'] as const;

export default function DashboardView(): JSX.Element {
  const { user } = useOutletContext<EnterpriseOutletContext>();
  const [layoutData, setLayoutData] = useState<DashboardLayoutData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetchDashboardLayoutData(user.enterpriseId);
      setLayoutData(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load dashboard metrics.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user.enterpriseId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return <LoadingState label="Loading enterprise dashboard..." />;
  }

  if (error || !layoutData) {
    return <ErrorState message={error || 'Dashboard unavailable.'} onRetry={() => void loadData()} />;
  }

  const metrics = layoutData.metrics;
  const titleAlreadyIncludesPortal = layoutData.title.toLowerCase().includes('tourism analytics portal');
  const dashboardTitle = titleAlreadyIncludesPortal
    ? layoutData.title
    : `${layoutData.title} - Tourism Analytics Portal`;

  return (
    <div className="grid min-h-[calc(100vh-7rem)] grid-rows-[auto_auto_1fr] gap-3">
      <header className="rounded-2xl border border-brand-light bg-brand-cream px-5 py-3 shadow-sm">
        <h2 className="text-3xl font-bold text-brand-dark">{dashboardTitle}</h2>
        <p className="text-xl text-brand-dark/80">{layoutData.timestampLabel}</p>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <article className="rounded-2xl border border-brand-light bg-brand-cream p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-dark/80">Average Visit Count (Month-to-Date)</p>
          <div className="mt-2 flex items-start justify-between gap-2">
            <p className="text-3xl font-bold text-brand-dark">{numberFormatter.format(metrics.averageVisitCountMtd)}</p>
            <Users className="text-brand-mid" size={20} />
          </div>
          <p className="mt-1 text-base font-semibold text-brand-dark">+{metrics.trendPercentage.toFixed(1)}%</p>
        </article>

        <article className="rounded-2xl border border-brand-light bg-brand-cream p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-dark/80">Peak Day</p>
          <div className="mt-2 flex items-start justify-between gap-2">
            <p className="text-3xl font-bold text-brand-dark">{metrics.peakDayLabel}</p>
            <CalendarDays className="text-brand-mid" size={20} />
          </div>
          <p className="mt-1 text-base text-brand-dark/85">{metrics.peakTimeRange}</p>
        </article>

        <article className="rounded-2xl border border-brand-light bg-brand-cream p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-dark/80">Report Submission</p>
          <div className="mt-2 flex items-start justify-between gap-2">
            <p className="text-3xl font-bold text-brand-dark">{metrics.reportMonthLabel}</p>
            <Send className="text-brand-mid" size={20} />
          </div>
          <p className="mt-1 text-base capitalize text-brand-dark/85">status: {metrics.reportStatus}</p>
        </article>
      </section>

      <section className="grid min-h-[500px] gap-3 md:grid-cols-[minmax(0,58%)_minmax(0,42%)]">
        <div className="grid h-full gap-3 grid-rows-[minmax(0,62%)_minmax(0,38%)]">
          <article className="rounded-2xl border border-brand-light bg-white p-3 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-brand-dark">
              Visitor Demographic - Sex, Visitor and Tourist Breakdown
            </h3>
            <div className="h-[260px] w-full">
              <ResponsiveContainer>
                <AreaChart data={layoutData.weeklyDemographicSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#D6D3A8" />
                  <XAxis dataKey="day" tick={{ fill: '#346739' }} />
                  <YAxis tick={{ fill: '#346739' }} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="male" stackId="1" stroke={CHART_COLORS.male} fill={CHART_COLORS.male} fillOpacity={0.75} />
                  <Area type="monotone" dataKey="female" stackId="1" stroke={CHART_COLORS.female} fill={CHART_COLORS.female} fillOpacity={0.75} />
                  <Area type="monotone" dataKey="visitors" stackId="1" stroke={CHART_COLORS.visitors} fill={CHART_COLORS.visitors} fillOpacity={0.75} />
                  <Area type="monotone" dataKey="tourist" stackId="1" stroke={CHART_COLORS.tourist} fill={CHART_COLORS.tourist} fillOpacity={0.8} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="rounded-2xl border border-brand-light bg-white p-3 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-brand-dark">Residence Mix Distribution</h3>
            <div className="h-[185px] w-full">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={layoutData.residenceMixDistribution}
                    dataKey="value"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    innerRadius={42}
                    outerRadius={68}
                    labelLine={false}
                    paddingAngle={2}
                    stroke="#F2EDC2"
                  >
                    {layoutData.residenceMixDistribution.map((row, index) => (
                      <Cell
                        key={row.category}
                        fill={RESIDENCE_COLORS[index % RESIDENCE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-1 grid gap-1 text-xs text-brand-dark/90 sm:grid-cols-3">
              {layoutData.residenceMixDistribution.map((row, index) => (
                <div key={row.category} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: RESIDENCE_COLORS[index % RESIDENCE_COLORS.length] }}
                  />
                  <span>{row.category}: {row.percentage}%</span>
                </div>
              ))}
            </div>
          </article>
        </div>

        <article className="h-full rounded-2xl border border-brand-light bg-white p-3 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-brand-dark">Hourly Demographic Volume (1:00 - 23:00)</h3>
          <div className="h-[470px] w-full">
            <ResponsiveContainer>
              <AreaChart data={layoutData.hourlyDemographicSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#D6D3A8" />
                <XAxis dataKey="hourLabel" angle={-35} textAnchor="end" height={70} tick={{ fill: '#346739', fontSize: 11 }} />
                <YAxis tick={{ fill: '#346739' }} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="male" stroke={CHART_COLORS.male} fill={CHART_COLORS.male} fillOpacity={0.75} />
                <Area type="monotone" dataKey="female" stroke={CHART_COLORS.female} fill={CHART_COLORS.female} fillOpacity={0.72} />
                <Area type="monotone" dataKey="visitor" stroke={CHART_COLORS.visitors} fill={CHART_COLORS.visitors} fillOpacity={0.72} />
                <Area type="monotone" dataKey="tourist" stroke={CHART_COLORS.tourist} fill={CHART_COLORS.tourist} fillOpacity={0.85} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>
    </div>
  );
}
