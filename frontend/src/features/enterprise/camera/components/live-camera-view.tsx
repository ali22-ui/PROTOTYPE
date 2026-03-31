/**
 * Live camera component with webcam feed and AI detection.
 * Optimized for compact enterprise monitoring layout and accurate canvas overlay rendering.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CameraOff,
  Loader2,
  MonitorPlay,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  UserCheck,
  Zap,
} from 'lucide-react';
import {
  CameraState,
  usePersonDetection,
  DetectionState,
  useGenderClassification,
  Gender,
  useDeduplication,
} from '../hooks';
import { useGlobalCamera } from '../context/CameraContext';
import { FaceEmbeddingState } from '../hooks/use-face-embedding';
import { ReIdMethod } from '../hooks/use-identity-registry';
import { sendDetectionBatch } from '../api/detection-api';
import type { DetectionBatchEvent } from '../types';
import type { EnhancedTrack } from '../hooks/use-deduplication';

const BATCH_INTERVAL_MS = 5000;
const MAX_BATCH_SIZE = 50;
const FRAME_STALL_TIMEOUT_MS = 3000;
const BRAND_DARK = '#5C6F2B';
const BRAND_ACCENT = '#DE802B';

type StreamFrameState = 'idle' | 'receiving' | 'stalled' | 'blocked';

type OverlayDetection = EnhancedTrack & {
  sex?: 'male' | 'female' | 'unknown';
  sexConfidence?: number;
  gender?: string;
  genderConfidence?: number;
};

interface LiveCameraViewProps {
  compactLayout?: boolean;
}

export default function LiveCameraView({
  compactLayout = false,
}: LiveCameraViewProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const autoInitRef = useRef(false);
  const batchBufferRef = useRef<DetectionBatchEvent[]>([]);
  const lastBatchTimeRef = useRef(Date.now());
  const lastFrameAtRef = useRef(0);
  const lastVideoTimeRef = useRef(0);

  const [, setIsDetectionActive] = useState(false);
  const [detectionLogs, setDetectionLogs] = useState<string[]>([]);
  const [frameState, setFrameState] = useState<StreamFrameState>('idle');
  const [stats, setStats] = useState({
    totalDetections: 0,
    maleCount: 0,
    femaleCount: 0,
    unknownCount: 0,
  });

  const deduplication = useDeduplication({
    enableAppearance: true,
    enableFaceEmbedding: true,
    dormantTimeMs: 30000,
    appearanceThreshold: 0.65,
  });

  const {
    stream,
    state: cameraState,
    error: cameraError,
    streamInfo,
    isCameraRunning: isStreaming,
    startCamera,
    stopCamera,
  } = useGlobalCamera();

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

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    if (stream) {
      if (videoElement.srcObject !== stream) {
        videoElement.srcObject = stream;
      }
      void videoElement.play().catch(() => {
        setFrameState('blocked');
      });
      return;
    }

    lastFrameAtRef.current = 0;
    lastVideoTimeRef.current = 0;
    setFrameState('idle');
    videoElement.srcObject = null;
  }, [stream]);

  useEffect(() => {
    if (!isStreaming) {
      setFrameState('idle');
      return;
    }

    const videoElement = videoRef.current;
    if (!videoElement) {
      setFrameState('stalled');
      return;
    }

    const markFrameReceived = (): void => {
      lastFrameAtRef.current = Date.now();
      setFrameState((prev) => (prev === 'receiving' ? prev : 'receiving'));
    };

    const markBlocked = (): void => {
      setFrameState('blocked');
    };

    videoElement.addEventListener('loadeddata', markFrameReceived);
    videoElement.addEventListener('playing', markFrameReceived);
    videoElement.addEventListener('timeupdate', markFrameReceived);
    videoElement.addEventListener('error', markBlocked);

    const intervalId = window.setInterval(() => {
      if (!videoRef.current) {
        setFrameState('stalled');
        return;
      }

      const now = Date.now();
      const currentTime = videoRef.current.currentTime;

      if (videoRef.current.readyState >= 2 && currentTime > lastVideoTimeRef.current + 0.01) {
        lastVideoTimeRef.current = currentTime;
        markFrameReceived();
        return;
      }

      if (lastFrameAtRef.current === 0) {
        setFrameState('stalled');
        return;
      }

      if (now - lastFrameAtRef.current > FRAME_STALL_TIMEOUT_MS) {
        setFrameState((prev) => (prev === 'blocked' ? prev : 'stalled'));
      }
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
      videoElement.removeEventListener('loadeddata', markFrameReceived);
      videoElement.removeEventListener('playing', markFrameReceived);
      videoElement.removeEventListener('timeupdate', markFrameReceived);
      videoElement.removeEventListener('error', markBlocked);
    };
  }, [isStreaming]);

  const handleStartCamera = useCallback(async (): Promise<void> => {
    const success = await startCamera();
    if (success) {
      await loadGenderModel();
      await deduplication.initialize();
    }
  }, [startCamera, loadGenderModel, deduplication]);

  useEffect(() => {
    if (!isStreaming) {
      autoInitRef.current = false;
      return;
    }

    if (autoInitRef.current) {
      return;
    }

    autoInitRef.current = true;

    void (async (): Promise<void> => {
      if (!isClassificationReady) {
        await loadGenderModel();
      }

      if (!deduplication.isInitialized) {
        await deduplication.initialize();
      }
    })();
  }, [isStreaming, isClassificationReady, loadGenderModel, deduplication]);

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
      const message = err instanceof Error ? err.message : 'Unknown error';
      addDetectionLog(`Failed to send batch: ${message}`);
    }
  }, [addDetectionLog]);

  useEffect(() => {
    if (!isDetecting || !rawDetections.length || !videoRef.current) return;

    const processDetections = async (): Promise<void> => {
      const videoElement = videoRef.current;
      if (!videoElement) return;

      const deduplicatedDetections = await deduplication.processFrame(
        rawDetections,
        videoElement,
      );

      const detectionForClassification = deduplicatedDetections.map(
        (detection) => ({
          ...detection,
          dwellSeconds: detection.dwellSeconds ?? 0,
          bbox: detection.bboxPercent || {
            x: (detection.bbox.originX / (videoElement.videoWidth || 1)) * 100,
            y: (detection.bbox.originY / (videoElement.videoHeight || 1)) * 100,
            w: (detection.bbox.width / (videoElement.videoWidth || 1)) * 100,
            h: (detection.bbox.height / (videoElement.videoHeight || 1)) * 100,
          },
        }),
      );

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
        const normalizedBbox =
          detection.bboxPercent ||
          (detection.bbox && 'x' in detection.bbox
            ? detection.bbox
            : undefined);

        if (detection.sex === Gender.MALE) newMale += 1;
        else if (detection.sex === Gender.FEMALE) newFemale += 1;
        else newUnknown += 1;

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
          .map((detection) =>
            detection.sex === Gender.MALE
              ? 'Male'
              : detection.sex === Gender.FEMALE
                ? 'Female'
                : 'Unknown',
          )
          .join(', ');
        addDetectionLog(
          `[${uniqueCount} unique] ${classified.length} detection(s): ${labels}`,
        );
      }

      const now = Date.now();
      if (
        batchBufferRef.current.length >= MAX_BATCH_SIZE ||
        now - lastBatchTimeRef.current >= BATCH_INTERVAL_MS
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
    const preview = previewRef.current;

    if (!canvas || !video || !preview || !isDetecting) return undefined;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let animationFrameId = 0;

    const drawFrame = (): void => {
      if (!isDetecting) return;

      const containerW = video.offsetWidth || preview.clientWidth;
      const containerH = video.offsetHeight || preview.clientHeight;
      if (!containerW || !containerH) {
        animationFrameId = requestAnimationFrame(drawFrame);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const targetWidth = Math.max(1, Math.floor(containerW * dpr));
      const targetHeight = Math.max(1, Math.floor(containerH * dpr));

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, containerW, containerH);

      const videoW = video.videoWidth || 1;
      const videoH = video.videoHeight || 1;
      const scale = Math.min(containerW / videoW, containerH / videoH);
      const renderedW = videoW * scale;
      const renderedH = videoH * scale;
      const offsetX = (containerW - renderedW) / 2;
      const offsetY = (containerH - renderedH) / 2;

      const activeDetections =
        deduplication.getActiveDetections() as OverlayDetection[];

      for (const detection of activeDetections) {
        const bbox = detection.bboxPercent || detection.bbox;
        if (!bbox) continue;

        const boxX = 'x' in bbox ? (bbox.x / 100) * videoW : bbox.originX;
        const boxY = 'y' in bbox ? (bbox.y / 100) * videoH : bbox.originY;
        const boxW = 'w' in bbox ? (bbox.w / 100) * videoW : bbox.width;
        const boxH = 'h' in bbox ? (bbox.h / 100) * videoH : bbox.height;

        const x = offsetX + boxX * scale;
        const y = offsetY + boxY * scale;
        const w = boxW * scale;
        const h = boxH * scale;

        if (w <= 1 || h <= 1) continue;

        const sex = detection.sex || detection.gender || Gender.UNKNOWN;
        const isMale = sex === Gender.MALE || sex === 'male';
        const isFemale = sex === Gender.FEMALE || sex === 'female';
        const strokeColor = isMale
          ? BRAND_DARK
          : isFemale
            ? BRAND_ACCENT
            : BRAND_DARK;

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(x, y, w, h);

        const hasReId =
          detection.reIdMethod && detection.reIdMethod !== ReIdMethod.NONE;
        if (hasReId) {
          const corner = Math.min(w, h) * 0.14;
          ctx.strokeStyle = BRAND_ACCENT;
          ctx.lineWidth = 3;

          ctx.beginPath();
          ctx.moveTo(x, y + corner);
          ctx.lineTo(x, y);
          ctx.lineTo(x + corner, y);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(x + w - corner, y);
          ctx.lineTo(x + w, y);
          ctx.lineTo(x + w, y + corner);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(x, y + h - corner);
          ctx.lineTo(x, y + h);
          ctx.lineTo(x + corner, y + h);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(x + w - corner, y + h);
          ctx.lineTo(x + w, y + h);
          ctx.lineTo(x + w, y + h - corner);
          ctx.stroke();
        }

        const confidence =
          detection.sexConfidence || detection.genderConfidence;
        const label = `${isMale ? 'Male' : isFemale ? 'Female' : 'Person'}${
          confidence ? ` ${Math.round(confidence * 100)}%` : ''
        }`;

        ctx.fillStyle = strokeColor;
        ctx.fillRect(x, Math.max(0, y - 24), Math.max(86, w * 0.5), 20);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 11px Inter, system-ui, sans-serif';
        ctx.fillText(label, x + 6, Math.max(12, y - 10));

        if (detection.personId) {
          const shortId = detection.personId.slice(-6);
          ctx.fillStyle = 'rgba(0,0,0,0.58)';
          ctx.fillRect(x, y + h, 72, 16);
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '10px monospace';
          ctx.fillText(`ID:${shortId}`, x + 5, y + h + 12);
        }
      }

      animationFrameId = requestAnimationFrame(drawFrame);
    };

    animationFrameId = requestAnimationFrame(drawFrame);

    return () => {
      cancelAnimationFrame(animationFrameId);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [isDetecting, deduplication, videoRef]);

  const renderCameraState = (): JSX.Element | null => {
    if (cameraState === CameraState.IDLE) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 text-brand-dark/70">
          <Camera size={58} className="opacity-60" />
          <p className="text-base font-semibold text-brand-dark">
            Camera not started
          </p>
          <button
            type="button"
            onClick={() => {
              void handleStartCamera();
            }}
            className="flex items-center gap-2 rounded-lg bg-brand-dark px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark/90"
          >
            <PlayCircle size={18} />
            Start Camera
          </button>
        </div>
      );
    }

    if (cameraState === CameraState.REQUESTING) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-brand-dark/70">
          <Loader2 size={46} className="animate-spin" />
          <p className="text-sm font-medium">Requesting camera access...</p>
        </div>
      );
    }

    if (cameraState === CameraState.DENIED) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-brand-dark">
          <CameraOff size={56} className="text-brand-accent" />
          <p className="text-sm font-semibold">Camera access denied</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 rounded-lg border border-brand-mid/70 bg-white px-4 py-2 text-xs font-semibold text-brand-dark hover:bg-brand-bg"
          >
            <RefreshCw size={14} />
            Refresh Page
          </button>
        </div>
      );
    }

    if (
      cameraState === CameraState.NOT_FOUND ||
      cameraState === CameraState.IN_USE ||
      cameraState === CameraState.NOT_SUPPORTED ||
      cameraState === CameraState.ERROR
    ) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-brand-dark">
          <AlertCircle size={56} className="text-brand-accent" />
          <p className="text-sm font-semibold">
            {cameraError?.message || 'Camera unavailable'}
          </p>
          <button
            type="button"
            onClick={() => {
              void handleStartCamera();
            }}
            className="flex items-center gap-2 rounded-lg border border-brand-mid/70 bg-white px-4 py-2 text-xs font-semibold text-brand-dark hover:bg-brand-bg"
          >
            <RefreshCw size={14} />
            Try Again
          </button>
        </div>
      );
    }

    return null;
  };

  const detectionStatusLabel =
    detectionState === DetectionState.RUNNING
      ? 'Running'
      : detectionState === DetectionState.READY
        ? 'Ready'
        : detectionState === DetectionState.LOADING
          ? 'Loading'
          : 'Idle';

  const frameStatusLabel =
    frameState === 'receiving'
      ? 'Receiving'
      : frameState === 'stalled'
        ? 'Stalled'
        : frameState === 'blocked'
          ? 'Blocked'
          : 'Idle';

  const transportStatusLabel =
    cameraState === CameraState.REQUESTING
      ? 'Connecting'
      : isStreaming
        ? 'Connected'
        : cameraState === CameraState.ERROR
          ? 'Error'
          : 'Disconnected';

  const overallStatusLabel =
    !isStreaming
      ? 'Offline'
      : frameState === 'receiving'
        ? 'Connected'
        : frameState === 'blocked'
          ? 'Blocked'
          : 'Degraded';

  const aiStatusLabel =
    detectionState === DetectionState.ERROR
    || deduplication.faceEmbeddingState === FaceEmbeddingState.ERROR
      ? 'Error'
      : detectionState === DetectionState.LOADING
      || deduplication.faceEmbeddingState === FaceEmbeddingState.LOADING
        ? 'Loading'
        : isClassificationReady && deduplication.isInitialized
          ? 'Ready'
          : 'Idle';

  return (
    <div className="space-y-3">
      <article className="rounded-xl border border-brand-mid/70 bg-white p-3 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MonitorPlay size={16} className="text-brand-dark" />
            <p className="text-sm font-semibold text-brand-dark">
              {isStreaming ? 'Live Webcam Feed' : 'Camera Preview'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isStreaming ? (
              <button
                type="button"
                onClick={() => {
                  void handleStartCamera();
                }}
                className="flex items-center gap-1 rounded-lg bg-brand-dark px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark/90"
              >
                <PlayCircle size={14} />
                Start Camera
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    void handleToggleDetection();
                  }}
                  className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    isDetecting
                      ? 'border border-brand-accent/50 bg-brand-accent/10 text-brand-accent hover:bg-brand-accent/20'
                      : 'bg-brand-dark text-white hover:bg-brand-dark/90'
                  }`}
                >
                  {isDetecting ? <PauseCircle size={14} /> : <Zap size={14} />}
                  {isDetecting ? 'Stop Detection' : 'Start Detection'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    stopDetection();
                    stopCamera();
                    setIsDetectionActive(false);
                  }}
                  className="flex items-center gap-1 rounded-lg border border-brand-mid/70 bg-white px-3 py-1.5 text-xs font-semibold text-brand-dark hover:bg-brand-bg"
                >
                  <CameraOff size={14} />
                  Stop Camera
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mx-auto w-full max-w-lg">
          <div
            ref={previewRef}
            className="relative aspect-square w-full overflow-hidden rounded-xl border border-brand-mid/70 bg-black"
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`absolute inset-0 h-full w-full object-contain ${isStreaming ? 'block' : 'hidden'}`}
            />

            {isStreaming ? (
              <>
                <canvas
                  ref={canvasRef}
                  className="pointer-events-none absolute inset-0 z-10 h-full w-full object-contain"
                />

                <div className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-1 text-[10px] font-semibold text-white">
                  LIVE | {streamInfo.width}x{streamInfo.height}
                </div>

                {isDetecting ? (
                  <div className="absolute right-2 top-2 rounded-md bg-black/60 px-2 py-1 text-[10px] font-semibold text-[#F9D6B9]">
                    AI ACTIVE · {fps} FPS
                  </div>
                ) : null}

                <div className="absolute bottom-2 left-2 flex items-center gap-2">
                  <div className="rounded-md bg-black/60 px-2 py-1 text-[10px] font-semibold text-white">
                    {deduplication.stats.activeTracks} tracked
                  </div>
                  <div className="rounded-md bg-brand-dark/90 px-2 py-1 text-[10px] font-semibold text-white">
                    <UserCheck size={10} className="mr-1 inline" />
                    {deduplication.stats.uniquePersons} unique
                  </div>
                </div>
              </>
            ) : (
              renderCameraState()
            )}
          </div>
        </div>
      </article>

      {!compactLayout ? (
        <section className="grid gap-3 lg:grid-cols-2">
          <article className="rounded-xl border border-brand-mid/70 bg-white p-3 shadow-sm">
            <h4 className="text-sm font-semibold text-brand-dark">
              Detection Activity
            </h4>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg border border-brand-mid/70 bg-brand-bg px-3 py-2">
                <p className="text-xs text-brand-dark/70">FPS</p>
                <p className="font-bold text-brand-dark">{fps}</p>
              </div>
              <div className="rounded-lg border border-brand-mid/70 bg-brand-bg px-3 py-2">
                <p className="text-xs text-brand-dark/70">Tracked</p>
                <p className="font-bold text-brand-dark">
                  {deduplication.stats.activeTracks}
                </p>
              </div>
              <div className="rounded-lg border border-brand-mid/70 bg-brand-bg px-3 py-2">
                <p className="text-xs text-brand-dark/70">Male</p>
                <p className="font-bold text-brand-dark">{stats.maleCount}</p>
              </div>
              <div className="rounded-lg border border-brand-mid/70 bg-brand-bg px-3 py-2">
                <p className="text-xs text-brand-dark/70">Female</p>
                <p className="font-bold text-brand-dark">{stats.femaleCount}</p>
              </div>
              <div className="rounded-lg border border-brand-mid/70 bg-brand-bg px-3 py-2">
                <p className="text-xs text-brand-dark/70">Unknown</p>
                <p className="font-bold text-brand-dark">
                  {stats.unknownCount}
                </p>
              </div>
              <div className="rounded-lg border border-brand-mid/70 bg-brand-bg px-3 py-2">
                <p className="text-xs text-brand-dark/70">Total Events</p>
                <p className="font-bold text-brand-dark">
                  {stats.totalDetections}
                </p>
              </div>
            </div>
          </article>

          <article className="rounded-xl border border-brand-mid/70 bg-white p-3 shadow-sm">
            <h4 className="text-sm font-semibold text-brand-dark">
              System Status
            </h4>
            <div className="mt-3 space-y-2 text-sm text-brand-dark">
              <div className="flex items-center justify-between">
                <span>Overall</span>
                <span className="font-semibold">{overallStatusLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Transport</span>
                <span className="font-semibold">
                  {transportStatusLabel}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Frame State</span>
                <span className="font-semibold">{frameStatusLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Person Detection</span>
                <span className="font-semibold">{detectionStatusLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>AI Readiness</span>
                <span className="font-semibold">{aiStatusLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Gender Classification</span>
                <span className="font-semibold">
                  {isClassificationReady ? 'Ready' : 'Not loaded'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Deduplication</span>
                <span className="font-semibold">
                  {deduplication.isInitialized ? 'Active' : 'Not initialized'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Face Embedding</span>
                <span className="font-semibold">
                  {deduplication.faceEmbeddingState === FaceEmbeddingState.READY
                    ? 'Ready'
                    : deduplication.faceEmbeddingState ===
                        FaceEmbeddingState.LOADING
                      ? 'Loading'
                      : deduplication.faceEmbeddingState ===
                          FaceEmbeddingState.ERROR
                        ? 'Error'
                        : 'Not loaded'}
                </span>
              </div>
            </div>
          </article>

          <article className="lg:col-span-2 rounded-xl border border-brand-mid/70 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-brand-dark">
                Detection Log
              </h4>
              <span className="rounded-md border border-brand-mid/70 bg-brand-bg px-2 py-1 text-[10px] font-semibold text-brand-dark">
                {detectionLogs.length} entries
              </span>
            </div>

            <ul className="max-h-55 space-y-1 overflow-y-auto pr-1 text-xs text-brand-dark/85">
              {detectionLogs.length === 0 ? (
                <li className="rounded-md border border-brand-mid/70 bg-brand-bg px-2 py-2 text-center text-brand-dark/60">
                  No detections yet. Start the camera and enable detection.
                </li>
              ) : (
                detectionLogs.map((log, index) => (
                  <li
                    key={`${log}-${index}`}
                    className="rounded-md border border-brand-mid/70 bg-brand-bg px-2 py-1.5"
                  >
                    {log}
                  </li>
                ))
              )}
            </ul>
          </article>
        </section>
      ) : null}
    </div>
  );
}
