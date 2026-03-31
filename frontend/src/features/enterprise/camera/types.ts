export type CameraMode = 'live_webcam' | 'ip_webcam';

export type CameraConnectionState = 'connecting' | 'live' | 'source_unavailable' | 'backend_unavailable';

export type GenderValue = 'male' | 'female' | 'unknown';

export interface Point {
  x: number;
  y: number;
}

export interface BBoxPercent {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoundingBoxPixels {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export interface DetectionCategory {
  score: number;
}

export interface RawPersonDetection {
  boundingBox: BoundingBoxPixels;
  categories?: DetectionCategory[];
  _trackId?: string;
  _firstSeen?: number;
  _lastSeen?: number;
  _dwellSeconds?: number;
}

export interface PersonTrackDetection {
  trackId: string;
  personId?: string | null;
  firstSeen: number;
  lastSeen: number;
  confidence: number;
  dwellSeconds: number;
  bbox?: BBoxPercent | BoundingBoxPixels;
  bboxPercent?: BBoxPercent | null;
  sex?: GenderValue;
  sexConfidence?: number;
  gender?: string;
  genderConfidence?: number;
  reIdMethod?: string;
  reIdConfidence?: number;
}

export interface CameraSourceHealth {
  reachable: boolean;
  status: 'online' | 'degraded' | 'offline' | 'unknown';
  last_error: string | null;
  last_ok_at: string | null;
  latency_ms: number | null;
}

export interface CameraSourceConfig {
  ip_webcam_enabled: boolean;
  ip_webcam_base_url: string;
  ip_webcam_video_path: string;
}

export interface CameraSourceState {
  enterprise_id: string;
  source_mode: CameraMode | null;
  is_live_camera: boolean;
  relay_url: string | null;
  health: CameraSourceHealth;
  config: CameraSourceConfig;
}

export interface CameraDiagnostic {
  message: string;
  available_modes?: CameraMode[];
  last_ok_at?: string | null;
}

export interface CameraStreamBox {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CameraStreamFrame {
  enterprise_id: string;
  frame: number;
  fps: number;
  active_tracks: number;
  status: string;
  camera_name: string;
  source_mode: CameraMode | null;
  is_live_camera: boolean;
  relay_url: string | null;
  source_status: string;
  last_frame_at: string | null;
  diagnostic?: CameraDiagnostic;
  boxes: CameraStreamBox[];
  events: string[];
}

export interface DetectionBatchEvent {
  enterprise_id: string;
  camera_id: string;
  track_id: string;
  person_id?: string | null;
  timestamp: string;
  sex: GenderValue;
  confidence_person: number;
  confidence_sex?: number | null;
  bbox_x?: number;
  bbox_y?: number;
  bbox_w?: number;
  bbox_h?: number;
  dwell_seconds: number;
  first_seen: string;
  reid_method: string;
  reid_confidence: number;
}

export interface ReIdByMethod {
  face: number;
  appearance: number;
  geometric: number;
}

export interface IdentityRegistryStats {
  totalUniquePersons: number;
  activeCount: number;
  dormantCount: number;
  exitedCount: number;
  reIdSuccessRate: number;
  avgDwellSeconds: number;
  reIdentificationCount: number;
  reIdByMethod: ReIdByMethod;
}

export interface DeduplicationStats {
  totalTracks: number;
  activeTracks: number;
  dormantTracks: number;
  uniquePersons: number;
  reIdRate: number;
  avgProcessingTime: number;
  reIdentificationCount: number;
}
