import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { EnterpriseOutletContext } from '@/components/layout/EnterpriseShell';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import { CameraPage } from '@/features/enterprise/camera';
import { fetchCameraMonitoringLayoutData } from '@/services/api';
import type { CameraMonitoringLayoutData } from '@/types';

const DONUT_COLORS = {
  male: '#346739',
  female: '#79AE6F',
};

const DONUT_EMPTY_COLORS = {
  male: '#CBD8C6',
  female: '#E4ECDD',
};

const parseDetectionCounts = (details: string): { male: number; female: number } => {
  const maleMatch = /(\d+)\s+Male/i.exec(details);
  const femaleMatch = /(\d+)\s+Female/i.exec(details);

  return {
    male: maleMatch ? Number(maleMatch[1]) : 0,
    female: femaleMatch ? Number(femaleMatch[1]) : 0,
  };
};

const buildDonutSeries = (split: { male: number; female: number }) => {
  const total = split.male + split.female;
  if (total > 0) {
    return {
      data: [
        { name: 'male', value: split.male },
        { name: 'female', value: split.female },
      ],
      hasData: true,
    };
  }

  return {
    data: [
      { name: 'male', value: 1 },
      { name: 'female', value: 1 },
    ],
    hasData: false,
  };
};

export default function CameraMonitoringView(): JSX.Element {
  const MAX_EVENT_ROWS = 11;
  const { user } = useOutletContext<EnterpriseOutletContext>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layoutData, setLayoutData] = useState<CameraMonitoringLayoutData | null>(null);

  const loadLayout = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const payload = await fetchCameraMonitoringLayoutData(user.enterpriseId);
      setLayoutData(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load camera monitoring layout.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user.enterpriseId]);

  useEffect(() => {
    void loadLayout();
  }, [loadLayout]);

  if (loading) {
    return <LoadingState label="Loading camera monitoring workspace..." />;
  }

  if (error || !layoutData) {
    return <ErrorState message={error || 'Camera monitoring unavailable.'} onRetry={() => void loadLayout()} />;
  }

  const touristDonut = buildDonutSeries(layoutData.todayVisitorData.tourist);
  const visitorDonut = buildDonutSeries(layoutData.todayVisitorData.visitor);

  const eventTotals = layoutData.events.reduce(
    (acc, row) => {
      const parsed = parseDetectionCounts(row.details);
      acc.male += parsed.male;
      acc.female += parsed.female;
      acc.total += parsed.male + parsed.female;
      return acc;
    },
    { male: 0, female: 0, total: 0 },
  );

  const estimatedReIdentifications = Math.max(
    eventTotals.total - layoutData.streamHealth.activeTracks,
    0,
  );

  const deduplicationRate = eventTotals.total
    ? Math.min(100, Math.round((estimatedReIdentifications / eventTotals.total) * 100))
    : 0;

  const hasLiveActivity = layoutData.streamHealth.activeTracks > 0 || layoutData.events.length > 0;
  const visibleEvents = layoutData.events.slice(0, MAX_EVENT_ROWS);

  return (
    <div className="space-y-4 bg-brand-cream">
      <header className="rounded-2xl border border-brand-light bg-brand-cream px-6 py-4 shadow-sm">
        <h2 className="text-3xl font-bold tracking-tight text-brand-dark">ARCHIES PORTAL LIVE CAMERA MONITORING</h2>
        <p className="text-lg text-brand-dark/80">Real-time WebSocket stream with automatic fallback and AI detection overlays.</p>
      </header>

      <section className="grid grid-cols-12 gap-4 lg:items-stretch">
        <article className="col-span-12 flex min-h-0 flex-col gap-4 rounded-2xl border border-brand-light bg-white p-4 shadow-sm lg:col-span-8">
          <div className="flex items-center justify-between rounded-xl border border-brand-light bg-brand-cream px-4 py-3">
            <p className="text-lg font-semibold text-brand-dark">{layoutData.cameraTitle}</p>
            <span className="rounded-md bg-brand-dark px-2 py-1 text-xs font-semibold text-brand-cream">
              {layoutData.timestampLabel}
            </span>
          </div>

          <div className="rounded-2xl border border-brand-light bg-white p-2">
            <CameraPage compactLayout />
          </div>

          <div className="grid flex-1 gap-4 md:grid-cols-2">
            <article className="h-full rounded-2xl border border-brand-light bg-brand-cream p-4 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wide text-brand-dark">Stream Health</h3>
              <div className="mt-3 space-y-2 text-sm text-brand-dark">
                <p>Date: {layoutData.streamHealth.dateLabel}</p>
                <p>FPS: {layoutData.streamHealth.fps}</p>
                <p>Active Tracks: {layoutData.streamHealth.activeTracks}</p>
                <p>
                  Status: <span className="font-semibold">{layoutData.streamHealth.status}</span>
                </p>
              </div>
            </article>

            <article className="h-full rounded-2xl border border-brand-light bg-brand-cream p-4 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wide text-brand-dark">System Status</h3>
              <div className="mt-3 space-y-2 text-sm text-brand-dark">
                <div className="flex items-center justify-between">
                  <span>Camera</span>
                  <span className="font-semibold">{hasLiveActivity ? 'Connected' : 'Disconnected'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Person Detection</span>
                  <span className="font-semibold">{hasLiveActivity ? 'Running' : 'Idle'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Gender Classification</span>
                  <span className="font-semibold">{hasLiveActivity ? 'Ready' : 'Not loaded'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Deduplication</span>
                  <span className="font-semibold">{hasLiveActivity ? 'Active' : 'Not initialized'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Face Embedding</span>
                  <span className="font-semibold">{hasLiveActivity ? 'Ready' : 'Not loaded'}</span>
                </div>
              </div>
            </article>
          </div>
        </article>

        <aside className="col-span-12 flex h-full min-h-0 flex-col gap-4 lg:col-span-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <article className="h-full rounded-2xl border border-brand-light bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wide text-brand-dark">Detection Stats</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-brand-dark">
                <div className="rounded-lg border border-brand-light bg-brand-cream p-2">
                  <p className="text-[11px] uppercase text-brand-dark/70">FPS</p>
                  <p className="text-base font-bold">{layoutData.streamHealth.fps}</p>
                </div>
                <div className="rounded-lg border border-brand-light bg-brand-cream p-2">
                  <p className="text-[11px] uppercase text-brand-dark/70">Active Tracks</p>
                  <p className="text-base font-bold">{layoutData.streamHealth.activeTracks}</p>
                </div>
                <div className="rounded-lg border border-brand-light bg-brand-cream p-2">
                  <p className="text-[11px] uppercase text-brand-dark/70">Male Detections</p>
                  <p className="text-base font-bold">{eventTotals.male}</p>
                </div>
                <div className="rounded-lg border border-brand-light bg-brand-cream p-2">
                  <p className="text-[11px] uppercase text-brand-dark/70">Female Detections</p>
                  <p className="text-base font-bold">{eventTotals.female}</p>
                </div>
              </div>
            </article>

            <article className="h-full rounded-2xl border border-brand-light bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wide text-brand-dark">Deduplication Stats</h3>
              <div className="mt-3 space-y-2 text-sm text-brand-dark">
                <div className="flex items-center justify-between rounded-lg border border-brand-light bg-brand-cream px-2 py-1.5">
                  <span>Unique Persons</span>
                  <span className="font-bold">{layoutData.streamHealth.activeTracks}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-brand-light bg-brand-cream px-2 py-1.5">
                  <span>Re-identifications</span>
                  <span className="font-bold">{estimatedReIdentifications}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-brand-light bg-brand-cream px-2 py-1.5">
                  <span>Re-ID Success Rate</span>
                  <span className="font-bold">{deduplicationRate}%</span>
                </div>
                <div className="rounded-lg border border-brand-light bg-brand-cream px-2 py-1.5 text-xs text-brand-dark/80">
                  Context: {layoutData.currentContext.dateLabel} · {layoutData.currentContext.timeLabel}
                </div>
              </div>
            </article>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <article className="h-full rounded-2xl border border-brand-light bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wide text-brand-dark">Active Track Breakdown</h3>
              <div className="mt-3 max-h-[190px] space-y-2 overflow-y-auto text-sm text-brand-dark">
                {layoutData.activeTrackBreakdown.length ? (
                  layoutData.activeTrackBreakdown.map((row) => (
                    <p key={row.label}>{row.count} {row.label}</p>
                  ))
                ) : (
                  <p>No active tracks.</p>
                )}
              </div>
            </article>

            <article className="h-full rounded-2xl border border-brand-light bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wide text-brand-dark">Today's Visitor Data</h3>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-brand-light bg-brand-cream p-2">
                  <p className="mb-1 text-xs font-semibold uppercase text-brand-dark">Tourist</p>
                  <div className="h-[118px]">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={touristDonut.data}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={24}
                          outerRadius={44}
                          stroke="#F2EDC2"
                        >
                          <Cell fill={touristDonut.hasData ? DONUT_COLORS.male : DONUT_EMPTY_COLORS.male} />
                          <Cell fill={touristDonut.hasData ? DONUT_COLORS.female : DONUT_EMPTY_COLORS.female} />
                        </Pie>
                        {touristDonut.hasData ? <Tooltip /> : null}
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="text-xs text-brand-dark/80">
                    <p>male: {layoutData.todayVisitorData.tourist.male}</p>
                    <p>female: {layoutData.todayVisitorData.tourist.female}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-brand-light bg-brand-cream p-2">
                  <p className="mb-1 text-xs font-semibold uppercase text-brand-dark">Visitor</p>
                  <div className="h-[118px]">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={visitorDonut.data}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={24}
                          outerRadius={44}
                          stroke="#F2EDC2"
                        >
                          <Cell fill={visitorDonut.hasData ? DONUT_COLORS.male : DONUT_EMPTY_COLORS.male} />
                          <Cell fill={visitorDonut.hasData ? DONUT_COLORS.female : DONUT_EMPTY_COLORS.female} />
                        </Pie>
                        {visitorDonut.hasData ? <Tooltip /> : null}
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="text-xs text-brand-dark/80">
                    <p>male: {layoutData.todayVisitorData.visitor.male}</p>
                    <p>female: {layoutData.todayVisitorData.visitor.female}</p>
                  </div>
                </div>
              </div>
            </article>
          </div>

          <article className="flex min-h-[340px] flex-1 flex-col overflow-hidden rounded-2xl border border-brand-light bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-lg font-semibold text-brand-dark">Detection Log & Recent Events</p>
              <span className="rounded-md border border-brand-mid bg-brand-cream px-2 py-1 text-xs font-semibold text-brand-dark">
                {visibleEvents.length} rows
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-brand-light">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-brand-cream text-left text-xs uppercase tracking-wide text-brand-dark">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Time</th>
                    <th className="px-3 py-2">Frame</th>
                    <th className="px-3 py-2">Detection Details</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEvents.map((row, index) => (
                    <tr key={row.id} className="border-t border-brand-light align-top">
                      <td className="px-3 py-2 text-brand-dark/80">{index + 1}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-brand-dark">{row.timeLabel}</td>
                      <td className="px-3 py-2 font-semibold text-brand-dark">{row.frame}</td>
                      <td className="px-3 py-2 text-brand-dark/85">{row.details}</td>
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
