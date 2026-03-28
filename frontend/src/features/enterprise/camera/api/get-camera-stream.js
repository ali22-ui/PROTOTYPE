import { api, withFallback, getSelectedEnterpriseId, getCameraWebSocketUrl } from '@/lib/api-client';

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
      boxes: [
        { id: 'trk_001', label: 'Male Tourist', x: 12, y: 23, w: 16, h: 35 },
        { id: 'trk_002', label: 'Female Local Resident', x: 41, y: 26, w: 18, h: 38 },
        { id: 'trk_003', label: 'Male Non-Local Resident', x: 69, y: 28, w: 15, h: 36 },
      ],
      events: Array.from({ length: 100 }, (_, index) => `Frame ${100 - index}: Simulated CCTV detection event`),
    }
  );

export { getCameraWebSocketUrl };
