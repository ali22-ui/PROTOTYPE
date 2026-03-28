/**
 * Appearance feature extraction utilities for person re-identification.
 * Extracts visual features from person crops for matching across frames.
 */

/**
 * Number of bins for HSV histogram.
 */
const HSV_BINS = {
  H: 12, // Hue bins (0-180 scaled to 0-12)
  S: 8,  // Saturation bins
  V: 8,  // Value bins
};

/**
 * Number of dominant colors to extract.
 */
const DOMINANT_COLORS_COUNT = 3;

/**
 * Convert RGB to HSV color space.
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {object} HSV values {h: 0-180, s: 0-255, v: 0-255}
 */
export function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const v = max;

  if (delta !== 0) {
    s = delta / max;

    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }

    h *= 30; // Scale to 0-180 (OpenCV convention)
    if (h < 0) h += 180;
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 255),
    v: Math.round(v * 255),
  };
}

/**
 * Extract image data from a canvas region.
 * @param {HTMLCanvasElement|CanvasRenderingContext2D} source - Canvas or context
 * @param {object} region - Region to extract {x, y, w, h}
 * @returns {ImageData|null} Extracted image data
 */
export function extractRegion(source, region) {
  try {
    const ctx = source.getContext ? source.getContext('2d') : source;
    const { x, y, w, h } = region;
    
    // Clamp to canvas bounds
    const canvasWidth = ctx.canvas?.width ?? source.width;
    const canvasHeight = ctx.canvas?.height ?? source.height;
    
    const clampedX = Math.max(0, Math.min(x, canvasWidth - 1));
    const clampedY = Math.max(0, Math.min(y, canvasHeight - 1));
    const clampedW = Math.min(w, canvasWidth - clampedX);
    const clampedH = Math.min(h, canvasHeight - clampedY);
    
    if (clampedW <= 0 || clampedH <= 0) {
      return null;
    }
    
    return ctx.getImageData(clampedX, clampedY, clampedW, clampedH);
  } catch (err) {
    console.warn('Failed to extract region:', err);
    return null;
  }
}

/**
 * Compute HSV color histogram from image data.
 * @param {ImageData} imageData - Image data to analyze
 * @returns {Float32Array} Normalized histogram (H*S*V bins)
 */
export function computeHsvHistogram(imageData) {
  const totalBins = HSV_BINS.H * HSV_BINS.S * HSV_BINS.V;
  const histogram = new Float32Array(totalBins);
  const data = imageData.data;
  let pixelCount = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    // Skip transparent pixels
    if (a < 128) continue;

    const hsv = rgbToHsv(r, g, b);
    
    // Quantize to histogram bins
    const hBin = Math.min(Math.floor(hsv.h / (180 / HSV_BINS.H)), HSV_BINS.H - 1);
    const sBin = Math.min(Math.floor(hsv.s / (256 / HSV_BINS.S)), HSV_BINS.S - 1);
    const vBin = Math.min(Math.floor(hsv.v / (256 / HSV_BINS.V)), HSV_BINS.V - 1);
    
    const binIndex = hBin * (HSV_BINS.S * HSV_BINS.V) + sBin * HSV_BINS.V + vBin;
    histogram[binIndex]++;
    pixelCount++;
  }

  // Normalize histogram
  if (pixelCount > 0) {
    for (let i = 0; i < totalBins; i++) {
      histogram[i] /= pixelCount;
    }
  }

  return histogram;
}

/**
 * Compute a simplified color histogram (just hue).
 * Faster but less discriminative than full HSV.
 * @param {ImageData} imageData - Image data to analyze
 * @param {number} bins - Number of hue bins
 * @returns {Float32Array} Normalized hue histogram
 */
export function computeHueHistogram(imageData, bins = 24) {
  const histogram = new Float32Array(bins);
  const data = imageData.data;
  let pixelCount = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a < 128) continue;

    const hsv = rgbToHsv(r, g, b);
    
    // Only count saturated colors (ignore grays)
    if (hsv.s > 30 && hsv.v > 30) {
      const binIndex = Math.min(Math.floor(hsv.h / (180 / bins)), bins - 1);
      histogram[binIndex]++;
      pixelCount++;
    }
  }

  if (pixelCount > 0) {
    for (let i = 0; i < bins; i++) {
      histogram[i] /= pixelCount;
    }
  }

  return histogram;
}

