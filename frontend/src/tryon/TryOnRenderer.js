/**
 * TryOnRenderer - Renders 3D glasses model overlaid on camera/image feed
 * @module tryon/TryOnRenderer
 * 
 * Requirements: 4.1, 4.3, 4.4, 4.5
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DEFAULT_RENDERER_CONFIG } from './types.js';

/**
 * TryOnRenderer class for rendering glasses overlay on face
 */
export class TryOnRenderer {
  /**
   * @param {HTMLElement} container - DOM element to render into
   * @param {Partial<import('./types.js').TryOnRendererConfig>} [config]
   */
  constructor(container, config = {}) {
    this.container = container;
    this.config = { ...DEFAULT_RENDERER_CONFIG, ...config };
    
    // Three.js components
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.glassesModel = null;
    this.backgroundMesh = null;
    this.backgroundTexture = null;
    
    // State
    this.initialized = false;
    this.glassesVisible = true;
    this.currentTransform = null;
    this.previousTransform = null;
    
    // Loader
    this.loader = new GLTFLoader();
  }

  /**
   * Initialize renderer and load glasses model
   * Requirement: 4.1
   * @param {string} glassesModelUrl - URL to glasses GLB model
   * @returns {Promise<void>}
   */
  async initialize(glassesModelUrl) {
    if (this.initialized) {
      this.dispose();
    }

    // Set up scene with transparent background for compositing
    this.scene = new THREE.Scene();
    
    // Create orthographic camera for 2D overlay matching
    // Using normalized coordinates (0-1) to match landmark coordinates
    // Note: top=1, bottom=0 for correct Y orientation
    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 1000);
    this.camera.position.z = 10;

    // Set up renderer with transparency
    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true,
      premultipliedAlpha: false
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    // Size to container
    this._updateSize();
    this.container.appendChild(this.renderer.domElement);

    // Add lighting for glasses
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(0.5, 0.5, 1);
    this.scene.add(directional);

    // Load glasses model
    await this._loadGlassesModel(glassesModelUrl);

    // Set up resize handler
    this._resizeHandler = () => this._updateSize();
    window.addEventListener('resize', this._resizeHandler);

