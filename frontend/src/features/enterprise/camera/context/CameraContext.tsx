import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  CameraState,
  isCameraSupported,
  type CameraStateValue,
  type CameraStreamInfo,
} from '../hooks/use-camera';

const CAMERA_STORAGE_KEY = 'lgu-dashboard-selected-camera';

interface CameraContextValue {
  stream: MediaStream | null;
  state: CameraStateValue;
  error: Error | null;
  streamInfo: CameraStreamInfo;
  selectedDeviceId: string;
  isCameraRunning: boolean;
  startCamera: (deviceId?: string) => Promise<boolean>;
  stopCamera: () => void;
}

interface CameraProviderProps {
  children: ReactNode;
}

const CameraContext = createContext<CameraContextValue | null>(null);

const DEFAULT_STREAM_INFO: CameraStreamInfo = {
  width: 0,
  height: 0,
  frameRate: 0,
};

const getStoredDeviceId = (): string => {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return window.localStorage.getItem(CAMERA_STORAGE_KEY) || '';
  } catch {
    return '';
  }
};

const saveStoredDeviceId = (deviceId: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(CAMERA_STORAGE_KEY, deviceId);
  } catch {
    // Ignore storage write failures.
  }
};

export function CameraProvider({ children }: CameraProviderProps): JSX.Element {
  const streamRef = useRef<MediaStream | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<CameraStateValue>(CameraState.IDLE);
  const [error, setError] = useState<Error | null>(null);
  const [streamInfo, setStreamInfo] = useState<CameraStreamInfo>(DEFAULT_STREAM_INFO);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(getStoredDeviceId);

  const stopCamera = useCallback((): void => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setStream(null);
    setStreamInfo(DEFAULT_STREAM_INFO);
    setState(CameraState.IDLE);
    setError(null);
  }, []);

  const startCamera = useCallback(
    async (deviceId = selectedDeviceId): Promise<boolean> => {
      if (!isCameraSupported()) {
        setState(CameraState.NOT_SUPPORTED);
        setError(new Error('Camera not supported in this browser'));
        return false;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      setState(CameraState.REQUESTING);
      setError(null);

      try {
        const constraints: MediaStreamConstraints = {
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          },
          audio: false,
        };

        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = newStream;
        setStream(newStream);

        const videoTrack = newStream.getVideoTracks()[0];
        const settings = videoTrack?.getSettings();
        const usedDeviceId = settings?.deviceId || deviceId;

        if (usedDeviceId) {
          setSelectedDeviceId(usedDeviceId);
          saveStoredDeviceId(usedDeviceId);
        }

        setStreamInfo({
          width: settings?.width || 0,
          height: settings?.height || 0,
          frameRate: settings?.frameRate || 0,
        });
        setState(CameraState.GRANTED);
        return true;
      } catch (err: unknown) {
        const domErr = err as DOMException;
        const normalizedError = domErr instanceof Error
          ? domErr
          : new Error('Unknown camera error');
        setError(normalizedError);

        if (
          domErr?.name === 'NotAllowedError'
          || domErr?.name === 'PermissionDeniedError'
        ) {
          setState(CameraState.DENIED);
        } else if (
          domErr?.name === 'NotFoundError'
          || domErr?.name === 'DevicesNotFoundError'
        ) {
          setState(CameraState.NOT_FOUND);
        } else if (
          domErr?.name === 'NotReadableError'
          || domErr?.name === 'TrackStartError'
        ) {
          setState(CameraState.IN_USE);
        } else {
          setState(CameraState.ERROR);
        }

        return false;
      }
    },
    [selectedDeviceId],
  );

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const value = useMemo<CameraContextValue>(
    () => ({
      stream,
      state,
      error,
      streamInfo,
      selectedDeviceId,
      isCameraRunning: state === CameraState.GRANTED && stream !== null,
      startCamera,
      stopCamera,
    }),
    [error, selectedDeviceId, startCamera, state, stopCamera, stream, streamInfo],
  );

  return (
    <CameraContext.Provider value={value}>
      {children}
    </CameraContext.Provider>
  );
}

export const useGlobalCamera = (): CameraContextValue => {
  const context = useContext(CameraContext);
  if (!context) {
    throw new Error('useGlobalCamera must be used inside CameraProvider');
  }

  return context;
};
