/**
 * IP Camera view component for Mobile IP Webcam stream.
 * Displays proxied MJPEG stream with detection overlay support.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Camera,
  CheckCircle2,
  Loader2,
  PlayCircle,
  RefreshCw,
  Settings,
  Smartphone,
  Users,
  WifiOff,
  Zap,
} from 'lucide-react';
import {
  usePersonDetection,
  DetectionState,
  useGenderClassification,
  Gender,
  useDeduplication,
} from '../hooks';
import { ReIdMethod } from '../hooks/use-identity-registry';
import { sendDetectionBatch } from '../api/detection-api';
import { fetchCameraSource, setCameraSource, getCameraRelayUrl } from '../api/get-camera-stream';

const BATCH_INTERVAL_MS = 5000;
const MAX_BATCH_SIZE = 50;
const HEALTH_CHECK_INTERVAL_MS = 10000;

const SourceStatus = {
  ONLINE: 'online',
  DEGRADED: 'degraded',
  OFFLINE: 'offline',
  UNKNOWN: 'unknown',
};

export default function IPCameraView() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const batchBufferRef = useRef([]);
  const lastBatchTimeRef = useRef(Date.now());

  const [sourceState, setSourceState] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showDeduplicationStats, setShowDeduplicationStats] = useState(true);
  const [detectionLogs, setDetectionLogs] = useState([]);
  const [isDetectionActive, setIsDetectionActive] = useState(false);
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

  const fetchSourceState = useCallback(async () => {
    try {
      const data = await fetchCameraSource();
      setSourceState(data);
      return data;
    } catch (err) {
      console.error('Failed to fetch source state:', err);
      return null;
    }
  }, []);

  const switchToIPCamera = useCallback(async () => {
    setIsLoading(true);
    setStreamError(null);
    try {
      const result = await setCameraSource('ip_webcam');
      setSourceState(result);
      addDetectionLog('Switched to IP Webcam mode');
      return result;
    } catch (err) {
      setStreamError(`Failed to switch source: ${err.message}`);
      addDetectionLog(`Source switch failed: ${err.message}`);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [addDetectionLog]);

  const startIPStream = useCallback(async () => {
    setIsLoading(true);
    setStreamError(null);

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
  }, [sourceState, switchToIPCamera, loadGenderModel, deduplication, addDetectionLog]);

  const stopIPStream = useCallback(() => {
    setIsStreaming(false);
    if (isDetecting) {
      stopDetection();
    }
    setIsDetectionActive(false);
    addDetectionLog('IP webcam stream stopped');
  }, [isDetecting, stopDetection, addDetectionLog]);

  const handleToggleDetection = useCallback(async () => {
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
    fetchSourceState().finally(() => setIsLoading(false));
  }, [fetchSourceState]);

  // Health check polling
  useEffect(() => {
    if (!isStreaming) return;

    const interval = setInterval(() => {
      fetchSourceState().then((state) => {
        if (state && !state.health?.reachable) {
          setStreamError(state.health?.last_error || 'Connection lost');
        } else {
          setStreamError(null);
        }
      });
    }, HEALTH_CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isStreaming, fetchSourceState]);

  // Copy MJPEG frame to hidden video for detection
  useEffect(() => {
    if (!isStreaming || !imgRef.current || !videoRef.current) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const copyFrame = () => {
      if (!isStreaming) return;

      const img = imgRef.current;
      const video = videoRef.current;

      if (img.complete && img.naturalWidth > 0) {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);

        // Create data URL and set as video poster for detection
        // Note: For real detection, we'd need a different approach
        // This is a simplified version
      }

      requestAnimationFrame(copyFrame);
    };

    requestAnimationFrame(copyFrame);
  }, [isStreaming]);

  // Process detections (similar to live-camera-view)
  useEffect(() => {
    if (!isDetecting || !rawDetections.length || !videoRef.current) return;

    const processDetections = async () => {
      const deduplicatedDetections = await deduplication.processFrame(
        rawDetections,
        videoRef.current
      );

      const classified = isClassificationReady
        ? await classifyDetections(videoRef.current, deduplicatedDetections.map(d => ({
            ...d,
            bbox: d.bboxPercent || {
              x: (d.bbox.originX / videoRef.current.videoWidth) * 100,
              y: (d.bbox.originY / videoRef.current.videoHeight) * 100,
              w: (d.bbox.width / videoRef.current.videoWidth) * 100,
              h: (d.bbox.height / videoRef.current.videoHeight) * 100,
            },
          })))
        : deduplicatedDetections.map((d) => ({
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
          camera_id: 'cam_ip_webcam',
          track_id: detection.trackId,
          person_id: detection.personId,
          timestamp: new Date().toISOString(),
          sex: detection.sex,
          confidence_person: detection.confidence,
          confidence_sex: detection.sexConfidence || null,
          bbox_x: detection.bboxPercent?.x ?? detection.bbox?.x,
          bbox_y: detection.bboxPercent?.y ?? detection.bbox?.y,
          bbox_w: detection.bboxPercent?.w ?? detection.bbox?.w,
          bbox_h: detection.bboxPercent?.h ?? detection.bbox?.h,
          dwell_seconds: detection.dwellSeconds,
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
        addDetectionLog(`[${uniqueCount} unique] ${classified.length} detection(s): ${labels}`);
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
    rawDetections,
    videoRef,
    isClassificationReady,
    classifyDetections,
    addDetectionLog,
    flushBatch,
    deduplication,
  ]);

  const renderHealthStatus = () => {
    if (!sourceState?.health) return null;

    const { status, reachable, latency_ms, last_error } = sourceState.health;

    return (
      <div className="flex items-center gap-2">
        {status === SourceStatus.ONLINE ? (
          <CheckCircle2 size={16} className="text-emerald-500" />
        ) : status === SourceStatus.DEGRADED ? (
          <AlertCircle size={16} className="text-amber-500" />
        ) : (
          <WifiOff size={16} className="text-red-500" />
        )}
        <span className={`text-sm font-medium ${
          status === SourceStatus.ONLINE ? 'text-emerald-600' :
          status === SourceStatus.DEGRADED ? 'text-amber-600' :
          'text-red-600'
        }`}>
          {status === SourceStatus.ONLINE ? 'Connected' :
           status === SourceStatus.DEGRADED ? 'Degraded' :
           'Offline'}
        </span>
        {latency_ms && (
          <span className="text-xs text-slate-500">({Math.round(latency_ms)}ms)</span>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center rounded-xl border border-slate-200 bg-slate-900">
        <div className="flex flex-col items-center gap-4 text-slate-400">
          <Loader2 size={48} className="animate-spin" />
          <p>Loading IP camera configuration...</p>
        </div>
      </div>
    );
  }

  if (!isStreaming) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col items-center justify-center gap-6 p-12">
          <Smartphone size={64} className="text-slate-400" />
          <div className="text-center">
            <h3 className="text-xl font-semibold text-slate-800">Mobile IP Camera</h3>
            <p className="mt-2 text-slate-500">
              Connect to your Android IP Webcam for real-time detection
            </p>
          </div>

          {sourceState?.config && (
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-sm text-slate-600">
                <span className="font-medium">Configured URL:</span>{' '}
                {sourceState.config.ip_webcam_base_url}
              </p>
              {renderHealthStatus()}
            </div>
          )}

          {streamError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2 text-red-600">
              <AlertCircle size={16} />
              <span className="text-sm">{streamError}</span>
            </div>
          )}

          <button
            type="button"
            onClick={startIPStream}
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

        <div className="flex items-center gap-3">
          {isDetecting && (
            <div className="flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1">
              <Zap size={14} className="text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700">{fps} FPS</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleToggleDetection}
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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="relative lg:col-span-2">
          <div className="relative aspect-video overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
            {/* MJPEG stream image */}
            <img
              ref={imgRef}
              src={relayUrl}
              alt="IP Camera Stream"
              className="h-full w-full object-contain"
              onError={() => setStreamError('Stream connection failed')}
              onLoad={() => setStreamError(null)}
            />

            {/* Hidden video element for detection (if needed) */}
            <video
              ref={videoRef}
              className="hidden"
              muted
              playsInline
            />

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
                    onClick={startIPStream}
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
        <div className="space-y-4">
          {/* Deduplication stats */}
          {showDeduplicationStats && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Users size={18} className="text-emerald-600" />
                <h3 className="font-semibold text-slate-800">Detection Stats</h3>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Unique Persons</span>
                  <span className="font-bold text-emerald-600">
                    {deduplication.stats.uniquePersons}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Total Detections</span>
                  <span className="font-medium text-slate-700">{stats.totalDetections}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Male</span>
                  <span className="font-medium text-blue-600">{stats.maleCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Female</span>
                  <span className="font-medium text-pink-600">{stats.femaleCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Re-identifications</span>
                  <span className="font-medium text-amber-600">
                    {deduplication.stats.reIdentificationCount}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Detection logs */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 font-semibold text-slate-800">Activity Log</h3>
            <div className="h-64 overflow-y-auto rounded-lg bg-slate-50 p-2 font-mono text-xs">
              {detectionLogs.length === 0 ? (
                <p className="text-slate-400">No activity yet...</p>
              ) : (
                detectionLogs.map((log, idx) => (
                  <div key={idx} className="border-b border-slate-200 py-1 last:border-0">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
