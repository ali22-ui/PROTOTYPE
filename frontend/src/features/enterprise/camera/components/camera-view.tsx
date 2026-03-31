import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Camera,
  CameraOff,
  PauseCircle,
  PlayCircle,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  fetchEnterpriseCameraStream,
  getCameraWebSocketUrl,
  CameraServiceUnavailableError,
} from '../api/get-camera-stream';
import type { CameraStreamFrame, CameraConnectionState } from '../types';

interface CameraViewProps {
  compactLayout?: boolean;
}

export default function CameraView({
  compactLayout = false,
}: CameraViewProps): JSX.Element {
  const [isRunning, setIsRunning] = useState(true);
  const [streamData, setStreamData] = useState<CameraStreamFrame | null>(null);
  const [detections, setDetections] = useState<string[]>([]);
  const [connectionState, setConnectionState] =
    useState<CameraConnectionState>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const initialLoadRef = useRef(false);

  const loadFrame = useCallback(async (): Promise<void> => {
    try {
      const data = await fetchEnterpriseCameraStream();
      setStreamData(data);
      setDetections(data.events || []);
      setErrorMessage(null);

      // Determine connection state based on response
      if (!data.source_mode) {
        setConnectionState('source_unavailable');
        setErrorMessage(
          data.diagnostic?.message || 'No camera source configured',
        );
      } else if (
        data.status === 'NO_SOURCE' ||
        data.source_status === 'offline'
      ) {
        setConnectionState('source_unavailable');
        setErrorMessage(
          data.diagnostic?.message || 'Camera source unavailable',
        );
      } else {
        setConnectionState('live');
      }
    } catch (error) {
      if (error instanceof CameraServiceUnavailableError) {
        setConnectionState('backend_unavailable');
        setErrorMessage(error.message);
      } else {
        setConnectionState('backend_unavailable');
        setErrorMessage('Failed to connect to camera service');
      }
    }
  }, []);

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    void loadFrame();
  }, [loadFrame]);

  useEffect(() => {
    if (!isRunning) return undefined;

    let socket: WebSocket | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let fallbackTimer: ReturnType<typeof setInterval> | undefined;
    let isClosed = false;

    const startFallbackPolling = (): void => {
      setConnectionState('connecting');
      fallbackTimer = setInterval(() => {
        void loadFrame();
      }, 2000);
    };

    const connect = (): void => {
      setConnectionState('connecting');
      try {
        socket = new globalThis.WebSocket(getCameraWebSocketUrl());
      } catch (error) {
        console.error(
          'WebSocket initialization failed, falling back to polling:',
          error,
        );
        startFallbackPolling();
        return;
      }

      socket.onopen = () => {
        if (streamData?.source_mode && streamData.status !== 'NO_SOURCE') {
          setConnectionState('live');
        }
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as CameraStreamFrame;
          setStreamData(payload);
          setDetections(payload.events || []);

          // Update connection state based on payload
          if (!payload.source_mode || payload.status === 'NO_SOURCE') {
            setConnectionState('source_unavailable');
            setErrorMessage(
              payload.diagnostic?.message || 'No camera source configured',
            );
          } else if (payload.source_status === 'offline') {
            setConnectionState('source_unavailable');
            setErrorMessage(payload.diagnostic?.message || 'Camera offline');
          } else {
            setConnectionState('live');
            setErrorMessage(null);
          }
        } catch (error) {
          console.error('Invalid WebSocket payload:', error);
        }
      };

      socket.onerror = () => {
        if (!fallbackTimer) startFallbackPolling();
      };

      socket.onclose = () => {
        if (isClosed) return;
        if (!fallbackTimer) startFallbackPolling();
        reconnectTimer = setTimeout(() => {
          if (isRunning) connect();
        }, 2000);
      };
    };

    connect();

    return () => {
      isClosed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (fallbackTimer) clearInterval(fallbackTimer);
      if (socket && socket.readyState === globalThis.WebSocket.OPEN)
        socket.close();
    };
  }, [isRunning, loadFrame, streamData?.source_mode, streamData?.status]);

  const fps = useMemo(() => streamData?.fps || 0, [streamData]);

  const connectionStateLabel = useMemo(() => {
    switch (connectionState) {
      case 'connecting':
        return 'Connecting...';
      case 'live':
        return 'Live';
      case 'source_unavailable':
        return 'Source Unavailable';
      case 'backend_unavailable':
        return 'Backend Unavailable';
      default:
        return 'Unknown';
    }
  }, [connectionState]);

  const connectionStateColor = useMemo(() => {
    switch (connectionState) {
      case 'live':
        return 'text-emerald-400';
      case 'connecting':
        return 'text-amber-400';
      case 'source_unavailable':
      case 'backend_unavailable':
        return 'text-red-400';
      default:
        return 'text-slate-400';
    }
  }, [connectionState]);

  // Show unavailable state when no data or backend unavailable
  if (connectionState === 'backend_unavailable') {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
          <WifiOff size={48} className="text-slate-400" />
          <div>
            <h3 className="text-lg font-semibold text-slate-700">
              Backend Unavailable
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              {errorMessage || 'Unable to connect to camera service'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadFrame()}
            className="mt-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!streamData) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          <span className="text-slate-600">Connecting to camera stream...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-2xl font-bold tracking-tight text-slate-800">
          Live Camera Monitoring
        </h3>
        <p className="text-sm text-slate-500">
          Real-time camera stream with AI detection overlays.
        </p>
      </div>

      <section
        className={
          compactLayout
            ? 'space-y-4'
            : 'grid gap-4 xl:grid-cols-[1.4fr_1fr] xl:items-start'
        }
      >
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Camera size={16} className="text-slate-600" />
              <p className="text-sm font-semibold text-slate-700">
                {streamData.camera_name}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsRunning((state) => !state)}
              className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              disabled={connectionState !== 'live'}
            >
              {isRunning ? <PauseCircle size={14} /> : <PlayCircle size={14} />}
              {isRunning ? 'Pause Detection' : 'Resume Detection'}
            </button>
          </div>

          <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-slate-300 bg-linear-to-br from-slate-900 via-slate-800 to-slate-700">
            {/* Camera unavailable state */}
            {connectionState === 'source_unavailable' ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
                <CameraOff size={48} className="text-slate-500" />
                <div>
                  <p className="text-sm font-semibold text-slate-300">
                    Camera Source Unavailable
                  </p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs">
                    {errorMessage ||
                      'Please configure a camera source to begin monitoring.'}
                  </p>
                </div>
              </div>
            ) : connectionState === 'connecting' ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-500 border-t-emerald-400" />
                <p className="text-sm text-slate-400">
                  Connecting to camera...
                </p>
              </div>
            ) : streamData.relay_url ? (
              /* IP webcam relay stream */
              <img
                src={streamData.relay_url}
                alt="Camera feed"
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              /* Live webcam - placeholder for WebRTC or direct feed */
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
                <Wifi size={32} className="text-emerald-400" />
                <p className="text-sm text-slate-300">Live feed active</p>
                <p className="text-xs text-slate-400">
                  Detection data streaming via WebSocket
                </p>
              </div>
            )}

            {/* Status overlays */}
            <div className="absolute left-3 top-3 rounded-md bg-black/55 px-2 py-1 text-[11px] font-semibold text-white">
              {connectionState === 'live'
                ? 'LIVE'
                : connectionState.toUpperCase().replace('_', ' ')}{' '}
              | Frame {streamData.frame}
            </div>
            <div
              className={`absolute right-3 top-3 rounded-md bg-black/55 px-2 py-1 text-[11px] font-semibold ${connectionState === 'live' ? 'text-emerald-300' : 'text-amber-300'}`}
            >
              AI DETECTION{' '}
              {connectionState === 'live' && isRunning ? 'ACTIVE' : 'PAUSED'}
            </div>
            <div
              className={`absolute left-3 bottom-3 rounded-md bg-black/55 px-2 py-1 text-[11px] font-semibold flex items-center gap-1 ${connectionStateColor}`}
            >
              {connectionState === 'live' ? (
                <Wifi size={12} />
              ) : (
                <AlertCircle size={12} />
              )}
              {connectionStateLabel}
            </div>
            <div className="absolute right-3 bottom-3 rounded-md bg-black/55 px-2 py-1 text-[11px] font-semibold text-slate-100">
              {streamData.source_mode
                ? streamData.source_mode.replace('_', ' ').toUpperCase()
                : 'NO SOURCE'}
            </div>

            {/* Grid overlay */}
            <div
              className="absolute inset-0 z-10 opacity-25 pointer-events-none"
              style={{
                backgroundImage:
                  'linear-gradient(to right, rgba(255,255,255,.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.2) 1px, transparent 1px)',
                backgroundSize: '36px 36px',
              }}
            />

            {/* Detection boxes - only show when live */}
            {connectionState === 'live' &&
              streamData.boxes.map((box) => (
                <div
                  key={box.id}
                  className="absolute z-20 rounded border-2 border-emerald-400 bg-emerald-200/20"
                  style={{
                    left: `${box.x}%`,
                    top: `${box.y}%`,
                    width: `${box.w}%`,
                    height: `${box.h}%`,
                  }}
                >
                  <span className="absolute -top-5 left-0 rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                    {box.label}
                  </span>
                </div>
              ))}
          </div>
        </div>

        {!compactLayout ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h4 className="text-sm font-semibold text-slate-700">
                Stream Health
              </h4>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2">
                  <span className="flex items-center gap-1">
                    <Activity size={14} /> FPS
                  </span>
                  <strong>{fps}</strong>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2">
                  <span className="flex items-center gap-1">
                    <Users size={14} /> Active Tracks
                  </span>
                  <strong>{streamData.active_tracks}</strong>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2">
                  <span>Connection</span>
                  <strong className={connectionStateColor}>
                    {connectionStateLabel}
                  </strong>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2">
                  <span>Detection</span>
                  <strong
                    className={
                      isRunning && connectionState === 'live'
                        ? 'text-emerald-700'
                        : 'text-amber-700'
                    }
                  >
                    {isRunning && connectionState === 'live'
                      ? 'ACTIVE'
                      : 'PAUSED'}
                  </strong>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h4 className="text-sm font-semibold text-slate-700">
                Recent Detection Events
              </h4>
              {detections.length > 0 ? (
                <ul className="mt-3 max-h-105 space-y-1.5 overflow-y-auto pr-1 text-xs text-slate-600">
                  {detections.map((line, index) => (
                    <li
                      key={`${line}-${index}`}
                      className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-slate-400 italic">
                  No detection events yet. Events will appear here when
                  detections are processed.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
