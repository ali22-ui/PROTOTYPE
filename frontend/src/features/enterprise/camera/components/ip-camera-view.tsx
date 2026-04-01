/**
 * IP Camera view component for Mobile IP Webcam stream.
 * Displays proxied MJPEG stream with detection overlay support.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Loader2,
  PlayCircle,
  RefreshCw,
  Smartphone,
  Users,
  WifiOff,
  Zap,
} from 'lucide-react';
import {
  usePersonDetection,
  useGenderClassification,
  Gender,
  useDeduplication,
} from '../hooks';
import { FaceEmbeddingState } from '../hooks/use-face-embedding';
import { sendDetectionBatch } from '../api/detection-api';
import {
  fetchCameraSource,
  setCameraSource,
  getCameraRelayUrl,
} from '../api/get-camera-stream';
import type {
  CameraDetectionStats,
  CameraSourceState,
  DetectionBatchEvent,
} from '../types';

const BATCH_INTERVAL_MS = 5000;
const MAX_BATCH_SIZE = 50;
const HEALTH_CHECK_INTERVAL_MS = 10000;
const FRAME_STALL_TIMEOUT_MS = 3000;

const SourceStatus = {
  ONLINE: 'online',
  DEGRADED: 'degraded',
  OFFLINE: 'offline',
} as const;

interface IPCameraViewProps {
  compactLayout?: boolean;
  onStatsChange?: (stats: CameraDetectionStats) => void;
}

export default function IPCameraView({
  compactLayout = false,
  onStatsChange,
}: IPCameraViewProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const processingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const processingStreamRef = useRef<MediaStream | null>(null);
  const lastFrameAtRef = useRef(0);
  const batchBufferRef = useRef<DetectionBatchEvent[]>([]);
  const lastBatchTimeRef = useRef(Date.now());

  const [sourceState, setSourceState] = useState<CameraSourceState | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [frameState, setFrameState] = useState<
    'idle' | 'receiving' | 'stalled' | 'blocked'
  >('idle');
  const [showDeduplicationStats] = useState(true);
  const [detectionLogs, setDetectionLogs] = useState<string[]>([]);
  const [, setIsDetectionActive] = useState(false);
  const [stats, setStats] = useState({
    totalDetections: 0,
    maleCount: 0,
    femaleCount: 0,
    unknownCount: 0,
  });
  const [totalEventCount, setTotalEventCount] = useState(0);

  const deduplication = useDeduplication({
    enableAppearance: true,
    enableFaceEmbedding: true,
    dormantTimeMs: 30000,
    appearanceThreshold: 0.65,
  });

  const {
    detections: rawDetections,
    fps,
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

  const addDetectionLog = useCallback((message: string): void => {
    const timestamp = new Date().toLocaleTimeString();
    setTotalEventCount((prev) => prev + 1);
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
      const response = await sendDetectionBatch(batch);
      const failedCount = response.failed_count ?? 0;
      const insertedCount = response.inserted_count ?? 0;

      if (failedCount > 0) {
        const summary = response.error_summary
          ? ` (${response.error_summary})`
          : '';
        addDetectionLog(
          `Partial persistence: inserted ${insertedCount}, failed ${failedCount}.${summary}`,
        );
      } else {
        addDetectionLog(
          `Persisted batch: inserted ${insertedCount} detections`,
        );
      }
    } catch (err: unknown) {
      console.error('Failed to send detection batch:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      addDetectionLog(`Failed to send batch: ${message}`);
    }
  }, [addDetectionLog]);

  const fetchSourceState =
    useCallback(async (): Promise<CameraSourceState | null> => {
      try {
        const data = await fetchCameraSource();
        setSourceState(data);
        return data;
      } catch (err) {
        console.error('Failed to fetch source state:', err);
        return null;
      }
    }, []);

  const switchToIPCamera =
    useCallback(async (): Promise<CameraSourceState | null> => {
      setIsLoading(true);
      setStreamError(null);
      try {
        const result = await setCameraSource('ip_webcam');
        setSourceState(result);
        addDetectionLog('Switched to IP Webcam mode');
        return result;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setStreamError(`Failed to switch source: ${message}`);
        addDetectionLog(`Source switch failed: ${message}`);
        return null;
      } finally {
        setIsLoading(false);
      }
    }, [addDetectionLog]);

  const startIPStream = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setStreamError(null);
    setFrameState('stalled');

    // Switch to ip_webcam mode if not already
    let state = sourceState;
    if (!state || state.source_mode !== 'ip_webcam') {
      state = await switchToIPCamera();
      if (!state) {
        setIsLoading(false);
        return;
      }
    }

    // Check health
    if (!state.health?.reachable) {
      setStreamError(state.health?.last_error || 'IP camera not reachable');
      setIsLoading(false);
      return;
    }

    // Load models
    await loadGenderModel();
    await deduplication.initialize();

    setIsStreaming(true);
    setIsLoading(false);
    addDetectionLog('IP webcam stream started');
  }, [
    sourceState,
    switchToIPCamera,
    loadGenderModel,
    deduplication,
    addDetectionLog,
  ]);

  const stopIPStream = useCallback((): void => {
    setIsStreaming(false);
    setFrameState('idle');
    lastFrameAtRef.current = 0;

    if (processingStreamRef.current) {
      processingStreamRef.current.getTracks().forEach((track) => track.stop());
      processingStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (isDetecting) {
      stopDetection();
    }
    setIsDetectionActive(false);
    addDetectionLog('IP webcam stream stopped');
  }, [isDetecting, stopDetection, addDetectionLog]);

  const handleToggleDetection = useCallback(async (): Promise<void> => {
    if (isDetecting) {
      stopDetection();
      setIsDetectionActive(false);
    } else {
      const success = await startDetection();
      setIsDetectionActive(success);
    }
  }, [isDetecting, startDetection, stopDetection]);

  // Initial fetch of source state
  useEffect(() => {
    void fetchSourceState().finally(() => setIsLoading(false));
  }, [fetchSourceState]);

  // Health check polling
  useEffect(() => {
    if (!isStreaming) return undefined;

    const interval = setInterval(() => {
      void fetchSourceState().then((state) => {
        if (state && !state.health?.reachable) {
          setStreamError(state.health?.last_error || 'Connection lost');
        } else {
          setStreamError(null);
        }
      });
    }, HEALTH_CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isStreaming, fetchSourceState]);

  // Copy MJPEG frames into a canvas-captured stream so detection hooks can read real video frames.
  useEffect(() => {
    if (!isStreaming || !imgRef.current || !videoRef.current) return;

    const processingCanvas = document.createElement('canvas');
    const ctx = processingCanvas.getContext('2d');
    if (!ctx) return;

    processingCanvasRef.current = processingCanvas;
    const frameStream = processingCanvas.captureStream(15);
    processingStreamRef.current = frameStream;

    if (videoRef.current.srcObject !== frameStream) {
      videoRef.current.srcObject = frameStream;
    }

    void videoRef.current.play().catch(() => {
      setFrameState('blocked');
      setStreamError('Unable to initialize processing stream');
    });

    let animationFrameId = 0;

    const copyFrame = (): void => {
      if (!isStreaming) return;

      const img = imgRef.current;

      if (img && img.complete && img.naturalWidth > 0) {
        processingCanvas.width = img.naturalWidth;
        processingCanvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);

        lastFrameAtRef.current = Date.now();
        setFrameState((prev) => (prev === 'receiving' ? prev : 'receiving'));
      }

      animationFrameId = requestAnimationFrame(copyFrame);
    };

    animationFrameId = requestAnimationFrame(copyFrame);

    return () => {
      cancelAnimationFrame(animationFrameId);

      if (videoRef.current?.srcObject === frameStream) {
        videoRef.current.srcObject = null;
      }

      frameStream.getTracks().forEach((track) => track.stop());
      processingStreamRef.current = null;
    };
  }, [isStreaming]);

  useEffect(() => {
    if (!isStreaming) {
      setFrameState('idle');
      return;
    }

    const intervalId = window.setInterval(() => {
      if (lastFrameAtRef.current === 0) {
        setFrameState((prev) => (prev === 'blocked' ? prev : 'stalled'));
        return;
      }

      if (Date.now() - lastFrameAtRef.current > FRAME_STALL_TIMEOUT_MS) {
        setFrameState((prev) => (prev === 'blocked' ? prev : 'stalled'));
      }
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isStreaming]);

  // Process detections (similar to live-camera-view)
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
          camera_id: 'cam_ip_webcam',
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
              `${d.sex === Gender.MALE ? 'Male' : d.sex === Gender.FEMALE ? 'Female' : 'Unknown'}`,
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

  const renderHealthStatus = (forDarkSurface = false): JSX.Element | null => {
    if (!sourceState?.health) return null;

    const { status, latency_ms: latencyMs } = sourceState.health;

    return (
      <div className="flex items-center gap-2">
        {status === SourceStatus.ONLINE ? (
          <CheckCircle2 size={16} className="text-emerald-500" />
        ) : status === SourceStatus.DEGRADED ? (
          <AlertCircle size={16} className="text-amber-500" />
        ) : (
          <WifiOff size={16} className="text-red-500" />
        )}
        <span
          className={`text-sm font-medium ${
            status === SourceStatus.ONLINE
              ? 'text-emerald-600'
              : status === SourceStatus.DEGRADED
                ? 'text-amber-600'
                : 'text-red-600'
          }`}
        >
          {status === SourceStatus.ONLINE
            ? 'Connected'
            : status === SourceStatus.DEGRADED
              ? 'Degraded'
              : 'Offline'}
        </span>
        {latencyMs && (
          <span
            className={`text-xs ${forDarkSurface ? 'text-slate-300/80' : 'text-slate-500'}`}
          >
            ({Math.round(latencyMs)}ms)
          </span>
        )}
      </div>
    );
  };

  const trackedCount = deduplication.stats.activeTracks;
  const uniqueCount = deduplication.stats.uniquePersons;

  useEffect(() => {
    if (!onStatsChange) {
      return;
    }

    onStatsChange({
      fps: Number.isFinite(fps) ? Math.max(0, Math.round(fps)) : 0,
      tracked: trackedCount,
      male: stats.maleCount,
      female: stats.femaleCount,
      unique: uniqueCount,
      totalEvents: totalEventCount,
    });
  }, [
    onStatsChange,
    fps,
    trackedCount,
    stats.maleCount,
    stats.femaleCount,
    uniqueCount,
    totalEventCount,
  ]);

  if (isLoading) {
    return (
      <div className="relative flex aspect-video w-full flex-col items-center justify-center overflow-hidden rounded-lg bg-black shadow-inner">
        <div className="flex flex-col items-center gap-4 text-slate-400">
          <Loader2 size={48} className="animate-spin" />
          <p>Loading IP camera configuration...</p>
        </div>
      </div>
    );
  }

  if (!isStreaming) {
    return (
      <div className="relative flex aspect-video w-full flex-col items-center justify-center overflow-hidden rounded-lg bg-black shadow-inner">
        <div className="z-10 flex w-full max-w-lg flex-col items-center gap-4 px-6 text-center">
          <Smartphone size={56} className="text-slate-300" />

          <div>
            <h3 className="text-xl font-semibold text-white">
              Mobile IP Camera
            </h3>
            <p className="mt-2 text-sm text-slate-300">
              Connect your Android IP Webcam for real-time detection.
            </p>
          </div>

          {sourceState?.config && (
            <div className="w-full rounded-lg border border-slate-600 bg-slate-800/65 p-3 text-left">
              <p className="truncate text-sm text-slate-200">
                <span className="font-medium">Configured URL:</span>{' '}
                {sourceState.config.ip_webcam_base_url}
              </p>
              <div className="mt-2">{renderHealthStatus(true)}</div>
            </div>
          )}

          {streamError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-400/40 bg-red-500/15 px-4 py-2 text-red-200">
              <AlertCircle size={16} />
              <span className="text-sm">{streamError}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              void startIPStream();
            }}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700"
          >
            <PlayCircle size={20} />
            Start IP Camera
          </button>
        </div>
      </div>
    );
  }

  const relayUrl = getCameraRelayUrl();

  const transportStatusLabel =
    sourceState?.health?.status === SourceStatus.ONLINE
      ? 'Connected'
      : sourceState?.health?.status === SourceStatus.DEGRADED
        ? 'Degraded'
        : sourceState?.health?.status === SourceStatus.OFFLINE
          ? 'Offline'
          : 'Connecting';

  const frameStatusLabel =
    frameState === 'receiving'
      ? 'Receiving'
      : frameState === 'stalled'
        ? 'Stalled'
        : frameState === 'blocked'
          ? 'Blocked'
          : 'Idle';

  const aiStatusLabel =
    deduplication.faceEmbeddingState === FaceEmbeddingState.ERROR
      ? 'Error'
      : deduplication.faceEmbeddingState === FaceEmbeddingState.LOADING
        ? 'Loading'
        : isClassificationReady && deduplication.isInitialized
          ? 'Ready'
          : 'Idle';

  const overallStatusLabel =
    frameState === 'receiving'
      ? 'Connected'
      : frameState === 'blocked'
        ? 'Blocked'
        : transportStatusLabel === 'Connected' ||
            transportStatusLabel === 'Degraded'
          ? 'Degraded'
          : 'Offline';

  const handleImageLoad = (): void => {
    setStreamError(null);
    lastFrameAtRef.current = Date.now();
    setFrameState((prev) => (prev === 'receiving' ? prev : 'receiving'));
  };

  const handleImageError = (): void => {
    setFrameState('blocked');
    setStreamError('Stream blocked or unavailable');
  };

  return (
    <div className="space-y-4">
      {/* Header with controls */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Activity size={20} className="text-emerald-500" />
            <span className="font-medium text-slate-700">Mobile IP Camera</span>
          </div>
          {renderHealthStatus()}
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <p>
            <span className="font-semibold">Overall:</span> {overallStatusLabel}
          </p>
          <p>
            <span className="font-semibold">Transport:</span>{' '}
            {transportStatusLabel}
          </p>
          <p>
            <span className="font-semibold">Frame:</span> {frameStatusLabel}
          </p>
          <p>
            <span className="font-semibold">AI:</span> {aiStatusLabel}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isDetecting && (
            <div className="flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1">
              <Zap size={14} className="text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700">
                {fps} FPS
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              void handleToggleDetection();
            }}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              isDetecting
                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {isDetecting ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                Stop Detection
              </>
            ) : (
              <>
                <Zap size={16} />
                Start Detection
              </>
            )}
          </button>

          <button
            type="button"
            onClick={stopIPStream}
            className="flex items-center gap-2 rounded-lg bg-red-100 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-200"
          >
            Stop Stream
          </button>
        </div>
      </div>

      {/* Video stream */}
      <div
        className={
          compactLayout
            ? 'space-y-4'
            : 'grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start'
        }
      >
        <div className={compactLayout ? 'relative' : 'relative lg:col-span-2'}>
          <div className="relative flex aspect-video w-full flex-col items-center justify-center overflow-hidden rounded-lg bg-black shadow-inner">
            {/* MJPEG stream image */}
            <img
              ref={imgRef}
              src={relayUrl}
              alt="IP Camera Stream"
              className="h-full w-full object-contain"
              onError={handleImageError}
              onLoad={handleImageLoad}
            />

            {/* Hidden video element for detection (if needed) */}
            <video ref={videoRef} className="hidden" muted playsInline />

            {/* Detection overlay canvas */}
            <canvas
              ref={canvasRef}
              className="pointer-events-none absolute inset-0 h-full w-full"
            />

            {streamError && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                <div className="flex flex-col items-center gap-2 text-white">
                  <WifiOff size={48} />
                  <p className="text-lg font-medium">{streamError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      void startIPStream();
                    }}
                    className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm hover:bg-emerald-700"
                  >
                    Retry Connection
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Stats sidebar */}
        {!compactLayout ? (
          <div className="space-y-4">
            {/* Deduplication stats */}
            {showDeduplicationStats && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <Users size={18} className="text-emerald-600" />
                  <h3 className="font-semibold text-slate-800">
                    Detection Stats
                  </h3>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">
                      Unique Persons
                    </span>
                    <span className="font-bold text-emerald-600">
                      {uniqueCount}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">
                      Total Detections
                    </span>
                    <span className="font-medium text-slate-700">
                      {totalEventCount}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Male</span>
                    <span className="font-medium text-blue-600">
                      {stats.maleCount}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Female</span>
                    <span className="font-medium text-pink-600">
                      {stats.femaleCount}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">
                      Re-identifications
                    </span>
                    <span className="font-medium text-amber-600">
                      {deduplication.stats.reIdentificationCount}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Detection logs */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 font-semibold text-slate-800">
                Activity Log
              </h3>
              <div className="h-64 overflow-y-auto rounded-lg bg-slate-50 p-2 font-mono text-xs">
                {detectionLogs.length === 0 ? (
                  <p className="text-slate-400">No activity yet...</p>
                ) : (
                  detectionLogs.map((log, idx) => (
                    <div
                      key={idx}
                      className="border-b border-slate-200 py-1 last:border-0"
                    >
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
