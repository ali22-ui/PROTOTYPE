/**
 * IOU (Intersection Over Union) utilities for bounding box operations.
 * Used for duplicate detection, overlap resolution, and track association.
 */

/**
 * Calculate the area of a bounding box.
 * @param {object} box - Bounding box {x, y, w, h} or {originX, originY, width, height}
 * @returns {number} Area in square pixels
 */
export function getArea(box) {
  const width = box.w ?? box.width;
  const height = box.h ?? box.height;
  return width * height;
}

/**
 * Normalize a bounding box to standard format {x, y, w, h}.
 * Handles both percentage-based and pixel-based coordinates.
 * @param {object} box - Bounding box in any format
 * @returns {object} Normalized box {x, y, w, h}
 */
export function normalizeBox(box) {
  return {
    x: box.x ?? box.originX ?? 0,
    y: box.y ?? box.originY ?? 0,
    w: box.w ?? box.width ?? 0,
    h: box.h ?? box.height ?? 0,
  };
}

/**
 * Calculate Intersection Over Union (IOU) between two bounding boxes.
 * IOU = Area of Intersection / Area of Union
 * 
 * @param {object} box1 - First bounding box {x, y, w, h}
 * @param {object} box2 - Second bounding box {x, y, w, h}
 * @returns {number} IOU value between 0 and 1
 */
export function calculateIOU(box1, box2) {
  const a = normalizeBox(box1);
  const b = normalizeBox(box2);

  // Calculate coordinates of intersection rectangle
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);

  // Check if there is an intersection
  if (x2 <= x1 || y2 <= y1) {
    return 0;
  }

  // Calculate intersection area
  const intersectionArea = (x2 - x1) * (y2 - y1);

  // Calculate union area
  const area1 = a.w * a.h;
  const area2 = b.w * b.h;
  const unionArea = area1 + area2 - intersectionArea;

  // Avoid division by zero
  if (unionArea <= 0) {
    return 0;
  }

  return intersectionArea / unionArea;
}

/**
 * Calculate overlap ratio relative to the smaller box.
 * Useful for detecting when a small box is contained within a larger one.
 * 
 * @param {object} box1 - First bounding box
 * @param {object} box2 - Second bounding box
 * @returns {number} Overlap ratio relative to smaller box (0 to 1)
 */
export function calculateOverlapRatio(box1, box2) {
  const a = normalizeBox(box1);
  const b = normalizeBox(box2);

  // Calculate intersection
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);

  if (x2 <= x1 || y2 <= y1) {
    return 0;
  }

  const intersectionArea = (x2 - x1) * (y2 - y1);
  const smallerArea = Math.min(a.w * a.h, b.w * b.h);

  if (smallerArea <= 0) {
    return 0;
  }

  return intersectionArea / smallerArea;
}

/**
 * Check if two boxes are duplicates based on IOU threshold.
 * @param {object} box1 - First bounding box
 * @param {object} box2 - Second bounding box
 * @param {number} threshold - IOU threshold (default 0.5)
 * @returns {boolean} True if boxes are considered duplicates
 */
export function areDuplicates(box1, box2, threshold = 0.5) {
  return calculateIOU(box1, box2) >= threshold;
}

/**
 * Remove duplicate detections using Non-Maximum Suppression (NMS).
 * Keeps the detection with highest confidence when boxes overlap.
 * 
 * @param {Array} detections - Array of detections with {bbox, confidence}
 * @param {number} iouThreshold - IOU threshold for considering duplicates
 * @returns {Array} Filtered detections with duplicates removed
 */
