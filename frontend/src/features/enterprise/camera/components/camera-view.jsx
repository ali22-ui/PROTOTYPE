import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Camera,
  PauseCircle,
  PlayCircle,
  Users,
  Video,
} from 'lucide-react';
import {
  fetchEnterpriseCameraStream,
  getCameraWebSocketUrl,
} from '../api/get-camera-stream';

export default function CameraView() {
  const [isRunning, setIsRunning] = useState(true);
  const [streamData, setStreamData] = useState(null);
  const [detections, setDetections] = useState([]);
  const [connectionMode, setConnectionMode] = useState('connecting');
  const [videoSourceIndex, setVideoSourceIndex] = useState(0);
  const initialLoadRef = useRef(false);

  const loadFrame = useCallback(async () => {
    const data = await fetchEnterpriseCameraStream();
    setStreamData(data);
    setDetections(data.events || []);
  }, []);

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial data fetch on mount is intentional
    loadFrame().catch((error) =>
      console.error('Failed to load camera stream frame:', error),
    );
  }, [loadFrame]);

  useEffect(() => {
    if (!isRunning) return undefined;

    let socket;
    let reconnectTimer;
    let fallbackTimer;
    let isClosed = false;

    const startFallbackPolling = () => {
      setConnectionMode('polling-fallback');
      fallbackTimer = setInterval(() => {
        loadFrame().catch((error) =>
          console.error('Camera polling error:', error),
        );
      }, 1000);
    };

    const connect = () => {
      setConnectionMode('connecting');
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

      socket.onopen = () => setConnectionMode('websocket-live');
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          setStreamData(payload);
          setDetections(payload.events || []);
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
      if (socket && socket.readyState === globalThis.WebSocket.OPEN) socket.close();
    };
  }, [isRunning, loadFrame]);

  const fps = useMemo(() => streamData?.fps || 0, [streamData]);
  const demoVideoSources = useMemo(
    () =>
      [
        streamData?.sample_video_url,
        'https://www.w3schools.com/html/mov_bbb.mp4',
        'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      ].filter(Boolean),
    [streamData?.sample_video_url],
  );

  if (!streamData) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        Loading live camera stream...
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
          Real-time WebSocket stream with automatic fallback and AI detection
          overlays.
        </p>
      </div>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
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
            >
              {isRunning ? <PauseCircle size={14} /> : <PlayCircle size={14} />}
              {isRunning ? 'Pause Detection' : 'Resume Detection'}
            </button>
          </div>

          <div className="relative h-[430px] overflow-hidden rounded-lg border border-slate-300 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700">
            <video
              className="absolute inset-0 h-full w-full object-cover opacity-60"
              src={
                demoVideoSources[
                  Math.min(videoSourceIndex, demoVideoSources.length - 1)
                ]
              }
              autoPlay
              loop
              muted
              playsInline
              onError={() =>
                setVideoSourceIndex((current) =>
                  Math.min(current + 1, demoVideoSources.length - 1),
                )
              }
            />

            <div className="absolute left-3 top-3 rounded-md bg-black/55 px-2 py-1 text-[11px] font-semibold text-white">
              LIVE | Frame {streamData.frame}
            </div>
            <div className="absolute right-3 top-3 rounded-md bg-black/55 px-2 py-1 text-[11px] font-semibold text-emerald-300">
              AI DETECTION {isRunning ? 'ACTIVE' : 'PAUSED'}
            </div>
            <div className="absolute left-3 bottom-3 rounded-md bg-black/55 px-2 py-1 text-[11px] font-semibold text-slate-100">
              {connectionMode === 'websocket-live'
                ? 'WebSocket Live'
                : connectionMode === 'polling-fallback'
                  ? 'Polling Fallback'
                  : 'Connecting...'}
            </div>
            <div className="absolute right-3 bottom-3 rounded-md bg-black/55 px-2 py-1 text-[11px] font-semibold text-slate-100 flex items-center gap-1">
              <Video size={12} /> CCTV Presentation Feed
            </div>

            <div
              className="absolute inset-0 z-10 opacity-25"
              style={{
                backgroundImage:
                  'linear-gradient(to right, rgba(255,255,255,.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.2) 1px, transparent 1px)',
                backgroundSize: '36px 36px',
              }}
            />

            {streamData.boxes.map((box) => (
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
                <span>Status</span>
                <strong
                  className={isRunning ? 'text-emerald-700' : 'text-amber-700'}
                >
                  {isRunning ? 'RUNNING' : 'PAUSED'}
                </strong>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-slate-700">
              Recent Detection Events (100 sample rows)
            </h4>
            <ul className="mt-3 max-h-[420px] space-y-1.5 overflow-y-auto pr-1 text-xs text-slate-600">
              {detections.map((line, index) => (
                <li
                  key={`${line}-${index}`}
                  className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5"
                >
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