/**
 * Extract dominant colors from image data using simple clustering.
 * @param {ImageData} imageData - Image data to analyze
 * @param {number} count - Number of dominant colors to extract
 * @returns {Array} Array of dominant colors [{r, g, b, percentage}, ...]
 */
export function extractDominantColors(imageData, count = DOMINANT_COLORS_COUNT) {
  const data = imageData.data;
  const colorCounts = new Map();
  let totalPixels = 0;

  // Quantize colors to reduce unique values
  const quantize = (value) => Math.floor(value / 32) * 32;

  for (let i = 0; i < data.length; i += 4) {
    const r = quantize(data[i]);
    const g = quantize(data[i + 1]);
    const b = quantize(data[i + 2]);
    const a = data[i + 3];

    if (a < 128) continue;

    const key = `${r},${g},${b}`;
    colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
    totalPixels++;
  }

  if (totalPixels === 0) {
    return [];
  }

  // Sort by frequency
  const sorted = Array.from(colorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, count);

  return sorted.map(([key, cnt]) => {
    const [r, g, b] = key.split(',').map(Number);
    return {
      r,
      g,
      b,
      percentage: cnt / totalPixels,
    };
  });
}

/**
 * Compute mean brightness of image.
 * @param {ImageData} imageData - Image data to analyze
 * @returns {number} Mean brightness (0-255)
 */
export function computeMeanBrightness(imageData) {
  const data = imageData.data;
  let sum = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a < 128) continue;

    // Luminance formula
    sum += 0.299 * r + 0.587 * g + 0.114 * b;
    count++;
  }

  return count > 0 ? sum / count : 128;
}

/**
 * Extract comprehensive appearance features from a person crop.
 * @param {HTMLCanvasElement|CanvasRenderingContext2D} canvas - Source canvas
 * @param {object} bbox - Bounding box {x, y, w, h} in pixels
 * @returns {object|null} Appearance features or null if extraction failed
 */
export function extractAppearanceFeatures(canvas, bbox) {
  const imageData = extractRegion(canvas, bbox);
  if (!imageData) return null;

  // Split into upper (torso) and lower (legs) regions for clothing analysis
  const height = imageData.height;
  const upperHeight = Math.floor(height * 0.5);
  
  // Create separate image data for upper and lower body
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.canvas.width = imageData.width;
  ctx.canvas.height = imageData.height;
  ctx.putImageData(imageData, 0, 0);
  
  const upperData = ctx.getImageData(0, 0, imageData.width, upperHeight);
  const lowerData = ctx.getImageData(0, upperHeight, imageData.width, height - upperHeight);

  return {
    // Full body histogram
    colorHistogram: Array.from(computeHsvHistogram(imageData)),
    
    // Separate upper/lower histograms for better matching
    upperHistogram: Array.from(computeHueHistogram(upperData, 12)),
    lowerHistogram: Array.from(computeHueHistogram(lowerData, 12)),
    
    // Body proportions
    aspectRatio: bbox.h / Math.max(bbox.w, 1),
    area: bbox.w * bbox.h,
    
    // Color features
    dominantColors: extractDominantColors(imageData),
    brightness: computeMeanBrightness(imageData),
    
    // Metadata
    timestamp: Date.now(),
  };
}

/**
 * Calculate histogram intersection similarity (0 to 1).
 * @param {Array|Float32Array} hist1 - First histogram
 * @param {Array|Float32Array} hist2 - Second histogram
 * @returns {number} Similarity score (0 to 1)
 */
export function histogramIntersection(hist1, hist2) {
  if (!hist1 || !hist2 || hist1.length !== hist2.length) {
    return 0;
  }

  let intersection = 0;
  for (let i = 0; i < hist1.length; i++) {
    intersection += Math.min(hist1[i], hist2[i]);
  }

  return intersection;
}

/**
 * Calculate color similarity between two dominant color sets.
 * @param {Array} colors1 - First set of dominant colors
 * @param {Array} colors2 - Second set of dominant colors
 * @returns {number} Similarity score (0 to 1)
 */
