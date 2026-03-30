import type { LguBarangay } from '@/types';

export interface MarkerOffset {
  lat: number;
  lng: number;
}

export interface MarkerStepTweak {
  latSteps: number;
  lngSteps: number;
}

/**
 * Temporary calibration step used for map-label alignment tuning.
 *
 * Change `latSteps` / `lngSteps` by +/-1 to nudge by exactly 0.001.
 */
export const MARKER_CALIBRATION_STEP = 0.001;

/**
 * Manual marker calibration dictionary.
 *
 * Update offset values below to fine-tune each barangay marker position on the basemap.
 * Positive lat moves north, negative lat moves south.
 * Positive lng moves east, negative lng moves west.
 */
export const BARANGAY_MARKER_OFFSETS: Record<string, MarkerOffset> = {
  'bagong-silang': { lat: 0.00008, lng: 0.00005 },
  calendola: { lat: 0.00007, lng: -0.00004 },
  chrysanthemum: { lat: 0.0001, lng: 0.00008 },
  cuyab: { lat: -0.00012, lng: 0.00011 },
  estrella: { lat: 0.00006, lng: -0.00007 },
  fatima: { lat: 0.00011, lng: 0.00004 },
  gsis: { lat: 0.00009, lng: -0.00003 },
  landayan: { lat: -0.0001, lng: 0.00012 },
  langgam: { lat: -0.00008, lng: -0.00009 },
  laram: { lat: -0.00007, lng: -0.00002 },
  magsaysay: { lat: 0.00005, lng: -0.00005 },
  maharlika: { lat: 0.00008, lng: 0.00006 },
  narra: { lat: -0.00005, lng: -0.00003 },
  nueva: { lat: 0.00007, lng: 0.0001 },
  'pacita-i': { lat: -0.00004, lng: 0.00007 },
  'pacita-ii': { lat: 0.00006, lng: 0.00005 },
  poblacion: { lat: 0.00009, lng: 0.00009 },
  riverside: { lat: -0.00003, lng: -0.00004 },
  rosario: { lat: 0.00008, lng: 0.00007 },
  'sampaguita-village': { lat: 0.00005, lng: -0.00005 },
  'san-antonio': { lat: 0.0001, lng: 0.00009 },
  'san-lorenzo-ruiz': { lat: 0.00006, lng: 0.00005 },
  'san-roque': { lat: 0.00011, lng: 0.00012 },
  'san-vicente': { lat: 0.00009, lng: 0.00006 },
  'santo-nino': { lat: 0.0001, lng: 0.00008 },
  'united-bayanihan': { lat: 0.00004, lng: -0.00005 },
  'united-better-living': { lat: 0.00005, lng: -0.00008 },
};

/**
 * Visual label calibration tweaks for all 27 San Pedro barangays.
 *
 * Example:
 * - latSteps: 1  => +0.001 latitude
 * - lngSteps: -1 => -0.001 longitude
 */
export const BARANGAY_MARKER_STEP_TWEAKS: Record<string, MarkerStepTweak> = {
  'bagong-silang': { latSteps: 0, lngSteps: 0 },
  calendola: { latSteps: 0, lngSteps: 0 },
  chrysanthemum: { latSteps: 0, lngSteps: 0 },
  cuyab: { latSteps: 0, lngSteps: 0 },
  estrella: { latSteps: 0, lngSteps: 0 },
  fatima: { latSteps: 0, lngSteps: 0 },
  gsis: { latSteps: 0, lngSteps: 0 },
  landayan: { latSteps: 0, lngSteps: 0 },
  langgam: { latSteps: 0, lngSteps: 0 },
  laram: { latSteps: 0, lngSteps: 0 },
  magsaysay: { latSteps: 0, lngSteps: 0 },
  maharlika: { latSteps: 0, lngSteps: 0 },
  narra: { latSteps: 0, lngSteps: 0 },
  nueva: { latSteps: 0, lngSteps: 0 },
  'pacita-i': { latSteps: 0, lngSteps: 0 },
  'pacita-ii': { latSteps: 0, lngSteps: 0 },
  poblacion: { latSteps: 0, lngSteps: 0 },
  riverside: { latSteps: 0, lngSteps: 0 },
  rosario: { latSteps: 0, lngSteps: 0 },
  'sampaguita-village': { latSteps: 0, lngSteps: 0 },
  'san-antonio': { latSteps: 0, lngSteps: 0 },
  'san-lorenzo-ruiz': { latSteps: 0, lngSteps: 0 },
  'san-roque': { latSteps: 0, lngSteps: 0 },
  'san-vicente': { latSteps: 0, lngSteps: 0 },
  'santo-nino': { latSteps: 0, lngSteps: 0 },
  'united-bayanihan': { latSteps: 0, lngSteps: 0 },
  'united-better-living': { latSteps: 0, lngSteps: 0 },
};

export const SAN_PEDRO_MAP_CENTER: [number, number] = [14.3413, 121.0446];

export const SAN_PEDRO_MAP_BOUNDS: [[number, number], [number, number]] = [
  [14.274, 120.985],
  [14.379, 121.091],
];

export const MAP_MARKER_STYLE = {
  selected: {
    color: '#5C6F2B',
    fillColor: '#DE802B',
    fillOpacity: 0.95,
    weight: 2,
    radius: 9,
  },
  default: {
    color: '#D8C9A7',
    fillColor: '#DE802B',
    fillOpacity: 0.72,
    weight: 1,
    radius: 6,
  },
} as const;

export const getTunedMarkerCenter = (barangay: LguBarangay): [number, number] => {
  const offset = BARANGAY_MARKER_OFFSETS[barangay.id] || { lat: 0, lng: 0 };
  const tweak = BARANGAY_MARKER_STEP_TWEAKS[barangay.id] || { latSteps: 0, lngSteps: 0 };

  return [
    barangay.center.lat + offset.lat + tweak.latSteps * MARKER_CALIBRATION_STEP,
    barangay.center.lng + offset.lng + tweak.lngSteps * MARKER_CALIBRATION_STEP,
  ];
};
