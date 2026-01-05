/**
 * FaceDetector - Detects faces and extracts landmarks using MediaPipe Face Landmarker
 * @module tryon/FaceDetector
 * 
 * Requirements: 1.1, 1.2
 */

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { DEFAULT_FACE_DETECTOR_CONFIG, REFERENCE_VALUES } from './types.js';

/**
 * FaceDetector class for detecting faces and extracting facial landmarks
 */
export class FaceDetector {
  /**
   * @param {Partial<import('./types.js').FaceDetectorConfig>} config
   */
  constructor(config = {}) {
    this.config = { ...DEFAULT_FACE_DETECTOR_CONFIG, ...config };
    this.faceLandmarker = null;
    this.initialized = false;
  }

  /**
   * Initialize the face landmarker model
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'IMAGE',
      numFaces: this.config.maxFaces,
      minFaceDetectionConfidence: this.config.minDetectionConfidence,
      minFacePresenceConfidence: this.config.minDetectionConfidence,
      minTrackingConfidence: this.config.minTrackingConfidence,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false
    });

    this.initialized = true;
  }


  /**
   * Set running mode for video or image processing
   * @param {'IMAGE'|'VIDEO'} mode
   */
  async setRunningMode(mode) {
    if (!this.faceLandmarker) {
      throw new Error('FaceDetector not initialized. Call initialize() first.');
    }
    await this.faceLandmarker.setOptions({ runningMode: mode });
  }

  /**
   * Detect face in a single image
   * Requirements: 1.3, 1.4, 1.5
   * @param {HTMLImageElement|HTMLCanvasElement} image
   * @returns {Promise<import('./types.js').FaceDetectionResult>}
   */
  async detectImage(image) {
    if (!this.faceLandmarker) {
      throw new Error('FaceDetector not initialized. Call initialize() first.');
    }

    const result = this.faceLandmarker.detect(image);
    return this._processDetectionResult(result);
  }

  /**
   * Detect face in video frame
   * Requirements: 1.3, 1.4, 1.5
   * @param {HTMLVideoElement} video
   * @param {number} [timestamp] - Optional timestamp for video mode
   * @returns {Promise<import('./types.js').FaceDetectionResult>}
   */
  async detectFrame(video, timestamp) {
    if (!this.faceLandmarker) {
      throw new Error('FaceDetector not initialized. Call initialize() first.');
    }

    const ts = timestamp ?? performance.now();
    const result = this.faceLandmarker.detectForVideo(video, ts);
    return this._processDetectionResult(result);
  }

  /**
   * Process MediaPipe detection result into our format
   * Handles no-face scenarios and selects largest face when multiple detected
   * @private
   * @param {Object} result - MediaPipe detection result
   * @returns {import('./types.js').FaceDetectionResult}
   */
  _processDetectionResult(result) {
    const timestamp = Date.now();

    // Handle no face detected - return valid empty result (Requirement 1.3)
    if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
      return {
        detected: false,
        face: null,
        timestamp,
        lowConfidence: false
      };
    }

    // Select largest face when multiple detected (Requirement 1.4)
    let selectedIndex = 0;
    if (result.faceLandmarks.length > 1) {
      selectedIndex = this._selectLargestFace(result.faceLandmarks);
    }

    const landmarks = result.faceLandmarks[selectedIndex];
    const boundingBox = this._calculateBoundingBox(landmarks);
    const confidence = this._estimateConfidence(landmarks);

    // Check for low confidence (Requirement 1.5)
    const lowConfidence = confidence < REFERENCE_VALUES.MIN_CONFIDENCE;

    return {
      detected: true,
      face: {
        landmarks: landmarks.map(lm => ({ x: lm.x, y: lm.y, z: lm.z })),
        boundingBox,
        confidence
      },
      timestamp,
      lowConfidence
    };
  }

  /**
   * Select the largest face from multiple detections based on bounding box area
   * @private
   * @param {Array} faceLandmarks - Array of face landmark arrays
   * @returns {number} Index of the largest face
   */
  _selectLargestFace(faceLandmarks) {
    let maxArea = 0;
    let maxIndex = 0;

    for (let i = 0; i < faceLandmarks.length; i++) {
      const bbox = this._calculateBoundingBox(faceLandmarks[i]);
      const area = bbox.width * bbox.height;
      if (area > maxArea) {
        maxArea = area;
        maxIndex = i;
      }
    }

    return maxIndex;
  }

  /**
   * Calculate bounding box from landmarks
   * @private
   * @param {Array} landmarks - Face landmarks array
   * @returns {import('./types.js').BoundingBox}
   */
  _calculateBoundingBox(landmarks) {
    let xMin = 1, xMax = 0, yMin = 1, yMax = 0;

    for (const lm of landmarks) {
      xMin = Math.min(xMin, lm.x);
      xMax = Math.max(xMax, lm.x);
      yMin = Math.min(yMin, lm.y);
      yMax = Math.max(yMax, lm.y);
    }

    return {
      xMin,
      yMin,
      width: xMax - xMin,
      height: yMax - yMin
    };
  }

  /**
   * Estimate detection confidence from landmark positions
   * Uses face coverage and landmark spread as proxy for confidence
   * @private
   * @param {Array} landmarks - Face landmarks array
   * @returns {number} Confidence value 0-1
   */
  _estimateConfidence(landmarks) {
    // Use bounding box coverage as confidence proxy
    const bbox = this._calculateBoundingBox(landmarks);
    const coverage = bbox.width * bbox.height;
    
    // Normalize to 0-1 range, typical face covers 0.1-0.5 of frame
    const normalizedCoverage = Math.min(coverage / 0.3, 1);
    
    // Also check landmark count (should be 478 for full mesh)
    const landmarkCompleteness = Math.min(landmarks.length / 478, 1);
    
    // Combined confidence
    return (normalizedCoverage * 0.5 + landmarkCompleteness * 0.5);
  }

  /**
   * Check if detector is initialized
   * @returns {boolean}
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Get current configuration
   * @returns {import('./types.js').FaceDetectorConfig}
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Dispose of resources and cleanup
   */
  dispose() {
    if (this.faceLandmarker) {
      this.faceLandmarker.close();
      this.faceLandmarker = null;
    }
    this.initialized = false;
  }
}

export default FaceDetector;
