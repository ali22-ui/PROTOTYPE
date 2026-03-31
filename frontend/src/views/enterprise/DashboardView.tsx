import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  readEnterpriseInfractions,
  subscribePortalBridge,
} from '@/lib/portalBridge';
import { fetchDashboardLayoutData } from '@/services/api';
import type { DashboardLayoutData, LguInfractionRecord, ResidenceMixDistributionRow } from '@/types';

const numberFormatter = new Intl.NumberFormat('en-PH');

const CHART_COLORS = {
  male: '#5C6F2B',
  female: '#DE802B',
  visitors: '#D8C9A7',
  tourist: '#5C6F2B',
};

const RESIDENCE_COLORS = ['#5C6F2B', '#DE802B', '#D8C9A7'] as const;
const EMPTY_DONUT_COLOR = '#E5E7EB';
const GRID_STROKE = 'rgba(92, 111, 43, 0.14)';
const RESIDENCE_PIE_MARGIN = { top: 4, right: 4, left: 4, bottom: 34 };

const TOOLTIP_CONTENT_STYLE = {
  borderRadius: '12px',
  border: '1px solid #D8C9A7',
  boxShadow: '0 10px 24px rgba(92, 111, 43, 0.14)',
  backgroundColor: '#FFFFFF',
};

const TOOLTIP_LABEL_STYLE = {
  color: '#5C6F2B',
  fontWeight: 700,
};

const TOOLTIP_ITEM_STYLE = {
  color: '#5C6F2B',
};

interface EmptyChartPlaceholderProps {
  message?: string;
}

const EmptyChartPlaceholder = ({
  message = 'Awaiting camera detection data...',
}: EmptyChartPlaceholderProps): JSX.Element => (
  <div className="flex h-full w-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-4">
    <svg
      className="mb-2 h-10 w-10 text-slate-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
      />
    </svg>
    <p className="text-center text-xs text-slate-500">{message}</p>
  </div>
);

const EMPTY_DONUT_DATA: ResidenceMixDistributionRow[] = [
  { category: 'Non-Local Resident', value: 1, percentage: 0 },
];

interface EmptyPieChartProps {
  height?: string;
}

const EmptyPieChart = ({ height = 'h-49.5' }: EmptyPieChartProps): JSX.Element => (
  <div className={`${height} relative w-full`}>
    <ResponsiveContainer>
      <PieChart margin={RESIDENCE_PIE_MARGIN}>
        <Pie
          data={EMPTY_DONUT_DATA}
          dataKey="value"
          nameKey="category"
          cx="50%"
          cy="40%"
          innerRadius={34}
          outerRadius={56}
          stroke="none"
        >
          <Cell fill={EMPTY_DONUT_COLOR} />
        </Pie>
      </PieChart>
    </ResponsiveContainer>
    <div className="absolute inset-0 flex items-center justify-center">
      <span className="rounded-md bg-white/80 px-2 py-1 text-xs font-medium text-slate-500">
        No Data
      </span>
    </div>
  </div>
);

const hasChartData = (
  data: Array<{ male?: number; female?: number; visitors?: number; visitor?: number; tourist?: number }>,
): boolean =>
  data.some(
    (point) =>
      (point.male ?? 0) > 0 ||
      (point.female ?? 0) > 0 ||
      (point.visitors ?? 0) > 0 ||
      (point.visitor ?? 0) > 0 ||
      (point.tourist ?? 0) > 0,
  );

const hasResidenceData = (data: ResidenceMixDistributionRow[]): boolean =>
  data.some((row) => row.value > 0);

