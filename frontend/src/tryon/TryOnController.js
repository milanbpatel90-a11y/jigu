/**
 * TryOnController - Orchestrates the try-on experience
 * @module tryon/TryOnController
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4
 */

import { FaceDetector } from './FaceDetector.js';
import { LandmarkMapper } from './LandmarkMapper.js';
import { TryOnRenderer } from './TryOnRenderer.js';
import { DEFAULT_ADJUSTMENTS } from './types.js';

/**
 * Supported image formats for photo upload
 * Requirement: 6.4
 */
export const SUPPORTED_IMAGE_FORMATS = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * TryOnController class - orchestrates face detection, landmark mapping, and rendering
 */
export class TryOnController {
  /**
   * @param {FaceDetector} detector - Face detector instance
   * @param {LandmarkMapper} mapper - Landmark mapper instance
   * @param {TryOnRenderer} renderer - Try-on renderer instance
   */
  constructor(detector, mapper, renderer) {
    this.detector = detector;
    this.mapper = mapper;
    this.renderer = renderer;
    
    // State management
    this.state = {
      mode: 'idle',
      cameraActive: false,
      faceDetected: false,
      glassesModel: null,
      adjustments: { ...DEFAULT_ADJUSTMENTS },
      error: null
    };
    
    // Webcam resources
    this.videoElement = null;
    this.mediaStream = null;
    this.detectionLoopId = null;
    this.isDetectionRunning = false;
    
    // Photo processing
    this.photoCanvas = null;
    this.photoImage = null;
  }

  /**
   * Get current state
   * @returns {import('./types.js').TryOnState}
   */
  getState() {
    return { ...this.state };
  }


  /**
   * Load a glasses model for try-on
   * @param {string} modelUrl - URL to glasses GLB model
   * @param {import('./types.js').GlassesStyle} [style] - Optional style customization
   * @returns {Promise<void>}
   */
  async loadGlasses(modelUrl, style) {
    try {
      await this.renderer.initialize(modelUrl);
      this.state.glassesModel = modelUrl;
      this.state.error = null;
      
      if (style) {
        this.renderer.setGlassesStyle(style);
      }
    } catch (error) {
      console.error('Failed to load glasses model:', error);
      this.state.error = `Failed to load glasses model: ${error.message}`;
      throw error;
    }
  }

