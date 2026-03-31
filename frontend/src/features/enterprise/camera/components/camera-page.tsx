/**
 * Camera monitoring page with mode selection.
 * Allows switching between live webcam feed and mobile IP camera stream.
 */
import { useCallback, useState } from 'react';
import { MonitorPlay, Smartphone } from 'lucide-react';
import LiveCameraView from './live-camera-view';
import IPCameraView from './ip-camera-view';
import type { CameraDetectionStats, CameraMode } from '../types';

const CAMERA_MODE_KEY = 'lgu-dashboard-camera-mode';

const CameraModeValue = {
  LIVE: 'live_webcam',
  IP_WEBCAM: 'ip_webcam',
} as const satisfies Record<string, CameraMode>;

const EMPTY_DETECTION_STATS: CameraDetectionStats = {
  fps: 0,
  tracked: 0,
  male: 0,
  female: 0,
  unique: 0,
  totalEvents: 0,
};

interface CameraPageProps {
  compactLayout?: boolean;
  showInternalHeader?: boolean;
  mode?: CameraMode;
  onModeChange?: (newMode: CameraMode) => void;
  onStatsChange?: (stats: CameraDetectionStats) => void;
}

const resolveStoredMode = (): CameraMode => {
  const saved = localStorage.getItem(CAMERA_MODE_KEY);
  if (saved === 'live') return CameraModeValue.LIVE;
  if (saved === CameraModeValue.LIVE) return CameraModeValue.LIVE;
  if (saved === CameraModeValue.IP_WEBCAM) return CameraModeValue.IP_WEBCAM;
  return CameraModeValue.LIVE;
};

export default function CameraPage({
  compactLayout = false,
  showInternalHeader = true,
  mode,
  onModeChange,
  onStatsChange,
}: CameraPageProps): JSX.Element {
  const [internalMode, setInternalMode] = useState<CameraMode>(() => resolveStoredMode());

  const resolvedMode = mode ?? internalMode;
  const isModeControlled = typeof mode !== 'undefined';

  const handleModeChange = useCallback((newMode: CameraMode): void => {
    if (!isModeControlled) {
      setInternalMode(newMode);
    }

    onModeChange?.(newMode);
    onStatsChange?.(EMPTY_DETECTION_STATS);
    localStorage.setItem(CAMERA_MODE_KEY, newMode);
  }, [isModeControlled, onModeChange, onStatsChange]);

  const getModeDescription = (): string => {
    switch (resolvedMode) {
      case CameraModeValue.LIVE:
        return 'Using your webcam for real-time person detection';
      case CameraModeValue.IP_WEBCAM:
        return 'Streaming from mobile IP Webcam with real-time detection';
      default:
        return 'Using your webcam for real-time person detection';
    }
  };

  const renderCurrentModeView = (): JSX.Element => {
    if (resolvedMode === CameraModeValue.LIVE) {
      return (
        <LiveCameraView
          compactLayout={compactLayout}
          onStatsChange={onStatsChange}
        />
      );
    }

    return (
      <IPCameraView
        compactLayout={compactLayout}
        onStatsChange={onStatsChange}
      />
    );
  };

  if (!showInternalHeader) {
    return <div className="space-y-3">{renderCurrentModeView()}</div>;
  }

  return (
    <div className="space-y-3">
      <div
        className={`rounded-xl bg-white shadow-md ${compactLayout ? 'p-3' : 'p-4'}`}
      >
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
              className={`flex min-w-37.5 flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors lg:flex-none ${
                resolvedMode === CameraModeValue.LIVE
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
              className={`flex min-w-37.5 flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors lg:flex-none ${
                resolvedMode === CameraModeValue.IP_WEBCAM
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

      {renderCurrentModeView()}
    </div>
  );
}
