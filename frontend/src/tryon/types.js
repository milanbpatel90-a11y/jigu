/**
 * Type definitions for Face Landmark Try-On feature
 * @module tryon/types
 */

/**
 * Configuration for FaceDetector
 * @typedef {Object} FaceDetectorConfig
 * @property {number} maxFaces - Maximum faces to detect (default: 1)
 * @property {boolean} refineLandmarks - Enable iris refinement (default: true)
 * @property {number} minDetectionConfidence - 0-1 threshold (default: 0.7)
 * @property {number} minTrackingConfidence - 0-1 threshold (default: 0.5)
 */

/**
 * 3D coordinate point
 * @typedef {Object} Point3D
 * @property {number} x - X coordinate (normalized 0-1)
 * @property {number} y - Y coordinate (normalized 0-1)
 * @property {number} z - Z coordinate (normalized 0-1)
 */

/**
 * Bounding box for detected face
 * @typedef {Object} BoundingBox
 * @property {number} xMin - Left edge (normalized 0-1)
 * @property {number} yMin - Top edge (normalized 0-1)
 * @property {number} width - Width (normalized 0-1)
 * @property {number} height - Height (normalized 0-1)
 */

/**
 * Face landmarks data from detection
 * @typedef {Object} FaceLandmarks
 * @property {Point3D[]} landmarks - Array of 478 landmark points
 * @property {BoundingBox} boundingBox - Face bounding box
 * @property {number} confidence - Detection confidence (0-1)
 */

/**
 * Result from face detection
 * @typedef {Object} FaceDetectionResult
 * @property {boolean} detected - Whether a face was detected
 * @property {FaceLandmarks|null} face - Face data if detected
 * @property {number} timestamp - Detection timestamp
 * @property {boolean} [lowConfidence] - True if confidence < 0.7
 */

/**
 * Key facial landmarks extracted for glasses positioning
 * @typedef {Object} KeyLandmarks
 * @property {Point3D} leftEye - Left eye center position
 * @property {Point3D} rightEye - Right eye center position
 * @property {Point3D} noseBridge - Nose bridge position
 * @property {Point3D} leftEar - Left ear/temple position
 * @property {Point3D} rightEar - Right ear/temple position
 * @property {number} ipd - Inter-pupillary distance (normalized)
 * @property {string[]} [missingLandmarks] - List of landmarks that couldn't be extracted
 */

/**
 * Face rotation angles
 * @typedef {Object} FaceRotation
 * @property {number} pitch - Rotation around X axis (radians, -π to π)
 * @property {number} yaw - Rotation around Y axis (radians, -π to π)
 * @property {number} roll - Rotation around Z axis (radians, -π to π)
 */

/**
 * 3D transformation for glasses positioning
 * @typedef {Object} GlassesTransform
 * @property {Point3D} position - Position in 3D space
 * @property {Point3D} rotation - Euler rotation angles (radians)
 * @property {number} scale - Scale factor (positive number)
 */

/**
 * User adjustment offsets for glasses positioning
 * @typedef {Object} AdjustmentOffsets
 * @property {number} verticalOffset - Vertical position offset (-1 to 1, default 0)
 * @property {number} scaleMultiplier - Scale multiplier (0.5 to 1.5, default 1)
 */

/**
 * Configuration for TryOnRenderer
 * @typedef {Object} TryOnRendererConfig
 * @property {number} smoothingFactor - Smoothing factor 0-1 (default: 0.3)
 * @property {boolean} showDebugOverlay - Show landmark debug points (default: false)
 */

/**
 * Glasses style customization
 * @typedef {Object} GlassesStyle
 * @property {string} [lensColor] - Lens color hex string
 * @property {string} [frameColor] - Frame color hex string
 * @property {number} [tintOpacity] - Lens tint opacity (0-1)
 */

/**
 * Try-on controller state
 * @typedef {Object} TryOnState
 * @property {'idle'|'webcam'|'photo'} mode - Current mode
 * @property {boolean} cameraActive - Whether camera is active
 * @property {boolean} faceDetected - Whether face is currently detected
 * @property {string|null} glassesModel - Current glasses model URL
 * @property {AdjustmentOffsets} adjustments - Current adjustment values
 */

// MediaPipe landmark indices for key facial features
export const LANDMARK_INDICES = {
  // Eye centers (iris landmarks from refined model)
  LEFT_EYE_CENTER: 468,
  RIGHT_EYE_CENTER: 473,
  
  // Nose bridge points
  NOSE_BRIDGE_TOP: 6,
  NOSE_BRIDGE_MID: 197,
  
  // Ear attachment points (temple area)
  LEFT_EAR: 234,
  RIGHT_EAR: 454,
  
  // Face outline for rotation estimation
  CHIN: 152,
  FOREHEAD: 10,
  LEFT_CHEEK: 234,
  RIGHT_CHEEK: 454
};

// Reference values for transform calculations
export const REFERENCE_VALUES = {
  IPD: 0.12,              // Normalized IPD for scale=1
  DEPTH_OFFSET: 0.02,     // Z offset from face surface
  MIN_CONFIDENCE: 0.7     // Minimum confidence threshold
};

// Default configurations
export const DEFAULT_FACE_DETECTOR_CONFIG = {
  maxFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.5
};

export const DEFAULT_RENDERER_CONFIG = {
  smoothingFactor: 0.3,
  showDebugOverlay: false
};

export const DEFAULT_ADJUSTMENTS = {
  verticalOffset: 0,
  scaleMultiplier: 1
};