export function nonMaxSuppression(detections, iouThreshold = 0.5) {
  if (!detections || detections.length === 0) {
    return [];
  }

  // Sort by confidence (highest first)
  const sorted = [...detections].sort((a, b) => {
    const confA = a.confidence ?? a.categories?.[0]?.score ?? 0;
    const confB = b.confidence ?? b.categories?.[0]?.score ?? 0;
    return confB - confA;
  });

  const kept = [];
  const suppressed = new Set();

  for (let i = 0; i < sorted.length; i++) {
    if (suppressed.has(i)) continue;

    kept.push(sorted[i]);

    // Suppress all lower-confidence overlapping boxes
    const bbox1 = sorted[i].bbox ?? sorted[i].boundingBox;
    for (let j = i + 1; j < sorted.length; j++) {
      if (suppressed.has(j)) continue;

      const bbox2 = sorted[j].bbox ?? sorted[j].boundingBox;
      if (calculateIOU(bbox1, bbox2) >= iouThreshold) {
        suppressed.add(j);
      }
    }
  }

  return kept;
}

/**
 * Find the best matching box from a list based on IOU.
 * @param {object} targetBox - The box to match against
 * @param {Array} candidates - Array of candidate boxes
 * @param {number} minIOU - Minimum IOU to consider a match
 * @returns {object|null} Best match {index, box, iou} or null if no match
 */
export function findBestMatch(targetBox, candidates, minIOU = 0.3) {
  let bestMatch = null;
  let bestIOU = minIOU;

  for (let i = 0; i < candidates.length; i++) {
    const candidateBox = candidates[i].bbox ?? candidates[i].boundingBox ?? candidates[i];
    const iou = calculateIOU(targetBox, candidateBox);
    
    if (iou > bestIOU) {
      bestMatch = { index: i, box: candidates[i], iou };
      bestIOU = iou;
    }
  }

  return bestMatch;
}

/**
 * Calculate the distance between centers of two bounding boxes.
 * @param {object} box1 - First bounding box
 * @param {object} box2 - Second bounding box
 * @returns {number} Distance between centers
 */
export function centerDistance(box1, box2) {
  const a = normalizeBox(box1);
  const b = normalizeBox(box2);

  const center1 = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const center2 = { x: b.x + b.w / 2, y: b.y + b.h / 2 };

  return Math.sqrt(
    Math.pow(center1.x - center2.x, 2) + 
    Math.pow(center1.y - center2.y, 2)
  );
}

/**
 * Check if a point is inside a bounding box.
 * @param {object} point - Point {x, y}
 * @param {object} box - Bounding box
 * @returns {boolean} True if point is inside box
 */
export function isPointInBox(point, box) {
  const b = normalizeBox(box);
  return (
    point.x >= b.x &&
    point.x <= b.x + b.w &&
    point.y >= b.y &&
    point.y <= b.y + b.h
  );
}

/**
 * Expand a bounding box by a margin.
 * @param {object} box - Bounding box
 * @param {number} margin - Margin to add (can be negative to shrink)
 * @returns {object} Expanded box
 */
export function expandBox(box, margin) {
  const b = normalizeBox(box);
  return {
    x: b.x - margin,
    y: b.y - margin,
    w: b.w + 2 * margin,
    h: b.h + 2 * margin,
  };
}

/**
 * Calculate the aspect ratio of a bounding box.
 * @param {object} box - Bounding box
 * @returns {number} Aspect ratio (height / width)
 */
export function getAspectRatio(box) {
  const b = normalizeBox(box);
  return b.w > 0 ? b.h / b.w : 0;
}

/**
 * Merge multiple bounding boxes into one encompassing box.
 * @param {Array} boxes - Array of bounding boxes
 * @returns {object} Merged bounding box
 */
export function mergeBoxes(boxes) {
  if (!boxes || boxes.length === 0) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }

  const normalized = boxes.map(normalizeBox);
  
  const minX = Math.min(...normalized.map(b => b.x));
  const minY = Math.min(...normalized.map(b => b.y));
  const maxX = Math.max(...normalized.map(b => b.x + b.w));
  const maxY = Math.max(...normalized.map(b => b.y + b.h));

  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  };
}

export default {
  calculateIOU,
  calculateOverlapRatio,
  areDuplicates,
  nonMaxSuppression,
  findBestMatch,
  centerDistance,
  isPointInBox,
  expandBox,
  getAspectRatio,
  getArea,
  normalizeBox,
  mergeBoxes,
};
