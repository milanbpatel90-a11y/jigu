/**
 * LandmarkMapper - Converts facial landmarks to 3D transformation parameters
 * @module tryon/LandmarkMapper
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { LANDMARK_INDICES, REFERENCE_VALUES, DEFAULT_ADJUSTMENTS } from './types.js';

/**
 * List of required landmark names for validation
 */
export const REQUIRED_LANDMARKS = ['leftEye', 'rightEye', 'noseBridge', 'leftEar', 'rightEar'];

/**
 * Check if a landmark point is valid (has valid coordinates)
 * @param {import('./types.js').Point3D|null|undefined} point
 * @returns {boolean}
 */
function isValidPoint(point) {
  if (!point) return false;
  return typeof point.x === 'number' && !isNaN(point.x) &&
         typeof point.y === 'number' && !isNaN(point.y) &&
         typeof point.z === 'number' && !isNaN(point.z);
}

/**
 * Extract key landmarks from full face mesh
 * Requirements: 2.1, 2.2, 2.3, 2.5
 * 
 * @param {import('./types.js').FaceLandmarks} faceLandmarks - Full face landmarks from detection
 * @returns {import('./types.js').KeyLandmarks} Extracted key landmarks with IPD and missing list
 */
export function extractKeyLandmarks(faceLandmarks) {
  const landmarks = faceLandmarks?.landmarks;
  const missingLandmarks = [];
  
  // Helper to safely extract a landmark point
  const extractPoint = (index, name) => {
    // Check if landmarks array exists and has enough elements
    if (!landmarks || !Array.isArray(landmarks) || index >= landmarks.length) {
      missingLandmarks.push(name);
      return null;
    }
    
    const point = landmarks[index];
    
    // Check if the point is valid
    if (!isValidPoint(point)) {
      missingLandmarks.push(name);
      return null;
    }
    
    // Ensure coordinates are normalized (0-1 range)
    return {
      x: clamp(point.x, 0, 1),
      y: clamp(point.y, 0, 1),
      z: clamp(point.z, 0, 1)
    };
  };

  // Extract key landmarks using defined indices
  const leftEye = extractPoint(LANDMARK_INDICES.LEFT_EYE_CENTER, 'leftEye');
  const rightEye = extractPoint(LANDMARK_INDICES.RIGHT_EYE_CENTER, 'rightEye');
  const noseBridge = extractPoint(LANDMARK_INDICES.NOSE_BRIDGE_TOP, 'noseBridge');
  const leftEar = extractPoint(LANDMARK_INDICES.LEFT_EAR, 'leftEar');
  const rightEar = extractPoint(LANDMARK_INDICES.RIGHT_EAR, 'rightEar');

  // Calculate IPD (inter-pupillary distance) from eye centers
  let ipd = 0;
  if (leftEye && rightEye) {
    ipd = calculateDistance(leftEye, rightEye);
  }
  // Note: IPD is derived from eyes, so we don't add it to missingLandmarks separately
  // If eyes are missing, IPD will be 0 and the eye landmarks will be in missingLandmarks

  // Build result with default values for missing landmarks
  const result = {
    leftEye: leftEye || { x: 0, y: 0, z: 0 },
    rightEye: rightEye || { x: 0, y: 0, z: 0 },
    noseBridge: noseBridge || { x: 0, y: 0, z: 0 },
    leftEar: leftEar || { x: 0, y: 0, z: 0 },
    rightEar: rightEar || { x: 0, y: 0, z: 0 },
    ipd,
    // Always include missingLandmarks array (empty if all present) - Requirement 2.5
    missingLandmarks: [...missingLandmarks]
  };

  return result;
}

/**
 * Check if all required landmarks were successfully extracted
 * @param {import('./types.js').KeyLandmarks} keyLandmarks
 * @returns {boolean}
 */
export function hasAllRequiredLandmarks(keyLandmarks) {
  return !keyLandmarks.missingLandmarks || keyLandmarks.missingLandmarks.length === 0;
}

/**
 * Get list of missing landmarks from extraction result
 * @param {import('./types.js').KeyLandmarks} keyLandmarks
 * @returns {string[]}
 */
export function getMissingLandmarks(keyLandmarks) {
  return keyLandmarks.missingLandmarks || [];
}

/**
 * Estimate face rotation from landmark positions
 * Requirements: 2.4
 * 
 * @param {import('./types.js').KeyLandmarks} keyLandmarks - Extracted key landmarks
 * @returns {import('./types.js').FaceRotation} Estimated rotation angles
 */
