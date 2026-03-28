/**
 * Camera feature hooks.
 */
export { useCamera, CameraState, isCameraSupported } from './use-camera';
export {
  usePersonDetection,
  DetectionState,
} from './use-person-detection';
export {
  useGenderClassification,
  ClassificationState,
  Gender,
} from './use-gender-classification';

// Deduplication system exports
export { useDeduplication, TrackStatus } from './use-deduplication';
export { useFaceEmbedding, FaceEmbeddingState } from './use-face-embedding';
export { useIdentityRegistry, IdentityStatus, ReIdMethod } from './use-identity-registry';

// Utility exports
export * as KalmanFilter from './kalman-filter';
export * as IOUUtils from './iou-utils';
export * as AppearanceFeatures from './appearance-features';
