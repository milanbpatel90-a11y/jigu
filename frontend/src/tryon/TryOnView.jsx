/**
 * TryOnView - React component for glasses try-on experience
 * @module tryon/TryOnView
 * 
 * Requirements: 5.1, 5.2, 5.3, 6.1, 6.3, 7.1, 7.2
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { FaceDetector } from './FaceDetector.js';
import { LandmarkMapper } from './LandmarkMapper.js';
import { TryOnRenderer } from './TryOnRenderer.js';
import { TryOnController, SUPPORTED_IMAGE_FORMATS } from './TryOnController.js';
import { DEFAULT_ADJUSTMENTS } from './types.js';
import './TryOnView.css';

/**
 * TryOnView component props
 * @typedef {Object} TryOnViewProps
 * @property {string} glassesModelUrl - URL to the glasses GLB model
 * @property {Object} [glassesStyle] - Optional style customization
 * @property {string} [glassesStyle.lensColor] - Lens color
 * @property {string} [glassesStyle.frameColor] - Frame color
 * @property {number} [glassesStyle.tintOpacity] - Lens tint opacity
 * @property {function} [onClose] - Callback when closing try-on view
 */

/**
 * TryOnView React component
 * @param {TryOnViewProps} props
 */
export function TryOnView({ glassesModelUrl, glassesStyle, onClose }) {
  // State
  const [mode, setMode] = useState('idle'); // 'idle' | 'webcam' | 'photo'
  const [faceDetected, setFaceDetected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false);
  const [adjustments, setAdjustments] = useState({ ...DEFAULT_ADJUSTMENTS });

  // Refs
  const containerRef = useRef(null);
  const controllerRef = useRef(null);
  const fileInputRef = useRef(null);
  const initializingRef = useRef(false);

  // Initialize controller on mount
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Prevent double initialization
    if (initializingRef.current) {
      console.log('Already initializing, skipping...');
      return;
    }
    
    initializingRef.current = true;
    let isMounted = true;
    
    const initController = async () => {
      try {
        setLoading(true);
        setError(null);

        // Create components
        const detector = new FaceDetector();
        const mapper = new LandmarkMapper();
        const renderer = new TryOnRenderer(containerRef.current);

        // Create controller
        const controller = new TryOnController(detector, mapper, renderer);
        
        // Check if still mounted before continuing
        if (!isMounted) {
          controller.dispose();
          return;
        }
        
        controllerRef.current = controller;

        // Load glasses model
        await controller.loadGlasses(glassesModelUrl, glassesStyle);

        // Check if still mounted after async operation
        if (!isMounted) {
          return;
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Failed to initialize try-on:', err);
        if (isMounted) {
          setError('Failed to initialize try-on. Please try again.');
          setLoading(false);
        }
      }
    };

    initController();

    // Cleanup on unmount
    return () => {
      isMounted = false;
      if (controllerRef.current) {
        controllerRef.current.dispose();
        controllerRef.current = null;
      }
      initializingRef.current = false;
    };
  }, [glassesModelUrl, glassesStyle]);


  // Update state from controller periodically when in webcam mode
  useEffect(() => {
    if (mode !== 'webcam' || !controllerRef.current) return;

    const interval = setInterval(() => {
      const state = controllerRef.current.getState();
      setFaceDetected(state.faceDetected);
    }, 100);

    return () => clearInterval(interval);
  }, [mode]);

  // Start webcam mode
  const handleStartWebcam = useCallback(async () => {
    if (!controllerRef.current) return;

    setError(null);
    setLoading(true);

    try {
      const success = await controllerRef.current.startWebcam();
      
      if (success) {
        setMode('webcam');
        setCameraPermissionDenied(false);
      } else {
        // Camera permission denied
        setCameraPermissionDenied(true);
        setError('Camera permission denied. Please upload a photo instead.');
      }
    } catch (err) {
      console.error('Failed to start webcam:', err);
      setError('Failed to start webcam. Please try uploading a photo.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Stop webcam mode
  const handleStopWebcam = useCallback(() => {
    if (!controllerRef.current) return;
    
    controllerRef.current.stopWebcam();
    setMode('idle');
    setFaceDetected(false);
  }, []);

  // Handle photo upload
  const handlePhotoUpload = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file || !controllerRef.current) return;

    // Validate file type
    if (!SUPPORTED_IMAGE_FORMATS.includes(file.type)) {
      setError('Unsupported image format. Please use JPEG, PNG, or WebP.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const success = await controllerRef.current.processPhoto(file);
      
      if (success) {
        setMode('photo');
        setFaceDetected(true);
      } else {
        const controllerError = controllerRef.current.getError();
        setError(controllerError || 'No face detected in the photo. Please try another image.');
        setFaceDetected(false);
      }
    } catch (err) {
      console.error('Failed to process photo:', err);
      setError('Failed to process photo. Please try another image.');
    } finally {
      setLoading(false);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Trigger file input click
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Handle adjustment changes
  const handleVerticalOffsetChange = useCallback((event) => {
    const value = parseFloat(event.target.value);
    const newAdjustments = { ...adjustments, verticalOffset: value };
    setAdjustments(newAdjustments);
    
    if (controllerRef.current) {
      controllerRef.current.setAdjustments(newAdjustments);
    }
  }, [adjustments]);

  const handleScaleChange = useCallback((event) => {
    const value = parseFloat(event.target.value);
    const newAdjustments = { ...adjustments, scaleMultiplier: value };
    setAdjustments(newAdjustments);
    
    if (controllerRef.current) {
      controllerRef.current.setAdjustments(newAdjustments);
    }
  }, [adjustments]);

  // Reset adjustments
  const handleResetAdjustments = useCallback(() => {
    const defaultAdj = { ...DEFAULT_ADJUSTMENTS };
    setAdjustments(defaultAdj);
    
    if (controllerRef.current) {
      controllerRef.current.resetAdjustments();
    }
  }, []);

  // Handle close
  const handleClose = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.stopWebcam();
    }
    onClose?.();
  }, [onClose]);

  return (
    <div className="tryon-view">
      <div className="tryon-header">
        <h2>👓 Virtual Try-On</h2>
        <button className="tryon-close-btn" onClick={handleClose} aria-label="Close">
          ×
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div className="tryon-error">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Mode toggle buttons */}
      <div className="tryon-mode-toggle">
        <button
          className={`tryon-mode-btn ${mode === 'webcam' ? 'active' : ''}`}
          onClick={mode === 'webcam' ? handleStopWebcam : handleStartWebcam}
          disabled={loading}
        >
          {mode === 'webcam' ? '⏹️ Stop Camera' : '📷 Use Webcam'}
        </button>
        <button
          className="tryon-mode-btn"
          onClick={handleUploadClick}
          disabled={loading}
        >
          📤 Upload Photo
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handlePhotoUpload}
          style={{ display: 'none' }}
        />
      </div>

      {/* Face detection status */}
      <div className="tryon-status">
        {loading ? (
          <span className="status-loading">
            <span className="spinner-small"></span>
            Loading...
          </span>
        ) : mode === 'idle' ? (
          <span className="status-idle">
            {cameraPermissionDenied 
              ? '📤 Upload a photo to try on glasses'
              : '📷 Start webcam or upload a photo to begin'}
          </span>
        ) : faceDetected ? (
          <span className="status-detected">✅ Face detected</span>
        ) : (
          <span className="status-no-face">❌ No face detected - adjust position</span>
        )}
      </div>

      {/* Renderer container */}
      <div className="tryon-renderer-container" ref={containerRef}>
        {loading && (
          <div className="tryon-loading-overlay">
            <div className="spinner"></div>
            <p>Initializing...</p>
          </div>
        )}
        {mode === 'idle' && !loading && (
          <div className="tryon-placeholder">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="11" width="7" height="6" rx="1"/>
              <rect x="14" y="11" width="7" height="6" rx="1"/>
              <path d="M10 14h4M3 14h-1M22 14h-1"/>
            </svg>
            <p>Start webcam or upload a photo to try on glasses</p>
          </div>
        )}
      </div>

      {/* Adjustment controls - only show when face is detected */}
      {(mode === 'webcam' || mode === 'photo') && (
        <div className="tryon-adjustments">
          <div className="adjustment-header">
            <h3>Adjustments</h3>
            <button 
              className="reset-btn" 
              onClick={handleResetAdjustments}
              title="Reset to defaults"
            >
              ↺ Reset
            </button>
          </div>
          
          <div className="adjustment-control">
            <label htmlFor="vertical-offset">
              Vertical Position
              <span className="adjustment-value">
                {adjustments.verticalOffset > 0 ? '+' : ''}{adjustments.verticalOffset.toFixed(2)}
              </span>
            </label>
            <input
              id="vertical-offset"
              type="range"
              min="-1"
              max="1"
              step="0.05"
              value={adjustments.verticalOffset}
              onChange={handleVerticalOffsetChange}
            />
          </div>

          <div className="adjustment-control">
            <label htmlFor="scale">
              Size
              <span className="adjustment-value">
                {(adjustments.scaleMultiplier * 100).toFixed(0)}%
              </span>
            </label>
            <input
              id="scale"
              type="range"
              min="0.5"
              max="1.5"
              step="0.05"
              value={adjustments.scaleMultiplier}
              onChange={handleScaleChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default TryOnView;