export default function DashboardView(): JSX.Element {
  const { user } = useOutletContext<EnterpriseOutletContext>();
  const [layoutData, setLayoutData] = useState<DashboardLayoutData | null>(
    null,
  );
  const [infractions, setInfractions] = useState<LguInfractionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetchDashboardLayoutData(user.enterpriseId);
      setLayoutData(response);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to load dashboard metrics.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user.enterpriseId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const refreshInfractions = (): void => {
      setInfractions(readEnterpriseInfractions(user.enterpriseId));
    };

    refreshInfractions();
    return subscribePortalBridge(refreshInfractions);
  }, [user.enterpriseId]);

  const hasWeeklyData = useMemo(
    () => hasChartData(layoutData?.weeklyDemographicSeries ?? []),
    [layoutData?.weeklyDemographicSeries],
  );

  const hasHourlyData = useMemo(
    () => hasChartData(layoutData?.hourlyDemographicSeries ?? []),
    [layoutData?.hourlyDemographicSeries],
  );

  const hasResidence = useMemo(
    () => hasResidenceData(layoutData?.residenceMixDistribution ?? []),
    [layoutData?.residenceMixDistribution],
  );

  const isEmptyState = useMemo(
    () => !layoutData?.hasData && layoutData?.metrics.averageVisitCountMtd === 0,
    [layoutData?.hasData, layoutData?.metrics.averageVisitCountMtd],
  );

  if (loading) {
    return <LoadingState label="Loading enterprise dashboard..." />;
  }

  if (error || !layoutData) {
    return (
      <ErrorState
        message={error || 'Dashboard unavailable.'}
        onRetry={() => void loadData()}
      />
    );
  }

  const metrics = layoutData.metrics;
  const titleAlreadyIncludesPortal = layoutData.title
    .toLowerCase()
    .includes('tourism analytics portal');
  const dashboardTitle = titleAlreadyIncludesPortal
    ? layoutData.title
    : `${layoutData.title} - Tourism Analytics Portal`;

  const isPeakDayEmpty =
    metrics.peakDayLabel === 'Insufficient Data' ||
    metrics.peakDayLabel === 'N/A' ||
    !metrics.peakDayLabel;

  return (
    <div className="space-y-3">
      <header className="rounded-xl border border-brand-mid/70 bg-brand-bg px-5 py-4 shadow-sm">
        <h2 className="text-2xl font-bold text-brand-dark md:text-3xl">
          {dashboardTitle}
        </h2>
        <p className="text-sm text-brand-dark/80 md:text-base">
          {layoutData.timestampLabel}
        </p>
      </header>

      {infractions.length ? (
        <section className="rounded-xl border border-brand-accent/40 bg-brand-accent/10 px-4 py-3 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-accent">
            Official Warning Record
          </p>
          <p className="mt-1 text-sm font-semibold text-brand-dark">
            You currently have {infractions.length} LGU compliance warning
            record(s).
          </p>
          <ul className="mt-2 space-y-1 text-xs text-brand-dark/85">
            {infractions.slice(0, 3).map((record) => (
              <li key={record.id}>
                • {record.period} — {record.type}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        <article className="rounded-xl border border-brand-mid/70 bg-white p-3.5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-dark/80">
            Average Visit Count (Month-to-Date)
          </p>
          <div className="mt-2 flex items-start justify-between gap-2">
            <p className="text-2xl font-bold text-brand-dark md:text-[1.75rem]">
              {metrics.averageVisitCountMtd > 0
                ? numberFormatter.format(metrics.averageVisitCountMtd)
                : '0'}
            </p>
            <Users className="text-brand-accent" size={18} />
          </div>
          {metrics.averageVisitCountMtd > 0 ? (
            <p className="mt-1 text-sm font-semibold text-brand-dark">
              +{metrics.trendPercentage.toFixed(1)}%
            </p>
          ) : (
            <p className="mt-1 text-sm text-gray-400">No data yet</p>
          )}
        </article>

        <article className="rounded-xl border border-brand-mid/70 bg-white p-3.5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-dark/80">
            Peak Day
          </p>
          <div className="mt-2 flex items-start justify-between gap-2">
            <p
              className={`text-2xl font-bold md:text-[1.75rem] ${
                isPeakDayEmpty ? 'text-gray-400' : 'text-brand-dark'
              }`}
            >
              {isPeakDayEmpty ? 'Insufficient Data' : metrics.peakDayLabel}
            </p>
            <CalendarDays className="text-brand-accent" size={18} />
          </div>
          {!isPeakDayEmpty && metrics.peakTimeRange ? (
            <p className="mt-1 text-sm text-brand-dark/85">
              {metrics.peakTimeRange}
            </p>
          ) : null}
        </article>

        <article className="rounded-xl border border-brand-mid/70 bg-white p-3.5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-dark/80">
            Report Submission
          </p>
          <div className="mt-2 flex items-start justify-between gap-2">
            <p className="text-2xl font-bold text-brand-dark md:text-[1.75rem]">
              {isEmptyState ? 'No reports yet' : metrics.reportMonthLabel}
            </p>
            <Send className="text-brand-accent" size={18} />
          </div>
          {!isEmptyState ? (
            <p className="mt-1 text-sm capitalize text-brand-dark/85">
              status: {metrics.reportStatus}
            </p>
          ) : (
            <p className="mt-1 text-sm text-gray-400">Awaiting first submission</p>
          )}
        </article>
      </section>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,58%)_minmax(0,42%)]">
        <div className="grid gap-3 lg:grid-rows-[minmax(0,58%)_minmax(0,42%)]">
          <article className="rounded-xl border border-brand-mid/70 bg-white p-3 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-brand-dark">
              Visitor Demographic - Sex, Visitor and Tourist Breakdown
            </h3>
            <div className="h-55 w-full">
              {hasWeeklyData ? (
                <ResponsiveContainer>
                  <AreaChart data={layoutData.weeklyDemographicSeries}>
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="3 3"
                      stroke={GRID_STROKE}
                    />
                    <XAxis
                      dataKey="day"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#5C6F2B', fontSize: 11 }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#5C6F2B', fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_CONTENT_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                      itemStyle={TOOLTIP_ITEM_STYLE}
                    />
                    <Legend wrapperStyle={{ color: '#5C6F2B', fontSize: 11 }} />
                    <Area
                      type="monotone"
                      dataKey="male"
                      stackId="1"
                      stroke={CHART_COLORS.male}
                      fill={CHART_COLORS.male}
                      fillOpacity={0.22}
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="female"
                      stackId="1"
                      stroke={CHART_COLORS.female}
                      fill={CHART_COLORS.female}
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="visitors"
                      stackId="1"
                      stroke={CHART_COLORS.visitors}
                      fill={CHART_COLORS.visitors}
                      fillOpacity={0.4}
                      strokeWidth={1.7}
                    />
                    <Area
                      type="monotone"
                      dataKey="tourist"
                      stackId="1"
                      stroke={CHART_COLORS.tourist}
                      fill={CHART_COLORS.tourist}
                      fillOpacity={0.1}
                      strokeWidth={1.4}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChartPlaceholder />
              )}
            </div>
          </article>

          <article className="rounded-xl border border-brand-mid/70 bg-white p-3 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-brand-dark">
              Residence Mix Distribution
            </h3>
            <div className="h-49.5 w-full">
              {hasResidence ? (
                <ResponsiveContainer>
                  <PieChart margin={RESIDENCE_PIE_MARGIN}>
                    <Pie
                      data={layoutData.residenceMixDistribution}
                      dataKey="value"
                      nameKey="category"
                      cx="50%"
                      cy="40%"
                      innerRadius={34}
                      outerRadius={56}
                      labelLine={false}
                      paddingAngle={2}
                      stroke="#EEEEEE"
                    >
                      {layoutData.residenceMixDistribution.map((row, index) => (
                        <Cell
                          key={row.category}
                          fill={RESIDENCE_COLORS[index % RESIDENCE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Legend
                      verticalAlign="bottom"
                      align="center"
                      wrapperStyle={{
                        bottom: 10,
                        fontSize: 11,
                        color: '#5C6F2B',
                      }}
                      formatter={(value, _entry, index) =>
                        `${value}: ${layoutData.residenceMixDistribution[index]?.percentage ?? 0}%`
                      }
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_CONTENT_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                      itemStyle={TOOLTIP_ITEM_STYLE}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyPieChart />
              )}
            </div>
          </article>
        </div>

        <article className="rounded-xl border border-brand-mid/70 bg-white p-3 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-brand-dark">
            Hourly Demographic Volume (1:00 - 23:00)
          </h3>
          <div className="h-90 w-full md:h-97.5">
            {hasHourlyData ? (
              <ResponsiveContainer>
                <AreaChart data={layoutData.hourlyDemographicSeries}>
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="3 3"
                    stroke={GRID_STROKE}
                  />
                  <XAxis
                    dataKey="hourLabel"
                    angle={-35}
                    textAnchor="end"
                    height={68}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#5C6F2B', fontSize: 11 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#5C6F2B', fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_CONTENT_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                  />
                  <Legend wrapperStyle={{ color: '#5C6F2B', fontSize: 11 }} />
                  <Area
                    type="monotone"
                    dataKey="male"
                    stroke={CHART_COLORS.male}
                    fill={CHART_COLORS.male}
                    fillOpacity={0.24}
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="female"
                    stroke={CHART_COLORS.female}
                    fill={CHART_COLORS.female}
                    fillOpacity={0.2}
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="visitor"
                    stroke={CHART_COLORS.visitors}
                    fill={CHART_COLORS.visitors}
                    fillOpacity={0.45}
                    strokeWidth={1.7}
                  />
                  <Area
                    type="monotone"
                    dataKey="tourist"
                    stroke={CHART_COLORS.tourist}
                    fill={CHART_COLORS.tourist}
                    fillOpacity={0.1}
                    strokeWidth={1.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChartPlaceholder />
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
