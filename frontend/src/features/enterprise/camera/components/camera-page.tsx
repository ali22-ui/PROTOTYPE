/**
 * Camera monitoring page with mode selection.
 * Allows switching between live webcam feed and mobile IP camera stream.
 */
import { useState } from 'react';
import { MonitorPlay, Smartphone } from 'lucide-react';
import LiveCameraView from './live-camera-view';
import IPCameraView from './ip-camera-view';
import type { CameraMode } from '../types';

const CAMERA_MODE_KEY = 'lgu-dashboard-camera-mode';

const CameraModeValue: Record<string, CameraMode> = {
  LIVE: 'live',
  IP_WEBCAM: 'ip_webcam',
};

interface CameraPageProps {
  compactLayout?: boolean;
}

export default function CameraPage({ compactLayout = false }: CameraPageProps): JSX.Element {
  const [mode, setMode] = useState<CameraMode>(() => {
    const saved = localStorage.getItem(CAMERA_MODE_KEY);
    if (saved === CameraModeValue.LIVE) return CameraModeValue.LIVE;
    if (saved === CameraModeValue.IP_WEBCAM) return CameraModeValue.IP_WEBCAM;
    return CameraModeValue.LIVE;
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
      default:
        return 'Using your webcam for real-time person detection';
    }
  };

  return (
    <div className="space-y-3">
      <div className={`rounded-xl bg-white shadow-md ${compactLayout ? 'p-3' : 'p-4'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-brand-dark md:text-xl">
              Camera Monitoring
            </h2>
            <p className="text-xs text-brand-dark/75 md:text-sm">
              {getModeDescription()}
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-brand-bg p-1 shadow-inner lg:w-auto lg:flex-nowrap">
          <button
            type="button"
            onClick={() => handleModeChange(CameraModeValue.LIVE)}
            className={`flex min-w-[150px] flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors lg:flex-none ${
              mode === CameraModeValue.LIVE
                ? 'bg-brand-dark text-white'
                : 'text-brand-dark hover:bg-brand-mid/40'
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
                ? 'bg-brand-accent text-white'
                : 'text-brand-dark hover:bg-brand-mid/40'
            }`}
          >
            <Smartphone size={16} />
            Mobile IP Camera
          </button>
        </div>
        </div>
      </div>

      {mode === CameraModeValue.LIVE && <LiveCameraView compactLayout={compactLayout} />}
      {mode === CameraModeValue.IP_WEBCAM && <IPCameraView compactLayout={compactLayout} />}
    </div>
  );
}
