/**
 * Camera monitoring page with mode selection.
 * Allows switching between live webcam feed, mobile IP camera, and demo mock stream.
 */
import { useState } from 'react';
import { MonitorPlay, Smartphone, Video } from 'lucide-react';
import CameraView from './camera-view';
import LiveCameraView from './live-camera-view';
import IPCameraView from './ip-camera-view';
import type { CameraMode } from '../types';

const CAMERA_MODE_KEY = 'lgu-dashboard-camera-mode';

const CameraModeValue: Record<string, CameraMode> = {
  LIVE: 'live',
  IP_WEBCAM: 'ip_webcam',
  DEMO: 'demo',
};

interface CameraPageProps {
  compactLayout?: boolean;
}

export default function CameraPage({ compactLayout = false }: CameraPageProps): JSX.Element {
  const [mode, setMode] = useState<CameraMode>(() => {
    const saved = localStorage.getItem(CAMERA_MODE_KEY);
    if (saved === CameraModeValue.LIVE) return CameraModeValue.LIVE;
    if (saved === CameraModeValue.IP_WEBCAM) return CameraModeValue.IP_WEBCAM;
    return CameraModeValue.DEMO;
  });

  const handleModeChange = (newMode: CameraMode): void => {
    setMode(newMode);
    localStorage.setItem(CAMERA_MODE_KEY, newMode);
  };

  const getModeDescription = (): string => {
    switch (mode) {
      case CameraModeValue.LIVE:
        return 'Using your webcam for real-time person detection';
      case CameraModeValue.IP_WEBCAM:
        return 'Streaming from mobile IP Webcam with real-time detection';
      case CameraModeValue.DEMO:
      default:
        return 'Viewing simulated CCTV feed with mock detections';
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              Camera Monitoring
            </h2>
            <p className="text-sm text-slate-500">
              {getModeDescription()}
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1 lg:w-auto lg:flex-nowrap">
          <button
            type="button"
            onClick={() => handleModeChange(CameraModeValue.LIVE)}
            className={`flex min-w-[150px] flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors lg:flex-none ${
              mode === CameraModeValue.LIVE
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <MonitorPlay size={16} />
            Live Webcam
          </button>
          <button
            type="button"
            onClick={() => handleModeChange(CameraModeValue.IP_WEBCAM)}
            className={`flex min-w-[150px] flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors lg:flex-none ${
              mode === CameraModeValue.IP_WEBCAM
                ? 'bg-violet-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Smartphone size={16} />
            Mobile IP Camera
          </button>
          <button
            type="button"
            onClick={() => handleModeChange(CameraModeValue.DEMO)}
            className={`flex min-w-[150px] flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors lg:flex-none ${
              mode === CameraModeValue.DEMO
                ? 'bg-slate-700 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Video size={16} />
            Demo Mode
          </button>
        </div>
        </div>
      </div>

      {mode === CameraModeValue.LIVE && <LiveCameraView compactLayout={compactLayout} />}
      {mode === CameraModeValue.IP_WEBCAM && <IPCameraView compactLayout={compactLayout} />}
      {mode === CameraModeValue.DEMO && <CameraView compactLayout={compactLayout} />}
    </div>
  );
}
