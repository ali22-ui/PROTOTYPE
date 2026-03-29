/**
 * Camera access and management hook.
 * Handles webcam permissions, device selection, and video stream.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const CAMERA_STORAGE_KEY = 'lgu-dashboard-selected-camera';

/**
 * Camera permission and device states.
 */
export const CameraState = {
  IDLE: 'idle',
  REQUESTING: 'requesting',
  GRANTED: 'granted',
  DENIED: 'denied',
  NOT_FOUND: 'not_found',
  IN_USE: 'in_use',
  NOT_SUPPORTED: 'not_supported',
  ERROR: 'error',
} as const;

export type CameraStateValue = (typeof CameraState)[keyof typeof CameraState];

/**
 * Check if browser supports camera access.
 */
export const isCameraSupported = (): boolean => {
  return !!(
    navigator.mediaDevices
    && typeof navigator.mediaDevices.getUserMedia === 'function'
  );
};

export interface UseCameraOptions {
  autoStart?: boolean;
  preferredResolution?: 'hd' | 'fhd' | 'sd';
}

export interface CameraStreamInfo {
  width: number;
  height: number;
  frameRate: number;
}

/**
 * Hook for managing camera access and video stream.
 * @param options - Configuration options
 * @param options.autoStart - Auto-start camera on mount
 * @param options.preferredResolution - Preferred resolution ('hd', 'fhd', 'sd')
 * @returns Camera state and controls
 */
export function useCamera({
  autoStart = false,
  preferredResolution = 'hd',
}: UseCameraOptions = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [state, setState] = useState<CameraStateValue>(CameraState.IDLE);
  const [error, setError] = useState<Error | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(CAMERA_STORAGE_KEY) || '';
    }
    return '';
  });
  const [streamInfo, setStreamInfo] = useState<CameraStreamInfo>({
    width: 0,
    height: 0,
    frameRate: 0,
  });

  const getResolutionConstraints = useCallback((): MediaTrackConstraints => {
    switch (preferredResolution) {
      case 'fhd':
        return { width: { ideal: 1920 }, height: { ideal: 1080 } };
      case 'sd':
        return { width: { ideal: 640 }, height: { ideal: 480 } };
      case 'hd':
      default:
        return { width: { ideal: 1280 }, height: { ideal: 720 } };
    }
  }, [preferredResolution]);

  const enumerateDevices = useCallback(async (): Promise<MediaDeviceInfo[]> => {
    if (!isCameraSupported()) {
      return [];
    }

    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter(
        (device) => device.kind === 'videoinput',
      );
      setDevices(videoDevices);
      return videoDevices;
    } catch (err) {
      console.error('Failed to enumerate devices:', err);
      return [];
    }
  }, []);

  const stopStream = useCallback((): void => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStream(null);
    setStreamInfo({ width: 0, height: 0, frameRate: 0 });
    setState(CameraState.IDLE);
  }, []);

  const startStream = useCallback(
    async (deviceId = selectedDeviceId): Promise<boolean> => {
      if (!isCameraSupported()) {
        setState(CameraState.NOT_SUPPORTED);
        setError(new Error('Camera not supported in this browser'));
        return false;
      }

      // Stop existing stream first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      setState(CameraState.REQUESTING);
      setError(null);

      try {
        const constraints: MediaStreamConstraints = {
          video: {
            ...getResolutionConstraints(),
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          },
          audio: false,
        };

        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = newStream;
        setStream(newStream);

        const videoTrack = newStream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();
        setStreamInfo({
          width: settings.width || 0,
          height: settings.height || 0,
          frameRate: settings.frameRate || 0,
        });

        const usedDeviceId = settings.deviceId || deviceId;
        if (usedDeviceId) {
          setSelectedDeviceId(usedDeviceId);
          localStorage.setItem(CAMERA_STORAGE_KEY, usedDeviceId);
        }

        await enumerateDevices();
        setState(CameraState.GRANTED);
        return true;
      } catch (err: unknown) {
        console.error('Camera access error:', err);
        const domErr = err as DOMException;
        setError(domErr instanceof Error ? domErr : new Error('Unknown camera error'));

        if (
          domErr.name === 'NotAllowedError'
          || domErr.name === 'PermissionDeniedError'
        ) {
          setState(CameraState.DENIED);
        } else if (
          domErr.name === 'NotFoundError'
          || domErr.name === 'DevicesNotFoundError'
        ) {
          setState(CameraState.NOT_FOUND);
        } else if (
          domErr.name === 'NotReadableError'
          || domErr.name === 'TrackStartError'
        ) {
          setState(CameraState.IN_USE);
        } else {
          setState(CameraState.ERROR);
        }

        return false;
      }
    },
    [selectedDeviceId, getResolutionConstraints, enumerateDevices],
  );

  const switchCamera = useCallback(
    async (deviceId: string): Promise<boolean> => {
      if (deviceId === selectedDeviceId) return true;
      return startStream(deviceId);
    },
    [selectedDeviceId, startStream],
  );

  const requestPermission = useCallback(async (): Promise<boolean> => {
    return startStream();
  }, [startStream]);

  // Attach stream to video element when both are available
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      void videoRef.current.play().catch((err) => {
        console.error('Error playing video:', err);
      });
    }
  }, [stream]);

  useEffect(() => {
    // Initial device enumeration on mount
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Device enumeration on mount is intentional
    void enumerateDevices();

    const handleDeviceChange = (): void => {
      void enumerateDevices();
    };

    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);

    return () => {
      navigator.mediaDevices?.removeEventListener(
        'devicechange',
        handleDeviceChange,
      );
      stopStream();
    };
  }, [enumerateDevices, stopStream]);

  useEffect(() => {
    if (autoStart && state === CameraState.IDLE) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Auto-start on mount is intentional
      void startStream();
    }
  }, [autoStart, state, startStream]);

  return {
    videoRef,
    stream,
    state,
    error,
    devices,
    selectedDeviceId,
    streamInfo,
    isSupported: isCameraSupported(),
    isStreaming: state === CameraState.GRANTED && stream !== null,
    startStream,
    stopStream,
    switchCamera,
    requestPermission,
    enumerateDevices,
  };
}

export default useCamera;