  /**
   * Start webcam try-on mode
   * Requirement: 5.2, 5.4
   * @returns {Promise<boolean>} True if webcam started successfully
   */
  async startWebcam() {
    // Stop any existing webcam session
    this.stopWebcam();
    
    try {
      // Request camera permission
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      
      // Create video element for webcam feed
      this.videoElement = document.createElement('video');
      this.videoElement.srcObject = this.mediaStream;
      this.videoElement.playsInline = true;
      this.videoElement.muted = true;
      this.videoElement.autoplay = true;
      
      // Wait for video to be ready and playing
      await new Promise((resolve, reject) => {
        this.videoElement.onloadedmetadata = () => {
          this.videoElement.play()
            .then(() => {
              // Wait a frame for video to actually start
              requestAnimationFrame(resolve);
            })
            .catch(reject);
        };
        this.videoElement.onerror = reject;
      });
      
      // Ensure video has valid dimensions
      if (this.videoElement.videoWidth === 0 || this.videoElement.videoHeight === 0) {
        throw new Error('Video has no dimensions');
      }
      
      // Set video as background in renderer
      this.renderer.setBackground(this.videoElement);
      
      // Initialize detector if needed
      if (!this.detector.isInitialized()) {
        await this.detector.initialize();
      }
      
      // Set detector to video mode
      await this.detector.setRunningMode('VIDEO');
      
      // Update state
      this.state.mode = 'webcam';
      this.state.cameraActive = true;
      this.state.error = null;
      
      // Start detection loop
      this._startDetectionLoop();
      
      return true;
    } catch (error) {
      // Handle permission denied (Requirement: 5.3)
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        this.state.error = 'Camera permission denied. Please upload a photo instead.';
        this.state.mode = 'idle';
        return false;
      }
      
      this.state.error = `Failed to start webcam: ${error.message}`;
      this.state.mode = 'idle';
      throw error;
    }
  }


  /**
   * Stop webcam and release resources
   * Requirement: 5.5
   */
  stopWebcam() {
    // Stop detection loop
    this._stopDetectionLoop();
    
    // Stop media stream tracks
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    // Clean up video element
    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
    
    // Update state
    this.state.cameraActive = false;
    this.state.faceDetected = false;
    
    if (this.state.mode === 'webcam') {
      this.state.mode = 'idle';
    }
    
    // Hide glasses when stopping
    this.renderer.setGlassesVisible(false);
  }

  /**
   * Start the face detection loop for webcam mode
   * @private
   */
  _startDetectionLoop() {
    if (this.isDetectionRunning) return;
    
    this.isDetectionRunning = true;
    
    const detectFrame = async () => {
      if (!this.isDetectionRunning || !this.videoElement) {
        return;
      }
      
      try {
        // Detect face in current video frame
        const result = await this.detector.detectFrame(this.videoElement);
        
        if (result.detected && result.face) {
          // Extract key landmarks
          const keyLandmarks = this.mapper.extractKeyLandmarks(result.face);
          
          // Calculate transform with current adjustments
          const transform = this.mapper.calculateTransform(
            keyLandmarks,
            this.videoElement.videoWidth,
            this.videoElement.videoHeight,
            this.state.adjustments
          );
          
          // Update renderer
          this.renderer.updateGlassesTransform(transform);
          this.renderer.setGlassesVisible(true);
          this.state.faceDetected = true;
        } else {
          // No face detected - hide glasses (Requirement: 4.5)
          this.renderer.setGlassesVisible(false);
          this.state.faceDetected = false;
        }
        
        // Render frame
        this.renderer.render();
        
      } catch (error) {
        console.error('Detection error:', error);
      }
      
      // Schedule next frame
      if (this.isDetectionRunning) {
        this.detectionLoopId = requestAnimationFrame(detectFrame);
      }
    };
    
    // Start the loop
    this.detectionLoopId = requestAnimationFrame(detectFrame);
  }

  /**
   * Stop the face detection loop
   * @private
   */
  _stopDetectionLoop() {
    this.isDetectionRunning = false;
    
    if (this.detectionLoopId) {
      cancelAnimationFrame(this.detectionLoopId);
      this.detectionLoopId = null;
    }
  }


  /**
   * Process uploaded photo for try-on
   * Requirement: 6.1, 6.3, 6.4
   * @param {File} file - Image file to process
   * @returns {Promise<boolean>} True if face detected and glasses rendered
   */
  async processPhoto(file) {
    // Validate file format (Requirement: 6.4)
    if (!SUPPORTED_IMAGE_FORMATS.includes(file.type)) {
      this.state.error = `Unsupported image format. Please use JPEG, PNG, or WebP.`;
      return false;
    }
    
    // Stop webcam if running
    this.stopWebcam();
    
    try {
      // Load image from file
      const imageUrl = URL.createObjectURL(file);
      this.photoImage = await this._loadImage(imageUrl);
      URL.revokeObjectURL(imageUrl);
      
      // Initialize detector if needed
      if (!this.detector.isInitialized()) {
        await this.detector.initialize();
      }
      
      // Set detector to image mode
      await this.detector.setRunningMode('IMAGE');
      
      // Detect face in image
      const result = await this.detector.detectImage(this.photoImage);
      
      if (!result.detected || !result.face) {
        // No face detected (Requirement: 6.3)
        this.state.error = 'No face detected in the photo. Please try another image.';
        this.state.faceDetected = false;
        this.renderer.setGlassesVisible(false);
        return false;
      }
      
      // Set image as background
      this.renderer.setBackground(this.photoImage);
      
      // Extract key landmarks
      const keyLandmarks = this.mapper.extractKeyLandmarks(result.face);
      
      // Calculate transform with current adjustments
      const transform = this.mapper.calculateTransform(
        keyLandmarks,
        this.photoImage.width,
        this.photoImage.height,
        this.state.adjustments
      );
      
      // Update renderer
      this.renderer.updateGlassesTransform(transform);
      this.renderer.setGlassesVisible(true);
      this.renderer.render();
      
      // Update state
      this.state.mode = 'photo';
      this.state.faceDetected = true;
      this.state.error = null;
      
      return true;
    } catch (error) {
      this.state.error = `Failed to process photo: ${error.message}`;
      this.state.faceDetected = false;
      throw error;
    }
  }

  /**
   * Load an image from URL
   * @private
   * @param {string} url - Image URL
   * @returns {Promise<HTMLImageElement>}
   */
  _loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = url;
    });
  }


  /**
   * Update adjustment offsets
   * Requirement: 7.1, 7.2, 7.4
   * @param {Partial<import('./types.js').AdjustmentOffsets>} adjustments
   */
  setAdjustments(adjustments) {
    // Merge with current adjustments
    this.state.adjustments = {
      ...this.state.adjustments,
      ...adjustments
    };
    
    // Clamp values to valid ranges
    this.state.adjustments.verticalOffset = Math.max(-1, Math.min(1, 
      this.state.adjustments.verticalOffset));
    this.state.adjustments.scaleMultiplier = Math.max(0.5, Math.min(1.5, 
      this.state.adjustments.scaleMultiplier));
    
    // If in photo mode, re-render with new adjustments
    if (this.state.mode === 'photo' && this.photoImage && this.state.faceDetected) {
      this._reprocessPhoto();
    }
    // In webcam mode, adjustments will be applied in the next detection loop iteration
  }

  /**
   * Re-process the current photo with updated adjustments
   * @private
   */
  async _reprocessPhoto() {
    if (!this.photoImage) return;
    
    try {
      const result = await this.detector.detectImage(this.photoImage);
      
      if (result.detected && result.face) {
        const keyLandmarks = this.mapper.extractKeyLandmarks(result.face);
        const transform = this.mapper.calculateTransform(
          keyLandmarks,
          this.photoImage.width,
          this.photoImage.height,
          this.state.adjustments
        );
        
        this.renderer.updateGlassesTransform(transform);
        this.renderer.render();
      }
    } catch (error) {
      console.error('Failed to reprocess photo:', error);
    }
  }

  /**
   * Get current adjustments
   * @returns {import('./types.js').AdjustmentOffsets}
   */
  getAdjustments() {
    return { ...this.state.adjustments };
  }

  /**
   * Reset adjustments to defaults
   */
  resetAdjustments() {
    this.setAdjustments({ ...DEFAULT_ADJUSTMENTS });
  }

  /**
   * Check if camera permission was denied
   * @returns {boolean}
   */
  isCameraPermissionDenied() {
    return this.state.error?.includes('permission denied') || false;
  }

  /**
   * Get the last error message
   * @returns {string|null}
   */
  getError() {
    return this.state.error;
  }

  /**
   * Clear error state
   */
  clearError() {
    this.state.error = null;
  }

  /**
   * Cleanup all resources
   */
  dispose() {
    // Stop webcam
    this.stopWebcam();
    
    // Clean up photo resources
    if (this.photoImage) {
      this.photoImage = null;
    }
    
    if (this.photoCanvas) {
      this.photoCanvas = null;
    }
    
    // Dispose components
    this.detector.dispose();
    this.renderer.dispose();
    
    // Reset state
    this.state = {
      mode: 'idle',
      cameraActive: false,
      faceDetected: false,
      glassesModel: null,
      adjustments: { ...DEFAULT_ADJUSTMENTS },
      error: null
    };
  }
}

export default TryOnController;
