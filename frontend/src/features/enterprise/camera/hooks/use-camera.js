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
};

/**
 * Check if browser supports camera access.
 */
export const isCameraSupported = () => {
  return !!(
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
};

/**
 * Hook for managing camera access and video stream.
 * @param {object} options - Configuration options
 * @param {boolean} options.autoStart - Auto-start camera on mount
 * @param {string} options.preferredResolution - Preferred resolution ('hd', 'fhd', 'sd')
 * @returns {object} Camera state and controls
 */
export function useCamera({
  autoStart = false,
  preferredResolution = 'hd',
} = {}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [state, setState] = useState(CameraState.IDLE);
  const [error, setError] = useState(null);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(CAMERA_STORAGE_KEY) || '';
    }
    return '';
  });
  const [streamInfo, setStreamInfo] = useState({
    width: 0,
    height: 0,
    frameRate: 0,
  });

  const getResolutionConstraints = useCallback(() => {
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

  const enumerateDevices = useCallback(async () => {
    if (!isCameraSupported()) {
      return [];
    }

    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter(
        (device) => device.kind === 'videoinput'
      );
      setDevices(videoDevices);
      return videoDevices;
    } catch (err) {
      console.error('Failed to enumerate devices:', err);
      return [];
    }
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStreamInfo({ width: 0, height: 0, frameRate: 0 });
  }, []);

  const startStream = useCallback(
    async (deviceId = selectedDeviceId) => {
      if (!isCameraSupported()) {
        setState(CameraState.NOT_SUPPORTED);
        setError(new Error('Camera not supported in this browser'));
        return false;
      }

      stopStream();
      setState(CameraState.REQUESTING);
      setError(null);

      try {
        const constraints = {
          video: {
            ...getResolutionConstraints(),
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        const videoTrack = stream.getVideoTracks()[0];
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
      } catch (err) {
        console.error('Camera access error:', err);
        setError(err);

        if (
          err.name === 'NotAllowedError' ||
          err.name === 'PermissionDeniedError'
        ) {
          setState(CameraState.DENIED);
        } else if (
          err.name === 'NotFoundError' ||
          err.name === 'DevicesNotFoundError'
        ) {
          setState(CameraState.NOT_FOUND);
        } else if (
          err.name === 'NotReadableError' ||
          err.name === 'TrackStartError'
        ) {
          setState(CameraState.IN_USE);
        } else {
          setState(CameraState.ERROR);
        }

        return false;
      }
    },
    [
      selectedDeviceId,
      stopStream,
      getResolutionConstraints,
      enumerateDevices,
    ]
  );

  const switchCamera = useCallback(
    async (deviceId) => {
      if (deviceId === selectedDeviceId) return true;
      return startStream(deviceId);
    },
    [selectedDeviceId, startStream]
  );

  const requestPermission = useCallback(async () => {
    return startStream();
  }, [startStream]);

  useEffect(() => {
    enumerateDevices();

    const handleDeviceChange = () => {
      enumerateDevices();
    };

    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);

    return () => {
      navigator.mediaDevices?.removeEventListener(
        'devicechange',
        handleDeviceChange
      );
      stopStream();
    };
  }, [enumerateDevices, stopStream]);

  useEffect(() => {
    if (autoStart && state === CameraState.IDLE) {
      startStream();
    }
  }, [autoStart, state, startStream]);

  return {
    videoRef,
    stream: streamRef.current,
    state,
    error,
    devices,
    selectedDeviceId,
    streamInfo,
    isSupported: isCameraSupported(),
    isStreaming: state === CameraState.GRANTED && streamRef.current !== null,
    startStream,
    stopStream,
    switchCamera,
    requestPermission,
    enumerateDevices,
  };
}

export default useCamera;
