/**
 * Kalman Filter for tracking object position and velocity.
 * Used to predict next position during occlusions and smooth tracking.
 * 
 * State vector: [x, y, vx, vy] (position and velocity)
 * Measurement vector: [x, y] (observed position)
 */

/**
 * Default process noise (how much we expect the system to change between updates)
 */
const DEFAULT_PROCESS_NOISE = 1.0;

/**
 * Default measurement noise (how noisy the measurements are)
 */
const DEFAULT_MEASUREMENT_NOISE = 1.0;

/**
 * Create a new Kalman filter state for tracking a point.
 * @param {object} initialPosition - Initial position {x, y}
 * @param {object} options - Configuration options
 * @param {number} options.processNoise - Process noise covariance
 * @param {number} options.measurementNoise - Measurement noise covariance
 * @returns {object} Kalman filter state
 */
export function createKalmanFilter(initialPosition, options = {}) {
  const { 
    processNoise = DEFAULT_PROCESS_NOISE, 
    measurementNoise = DEFAULT_MEASUREMENT_NOISE 
  } = options;

  // State vector: [x, y, vx, vy]
  const state = [initialPosition.x, initialPosition.y, 0, 0];

  // State covariance matrix (4x4)
  // Initial uncertainty is high for velocity, moderate for position
  const P = [
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
function matrixMultiply(A, B) {
  if (Array.isArray(B[0])) {
    // Matrix * Matrix
    const result = [];
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
  } else {
    // Matrix * Vector
    const result = [];
    for (let i = 0; i < A.length; i++) {
      let sum = 0;
      for (let j = 0; j < A[0].length; j++) {
        sum += A[i][j] * B[j];
      }
      result[i] = sum;
    }
    return result;
  }
}

/**
 * Matrix transpose helper.
 */
function transpose(A) {
  const result = [];
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
function matrixAdd(A, B) {
  const result = [];
  for (let i = 0; i < A.length; i++) {
    if (Array.isArray(A[i])) {
      result[i] = [];
      for (let j = 0; j < A[i].length; j++) {
        result[i][j] = A[i][j] + B[i][j];
      }
    } else {
      result[i] = A[i] + B[i];
    }
  }
  return result;
}

/**
 * Matrix subtraction helper.
 */
function matrixSubtract(A, B) {
  const result = [];
  for (let i = 0; i < A.length; i++) {
    if (Array.isArray(A[i])) {
      result[i] = [];
      for (let j = 0; j < A[i].length; j++) {
        result[i][j] = A[i][j] - B[i][j];
      }
    } else {
      result[i] = A[i] - B[i];
    }
  }
  return result;
}

/**
 * 2x2 matrix inverse helper.
 */
function inverse2x2(M) {
  const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
  if (Math.abs(det) < 1e-10) {
    // Singular matrix, return identity
    return [[1, 0], [0, 1]];
  }
  return [
    [M[1][1] / det, -M[0][1] / det],
    [-M[1][0] / det, M[0][0] / det],
  ];
}

/**
 * Predict the next state based on the motion model.
 * @param {object} filter - Kalman filter state
 * @param {number} dt - Time delta in seconds
 * @returns {object} Updated filter with predicted state
 */
export function predict(filter, dt = null) {
  const now = Date.now();
  if (dt === null) {
    dt = (now - filter.lastUpdateTime) / 1000; // Convert to seconds
  }

  // Clamp dt to reasonable range (prevent huge predictions after long pauses)
  dt = Math.min(Math.max(dt, 0.001), 2.0);

  // State transition matrix (constant velocity model)
  const F = [
    [1, 0, dt, 0],
    [0, 1, 0, dt],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];

  // Process noise covariance
  const q = filter.processNoise;
  const dt2 = dt * dt;
  const dt3 = dt2 * dt;
  const dt4 = dt3 * dt;
  
  const Q = [
    [dt4/4 * q, 0, dt3/2 * q, 0],
    [0, dt4/4 * q, 0, dt3/2 * q],
    [dt3/2 * q, 0, dt2 * q, 0],
    [0, dt3/2 * q, 0, dt2 * q],
  ];

  // Predict state: x' = F * x
  const predictedState = matrixMultiply(F, filter.state);

  // Predict covariance: P' = F * P * F^T + Q
  const FP = matrixMultiply(F, filter.P);
  const FT = transpose(F);
  const FPFT = matrixMultiply(FP, FT);
  const predictedP = matrixAdd(FPFT, Q);

  return {
    ...filter,
    state: predictedState,
    P: predictedP,
    lastUpdateTime: now,
  };
}

/**
 * Update the filter with a new measurement.
 * @param {object} filter - Kalman filter state (after prediction)
 * @param {object} measurement - Measured position {x, y}
 * @returns {object} Updated filter state
 */
export function update(filter, measurement) {
  // Measurement matrix (we only observe position)
  const H = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
  ];

  // Measurement noise covariance
  const r = filter.measurementNoise;
  const R = [
    [r, 0],
    [0, r],
  ];

  // Measurement vector
  const z = [measurement.x, measurement.y];

  // Innovation (measurement residual): y = z - H * x
  const Hx = matrixMultiply(H, filter.state);
  const y = matrixSubtract(z, Hx);

  // Innovation covariance: S = H * P * H^T + R
  const HP = matrixMultiply(H, filter.P);
  const HT = transpose(H);
  const HPHT = matrixMultiply(HP, HT);
  const S = matrixAdd(HPHT, R);

  // Kalman gain: K = P * H^T * S^-1
  const PHT = matrixMultiply(filter.P, HT);
  const Sinv = inverse2x2(S);
  const K = matrixMultiply(PHT, Sinv);

  // Update state: x' = x + K * y
  const Ky = [];
  for (let i = 0; i < K.length; i++) {
    Ky[i] = K[i][0] * y[0] + K[i][1] * y[1];
  }
  const newState = matrixAdd(filter.state, Ky);

  // Update covariance: P' = (I - K * H) * P
  const KH = matrixMultiply(K, H);
  const I = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
  const IKH = matrixSubtract(I, KH);
  const newP = matrixMultiply(IKH, filter.P);

  return {
    ...filter,
    state: newState,
    P: newP,
    lastUpdateTime: Date.now(),
  };
}

/**
 * Get the current position estimate from the filter.
 * @param {object} filter - Kalman filter state
 * @returns {object} Position {x, y}
 */
export function getPosition(filter) {
  return {
    x: filter.state[0],
    y: filter.state[1],
  };
}

/**
 * Get the current velocity estimate from the filter.
 * @param {object} filter - Kalman filter state
 * @returns {object} Velocity {vx, vy}
 */
export function getVelocity(filter) {
  return {
    vx: filter.state[2],
    vy: filter.state[3],
  };
}

/**
 * Predict future position based on current state and velocity.
 * @param {object} filter - Kalman filter state
 * @param {number} dt - Time in the future (seconds)
 * @returns {object} Predicted position {x, y}
 */
export function predictPosition(filter, dt) {
  const [x, y, vx, vy] = filter.state;
  return {
    x: x + vx * dt,
    y: y + vy * dt,
  };
}

/**
 * Get the speed (magnitude of velocity).
 * @param {object} filter - Kalman filter state
 * @returns {number} Speed in pixels per second
 */
export function getSpeed(filter) {
  const { vx, vy } = getVelocity(filter);
  return Math.sqrt(vx * vx + vy * vy);
}

/**
 * Calculate the uncertainty (standard deviation) of position estimate.
 * @param {object} filter - Kalman filter state
 * @returns {object} Uncertainty {x, y}
 */
export function getPositionUncertainty(filter) {
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