    this.initialized = true;
  }

  /**
   * Load glasses model from URL with fallback to local model
   * @private
   * @param {string} url
   * @returns {Promise<void>}
   */
  async _loadGlassesModel(url) {
    const FALLBACK_MODEL = '/models/glasses2.glb';
    
    const loadModel = (modelUrl) => {
      return new Promise((resolve, reject) => {
        this.loader.load(
          modelUrl,
          (gltf) => {
            // Check if scene still exists (component might have been disposed)
            if (!this.scene) {
              console.warn('Scene was disposed during model loading');
              resolve();
              return;
            }
            
            this.glassesModel = gltf.scene;
            
            // Center and normalize the model
            const box = new THREE.Box3().setFromObject(this.glassesModel);
            const size = new THREE.Vector3();
            const center = new THREE.Vector3();
            box.getSize(size);
            box.getCenter(center);
            
            // Normalize to unit size
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0) {
              this.glassesModel.scale.setScalar(0.1 / maxDim);
            }
            
            // Center the model
            this.glassesModel.position.set(-center.x, -center.y, -center.z);
            
            // Wrap in a group for easier transform application
            this.glassesGroup = new THREE.Group();
            this.glassesGroup.add(this.glassesModel);
            
            // Check again before adding to scene
            if (this.scene) {
              this.scene.add(this.glassesGroup);
              console.log('Glasses model loaded successfully from:', modelUrl);
            }
            
            resolve();
          },
          undefined,
          (error) => {
            const errorMsg = error?.message || error?.toString() || 'Unknown error';
            console.error('GLTFLoader error:', errorMsg);
            reject(new Error(`Failed to load: ${errorMsg}`));
          }
        );
      });
    };

    // Try primary URL first, then fallback
    try {
      console.log('Attempting to load glasses model from:', url);
      await loadModel(url);
    } catch (primaryError) {
      console.warn(`Primary model failed: ${primaryError.message}`);
      console.log('Attempting fallback model:', FALLBACK_MODEL);
      try {
        await loadModel(FALLBACK_MODEL);
      } catch (fallbackError) {
        console.error('Fallback model also failed:', fallbackError.message);
        throw fallbackError;
      }
    }
  }

  /**
   * Update renderer size to match container
   * @private
   */
  _updateSize() {
    if (!this.renderer || !this.container) return;
    
    const width = this.container.clientWidth || 640;
    const height = this.container.clientHeight || 480;
    
    this.renderer.setSize(width, height);
    
    // Update camera for orthographic - note: top > bottom for correct Y orientation
    this.camera.left = 0;
    this.camera.right = 1;
    this.camera.top = 1;
    this.camera.bottom = 0;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Set the background source (video or image)
   * Requirement: 4.4
   * @param {HTMLVideoElement|HTMLImageElement} source
   */
  setBackground(source) {
    // Remove existing background
    if (this.backgroundMesh) {
      this.scene.remove(this.backgroundMesh);
      this.backgroundMesh.geometry.dispose();
      this.backgroundMesh.material.dispose();
      this.backgroundMesh = null;
    }
    
    if (this.backgroundTexture) {
      this.backgroundTexture.dispose();
      this.backgroundTexture = null;
    }

    if (!source) return;

    // Store source reference for video updates
    this.backgroundSource = source;

    // Create texture from source
    if (source instanceof HTMLVideoElement) {
      this.backgroundTexture = new THREE.VideoTexture(source);
      this.backgroundTexture.minFilter = THREE.LinearFilter;
      this.backgroundTexture.magFilter = THREE.LinearFilter;
    } else {
      this.backgroundTexture = new THREE.Texture(source);
      this.backgroundTexture.needsUpdate = true;
    }
    
    this.backgroundTexture.colorSpace = THREE.SRGBColorSpace;

    // Create background plane that fills the view
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({
      map: this.backgroundTexture,
      depthWrite: false,
      depthTest: false
    });
    
    this.backgroundMesh = new THREE.Mesh(geometry, material);
    this.backgroundMesh.position.set(0.5, 0.5, -1); // Behind glasses
    this.backgroundMesh.renderOrder = -1;
    this.scene.add(this.backgroundMesh);
  }

  /**
   * Update glasses position based on transform
   * Requirement: 4.3
   * @param {import('./types.js').GlassesTransform} transform
   */
  updateGlassesTransform(transform) {
    if (!this.glassesGroup || !transform) return;

    // Store previous transform for smoothing
    this.previousTransform = this.currentTransform;
    
    // Apply smoothing interpolation if we have a previous transform
    let smoothedTransform = transform;
    if (this.previousTransform && this.config.smoothingFactor > 0) {
      smoothedTransform = this._smoothTransform(this.previousTransform, transform);
    }
    
    this.currentTransform = smoothedTransform;

    // Apply position (convert from normalized 0-1 to scene coordinates)
    // Y is inverted in screen coordinates
    this.glassesGroup.position.set(
      smoothedTransform.position.x,
      1 - smoothedTransform.position.y, // Invert Y
      smoothedTransform.position.z
    );

    // Apply rotation
    this.glassesGroup.rotation.set(
      smoothedTransform.rotation.x,
      smoothedTransform.rotation.y,
      smoothedTransform.rotation.z
    );

    // Apply scale
    const scale = smoothedTransform.scale;
    this.glassesGroup.scale.setScalar(scale);
  }

  /**
   * Apply smoothing interpolation between transforms
   * Requirement: 4.3
   * @private
   * @param {import('./types.js').GlassesTransform} previous
   * @param {import('./types.js').GlassesTransform} target
   * @returns {import('./types.js').GlassesTransform}
   */
  _smoothTransform(previous, target) {
    const factor = this.config.smoothingFactor;
    const invFactor = 1 - factor;

    return {
      position: {
        x: previous.position.x * factor + target.position.x * invFactor,
        y: previous.position.y * factor + target.position.y * invFactor,
        z: previous.position.z * factor + target.position.z * invFactor
      },
      rotation: {
        x: previous.rotation.x * factor + target.rotation.x * invFactor,
        y: previous.rotation.y * factor + target.rotation.y * invFactor,
        z: previous.rotation.z * factor + target.rotation.z * invFactor
      },
      scale: previous.scale * factor + target.scale * invFactor
    };
  }

  /**
   * Show/hide glasses
   * Requirement: 4.5
   * @param {boolean} visible
   */
  setGlassesVisible(visible) {
    this.glassesVisible = visible;
    if (this.glassesGroup) {
      this.glassesGroup.visible = visible;
    }
  }

  /**
   * Check if glasses are currently visible
   * @returns {boolean}
   */
  isGlassesVisible() {
    return this.glassesVisible;
  }

  /**
   * Apply glasses customization (colors, etc.)
   * Requirement: 4.4
   * @param {import('./types.js').GlassesStyle} style
   */
  setGlassesStyle(style) {
    if (!this.glassesModel) return;

    const { lensColor, frameColor, tintOpacity } = style;

    this.glassesModel.traverse((child) => {
      if (!child.isMesh) return;

      const name = (child.name || '').toLowerCase();
      const isLens = name.includes('lens') || name.includes('glass');

      if (isLens && lensColor) {
        // Apply lens material
        child.material = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(lensColor),
          transparent: true,
          opacity: tintOpacity ?? 0.5,
          roughness: 0.0,
          metalness: 0.0,
          transmission: 0.85,
          thickness: 0.3,
          ior: 1.5,
          side: THREE.DoubleSide,
          depthWrite: false
        });
      } else if (!isLens && frameColor) {
        // Apply frame material
        child.material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(frameColor),
          roughness: 0.5,
          metalness: 0.0,
          side: THREE.DoubleSide
        });
      }
    });
  }

  /**
   * Render a single frame
   */
  render() {
    if (!this.renderer || !this.scene || !this.camera) return;
    
    // Update video texture if using video background
    if (this.backgroundTexture && this.backgroundTexture.isVideoTexture) {
      this.backgroundTexture.needsUpdate = true;
    }
    
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Get current smoothing factor
   * @returns {number}
   */
  getSmoothingFactor() {
    return this.config.smoothingFactor;
  }

  /**
   * Set smoothing factor
   * @param {number} factor - Value between 0 and 1
   */
  setSmoothingFactor(factor) {
    this.config.smoothingFactor = Math.max(0, Math.min(1, factor));
  }

  /**
   * Get current transform (for testing)
   * @returns {import('./types.js').GlassesTransform|null}
   */
  getCurrentTransform() {
    return this.currentTransform;
  }

  /**
   * Get previous transform (for testing)
   * @returns {import('./types.js').GlassesTransform|null}
   */
  getPreviousTransform() {
    return this.previousTransform;
  }

  /**
   * Check if renderer is initialized
   * @returns {boolean}
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Cleanup resources
   */
  dispose() {
    // Remove resize handler
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }

    // Dispose background
    if (this.backgroundMesh) {
      this.scene.remove(this.backgroundMesh);
      this.backgroundMesh.geometry.dispose();
      this.backgroundMesh.material.dispose();
      this.backgroundMesh = null;
    }
    
    if (this.backgroundTexture) {
      this.backgroundTexture.dispose();
      this.backgroundTexture = null;
    }

    // Dispose glasses model
    if (this.glassesGroup) {
      this.scene.remove(this.glassesGroup);
    }
    
    if (this.glassesModel) {
      this.glassesModel.traverse((child) => {
        if (child.isMesh) {
          child.geometry?.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose?.());
            } else {
              child.material.dispose?.();
            }
          }
        }
      });
      this.glassesModel = null;
      this.glassesGroup = null;
    }

    // Dispose renderer
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement?.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
      this.renderer = null;
    }

    this.scene = null;
    this.camera = null;
    this.initialized = false;
    this.currentTransform = null;
    this.previousTransform = null;
  }
}

/**
 * Utility function for smoothing interpolation (exported for testing)
 * Requirement: 4.3 - Property 12
 * @param {number} previous - Previous value
 * @param {number} target - Target value
 * @param {number} factor - Smoothing factor (0-1)
 * @returns {number} Smoothed value
 */
export function smoothValue(previous, target, factor) {
  const invFactor = 1 - factor;
  return previous * factor + target * invFactor;
}

/**
 * Check if smoothed value is within bounds of previous and target
 * Requirement: 4.3 - Property 12
 * @param {number} smoothed - Smoothed value
 * @param {number} previous - Previous value
 * @param {number} target - Target value
 * @returns {boolean}
 */
export function isWithinBounds(smoothed, previous, target) {
  const min = Math.min(previous, target);
  const max = Math.max(previous, target);
  // Allow small floating point tolerance
  const epsilon = 1e-10;
  return smoothed >= min - epsilon && smoothed <= max + epsilon;
}

export default TryOnRenderer;
