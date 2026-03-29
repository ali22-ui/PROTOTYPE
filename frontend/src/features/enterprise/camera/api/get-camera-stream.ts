import {
  api,
  withFallback,
  getSelectedEnterpriseId,
  getCameraWebSocketUrl,
  getApiBaseUrl,
} from '@/lib/api-client';
import type { AxiosResponse } from 'axios';
import type { CameraMode, CameraSourceState, CameraStreamFrame } from '../types';

const fallbackCameraStream = (enterpriseId: string): CameraStreamFrame => ({
  enterprise_id: enterpriseId,
  frame: 1,
  fps: 6,
  active_tracks: 3,
  status: 'RUNNING',
  camera_name: 'Main Entrance - Camera 1',
  source_mode: 'mock',
  is_live_camera: false,
  relay_url: null,
  source_status: 'unknown',
  last_frame_at: null,
  boxes: [
    { id: 'trk_001', label: 'Male Tourist', x: 12, y: 23, w: 16, h: 35 },
    {
      id: 'trk_002',
      label: 'Female Local Resident',
      x: 41,
      y: 26,
      w: 18,
      h: 38,
    },
    {
      id: 'trk_003',
      label: 'Male Non-Local Resident',
      x: 69,
      y: 28,
      w: 15,
      h: 36,
    },
  ],
  events: Array.from(
    { length: 100 },
    (_, index) => `Frame ${100 - index}: Simulated CCTV detection event`,
  ),
});

const fallbackCameraSource = (enterpriseId: string): CameraSourceState => ({
  enterprise_id: enterpriseId,
  source_mode: 'mock',
  is_live_camera: false,
  relay_url: null,
  health: {
    reachable: false,
    status: 'unknown',
    last_error: null,
    last_ok_at: null,
    latency_ms: null,
  },
  config: {
    ip_webcam_enabled: false,
    ip_webcam_base_url: '',
    ip_webcam_video_path: '/video',
  },
});

export const fetchEnterpriseCameraStream = async (
  enterpriseId?: string,
): Promise<CameraStreamFrame> => {
  const resolvedEnterpriseId = enterpriseId || getSelectedEnterpriseId();
  return withFallback(
    () =>
      api
        .get<CameraStreamFrame>('/enterprise/camera/stream', {
          params: { enterprise_id: resolvedEnterpriseId },
        })
        .then((res: AxiosResponse<CameraStreamFrame>) => res.data),
    fallbackCameraStream(resolvedEnterpriseId),
  );
};

export const fetchCameraSource = async (
  enterpriseId?: string,
): Promise<CameraSourceState> => {
  const resolvedEnterpriseId = enterpriseId || getSelectedEnterpriseId();
  return withFallback(
    () =>
      api
        .get<CameraSourceState>('/enterprise/camera/source', {
          params: { enterprise_id: resolvedEnterpriseId },
        })
        .then((res: AxiosResponse<CameraSourceState>) => res.data),
    fallbackCameraSource(resolvedEnterpriseId),
  );
};

export const setCameraSource = async (
  mode: CameraMode,
  enterpriseId?: string,
): Promise<CameraSourceState> => api.post<CameraSourceState>(
  '/enterprise/camera/source',
  { mode },
  { params: { enterprise_id: enterpriseId || getSelectedEnterpriseId() } },
).then((res: AxiosResponse<CameraSourceState>) => res.data);

export const getCameraRelayUrl = (enterpriseId?: string): string => {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}/api/enterprise/camera/relay.mjpeg?enterprise_id=${enterpriseId || getSelectedEnterpriseId()}`;
};

export { getCameraWebSocketUrl };
