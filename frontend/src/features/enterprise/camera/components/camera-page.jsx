/**
 * Camera monitoring page with mode selection.
 * Allows switching between live webcam feed and demo mock stream.
 */
import { useState } from 'react';
import { MonitorPlay, Video } from 'lucide-react';
import CameraView from './camera-view';
import LiveCameraView from './live-camera-view';

const CAMERA_MODE_KEY = 'lgu-dashboard-camera-mode';

const CameraMode = {
  LIVE: 'live',
  DEMO: 'demo',
};

export default function CameraPage() {
  const [mode, setMode] = useState(() => {
    const saved = localStorage.getItem(CAMERA_MODE_KEY);
    return saved === CameraMode.LIVE ? CameraMode.LIVE : CameraMode.DEMO;
  });

  const handleModeChange = (newMode) => {
    setMode(newMode);
    localStorage.setItem(CAMERA_MODE_KEY, newMode);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            Camera Monitoring
          </h2>
          <p className="text-sm text-slate-500">
            {mode === CameraMode.LIVE
              ? 'Using your webcam for real-time person detection'
              : 'Viewing simulated CCTV feed with mock detections'}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 p-1">
          <button
            type="button"
            onClick={() => handleModeChange(CameraMode.LIVE)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              mode === CameraMode.LIVE
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <MonitorPlay size={16} />
            Live Webcam
          </button>
          <button
            type="button"
            onClick={() => handleModeChange(CameraMode.DEMO)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              mode === CameraMode.DEMO
                ? 'bg-slate-700 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Video size={16} />
            Demo Mode
          </button>
        </div>
      </div>

      {mode === CameraMode.LIVE ? <LiveCameraView /> : <CameraView />}
    </div>
  );
}
