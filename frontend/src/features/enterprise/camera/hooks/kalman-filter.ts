/**
 * Kalman Filter for tracking object position and velocity.
 * Used to predict next position during occlusions and smooth tracking.
 *
 * State vector: [x, y, vx, vy] (position and velocity)
 * Measurement vector: [x, y] (observed position)
 */

import type { Point } from '../types';

/**
 * Default process noise (how much we expect the system to change between updates)
 */
const DEFAULT_PROCESS_NOISE = 1.0;

/**
 * Default measurement noise (how noisy the measurements are)
 */
const DEFAULT_MEASUREMENT_NOISE = 1.0;

type Vector = number[];
type Matrix = number[][];

export interface KalmanFilterOptions {
  processNoise?: number;
  measurementNoise?: number;
}

export interface KalmanFilterState {
  state: [number, number, number, number];
  P: Matrix;
  processNoise: number;
  measurementNoise: number;
  lastUpdateTime: number;
}

const isMatrix = (value: Matrix | Vector): value is Matrix =>
  Array.isArray((value as Matrix)[0]);

/**
 * Create a new Kalman filter state for tracking a point.
 * @param initialPosition - Initial position {x, y}
 * @param options - Configuration options
 * @returns Kalman filter state
 */
export function createKalmanFilter(
  initialPosition: Point,
  options: KalmanFilterOptions = {},
): KalmanFilterState {
  const {
    processNoise = DEFAULT_PROCESS_NOISE,
    measurementNoise = DEFAULT_MEASUREMENT_NOISE,
  } = options;

  // State vector: [x, y, vx, vy]
  const state: [number, number, number, number] = [
    initialPosition.x,
    initialPosition.y,
    0,
    0,
  ];

  // State covariance matrix (4x4)
  // Initial uncertainty is high for velocity, moderate for position
  const P: Matrix = [
    [100, 0, 0, 0],
    [0, 100, 0, 0],
    [0, 0, 1000, 0],
    [0, 0, 0, 1000],
  ];

  return {
    state,
    P,
    processNoise,
    measurementNoise,
    lastUpdateTime: Date.now(),
  };
}

/**
 * Matrix multiplication helper (for 4x4 and 4x1 matrices).
 */
function matrixMultiply(A: Matrix, B: Matrix): Matrix;
function matrixMultiply(A: Matrix, B: Vector): Vector;
function matrixMultiply(A: Matrix, B: Matrix | Vector): Matrix | Vector {
  if (isMatrix(B)) {
    // Matrix * Matrix
    const result: Matrix = [];
    for (let i = 0; i < A.length; i++) {
      result[i] = [];
      for (let j = 0; j < B[0].length; j++) {
        let sum = 0;
        for (let k = 0; k < A[0].length; k++) {
          sum += A[i][k] * B[k][j];
        }
        result[i][j] = sum;
      }
    }
    return result;
  }

  // Matrix * Vector
  const result: Vector = [];
  for (let i = 0; i < A.length; i++) {
    let sum = 0;
    for (let j = 0; j < A[0].length; j++) {
      sum += A[i][j] * B[j];
    }
    result[i] = sum;
  }
  return result;
}

/**
 * Matrix transpose helper.
 */
function transpose(A: Matrix): Matrix {
  const result: Matrix = [];
  for (let i = 0; i < A[0].length; i++) {
    result[i] = [];
    for (let j = 0; j < A.length; j++) {
      result[i][j] = A[j][i];
    }
  }
  return result;
}

/**
 * Matrix addition helper.
 */
function matrixAdd(A: Matrix, B: Matrix): Matrix;
function matrixAdd(A: Vector, B: Vector): Vector;
function matrixAdd(A: Matrix | Vector, B: Matrix | Vector): Matrix | Vector {
  if (isMatrix(A) && isMatrix(B)) {
    const result: Matrix = [];
    for (let i = 0; i < A.length; i++) {
      result[i] = [];
      for (let j = 0; j < A[i].length; j++) {
        result[i][j] = A[i][j] + B[i][j];
      }
    }
    return result;
  }

  const a = A as Vector;
  const b = B as Vector;
  const result: Vector = [];
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i] + b[i];
  }
  return result;
}

/**
 * Matrix subtraction helper.
 */
function matrixSubtract(A: Matrix, B: Matrix): Matrix;
function matrixSubtract(A: Vector, B: Vector): Vector;
function matrixSubtract(A: Matrix | Vector, B: Matrix | Vector): Matrix | Vector {
  if (isMatrix(A) && isMatrix(B)) {
    const result: Matrix = [];
    for (let i = 0; i < A.length; i++) {
      result[i] = [];
      for (let j = 0; j < A[i].length; j++) {
        result[i][j] = A[i][j] - B[i][j];
      }
    }
    return result;
  }

  const a = A as Vector;
  const b = B as Vector;
  const result: Vector = [];
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i] - b[i];
  }
  return result;
}

/**
 * 2x2 matrix inverse helper.
 */
function inverse2x2(M: Matrix): Matrix {
  const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
  if (Math.abs(det) < 1e-10) {
    // Singular matrix, return identity
    return [
      [1, 0],
      [0, 1],
    ];
  }
  return [
    [M[1][1] / det, -M[0][1] / det],
    [-M[1][0] / det, M[0][0] / det],
  ];
}

/**
 * Predict the next state based on the motion model.
 * @param filter - Kalman filter state
 * @param dt - Time delta in seconds
 * @returns Updated filter with predicted state
 */