export function estimateRotation(keyLandmarks) {
  const { leftEye, rightEye, noseBridge } = keyLandmarks;

  // Calculate yaw (rotation around Y axis) from eye positions
  // When face turns left, right eye appears closer to center
  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const eyeSpanX = rightEye.x - leftEye.x;
  
  // Use nose bridge offset from eye center to estimate yaw
  const noseOffsetX = noseBridge.x - eyeMidX;
  // Normalize yaw: positive = looking right, negative = looking left
  let yaw = Math.atan2(noseOffsetX, eyeSpanX) * 2;

  // Calculate pitch (rotation around X axis) from nose and eye positions
  // When looking up, nose appears higher relative to eyes
  const eyeMidY = (leftEye.y + rightEye.y) / 2;
  const noseOffsetY = noseBridge.y - eyeMidY;
  // Normalize pitch: positive = looking down, negative = looking up
  let pitch = Math.atan2(noseOffsetY, 0.1) * 0.5;

  // Calculate roll (rotation around Z axis) from eye tilt
  // When head tilts, eyes are no longer horizontal
  const eyeDeltaY = rightEye.y - leftEye.y;
  const eyeDeltaX = rightEye.x - leftEye.x;
  let roll = Math.atan2(eyeDeltaY, eyeDeltaX);

  // Clamp all angles to [-π, π] range
  pitch = clampAngle(pitch);
  yaw = clampAngle(yaw);
  roll = clampAngle(roll);

  return { pitch, yaw, roll };
}

/**
 * Calculate 3D transform for glasses positioning
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 * 
 * @param {import('./types.js').KeyLandmarks} keyLandmarks - Extracted key landmarks
 * @param {number} imageWidth - Image width in pixels
 * @param {number} imageHeight - Image height in pixels
 * @param {import('./types.js').AdjustmentOffsets} [adjustments] - User adjustments
 * @returns {import('./types.js').GlassesTransform} Transform for glasses positioning
 */
export function calculateTransform(keyLandmarks, _imageWidth, _imageHeight, adjustments = DEFAULT_ADJUSTMENTS) {
  const { leftEye, rightEye, ipd } = keyLandmarks;
  const { verticalOffset, scaleMultiplier } = { ...DEFAULT_ADJUSTMENTS, ...adjustments };

  // Position: center between eyes with Z offset (Requirement 3.1)
  const centerX = (leftEye.x + rightEye.x) / 2;
  const centerY = (leftEye.y + rightEye.y) / 2;
  const centerZ = (leftEye.z + rightEye.z) / 2 - REFERENCE_VALUES.DEPTH_OFFSET;

  // Apply vertical offset adjustment (Requirement 3.5)
  const adjustedY = centerY + verticalOffset * 0.1;

  const position = {
    x: centerX,
    y: clamp(adjustedY, 0, 1),
    z: centerZ
  };

  // Scale: based on IPD relative to reference value (Requirement 3.2)
  const baseScale = ipd / REFERENCE_VALUES.IPD;
  const scale = Math.max(0.1, baseScale * scaleMultiplier);

  // Rotation: from estimated face rotation (Requirement 3.3)
  const faceRotation = estimateRotation(keyLandmarks);
  const rotation = {
    x: faceRotation.pitch,
    y: faceRotation.yaw,
    z: faceRotation.roll
  };

  return { position, rotation, scale };
}

/**
 * Calculate Euclidean distance between two 3D points
 * @param {import('./types.js').Point3D} p1 
 * @param {import('./types.js').Point3D} p2 
 * @returns {number}
 */
function calculateDistance(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = p2.z - p1.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Clamp a value to a range
 * @param {number} value 
 * @param {number} min 
 * @param {number} max 
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Clamp an angle to [-π, π] range
 * @param {number} angle - Angle in radians
 * @returns {number}
 */
function clampAngle(angle) {
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}

/**
 * LandmarkMapper class for stateful operations
 */
export class LandmarkMapper {
  /**
   * Extract key landmarks from full face mesh
   * @param {import('./types.js').FaceLandmarks} faceLandmarks
   * @returns {import('./types.js').KeyLandmarks}
   */
  extractKeyLandmarks(faceLandmarks) {
    return extractKeyLandmarks(faceLandmarks);
  }

  /**
   * Calculate glasses transform from key landmarks
   * @param {import('./types.js').KeyLandmarks} keyLandmarks
   * @param {number} imageWidth
   * @param {number} imageHeight
   * @param {import('./types.js').AdjustmentOffsets} [adjustments]
   * @returns {import('./types.js').GlassesTransform}
   */
  calculateTransform(keyLandmarks, imageWidth, imageHeight, adjustments) {
    return calculateTransform(keyLandmarks, imageWidth, imageHeight, adjustments);
  }

  /**
   * Estimate face rotation from landmarks
   * @param {import('./types.js').KeyLandmarks} keyLandmarks
   * @returns {import('./types.js').FaceRotation}
   */
  estimateRotation(keyLandmarks) {
    return estimateRotation(keyLandmarks);
  }
}

export default LandmarkMapper;