export function dominantColorSimilarity(colors1, colors2) {
  if (!colors1?.length || !colors2?.length) {
    return 0;
  }

  let totalSimilarity = 0;
  const maxColors = Math.min(colors1.length, colors2.length);

  for (let i = 0; i < maxColors; i++) {
    const c1 = colors1[i];
    const c2 = colors2[i];

    // Euclidean distance in RGB space (normalized to 0-1)
    const distance = Math.sqrt(
      Math.pow(c1.r - c2.r, 2) +
      Math.pow(c1.g - c2.g, 2) +
      Math.pow(c1.b - c2.b, 2)
    ) / (255 * Math.sqrt(3));

    totalSimilarity += (1 - distance) * Math.min(c1.percentage, c2.percentage);
  }

  return totalSimilarity;
}

/**
 * Calculate aspect ratio similarity.
 * @param {number} ratio1 - First aspect ratio
 * @param {number} ratio2 - Second aspect ratio
 * @returns {number} Similarity score (0 to 1)
 */
export function aspectRatioSimilarity(ratio1, ratio2) {
  if (!ratio1 || !ratio2) return 0;
  const maxRatio = Math.max(ratio1, ratio2);
  if (maxRatio === 0) return 1;
  return 1 - Math.abs(ratio1 - ratio2) / maxRatio;
}

/**
 * Calculate overall appearance similarity between two feature sets.
 * @param {object} features1 - First appearance features
 * @param {object} features2 - Second appearance features
 * @param {object} weights - Optional weight configuration
 * @returns {number} Combined similarity score (0 to 1)
 */
export function computeAppearanceSimilarity(features1, features2, weights = {}) {
  if (!features1 || !features2) {
    return 0;
  }

  const {
    histogramWeight = 0.35,
    upperHistWeight = 0.15,
    lowerHistWeight = 0.15,
    dominantColorWeight = 0.20,
    aspectRatioWeight = 0.10,
    brightnessWeight = 0.05,
  } = weights;

  const histSim = histogramIntersection(features1.colorHistogram, features2.colorHistogram);
  const upperSim = histogramIntersection(features1.upperHistogram, features2.upperHistogram);
  const lowerSim = histogramIntersection(features1.lowerHistogram, features2.lowerHistogram);
  const colorSim = dominantColorSimilarity(features1.dominantColors, features2.dominantColors);
  const aspectSim = aspectRatioSimilarity(features1.aspectRatio, features2.aspectRatio);
  
  // Brightness similarity (normalized difference)
  const brightDiff = Math.abs(features1.brightness - features2.brightness) / 255;
  const brightSim = 1 - brightDiff;

  return (
    histSim * histogramWeight +
    upperSim * upperHistWeight +
    lowerSim * lowerHistWeight +
    colorSim * dominantColorWeight +
    aspectSim * aspectRatioWeight +
    brightSim * brightnessWeight
  );
}

/**
 * Update a rolling average of appearance features.
 * @param {object} existing - Existing averaged features
 * @param {object} newFeatures - New features to incorporate
 * @param {number} alpha - Smoothing factor (0-1, higher = more weight to new)
 * @returns {object} Updated averaged features
 */
export function updateRollingAverage(existing, newFeatures, alpha = 0.3) {
  if (!existing) {
    return { ...newFeatures };
  }

  const blend = (arr1, arr2) => {
    if (!arr1 || !arr2) return arr2 || arr1;
    return arr1.map((v, i) => v * (1 - alpha) + (arr2[i] || 0) * alpha);
  };

  return {
    colorHistogram: blend(existing.colorHistogram, newFeatures.colorHistogram),
    upperHistogram: blend(existing.upperHistogram, newFeatures.upperHistogram),
    lowerHistogram: blend(existing.lowerHistogram, newFeatures.lowerHistogram),
    aspectRatio: existing.aspectRatio * (1 - alpha) + newFeatures.aspectRatio * alpha,
    area: existing.area * (1 - alpha) + newFeatures.area * alpha,
    dominantColors: newFeatures.dominantColors, // Use latest dominant colors
    brightness: existing.brightness * (1 - alpha) + newFeatures.brightness * alpha,
    timestamp: newFeatures.timestamp,
  };
}

export default {
  rgbToHsv,
  extractRegion,
  computeHsvHistogram,
  computeHueHistogram,
  extractDominantColors,
  computeMeanBrightness,
  extractAppearanceFeatures,
  histogramIntersection,
  dominantColorSimilarity,
  aspectRatioSimilarity,
  computeAppearanceSimilarity,
  updateRollingAverage,
};
