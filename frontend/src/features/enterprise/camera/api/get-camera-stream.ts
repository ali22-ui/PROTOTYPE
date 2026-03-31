import {
  api,
  getSelectedEnterpriseId,
  getCameraWebSocketUrl,
  getApiBaseUrl,
} from '@/lib/api-client';
import type { AxiosResponse, AxiosError } from 'axios';
import type { CameraMode, CameraSourceState, CameraStreamFrame } from '../types';

export class CameraServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CameraServiceUnavailableError';
  }
}

export class CameraSourceNotConfiguredError extends Error {
  availableModes: CameraMode[];
  constructor(message: string, availableModes: CameraMode[] = ['live_webcam', 'ip_webcam']) {
    super(message);
    this.name = 'CameraSourceNotConfiguredError';
    this.availableModes = availableModes;
  }
}

export const fetchEnterpriseCameraStream = async (
  enterpriseId?: string,
): Promise<CameraStreamFrame> => {
  const resolvedEnterpriseId = enterpriseId || getSelectedEnterpriseId();
  try {
    const response = await api.get<CameraStreamFrame>('/enterprise/camera/stream', {
      params: { enterprise_id: resolvedEnterpriseId },
    });
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError<{ detail: string; service_unavailable?: boolean }>;
    if (axiosError.response?.status === 503) {
      throw new CameraServiceUnavailableError(
        axiosError.response.data?.detail || 'Camera service unavailable'
      );
    }
    throw error;
  }
};

export const fetchCameraSource = async (
  enterpriseId?: string,
): Promise<CameraSourceState> => {
  const resolvedEnterpriseId = enterpriseId || getSelectedEnterpriseId();
  try {
    const response = await api.get<CameraSourceState>('/enterprise/camera/source', {
      params: { enterprise_id: resolvedEnterpriseId },
    });
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError<{ detail: string; service_unavailable?: boolean }>;
    if (axiosError.response?.status === 503) {
      throw new CameraServiceUnavailableError(
        axiosError.response.data?.detail || 'Camera service unavailable'
      );
    }
    throw error;
  }
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
