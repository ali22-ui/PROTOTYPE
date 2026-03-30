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
import { CalendarDays, Globe2, Users, UsersRound } from 'lucide-react';
import {
  fetchLguLogs,
  fetchLguOverview,
  fetchLguReportsDashboard,
} from '@/features/lgu/master/api/apiService';
import type {
  LguLogEntry,
  LguOverviewResponse,
  LguReportsDashboardResponse,
} from '@/types';

interface ForecastRow {
  isoDate: string;
  dayNumber: number;
  weekdayLabel: string;
  visitors: number;
  tourists: number;
  isWeekend: boolean;
  isHoliday: boolean;
  isPeak: boolean;
}

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const holidaySet = new Set<string>(['01-01', '04-09', '06-12', '08-21', '11-30', '12-25', '12-30']);
const piePalette = ['#346739', '#79AE6F', '#9FCB98', '#F2EDC2'];

const toIsoDate = (year: number, month: number, day: number): string =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const buildForecastRows = (
  monthCursor: Date,
  baseVisitors: number,
  baseTourists: number,
): ForecastRow[] => {
  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weekdayFactors = [0.95, 0.9, 0.96, 1, 1.06, 1.17, 1.14];

  const baselineVisitors = Math.max(120, Math.round(baseVisitors * 0.21));
  const baselineTourists = Math.max(40, Math.round(baseTourists * 0.23));

  const rows = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = new Date(year, month, day);
    const dayOfWeek = date.getDay();
    const monthDayKey = `${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isHoliday = holidaySet.has(monthDayKey);
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const weatherSwing = 0.93 + ((day % 6) * 0.025);
    const holidayBoost = isHoliday ? 1.28 : 1;

    const visitors = Math.round(
      baselineVisitors * weekdayFactors[dayOfWeek] * weatherSwing * holidayBoost,
    );
    const tourists = Math.round(
      baselineTourists * (isWeekend ? 1.24 : 1.04) * weatherSwing * holidayBoost,
    );

    return {
      isoDate: toIsoDate(year, month, day),
      dayNumber: day,
      weekdayLabel: weekdayLabels[dayOfWeek],
      visitors,
      tourists,
      isWeekend,
      isHoliday,
      isPeak: false,
    };
  });

  const rankedTotals = rows
    .map((entry) => entry.visitors + entry.tourists)
    .sort((left, right) => right - left);
  const peakThreshold = rankedTotals[Math.floor(rankedTotals.length * 0.25)] ?? rankedTotals[0] ?? 0;

  return rows.map((entry) => ({
    ...entry,
    isPeak: entry.visitors + entry.tourists >= peakThreshold,
  }));
};

const formatMonthLabel = (value: Date): string =>
  new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' }).format(value);

export default function OverviewView(): JSX.Element {
  const [overview, setOverview] = useState<LguOverviewResponse | null>(null);
  const [logs, setLogs] = useState<LguLogEntry[]>([]);
  const [reportsDashboard, setReportsDashboard] = useState<LguReportsDashboardResponse | null>(null);
  const [monthCursor, setMonthCursor] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedIsoDate, setSelectedIsoDate] = useState<string>('');

  useEffect(() => {
    const loadOverview = async (): Promise<void> => {
      const [overviewPayload, logsPayload, reportsPayload] = await Promise.all([
        fetchLguOverview(),
        fetchLguLogs(),
        fetchLguReportsDashboard(),
      ]);

      setOverview(overviewPayload);
      setLogs(logsPayload.logs);
      setReportsDashboard(reportsPayload);
    };

    void loadOverview().catch((error: unknown) => {
      console.error('Failed to load LGU overview datasets:', error);
    });
  }, []);

  const forecastRows = useMemo<ForecastRow[]>(() => {
    if (!overview) {
      return [];
    }

    return buildForecastRows(
      monthCursor,
      overview.metrics.totalVisitors,
      overview.metrics.totalTourists,
    );
  }, [monthCursor, overview]);

  useEffect(() => {
    if (!forecastRows.length) {
      return;
    }

    if (!selectedIsoDate || !forecastRows.some((row) => row.isoDate === selectedIsoDate)) {
      setSelectedIsoDate(forecastRows[0].isoDate);
    }
  }, [forecastRows, selectedIsoDate]);

  const selectedForecast = useMemo<ForecastRow | null>(() => {
    return forecastRows.find((row) => row.isoDate === selectedIsoDate) ?? forecastRows[0] ?? null;
  }, [forecastRows, selectedIsoDate]);

  const visitorTouristPie = useMemo(
    () => [
      { name: 'Visitors', value: overview?.metrics.totalVisitors ?? 0 },
      { name: 'Tourists', value: overview?.metrics.totalTourists ?? 0 },
    ],
    [overview?.metrics.totalTourists, overview?.metrics.totalVisitors],
  );

  const foreignLocalPie = useMemo(() => {
    const demographics = reportsDashboard?.quarterlyVisitorDemographics ?? [];
    const local = demographics
      .filter((item) => item.name.toLowerCase().includes('resident'))
      .reduce((sum, item) => sum + item.value, 0);
    const foreign = demographics
      .filter((item) => {
        const normalized = item.name.toLowerCase();
        return normalized.includes('tourist') || normalized.includes('foreign');
      })
      .reduce((sum, item) => sum + item.value, 0);

    if (local + foreign > 0) {
      return [
        { name: 'Local', value: local },
        { name: 'Foreign/Tourist', value: foreign },
      ];
    }

    const visitors = overview?.metrics.totalVisitors ?? 0;
    const tourists = overview?.metrics.totalTourists ?? 0;
    const localFallback = Math.max(visitors - tourists, 0);

    return [
      { name: 'Local', value: localFallback },
      { name: 'Foreign/Tourist', value: tourists },
    ];
  }, [overview?.metrics.totalTourists, overview?.metrics.totalVisitors, reportsDashboard?.quarterlyVisitorDemographics]);

  const calendarPrefix = useMemo<number>(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    return new Date(year, month, 1).getDay();
  }, [monthCursor]);

  if (!overview) {
    return (
      <div className="grid min-h-full place-items-center rounded-2xl border border-brand-light/70 bg-white">
        <p className="text-sm text-slate-600">Loading LGU overview data...</p>
      </div>
    );
  }

  const metricCards = [
    {
      label: 'Total Visitors',
      value: overview.metrics.totalVisitors,
      icon: UsersRound,
      accent: 'text-brand-dark',
    },
    {
      label: 'Total Tourists',
      value: overview.metrics.totalTourists,
      icon: Globe2,
      accent: 'text-brand-mid',
    },
    {
      label: 'People Today',
      value: overview.metrics.totalPeopleToday,
      icon: Users,
      accent: 'text-emerald-700',
    },
    {
      label: 'Inside Establishments',
      value: overview.metrics.currentlyInside,
      icon: CalendarDays,
      accent: 'text-amber-700',
    },
  ];

  return (
    <div className="grid min-h-full gap-4">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <article
              key={card.label}
              className="rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center gap-2 text-slate-600">
                <span className="rounded-xl bg-brand-cream p-2">
                  <Icon size={16} />
                </span>
                <p className="text-xs uppercase tracking-wide">{card.label}</p>
              </div>
              <p className={`mt-3 text-3xl font-black ${card.accent}`}>
                {card.value.toLocaleString()}
              </p>
            </article>
          );
        })}
      </section>

      <section className="grid min-h-full gap-4 xl:grid-cols-[1.55fr_1fr]">
        <article className="grid min-h-full gap-4 rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-brand-dark">Forecast Calendar</h3>
              <p className="text-sm text-slate-600">
                Holiday/weekend-aware assumptions for all connected enterprises.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
                }
                className="rounded-lg border border-brand-light px-2.5 py-1.5 text-sm text-brand-dark hover:bg-brand-cream"
              >
                Prev
              </button>
              <p className="min-w-[168px] text-center text-sm font-semibold text-brand-dark">
                {formatMonthLabel(monthCursor)}
              </p>
              <button
                type="button"
                onClick={() =>
                  setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
                }
                className="rounded-lg border border-brand-light px-2.5 py-1.5 text-sm text-brand-dark hover:bg-brand-cream"
              >
                Next
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
            {weekdayLabels.map((label) => (
              <div key={label} className="py-1">
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: calendarPrefix }, (_, index) => (
              <div key={`blank-${index}`} className="h-14 rounded-lg bg-slate-50/60" />
            ))}
            {forecastRows.map((row) => {
              const isSelected = row.isoDate === selectedIsoDate;

              return (
                <button
                  key={row.isoDate}
                  type="button"
                  onClick={() => setSelectedIsoDate(row.isoDate)}
                  className={`h-14 rounded-lg border p-1 text-left text-[11px] transition ${
                    isSelected
                      ? 'border-brand-dark bg-brand-mid/25'
                      : row.isPeak
                        ? 'border-brand-mid/80 bg-brand-light/30 hover:bg-brand-light/45'
                        : row.isHoliday
                          ? 'border-amber-300 bg-amber-50 hover:bg-amber-100'
                          : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-brand-dark">{row.dayNumber}</span>
                    {row.isPeak ? <span className="text-[10px] font-bold text-emerald-700">Peak</span> : null}
                  </div>
                  <p className="mt-1 truncate text-[10px] text-slate-600">
                    {(row.visitors + row.tourists).toLocaleString()} projected
                  </p>
                </button>
              );
            })}
          </div>

          {selectedForecast ? (
            <div className="rounded-xl border border-brand-light/70 bg-brand-cream p-3 text-sm text-slate-700">
              <p className="font-semibold text-brand-dark">
                {selectedForecast.isoDate} ({selectedForecast.weekdayLabel})
              </p>
              <p className="mt-1">
                Visitors: <strong>{selectedForecast.visitors.toLocaleString()}</strong> · Tourists:{' '}
                <strong>{selectedForecast.tourists.toLocaleString()}</strong>
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {selectedForecast.isHoliday ? 'Holiday uplift applied. ' : ''}
                {selectedForecast.isWeekend ? 'Weekend uplift applied. ' : 'Weekday baseline applied. '}
                {selectedForecast.isPeak ? 'Classified as peak assumption date.' : 'Normal assumption day.'}
              </p>
            </div>
          ) : null}

          <div className="h-56 rounded-xl border border-brand-light/70 bg-white p-3">
            <p className="mb-2 text-sm font-semibold text-brand-dark">Visitor vs Tourist Forecast Trend</p>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={forecastRows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dayNumber" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="visitors" stroke="#346739" fill="#9FCB98" fillOpacity={0.35} />
                <Area type="monotone" dataKey="tourists" stroke="#79AE6F" fill="#79AE6F" fillOpacity={0.22} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <aside className="grid min-h-full gap-4">
          <article className="rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-brand-dark">Visitor vs Tourist Mix</h4>
            <div className="mt-2 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={visitorTouristPie} dataKey="value" nameKey="name" outerRadius={86}>
                    {visitorTouristPie.map((entry, index) => (
                      <Cell key={entry.name} fill={piePalette[index % piePalette.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-brand-dark">Foreign vs Local Demographics</h4>
            <div className="mt-2 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={foreignLocalPie} dataKey="value" nameKey="name" outerRadius={86}>
                    {foreignLocalPie.map((entry, index) => (
                      <Cell key={entry.name} fill={piePalette[(index + 1) % piePalette.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-brand-dark">Latest Logs</h4>
            <div className="mt-2 max-h-[280px] overflow-y-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-brand-cream text-slate-600">
                  <tr>
                    <th className="px-2 py-1.5">Time</th>
                    <th className="px-2 py-1.5">Category</th>
                    <th className="px-2 py-1.5">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.slice(0, 12).map((log) => (
                    <tr key={log.id} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 whitespace-nowrap">{log.timestamp}</td>
                      <td className="px-2 py-1.5">
                        <span className="rounded-full bg-brand-light/40 px-2 py-0.5 font-semibold text-brand-dark">
                          {log.category}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-slate-700">{log.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </aside>
      </section>
    </div>
  );
}
