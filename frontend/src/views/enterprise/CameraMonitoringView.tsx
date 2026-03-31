import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { EnterpriseOutletContext } from '@/components/layout/EnterpriseShell';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import { CameraPage } from '@/features/enterprise/camera';
import { useGlobalCamera } from '@/features/enterprise/camera/context/CameraContext';
import { fetchCameraMonitoringLayoutData } from '@/services/api';
import type { CameraMonitoringLayoutData } from '@/types';

export default function CameraMonitoringView(): JSX.Element {
  const MAX_EVENT_ROWS = 18;
  const { user } = useOutletContext<EnterpriseOutletContext>();
  const { isCameraRunning } = useGlobalCamera();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layoutData, setLayoutData] =
    useState<CameraMonitoringLayoutData | null>(null);

  const loadLayout = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const payload = await fetchCameraMonitoringLayoutData(user.enterpriseId);
      setLayoutData(payload);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to load camera monitoring layout.';
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
    return (
      <ErrorState
        message={error || 'Camera monitoring unavailable.'}
        onRetry={() => void loadLayout()}
      />
    );
  }

  const hasDetectionActivity =
    layoutData.streamHealth.activeTracks > 0 || layoutData.events.length > 0;
  const visibleEvents = layoutData.events.slice(0, MAX_EVENT_ROWS);

  return (
    <div className="space-y-4">
      <header className="rounded-xl bg-brand-bg px-6 py-4 shadow-md">
        <h2 className="text-2xl font-bold tracking-tight text-brand-dark md:text-3xl">
          ARCHIES PORTAL LIVE CAMERA MONITORING
        </h2>
        <p className="text-sm text-brand-dark/80 md:text-base">
          Real-time WebSocket stream with AI detection overlays and automatic
          fallback monitoring.
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-12">
        <article className="lg:col-span-8 rounded-xl bg-white p-4 shadow-md">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-brand-dark">
                Camera Preview
              </p>
              <p className="text-xs text-brand-dark/75">
                {layoutData.cameraTitle}
              </p>
            </div>
            <span className="rounded-md border border-brand-mid/80 bg-brand-bg px-2 py-1 text-xs font-semibold text-brand-dark">
              {layoutData.timestampLabel}
            </span>
          </div>

          <div className="rounded-xl bg-brand-bg/60 p-2 shadow-inner">
            <CameraPage compactLayout />
          </div>
        </article>

        <aside className="lg:col-span-4 flex flex-col gap-4">
          <article className="rounded-xl bg-white p-4 shadow-md">
            <h3 className="text-sm font-bold uppercase tracking-wide text-brand-dark">
              Stream Health
            </h3>
            <div className="mt-3 space-y-2 text-sm text-brand-dark">
              <p>Date: {layoutData.streamHealth.dateLabel}</p>
              <p>FPS: {layoutData.streamHealth.fps}</p>
              <p>Active Tracks: {layoutData.streamHealth.activeTracks}</p>
              <p>
                Status:{' '}
                <span className="font-semibold">
                  {layoutData.streamHealth.status}
                </span>
              </p>
            </div>
          </article>

          <article className="rounded-xl bg-white p-4 shadow-md">
            <h3 className="text-sm font-bold uppercase tracking-wide text-brand-dark">
              System Status
            </h3>
            <div className="mt-3 space-y-2 text-sm text-brand-dark">
              <div className="flex items-center justify-between">
                <span>Camera Transport</span>
                <span className="font-semibold">
                  {isCameraRunning ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Recent Detection Activity</span>
                <span className="font-semibold">
                  {hasDetectionActivity ? 'Active' : 'Idle'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Gender Classification</span>
                <span className="font-semibold">
                  {hasDetectionActivity ? 'Ready' : 'Not loaded'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Deduplication</span>
                <span className="font-semibold">
                  {hasDetectionActivity ? 'Active' : 'Not initialized'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Face Embedding</span>
                <span className="font-semibold">
                  {hasDetectionActivity ? 'Ready' : 'Not loaded'}
                </span>
              </div>
            </div>
          </article>
        </aside>
      </section>

      <section className="rounded-xl bg-white p-4 shadow-md">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-base font-semibold text-brand-dark md:text-lg">
            Detection Log & Recent Events
          </p>
          <span className="rounded-md bg-brand-bg px-2 py-1 text-xs font-semibold text-brand-dark">
            {visibleEvents.length} rows
          </span>
        </div>

        <div className="overflow-hidden rounded-xl bg-brand-bg/45">
          <div className="max-h-90 overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-20 bg-brand-dark/90 text-left text-xs uppercase tracking-wide text-white shadow-sm backdrop-blur-sm">
                <tr>
                  <th className="bg-brand-dark/90 px-3 py-3 leading-tight">
                    #
                  </th>
                  <th className="bg-brand-dark/90 px-3 py-3 leading-tight">
                    Time
                  </th>
                  <th className="bg-brand-dark/90 px-3 py-3 leading-tight">
                    Frame
                  </th>
                  <th className="bg-brand-dark/90 px-3 py-3 leading-tight">
                    Detection Details
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {visibleEvents.map((row, index) => (
                  <tr
                    key={row.id}
                    className="border-t border-brand-mid/25 align-top transition-colors hover:bg-brand-cream/50"
                  >
                    <td className="px-3 py-2.5 text-brand-dark/80">
                      {index + 1}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-brand-dark">
                      {row.timeLabel}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-brand-dark">
                      {row.frame}
                    </td>
                    <td className="px-3 py-2.5 text-brand-dark/85">
                      {row.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
