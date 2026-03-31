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
  fetchLguLogs,
  fetchLguOverview,
} from '@/features/lgu/master/api/apiService';
import type {
  LguLogEntry,
  LguOverviewResponse,
} from '@/types';

interface CalendarDay {
  isoDate: string;
  dayNumber: number;
  weekdayLabel: string;
}

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const piePalette = ['#5C6F2B', '#DE802B', '#D8C9A7', '#1F2937'];

const toIsoDate = (year: number, month: number, day: number): string =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const toMonthString = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const buildCalendarDays = (monthCursor: Date): CalendarDay[] => {
  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = new Date(year, month, day);
    const dayOfWeek = date.getDay();

    return {
      isoDate: toIsoDate(year, month, day),
      dayNumber: day,
      weekdayLabel: weekdayLabels[dayOfWeek],
    };
  });
};

const formatMonthLabel = (value: Date): string =>
  new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' }).format(value);

const ChartAwaitingState = (): JSX.Element => (
  <div className="flex h-full items-center justify-center text-brand-mid italic text-sm">
    Awaiting enterprise submissions...
  </div>
);

export default function OverviewView(): JSX.Element {
  const [overview, setOverview] = useState<LguOverviewResponse | null>(null);
  const [logs, setLogs] = useState<LguLogEntry[]>([]);
  const [monthCursor, setMonthCursor] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedIsoDate, setSelectedIsoDate] = useState<string>('');

  useEffect(() => {
    const loadOverview = async (): Promise<void> => {
      const targetMonth = toMonthString(monthCursor);
      const [overviewPayload, logsPayload] = await Promise.all([
        fetchLguOverview(targetMonth),
        fetchLguLogs(),
      ]);

      setOverview(overviewPayload);
      setLogs(logsPayload.logs);
    };

    void loadOverview().catch((error: unknown) => {
      console.error('Failed to load LGU overview datasets:', error);
    });
  }, [monthCursor]);

  const calendarDays = useMemo<CalendarDay[]>(() => buildCalendarDays(monthCursor), [monthCursor]);

  const trendData = useMemo<Array<{ dayNumber: number; visitors: number; tourists: number }>>(
    () => [],
    [],
  );

  const visitorTouristPie = useMemo<Array<{ name: string; value: number }>>(
    () => [],
    [],
  );

  const foreignLocalPie = useMemo<Array<{ name: string; value: number }>>(
    () => [],
    [],
  );

  const selectedDateData = useMemo<null>(() => null, [selectedIsoDate]);

  useEffect(() => {
    if (!calendarDays.length) {
      return;
    }

    if (!selectedIsoDate || !calendarDays.some((day) => day.isoDate === selectedIsoDate)) {
      setSelectedIsoDate(calendarDays[0].isoDate);
    }
  }, [calendarDays, selectedIsoDate]);

  const selectedCalendarDay = useMemo<CalendarDay | null>(() => {
    return calendarDays.find((day) => day.isoDate === selectedIsoDate) ?? calendarDays[0] ?? null;
  }, [calendarDays, selectedIsoDate]);

  const calendarPrefix = useMemo<number>(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    return new Date(year, month, 1).getDay();
  }, [monthCursor]);

  if (!overview) {
    return (
      <div className="grid min-h-full place-items-center rounded-2xl border border-brand-light/70 bg-white">
        <p className="text-sm text-slate-700">Loading LGU overview data...</p>
      </div>
    );
  }

  return (
    <div className="grid min-h-full gap-3">
      <section className="grid min-h-full gap-3 xl:grid-cols-[1.55fr_1fr]">
        <article className="grid min-h-full gap-3 rounded-2xl border border-brand-light/70 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-brand-dark">Forecast Calendar</h3>
              <p className="text-sm text-slate-700">
                Calendar date grid is ready. Forecast analytics will appear after real submissions are ingested.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
                }
                className="rounded-lg border border-brand-light px-2.5 py-1.5 text-sm text-brand-dark hover:bg-brand-bg"
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
                className="rounded-lg border border-brand-light px-2.5 py-1.5 text-sm text-brand-dark hover:bg-brand-bg"
              >
                Next
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wide text-slate-700">
            {weekdayLabels.map((label) => (
              <div key={label} className="py-1">
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: calendarPrefix }, (_, index) => (
              <div key={`blank-${index}`} className="h-11 rounded-lg bg-slate-100/90" />
            ))}
            {calendarDays.map((day) => {
              const isSelected = day.isoDate === selectedIsoDate;

              return (
                <button
                  key={day.isoDate}
                  type="button"
                  onClick={() => setSelectedIsoDate(day.isoDate)}
                  className={`h-11 rounded-lg border p-1 text-left text-[11px] transition ${
                    isSelected
                      ? 'border-brand-accent bg-[#DE802B] text-white'
                      : 'border-slate-300 bg-slate-100 hover:bg-slate-200 hover:border-brand-accent'
                  }`}
                >
                  <div className="flex items-start justify-start">
                    <span className={`font-semibold ${isSelected ? 'text-white' : 'text-brand-dark'}`}>
                      {day.dayNumber}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedCalendarDay ? (
            <div className="rounded-xl border border-brand-light/70 bg-brand-bg p-2.5 text-sm text-slate-800">
              <p className="font-semibold text-brand-dark">
                {selectedCalendarDay.isoDate} ({selectedCalendarDay.weekdayLabel})
              </p>
              {!selectedDateData ? <p className="mt-1 text-brand-mid italic">No forecast data available for this date.</p> : null}
            </div>
          ) : null}

          <div className="h-44 rounded-xl border border-brand-light/70 bg-white p-2.5">
            <p className="mb-1 text-sm font-semibold text-brand-dark">Visitor vs Tourist Forecast Trend</p>
            {trendData.length === 0 ? (
              <ChartAwaitingState />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="dayNumber" />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="visitors" stroke="#5C6F2B" fill="#D8C9A7" fillOpacity={0.36} />
                  <Area type="monotone" dataKey="tourists" stroke="#DE802B" fill="#DE802B" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </article>

        <aside className="grid min-h-full gap-3">
          <article className="rounded-2xl border border-brand-light/70 bg-white p-3 shadow-sm">
            <h4 className="text-sm font-semibold text-brand-dark">Demographic Mix Overview</h4>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col items-center">
                <div className="h-40 w-full">
                  {visitorTouristPie.length === 0 ? (
                    <ChartAwaitingState />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={visitorTouristPie} dataKey="value" nameKey="name" outerRadius={62}>
                          {visitorTouristPie.map((entry, index) => (
                            <Cell key={entry.name} fill={piePalette[index % piePalette.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <p className="mt-1 text-center text-sm font-semibold text-brand-dark">Visitor vs Tourist</p>
              </div>

              <div className="flex flex-col items-center">
                <div className="h-40 w-full">
                  {foreignLocalPie.length === 0 ? (
                    <ChartAwaitingState />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={foreignLocalPie} dataKey="value" nameKey="name" outerRadius={62}>
                          {foreignLocalPie.map((entry, index) => (
                            <Cell key={entry.name} fill={piePalette[(index + 1) % piePalette.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <p className="mt-1 text-center text-sm font-semibold text-brand-dark">Foreign vs Local Demographics</p>
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-brand-light/70 bg-white p-3 shadow-sm">
            <h4 className="text-sm font-semibold text-brand-dark">Latest Logs</h4>
            <div className="mt-2 max-h-[235px] overflow-y-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-brand-bg text-slate-700">
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
                      <td className="px-2 py-1.5 text-slate-800">{log.message}</td>
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
