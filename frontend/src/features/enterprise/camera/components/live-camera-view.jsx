/**
 * Live camera component with real webcam feed and ML detection.
 * Replaces the mock video stream with actual camera input.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Camera,
  CameraOff,
  MonitorPlay,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Settings,
  Users,
  Video,
  Zap,
} from 'lucide-react';
import {
  useCamera,
  CameraState,
  usePersonDetection,
  DetectionState,
  useGenderClassification,
  Gender,
} from '../hooks';
import { sendDetectionBatch } from '../api/detection-api';

const BATCH_INTERVAL_MS = 5000;
const MAX_BATCH_SIZE = 50;

export default function LiveCameraView() {
  const canvasRef = useRef(null);
  const batchBufferRef = useRef([]);
  const lastBatchTimeRef = useRef(Date.now());

  const [isDetectionActive, setIsDetectionActive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [detectionLogs, setDetectionLogs] = useState([]);
  const [stats, setStats] = useState({
    totalDetections: 0,
    maleCount: 0,
    femaleCount: 0,
    unknownCount: 0,
  });

  const {
    videoRef,
    state: cameraState,
    error: cameraError,
    devices,
    selectedDeviceId,
    streamInfo,
    isStreaming,
    startStream,
    stopStream,
    switchCamera,
  } = useCamera({ autoStart: false });

  const {
    state: detectionState,
    detections,
    trackCount,
    fps,
    isRunning: isDetecting,
    startDetection,
    stopDetection,
  } = usePersonDetection({
    videoRef,
  });

  const {
    state: classificationState,
    loadModel: loadGenderModel,
    classifyDetections,
    isReady: isClassificationReady,
  } = useGenderClassification();

  const handleStartCamera = useCallback(async () => {
    const success = await startStream();
    if (success) {
      await loadGenderModel();
    }
  }, [startStream, loadGenderModel]);

  const handleToggleDetection = useCallback(async () => {
    if (isDetecting) {
      stopDetection();
      setIsDetectionActive(false);
    } else {
      const success = await startDetection();
      setIsDetectionActive(success);
    }
  }, [isDetecting, startDetection, stopDetection]);

  const addDetectionLog = useCallback((message) => {
    const timestamp = new Date().toLocaleTimeString();
    setDetectionLogs((prev) => [
      `[${timestamp}] ${message}`,
      ...prev.slice(0, 99),
    ]);
  }, []);

  const flushBatch = useCallback(async () => {
    if (batchBufferRef.current.length === 0) return;

    const batch = [...batchBufferRef.current];
    batchBufferRef.current = [];

    try {
      await sendDetectionBatch(batch);
      addDetectionLog(`Sent batch of ${batch.length} detections to server`);
    } catch (err) {
      console.error('Failed to send detection batch:', err);
      addDetectionLog(`Failed to send batch: ${err.message}`);
    }
  }, [addDetectionLog]);

  useEffect(() => {
    if (!isDetecting || !detections.length || !videoRef.current) return;

    const processDetections = async () => {
      const classified = isClassificationReady
        ? await classifyDetections(videoRef.current, detections)
        : detections.map((d) => ({
            ...d,
            sex: Gender.UNKNOWN,
            sexConfidence: 0,
          }));

      let newMale = 0;
      let newFemale = 0;
      let newUnknown = 0;

      for (const detection of classified) {
        if (detection.sex === Gender.MALE) newMale++;
        else if (detection.sex === Gender.FEMALE) newFemale++;
        else newUnknown++;

        batchBufferRef.current.push({
          enterprise_id: 'ent_archies_001',
          camera_id: 'cam_live_webcam',
          track_id: detection.trackId,
          timestamp: new Date().toISOString(),
          sex: detection.sex,
          confidence_person: detection.confidence,
          confidence_sex: detection.sexConfidence || null,
          bbox_x: detection.bbox.x,
          bbox_y: detection.bbox.y,
          bbox_w: detection.bbox.w,
          bbox_h: detection.bbox.h,
          dwell_seconds: detection.dwellSeconds,
          first_seen: new Date(detection.firstSeen).toISOString(),
        });
      }

      setStats((prev) => ({
        totalDetections: prev.totalDetections + classified.length,
        maleCount: prev.maleCount + newMale,
        femaleCount: prev.femaleCount + newFemale,
        unknownCount: prev.unknownCount + newUnknown,
      }));

      if (classified.length > 0) {
        const labels = classified
          .map(
            (d) =>
              `${d.sex === Gender.MALE ? 'Male' : d.sex === Gender.FEMALE ? 'Female' : 'Unknown'}`,
          )
          .join(', ');
        addDetectionLog(`Detected ${classified.length} person(s): ${labels}`);
      }

      const now = Date.now();
      if (
        batchBufferRef.current.length >= MAX_BATCH_SIZE ||
        now - lastBatchTimeRef.current >= BATCH_INTERVAL_MS
      ) {
        lastBatchTimeRef.current = now;
        flushBatch();
      }
    };

    processDetections();
  }, [
    isDetecting,
    detections,
    videoRef,
    isClassificationReady,
    classifyDetections,
    addDetectionLog,
    flushBatch,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !isDetecting) return;

    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const drawFrame = () => {
      if (!isDetecting) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const detection of detections) {
        const { bbox, sex, sexConfidence, trackId } = detection;
        const x = (bbox.x / 100) * canvas.width;
        const y = (bbox.y / 100) * canvas.height;
        const w = (bbox.w / 100) * canvas.width;
        const h = (bbox.h / 100) * canvas.height;

        const color =
          sex === Gender.MALE
            ? '#3B82F6'
            : sex === Gender.FEMALE
              ? '#EC4899'
              : '#10B981';

        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, w, h);

        ctx.fillStyle = color;
        ctx.fillRect(x, y - 24, Math.max(w, 80), 22);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 12px system-ui';
        const label =
          sex === Gender.MALE
            ? 'Male'
            : sex === Gender.FEMALE
              ? 'Female'
              : 'Person';
        const confidence = sexConfidence
          ? ` ${Math.round(sexConfidence * 100)}%`
          : '';
        ctx.fillText(`${label}${confidence}`, x + 4, y - 8);
      }

      requestAnimationFrame(drawFrame);
    };

    const animationId = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(animationId);
  }, [isDetecting, detections, videoRef]);

  const renderCameraState = () => {
    if (cameraState === CameraState.IDLE) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 text-slate-500">
          <Camera size={64} className="opacity-50" />
          <p className="text-lg font-medium">Camera not started</p>
          <button
            type="button"
            onClick={handleStartCamera}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700"
          >
            <PlayCircle size={20} />
            Start Camera
          </button>
        </div>
      );
    }

    if (cameraState === CameraState.REQUESTING) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 text-slate-500">
          <RefreshCw size={48} className="animate-spin opacity-50" />
          <p className="text-lg font-medium">Requesting camera access...</p>
          <p className="text-sm">Please allow camera access in your browser</p>
        </div>
      );
    }

    if (cameraState === CameraState.DENIED) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 text-red-500">
          <CameraOff size={64} className="opacity-70" />
          <p className="text-lg font-medium">Camera access denied</p>
          <p className="max-w-md text-center text-sm text-slate-600">
            To use real-time detection, please enable camera access in your
            browser settings and refresh the page.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            Refresh Page
          </button>
        </div>
      );
    }

    if (cameraState === CameraState.NOT_FOUND) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 text-amber-600">
          <AlertCircle size={64} className="opacity-70" />
          <p className="text-lg font-medium">No camera found</p>
          <p className="max-w-md text-center text-sm text-slate-600">
            Please connect a webcam or enable your built-in camera and try
            again.
          </p>
          <button
            type="button"
            onClick={handleStartCamera}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            Try Again
          </button>
        </div>
      );
    }

    if (cameraState === CameraState.IN_USE) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 text-amber-600">
          <Video size={64} className="opacity-70" />
          <p className="text-lg font-medium">Camera in use</p>
          <p className="max-w-md text-center text-sm text-slate-600">
            The camera is being used by another application. Please close other
            apps using the camera and try again.
          </p>
          <button
            type="button"
            onClick={handleStartCamera}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            Try Again
          </button>
        </div>
      );
    }

    if (cameraState === CameraState.ERROR) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 text-red-500">
          <AlertCircle size={64} className="opacity-70" />
          <p className="text-lg font-medium">Camera error</p>
          <p className="max-w-md text-center text-sm text-slate-600">
            {cameraError?.message || 'An unexpected error occurred'}
          </p>
          <button
            type="button"
            onClick={handleStartCamera}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            Try Again
          </button>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-slate-800">
              Live Camera Detection
            </h3>
            <p className="text-sm text-slate-500">
              Real-time person detection with gender classification using your
              webcam
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isStreaming && (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                Live
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>
      </div>

      {showSettings && isStreaming && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="mb-3 text-sm font-semibold text-slate-700">
            Camera Settings
          </h4>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">Camera Device</span>
              <select
                value={selectedDeviceId}
                onChange={(e) => switchCamera(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {devices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${device.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">Resolution</span>
              <span className="text-sm font-medium text-slate-700">
                {streamInfo.width} x {streamInfo.height}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">Camera FPS</span>
              <span className="text-sm font-medium text-slate-700">
                {Math.round(streamInfo.frameRate)} fps
              </span>
            </div>
          </div>
        </div>
      )}

      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MonitorPlay size={16} className="text-slate-600" />
              <p className="text-sm font-semibold text-slate-700">
                {isStreaming ? 'Live Webcam Feed' : 'Camera Preview'}
              </p>
            </div>
            {isStreaming && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleDetection}
                  className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    isDetecting
                      ? 'border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                >
                  {isDetecting ? <PauseCircle size={14} /> : <Zap size={14} />}
                  {isDetecting ? 'Stop Detection' : 'Start Detection'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopDetection();
                    stopStream();
                  }}
                  className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <CameraOff size={14} />
                  Stop Camera
                </button>
              </div>
            )}
          </div>

          <div className="relative h-[430px] overflow-hidden rounded-lg border border-slate-300 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700">
            {/* Video element is always rendered but hidden when not streaming */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`absolute inset-0 h-full w-full object-cover ${isStreaming ? 'block' : 'hidden'}`}
            />
            {isStreaming ? (
              <>
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute left-3 top-3 rounded-md bg-black/55 px-2 py-1 text-[11px] font-semibold text-white">
                  LIVE | {streamInfo.width}x{streamInfo.height}
                </div>
                {isDetecting && (
                  <div className="absolute right-3 top-3 rounded-md bg-black/55 px-2 py-1 text-[11px] font-semibold text-emerald-300">
                    AI DETECTION ACTIVE | {fps} FPS
                  </div>
                )}
                <div className="absolute left-3 bottom-3 rounded-md bg-black/55 px-2 py-1 text-[11px] font-semibold text-slate-100">
                  {trackCount} person(s) tracked
                </div>
              </>
            ) : (
              renderCameraState()
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-slate-700">
              Detection Stats
            </h4>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="flex items-center gap-1 text-sm text-slate-600">
                  <Activity size={14} /> FPS
                </span>
                <strong className="text-slate-800">{fps}</strong>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="flex items-center gap-1 text-sm text-slate-600">
                  <Users size={14} /> Tracked
                </span>
                <strong className="text-slate-800">{trackCount}</strong>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2">
                <span className="text-sm text-blue-700">Male</span>
                <strong className="text-blue-800">{stats.maleCount}</strong>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-pink-50 px-3 py-2">
                <span className="text-sm text-pink-700">Female</span>
                <strong className="text-pink-800">{stats.femaleCount}</strong>
              </div>
              <div className="col-span-2 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2">
                <span className="text-sm text-emerald-700">
                  Total Detections
                </span>
                <strong className="text-emerald-800">
                  {stats.totalDetections}
                </strong>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-slate-700">
              Detection Log
            </h4>
            <ul className="mt-3 max-h-[300px] space-y-1.5 overflow-y-auto pr-1 text-xs text-slate-600">
              {detectionLogs.length === 0 ? (
                <li className="rounded border border-slate-200 bg-slate-50 px-2 py-2 text-center text-slate-400">
                  No detections yet. Start the camera and enable detection.
                </li>
              ) : (
                detectionLogs.map((log, index) => (
                  <li
                    key={`${log}-${index}`}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5"
                  >
                    {log}
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-slate-700">
              System Status
            </h4>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Camera</span>
                <span
                  className={`font-medium ${
                    isStreaming ? 'text-emerald-600' : 'text-slate-400'
                  }`}
                >
                  {isStreaming ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Person Detection</span>
                <span
                  className={`font-medium ${
                    detectionState === DetectionState.RUNNING
                      ? 'text-emerald-600'
                      : detectionState === DetectionState.READY
                        ? 'text-amber-600'
                        : 'text-slate-400'
                  }`}
                >
                  {detectionState === DetectionState.RUNNING
                    ? 'Running'
                    : detectionState === DetectionState.READY
                      ? 'Ready'
                      : detectionState === DetectionState.LOADING
                        ? 'Loading...'
                        : 'Idle'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Gender Classification</span>
                <span
                  className={`font-medium ${
                    isClassificationReady
                      ? 'text-emerald-600'
                      : 'text-slate-400'
                  }`}
                >
                  {isClassificationReady ? 'Ready' : 'Not loaded'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
