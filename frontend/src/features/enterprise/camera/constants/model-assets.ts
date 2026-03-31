const withBase = (path: string): string => {
  const baseUrl = import.meta.env.BASE_URL || '/';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${path}`;
};

export const FACE_API_MODEL_BASE_URL = withBase('vendor/face-api/model');
export const MEDIAPIPE_WASM_BASE_URL = withBase('vendor/mediapipe/wasm');
export const MEDIAPIPE_PERSON_MODEL_URL = withBase('vendor/mediapipe/models/efficientdet_lite0.tflite');
