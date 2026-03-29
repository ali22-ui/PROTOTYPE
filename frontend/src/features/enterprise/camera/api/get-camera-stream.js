import { api, withFallback, getSelectedEnterpriseId, getCameraWebSocketUrl, getApiBaseUrl } from '@/lib/api-client';

export const fetchEnterpriseCameraStream = async (enterpriseId) =>
  withFallback(
    () => api.get('/enterprise/camera/stream', { params: { enterprise_id: enterpriseId || getSelectedEnterpriseId() } }),
    {
      enterprise_id: enterpriseId || getSelectedEnterpriseId(),
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
        { id: 'trk_002', label: 'Female Local Resident', x: 41, y: 26, w: 18, h: 38 },
        { id: 'trk_003', label: 'Male Non-Local Resident', x: 69, y: 28, w: 15, h: 36 },
      ],
      events: Array.from({ length: 100 }, (_, index) => `Frame ${100 - index}: Simulated CCTV detection event`),
    }
  );

export const fetchCameraSource = async (enterpriseId) =>
  withFallback(
    () => api.get('/enterprise/camera/source', { params: { enterprise_id: enterpriseId || getSelectedEnterpriseId() } }),
    {
      enterprise_id: enterpriseId || getSelectedEnterpriseId(),
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
    }
  );

export const setCameraSource = async (mode, enterpriseId) =>
  api.post(
    '/enterprise/camera/source',
    { mode },
    { params: { enterprise_id: enterpriseId || getSelectedEnterpriseId() } }
  ).then((res) => res.data);

export const getCameraRelayUrl = (enterpriseId) => {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}/api/enterprise/camera/relay.mjpeg?enterprise_id=${enterpriseId || getSelectedEnterpriseId()}`;
};

export { getCameraWebSocketUrl };