export function predict(
  filter: KalmanFilterState,
  dt: number | null = null,
): KalmanFilterState {
  const now = Date.now();
  let safeDt = dt;
  if (safeDt === null) {
    safeDt = (now - filter.lastUpdateTime) / 1000; // Convert to seconds
  }

  // Clamp dt to reasonable range (prevent huge predictions after long pauses)
  safeDt = Math.min(Math.max(safeDt, 0.001), 2.0);

  // State transition matrix (constant velocity model)
  const F: Matrix = [
    [1, 0, safeDt, 0],
    [0, 1, 0, safeDt],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];

  // Process noise covariance
  const q = filter.processNoise;
  const dt2 = safeDt * safeDt;
  const dt3 = dt2 * safeDt;
  const dt4 = dt3 * safeDt;

  const Q: Matrix = [
    [(dt4 / 4) * q, 0, (dt3 / 2) * q, 0],
    [0, (dt4 / 4) * q, 0, (dt3 / 2) * q],
    [(dt3 / 2) * q, 0, dt2 * q, 0],
    [0, (dt3 / 2) * q, 0, dt2 * q],
  ];

  // Predict state: x' = F * x
  const predictedStateVector = matrixMultiply(F, filter.state) as Vector;
  const predictedState: [number, number, number, number] = [
    predictedStateVector[0] ?? 0,
    predictedStateVector[1] ?? 0,
    predictedStateVector[2] ?? 0,
    predictedStateVector[3] ?? 0,
  ];

  // Predict covariance: P' = F * P * F^T + Q
  const FP = matrixMultiply(F, filter.P) as Matrix;
  const FT = transpose(F);
  const FPFT = matrixMultiply(FP, FT) as Matrix;
  const predictedP = matrixAdd(FPFT, Q) as Matrix;

  return {
    ...filter,
    state: predictedState,
    P: predictedP,
    lastUpdateTime: now,
  };
}

/**
 * Update the filter with a new measurement.
 * @param filter - Kalman filter state (after prediction)
 * @param measurement - Measured position {x, y}
 * @returns Updated filter state
 */
export function update(
  filter: KalmanFilterState,
  measurement: Point,
): KalmanFilterState {
  // Measurement matrix (we only observe position)
  const H: Matrix = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
  ];

  // Measurement noise covariance
  const r = filter.measurementNoise;
  const R: Matrix = [
    [r, 0],
    [0, r],
  ];

  // Measurement vector
  const z: Vector = [measurement.x, measurement.y];

  // Innovation (measurement residual): y = z - H * x
  const Hx = matrixMultiply(H, filter.state) as Vector;
  const innovation = matrixSubtract(z, Hx) as Vector;

  // Innovation covariance: S = H * P * H^T + R
  const HP = matrixMultiply(H, filter.P) as Matrix;
  const HT = transpose(H);
  const HPHT = matrixMultiply(HP, HT) as Matrix;
  const S = matrixAdd(HPHT, R) as Matrix;

  // Kalman gain: K = P * H^T * S^-1
  const PHT = matrixMultiply(filter.P, HT) as Matrix;
  const Sinv = inverse2x2(S);
  const K = matrixMultiply(PHT, Sinv) as Matrix;

  // Update state: x' = x + K * y
  const Ky: Vector = [];
  for (let i = 0; i < K.length; i++) {
    Ky[i] = K[i][0] * innovation[0] + K[i][1] * innovation[1];
  }
  const newStateVector = matrixAdd(filter.state as unknown as Vector, Ky) as Vector;
  const newState: [number, number, number, number] = [
    newStateVector[0] ?? 0,
    newStateVector[1] ?? 0,
    newStateVector[2] ?? 0,
    newStateVector[3] ?? 0,
  ];

  // Update covariance: P' = (I - K * H) * P
  const KH = matrixMultiply(K, H) as Matrix;
  const I: Matrix = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
  const IKH = matrixSubtract(I, KH) as Matrix;
  const newP = matrixMultiply(IKH, filter.P) as Matrix;

  return {
    ...filter,
    state: newState,
    P: newP,
    lastUpdateTime: Date.now(),
  };
}

/**
 * Get the current position estimate from the filter.
 * @param filter - Kalman filter state
 * @returns Position {x, y}
 */
export function getPosition(filter: KalmanFilterState): Point {
  return {
    x: filter.state[0],
    y: filter.state[1],
  };
}

/**
 * Get the current velocity estimate from the filter.
 * @param filter - Kalman filter state
 * @returns Velocity {vx, vy}
 */
export function getVelocity(filter: KalmanFilterState): { vx: number; vy: number } {
  return {
    vx: filter.state[2],
    vy: filter.state[3],
  };
}

/**
 * Predict future position based on current state and velocity.
 * @param filter - Kalman filter state
 * @param dt - Time in the future (seconds)
 * @returns Predicted position {x, y}
 */
export function predictPosition(filter: KalmanFilterState, dt: number): Point {
  const [x, y, vx, vy] = filter.state;
  return {
    x: x + vx * dt,
    y: y + vy * dt,
  };
}

/**
 * Get the speed (magnitude of velocity).
 * @param filter - Kalman filter state
 * @returns Speed in pixels per second
 */
export function getSpeed(filter: KalmanFilterState): number {
  const { vx, vy } = getVelocity(filter);
  return Math.sqrt(vx * vx + vy * vy);
}

/**
 * Calculate the uncertainty (standard deviation) of position estimate.
 * @param filter - Kalman filter state
 * @returns Uncertainty {x, y}
 */
export function getPositionUncertainty(filter: KalmanFilterState): Point {
  return {
    x: Math.sqrt(filter.P[0][0]),
    y: Math.sqrt(filter.P[1][1]),
  };
}

export default {
  createKalmanFilter,
  predict,
  update,
  getPosition,
  getVelocity,
  predictPosition,
  getSpeed,
  getPositionUncertainty,
};
