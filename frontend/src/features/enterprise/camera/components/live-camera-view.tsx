/**
 * Live camera component with real webcam feed and ML detection.
 * Includes multi-layer deduplication for accurate unique person counting.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Camera,
  CameraOff,
  Fingerprint,
  Loader2,
  MonitorPlay,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Settings,
  Sparkles,
  UserCheck,
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
  useDeduplication,
} from '../hooks';
import { FaceEmbeddingState } from '../hooks/use-face-embedding';
import { ReIdMethod } from '../hooks/use-identity-registry';
import { sendDetectionBatch } from '../api/detection-api';
import type { DetectionBatchEvent } from '../types';
import type { EnhancedTrack } from '../hooks/use-deduplication';

const BATCH_INTERVAL_MS = 5000;
const MAX_BATCH_SIZE = 50;

type OverlayDetection = EnhancedTrack & {
  sex?: 'male' | 'female' | 'unknown';
  sexConfidence?: number;
  gender?: string;
  genderConfidence?: number;
};

interface LiveCameraViewProps {
  compactLayout?: boolean;
}

export default function LiveCameraView({ compactLayout = false }: LiveCameraViewProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const batchBufferRef = useRef<DetectionBatchEvent[]>([]);
  const lastBatchTimeRef = useRef(Date.now());

  const [, setIsDetectionActive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDeduplicationStats, setShowDeduplicationStats] = useState(true);
  const [detectionLogs, setDetectionLogs] = useState<string[]>([]);
  const [stats, setStats] = useState({
    totalDetections: 0,
    maleCount: 0,
    femaleCount: 0,
    unknownCount: 0,
  });

  // Deduplication hook for multi-layer person tracking
  const deduplication = useDeduplication({
    enableAppearance: true,
    enableFaceEmbedding: true,
    dormantTimeMs: 30000,
    appearanceThreshold: 0.65,
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
    detections: rawDetections,
    fps,
    state: detectionState,
    isRunning: isDetecting,
    startDetection,
    stopDetection,
  } = usePersonDetection({
    videoRef,
  });

  const {
    loadModel: loadGenderModel,
    classifyDetections,
    isReady: isClassificationReady,
  } = useGenderClassification();

  const handleStartCamera = useCallback(async (): Promise<void> => {
    const success = await startStream();
    if (success) {
      await loadGenderModel();
      // Initialize deduplication system (loads face-api models)
      await deduplication.initialize();
    }
  }, [startStream, loadGenderModel, deduplication]);

  const handleToggleDetection = useCallback(async (): Promise<void> => {
    if (isDetecting) {
      stopDetection();
      setIsDetectionActive(false);
    } else {
      const success = await startDetection();
      setIsDetectionActive(success);
    }
  }, [isDetecting, startDetection, stopDetection]);

  const addDetectionLog = useCallback((message: string): void => {
    const timestamp = new Date().toLocaleTimeString();
    setDetectionLogs((prev) => [
      `[${timestamp}] ${message}`,
      ...prev.slice(0, 99),
    ]);
  }, []);

  const flushBatch = useCallback(async (): Promise<void> => {
    if (batchBufferRef.current.length === 0) return;

    const batch = [...batchBufferRef.current];
    batchBufferRef.current = [];

    try {
      await sendDetectionBatch(batch);
      addDetectionLog(`Sent batch of ${batch.length} detections to server`);
    } catch (err: unknown) {
      console.error('Failed to send detection batch:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      addDetectionLog(`Failed to send batch: ${message}`);
    }
  }, [addDetectionLog]);

  useEffect(() => {
    if (!isDetecting || !rawDetections.length || !videoRef.current) return;

    const processDetections = async (): Promise<void> => {
      const videoElement = videoRef.current;
      if (!videoElement) return;

      // Process through deduplication pipeline
      const deduplicatedDetections = await deduplication.processFrame(
        rawDetections,
        videoElement,
      );

      const detectionForClassification = deduplicatedDetections.map((detection) => ({
        ...detection,
        dwellSeconds: detection.dwellSeconds ?? 0,
        bbox: detection.bboxPercent || {
          x: (detection.bbox.originX / (videoElement.videoWidth || 1)) * 100,
          y: (detection.bbox.originY / (videoElement.videoHeight || 1)) * 100,
          w: (detection.bbox.width / (videoElement.videoWidth || 1)) * 100,
          h: (detection.bbox.height / (videoElement.videoHeight || 1)) * 100,
        },
      }));

      // Classify gender for each detection
      const classified = isClassificationReady
        ? await classifyDetections(videoElement, detectionForClassification)
        : detectionForClassification.map((detection) => ({
          ...detection,
          sex: Gender.UNKNOWN,
          sexConfidence: 0,
        }));

      let newMale = 0;
      let newFemale = 0;
      let newUnknown = 0;

      for (const detection of classified) {
        const normalizedBbox = detection.bboxPercent
          || (detection.bbox && 'x' in detection.bbox ? detection.bbox : undefined);

        if (detection.sex === Gender.MALE) newMale += 1;
        else if (detection.sex === Gender.FEMALE) newFemale += 1;
        else newUnknown += 1;

        // Prepare unified detection event for backend
        batchBufferRef.current.push({
          enterprise_id: 'ent_archies_001',
          camera_id: 'cam_live_webcam',
          track_id: detection.trackId,
          person_id: detection.personId,
          timestamp: new Date().toISOString(),
          sex: detection.sex,
          confidence_person: detection.confidence,
          confidence_sex: detection.sexConfidence || null,
          bbox_x: normalizedBbox?.x,
          bbox_y: normalizedBbox?.y,
          bbox_w: normalizedBbox?.w,
          bbox_h: normalizedBbox?.h,
          dwell_seconds: detection.dwellSeconds || 0,
          first_seen: new Date(detection.firstSeen).toISOString(),
          reid_method: detection.reIdMethod || 'none',
          reid_confidence: detection.reIdConfidence || 0,
        });
      }

      setStats((prev) => ({
        totalDetections: prev.totalDetections + classified.length,
        maleCount: prev.maleCount + newMale,
        femaleCount: prev.femaleCount + newFemale,
        unknownCount: prev.unknownCount + newUnknown,
      }));

      if (classified.length > 0) {
        const uniqueCount = deduplication.stats.uniquePersons;
        const labels = classified
          .map(
            (d) =>
              `${d.sex === Gender.MALE ? 'Male' : d.sex === Gender.FEMALE ? 'Female' : 'Unknown'}${
                d.reIdMethod !== 'none' && d.reIdMethod ? ` (Re-ID: ${d.reIdMethod})` : ''
              }`,
          )
          .join(', ');
        addDetectionLog(`[${uniqueCount} unique] ${classified.length} detection(s): ${labels}`);
      }

      const now = Date.now();
      if (
        batchBufferRef.current.length >= MAX_BATCH_SIZE
        || now - lastBatchTimeRef.current >= BATCH_INTERVAL_MS
      ) {
        lastBatchTimeRef.current = now;
        void flushBatch();
      }
    };

    void processDetections();
  }, [
    isDetecting,
    rawDetections,
    videoRef,
    isClassificationReady,
    classifyDetections,
    addDetectionLog,
    flushBatch,
    deduplication,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !isDetecting) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const drawFrame = (): void => {
      if (!isDetecting) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Get active detections from deduplication system
      const activeDetections = deduplication.getActiveDetections() as OverlayDetection[];

      for (const detection of activeDetections) {
        const bbox = detection.bboxPercent || detection.bbox;
        if (!bbox) continue;

        // Handle both percentage and pixel coordinates
        const x = 'x' in bbox
          ? (bbox.x / 100) * canvas.width
          : (bbox.originX / (video.videoWidth || 1)) * canvas.width;
        const y = 'y' in bbox
          ? (bbox.y / 100) * canvas.height
          : (bbox.originY / (video.videoHeight || 1)) * canvas.height;
        const w = 'w' in bbox
          ? (bbox.w / 100) * canvas.width
          : (bbox.width / (video.videoWidth || 1)) * canvas.width;
        const h = 'h' in bbox
          ? (bbox.h / 100) * canvas.height
          : (bbox.height / (video.videoHeight || 1)) * canvas.height;

        const sex = detection.sex || detection.gender || 'unknown';
        const sexConfidence = detection.sexConfidence || detection.genderConfidence;

        // Color based on gender
        const color =
          sex === Gender.MALE || sex === 'male'
            ? '#3B82F6'
            : sex === Gender.FEMALE || sex === 'female'
              ? '#EC4899'
              : '#10B981';

        // Re-ID indicator border color
        const reIdMethod = detection.reIdMethod;
        const hasReId = reIdMethod && reIdMethod !== ReIdMethod.NONE;
        const reIdColor = reIdMethod === ReIdMethod.FACE
          ? '#F59E0B' // amber for face
          : reIdMethod === ReIdMethod.APPEARANCE
            ? '#8B5CF6' // purple for appearance
            : null;

        // Draw main bounding box
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, w, h);

        // Draw re-ID indicator (corner marks) if person was re-identified
        if (hasReId && reIdColor) {
          ctx.strokeStyle = reIdColor;
          ctx.lineWidth = 4;
          const cornerSize = Math.min(w, h) * 0.15;

          // Top-left corner
          ctx.beginPath();
          ctx.moveTo(x, y + cornerSize);
          ctx.lineTo(x, y);
          ctx.lineTo(x + cornerSize, y);
          ctx.stroke();

          // Top-right corner
          ctx.beginPath();
          ctx.moveTo(x + w - cornerSize, y);
          ctx.lineTo(x + w, y);
          ctx.lineTo(x + w, y + cornerSize);
          ctx.stroke();

          // Bottom-left corner
          ctx.beginPath();
          ctx.moveTo(x, y + h - cornerSize);
          ctx.lineTo(x, y + h);
          ctx.lineTo(x + cornerSize, y + h);
          ctx.stroke();

          // Bottom-right corner
          ctx.beginPath();
          ctx.moveTo(x + w - cornerSize, y + h);
          ctx.lineTo(x + w, y + h);
          ctx.lineTo(x + w, y + h - cornerSize);
          ctx.stroke();
        }

        // Label background
        const labelWidth = hasReId ? Math.max(w, 100) : Math.max(w, 80);
        ctx.fillStyle = color;
        ctx.fillRect(x, y - 24, labelWidth, 22);

        // Label text
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 11px system-ui';
        const genderLabel =
          sex === Gender.MALE || sex === 'male'
            ? 'Male'
            : sex === Gender.FEMALE || sex === 'female'
              ? 'Female'
              : 'Person';
        const confidence = sexConfidence
          ? ` ${Math.round(sexConfidence * 100)}%`
          : '';
        const reIdLabel = hasReId
          ? ` [${reIdMethod === ReIdMethod.FACE ? 'Face' : 'Appear'}]`
          : '';
        ctx.fillText(`${genderLabel}${confidence}${reIdLabel}`, x + 4, y - 8);

        // Person ID indicator (bottom of bbox)
        if (detection.personId) {
          const shortId = detection.personId.slice(-6);
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(x, y + h, 60, 16);
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '10px monospace';
          ctx.fillText(`ID: ${shortId}`, x + 4, y + h + 12);
        }
      }

      requestAnimationFrame(drawFrame);
    };

    const animationId = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(animationId);
  }, [isDetecting, deduplication, videoRef]);

  const renderCameraState = (): JSX.Element | null => {
    if (cameraState === CameraState.IDLE) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 text-slate-500">
          <Camera size={64} className="opacity-50" />
          <p className="text-lg font-medium">Camera not started</p>
          <button
            type="button"
            onClick={() => {
              void handleStartCamera();
            }}
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
            onClick={() => {
              void handleStartCamera();
            }}
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
            onClick={() => {
              void handleStartCamera();
            }}
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
            onClick={() => {
              void handleStartCamera();
            }}
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
                onChange={(e) => {
                  void switchCamera(e.target.value);
                }}
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

      <section className={compactLayout ? 'space-y-4' : 'grid gap-4 xl:grid-cols-[1.4fr_1fr] xl:items-start'}>
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
                  onClick={() => {
                    void handleToggleDetection();
                  }}
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

          <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-slate-300 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700">
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
                  <>
                    <div className="absolute right-3 top-3 rounded-md bg-black/55 px-2 py-1 text-[11px] font-semibold text-emerald-300">
                      AI DETECTION ACTIVE | {fps} FPS
                    </div>
                    {deduplication.faceEmbeddingState === FaceEmbeddingState.LOADING && (
                      <div className="absolute right-3 top-10 flex items-center gap-1 rounded-md bg-amber-500/80 px-2 py-1 text-[10px] font-semibold text-white">
                        <Loader2 size={10} className="animate-spin" />
                        Loading Face Models...
                      </div>
                    )}
                  </>
                )}
                <div className="absolute left-3 bottom-3 flex items-center gap-2">
                  <div className="rounded-md bg-black/55 px-2 py-1 text-[11px] font-semibold text-slate-100">
                    {deduplication.stats.activeTracks} tracked
                  </div>
                  <div className="rounded-md bg-emerald-600/80 px-2 py-1 text-[11px] font-semibold text-white">
                    <UserCheck size={10} className="mr-1 inline" />
                    {deduplication.stats.uniquePersons} unique
                  </div>
                  {deduplication.stats.reIdRate > 0 && (
                    <div className="rounded-md bg-purple-600/80 px-2 py-1 text-[10px] font-semibold text-white">
                      {Math.round(deduplication.stats.reIdRate * 100)}% re-ID
                    </div>
                  )}
                </div>
              </>
            ) : (
              renderCameraState()
            )}
          </div>
        </div>

        {!compactLayout ? (
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
                <strong className="text-slate-800">{deduplication.stats.activeTracks}</strong>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2">
                <span className="text-sm text-blue-700">Male</span>
                <strong className="text-blue-800">{stats.maleCount}</strong>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-pink-50 px-3 py-2">
                <span className="text-sm text-pink-700">Female</span>
                <strong className="text-pink-800">{stats.femaleCount}</strong>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2">
                <span className="flex items-center gap-1 text-sm text-emerald-700">
                  <UserCheck size={14} /> Unique
                </span>
                <strong className="text-emerald-800">
                  {deduplication.stats.uniquePersons}
                </strong>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-sm text-slate-600">
                  Total Events
                </span>
                <strong className="text-slate-800">
                  {stats.totalDetections}
                </strong>
              </div>
            </div>
          </div>

          {/* Deduplication Stats Panel */}
          {showDeduplicationStats && (
            <div className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 to-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="flex items-center gap-1.5 text-sm font-semibold text-purple-800">
                  <Fingerprint size={14} />
                  Deduplication Stats
                </h4>
                <button
                  type="button"
                  onClick={() => setShowDeduplicationStats(false)}
                  className="text-xs text-purple-500 hover:text-purple-700"
                >
                  Hide
                </button>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-purple-700">Total Tracks (All Time)</span>
                  <strong className="text-purple-900">{deduplication.stats.totalTracks}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-purple-700">Active Tracks</span>
                  <strong className="text-purple-900">{deduplication.stats.activeTracks}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-purple-700">Dormant Tracks</span>
                  <strong className="text-purple-900">{deduplication.stats.dormantTracks}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-purple-700">Re-ID Success Rate</span>
                  <strong className="text-purple-900">
                    {Math.round(deduplication.stats.reIdRate * 100)}%
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-purple-700">Avg Processing Time</span>
                  <strong className="text-purple-900">
                    {Math.round(deduplication.stats.avgProcessingTime)}ms
                  </strong>
                </div>
                {deduplication.identityStats && (
                  <>
                    <div className="my-2 border-t border-purple-200" />
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-purple-700">
                        <Sparkles size={12} /> Face Re-IDs
                      </span>
                      <strong className="text-amber-700">
                        {deduplication.identityStats.reIdByMethod?.face || 0}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-purple-700">Appearance Re-IDs</span>
                      <strong className="text-purple-700">
                        {deduplication.identityStats.reIdByMethod?.appearance || 0}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-purple-700">Geometric Matches</span>
                      <strong className="text-slate-700">
                        {deduplication.identityStats.reIdByMethod?.geometric || 0}
                      </strong>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {!showDeduplicationStats && (
            <button
              type="button"
              onClick={() => setShowDeduplicationStats(true)}
              className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-purple-300 py-2 text-xs text-purple-600 hover:bg-purple-50"
            >
              <Fingerprint size={12} />
              Show Deduplication Stats
            </button>
          )}

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
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Deduplication</span>
                <span
                  className={`font-medium ${
                    deduplication.isInitialized
                      ? 'text-emerald-600'
                      : 'text-slate-400'
                  }`}
                >
                  {deduplication.isInitialized ? 'Active' : 'Not initialized'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Face Embedding</span>
                <span
                  className={`font-medium ${
                    deduplication.faceEmbeddingState === FaceEmbeddingState.READY
                      ? 'text-emerald-600'
                      : deduplication.faceEmbeddingState === FaceEmbeddingState.LOADING
                        ? 'text-amber-600'
                        : deduplication.faceEmbeddingState === FaceEmbeddingState.ERROR
                          ? 'text-red-600'
                          : 'text-slate-400'
                  }`}
                >
                  {deduplication.faceEmbeddingState === FaceEmbeddingState.READY
                    ? 'Ready'
                    : deduplication.faceEmbeddingState === FaceEmbeddingState.LOADING
                      ? `Loading (${Math.round(deduplication.faceModelProgress)}%)`
                      : deduplication.faceEmbeddingState === FaceEmbeddingState.ERROR
                        ? 'Error'
                        : 'Not loaded'}
                </span>
              </div>
            </div>
          </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
