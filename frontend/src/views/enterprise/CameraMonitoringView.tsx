import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { MonitorPlay, Smartphone } from 'lucide-react';
import type { EnterpriseOutletContext } from '@/components/layout/EnterpriseShell';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import { CameraPage } from '@/features/enterprise/camera';
import type { CameraDetectionStats, CameraMode } from '@/features/enterprise/camera';
import { useGlobalCamera } from '@/features/enterprise/camera/context/CameraContext';
import { fetchCameraMonitoringEvents, fetchCameraMonitoringLayoutData } from '@/services/api';
import type { CameraMonitoringLayoutData } from '@/types';

const CAMERA_MODE_KEY = 'lgu-dashboard-camera-mode';

const CameraModeValue = {
  LIVE: 'live_webcam',
  IP_WEBCAM: 'ip_webcam',
} as const satisfies Record<string, CameraMode>;

const DEFAULT_DETECTION_STATS: CameraDetectionStats = {
  fps: 0,
  tracked: 0,
  male: 0,
  female: 0,
  unique: 0,
  totalEvents: 0,
};

const resolveStoredCameraMode = (): CameraMode => {
  if (typeof window === 'undefined') {
    return CameraModeValue.LIVE;
  }

  const saved = window.localStorage.getItem(CAMERA_MODE_KEY);
  if (saved === 'live' || saved === CameraModeValue.LIVE) {
    return CameraModeValue.LIVE;
  }

  if (saved === CameraModeValue.IP_WEBCAM) {
    return CameraModeValue.IP_WEBCAM;
  }

  return CameraModeValue.LIVE;
};

const getCameraModeDescription = (mode: CameraMode): string => {
  if (mode === CameraModeValue.IP_WEBCAM) {
    return 'Streaming from Mobile IP Camera';
  }

  return 'Streaming from Live Webcam';
};

export default function CameraMonitoringView(): JSX.Element {
  const MAX_EVENT_ROWS = 18;
  const { user } = useOutletContext<EnterpriseOutletContext>();
  const { isCameraRunning } = useGlobalCamera();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layoutData, setLayoutData] =
    useState<CameraMonitoringLayoutData | null>(null);
  const [detectionEvents, setDetectionEvents] =
    useState<CameraMonitoringLayoutData['events']>([]);
  const [cameraMode, setCameraMode] =
    useState<CameraMode>(() => resolveStoredCameraMode());
  const [detectionStats, setDetectionStats] =
    useState<CameraDetectionStats>(DEFAULT_DETECTION_STATS);

  const handleCameraModeChange = useCallback((mode: CameraMode): void => {
    setCameraMode(mode);
    window.localStorage.setItem(CAMERA_MODE_KEY, mode);
    setDetectionStats(DEFAULT_DETECTION_STATS);
  }, []);

  const handleDetectionStatsChange = useCallback((stats: CameraDetectionStats): void => {
    setDetectionStats(stats);
  }, []);

  const loadLayout = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const payload = await fetchCameraMonitoringLayoutData(user.enterpriseId);
      setLayoutData(payload);
      setDetectionEvents(payload.events.slice(0, MAX_EVENT_ROWS));
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

  useEffect(() => {
    let mounted = true;

    const refreshEvents = async (): Promise<void> => {
      const rows = await fetchCameraMonitoringEvents(user.enterpriseId, undefined, MAX_EVENT_ROWS);
      if (!mounted || rows.length === 0) {
        return;
      }
      setDetectionEvents(rows.slice(0, MAX_EVENT_ROWS));
    };

    void refreshEvents();
    const intervalId = window.setInterval(() => {
      void refreshEvents();
    }, 7000);

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, [user.enterpriseId]);

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
    detectionStats.tracked > 0
    || detectionStats.totalEvents > 0
    || layoutData.streamHealth.activeTracks > 0
    || detectionEvents.length > 0;
  const visibleEvents = detectionEvents.slice(0, MAX_EVENT_ROWS);

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
                Camera Monitoring
              </p>
              <p className="text-xs text-brand-dark/75">
                {getCameraModeDescription(cameraMode)}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCameraModeChange(CameraModeValue.LIVE)}
                  className={`flex items-center gap-2 rounded border px-4 py-2 font-medium transition-colors ${
                    cameraMode === CameraModeValue.LIVE
                      ? 'border-brand-dark bg-brand-dark text-white'
                      : 'border-gray-200 bg-white text-brand-dark hover:bg-gray-50'
                  }`}
                >
                  <MonitorPlay size={16} />
                  Live Webcam
                </button>
                <button
                  type="button"
                  onClick={() => handleCameraModeChange(CameraModeValue.IP_WEBCAM)}
                  className={`flex items-center gap-2 rounded border px-4 py-2 font-medium transition-colors ${
                    cameraMode === CameraModeValue.IP_WEBCAM
                      ? 'border-brand-dark bg-brand-dark text-white'
                      : 'border-gray-200 bg-white text-brand-dark hover:bg-gray-50'
                  }`}
                >
                  <Smartphone size={16} />
                  Mobile IP Camera
                </button>
              </div>

              <span className="rounded-md border border-brand-mid/80 bg-brand-bg px-2 py-1 text-xs font-semibold text-brand-dark">
                {layoutData.timestampLabel}
              </span>
            </div>
          </div>

          <div className="rounded-xl bg-brand-bg/60 p-2 shadow-inner">
            <CameraPage
              compactLayout
              showInternalHeader={false}
              mode={cameraMode}
              onModeChange={handleCameraModeChange}
              onStatsChange={handleDetectionStatsChange}
            />
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

          <article className="bg-white rounded-lg shadow-sm p-4 border border-gray-100">
            <h3 className="text-sm font-bold text-gray-700 mb-4">Detection Stats</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 flex justify-between p-2 rounded items-center">
                <span className="text-gray-500 text-xs">FPS</span>
                <span className="font-bold text-gray-800">{detectionStats.fps}</span>
              </div>

              <div className="bg-gray-50 flex justify-between p-2 rounded items-center">
                <span className="text-gray-500 text-xs">Tracked</span>
                <span className="font-bold text-gray-800">{detectionStats.tracked}</span>
              </div>

              <div className="bg-blue-50 flex justify-between p-2 rounded items-center">
                <span className="text-blue-600 text-xs">Male</span>
                <span className="text-blue-600 font-bold">{detectionStats.male}</span>
              </div>

              <div className="bg-pink-50 flex justify-between p-2 rounded items-center">
                <span className="text-pink-600 text-xs">Female</span>
                <span className="text-pink-600 font-bold">{detectionStats.female}</span>
              </div>

              <div className="bg-green-50 flex justify-between p-2 rounded items-center">
                <span className="text-green-600 text-xs">Unique</span>
                <span className="text-green-600 font-bold">{detectionStats.unique}</span>
              </div>

              <div className="bg-gray-50 flex justify-between p-2 rounded items-center">
                <span className="text-gray-500 text-xs">Total Events</span>
                <span className="font-bold text-gray-800">{detectionStats.totalEvents}</span>
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
          <div className="max-h-90 overflow-auto">
            <table className="min-w-[720px] w-full text-sm">
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
