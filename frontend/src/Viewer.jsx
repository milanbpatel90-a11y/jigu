import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export default function Viewer({ 
  modelUrl, 
  lensColor = "#3b82f6", 
  frameColor = "#1a1a1a", 
  tintOpacity = 0.5, 
  frameScale = 1.0,
  frameMaterial = "plastic",
  frameMetalness = 0.1
}) {
  const ref = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!modelUrl) return;
    
    const container = ref.current;
    if (!container) return;
    
    // Clear previous content
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f4f8);
    
    // Convert colors
    const lensColorThree = new THREE.Color(lensColor);
    const frameColorThree = new THREE.Color(frameColor);
    
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);
    
    // Create a simple environment map for reflections and transmission
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    
    // Create a simple gradient environment
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0xcccccc);
    const envMap = pmremGenerator.fromScene(envScene, 0.04).texture;
    scene.environment = envMap;
    
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight || 1, 0.01, 1000);
    camera.position.set(0, 0, 4);
    
    // Enhanced lighting for better material rendering
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);
    
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(5, 5, 5);
    keyLight.castShadow = true;
    scene.add(keyLight);
    
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-5, 3, -5);
    scene.add(fillLight);
    
    // Add rim light for better edge definition
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
    rimLight.position.set(0, -5, -5);
    scene.add(rimLight);
    
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.5;
    
    let current = null;
    const loader = new GLTFLoader();
    
    function resize() {
      const w = container.clientWidth || 600;
      const h = container.clientHeight || 400;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", resize);
    resize();
    
    let stop = false;
    function animate() {
      if (stop) return;
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();
    
    function clearCurrent() {
      if (current) {
        scene.remove(current);
        current.traverse(c => {
          if (c.isMesh) {
            c.geometry?.dispose();
            if (c.material) {
              if (Array.isArray(c.material)) c.material.forEach(m => m.dispose?.());
              else c.material.dispose?.();
            }
          }
        });
        current = null;
      }
    }
    
    setLoading(true);
    setError(null);
    
    console.log("Loading model from:", modelUrl);
    
    loader.load(modelUrl, gltf => {
      console.log("GLB loaded successfully");
      setLoading(false);
      clearCurrent();
      current = gltf.scene;
      
      // Center and scale
      const box = new THREE.Box3().setFromObject(current);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 0 && isFinite(maxDim)) {
        const scale = 2.5 / maxDim * frameScale;
        current.scale.setScalar(scale);
        box.setFromObject(current);
        box.getCenter(center);
      }
      
      current.position.set(-center.x, -center.y, -center.z);
      
      // Apply materials based on detected properties
      const meshes = [];
      current.traverse(child => {
        if (child.isMesh) meshes.push(child);
      });
      
      console.log(`Found ${meshes.length} meshes, applying colors: lens=${lensColor}, frame=${frameColor}, material=${frameMaterial}`);
      
      // Analyze all meshes to find lens candidates based on position and size
      const meshAnalysis = meshes.map((child, idx) => {
        child.geometry.computeBoundingBox();
        const box = child.geometry.boundingBox;
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        if (box) {
          box.getCenter(center);
          box.getSize(size);
        }
        return { mesh: child, center, size, index: idx };
      });
      
      // First pass: identify lens candidates by name and material
      const lensScores = meshes.map((child, idx) => {
        const name = (child.name || '').toLowerCase();
        const matName = (child.material?.name || '').toLowerCase();
        let score = 0;
        
        // Strong indicators (name-based)
        if (name.includes('lens')) score += 10;
        if (name.includes('glass') && !name.includes('glasses')) score += 8;
        if (name.includes('lense')) score += 10;
        if (matName.includes('lens')) score += 10;
        if (matName.includes('glass') && !matName.includes('glasses')) score += 8;
        
        // Medium indicators
        if (name.includes('tint') || matName.includes('tint')) score += 5;
        if (matName.includes('transparent') || matName.includes('clear')) score += 5;
        
        // Material-based detection
        if (child.material) {
          const mat = child.material;
          // Originally transparent material
          if (mat.transparent && mat.opacity < 0.7) score += 8;
          // Has transmission property
          if (mat.transmission && mat.transmission > 0.3) score += 10;
        }
        
        // Geometry-based detection (thin surfaces only)
        const analysis = meshAnalysis[idx];
        if (analysis.size) {
          const { x, y, z } = analysis.size;
          const minDim = Math.min(x, y, z);
          const maxDim = Math.max(x, y, z);
          // Very thin surfaces are likely lenses
          if (minDim < maxDim * 0.08) {
            score += 6;
            console.log(`  Thin geometry detected: ${child.name} (${minDim.toFixed(4)} vs ${maxDim.toFixed(4)})`);
          }
        }
        
        return { mesh: child, index: idx, score, name };
      });
      
      // Sort by score and pick top 2 as lenses (glasses have 2 lenses)
      const sortedByScore = [...lensScores].sort((a, b) => b.score - a.score);
      const maxLenses = 2;
      const detectedLensIndices = new Set();
      
      // Only select meshes with score > 0 as lenses, max 2
      for (let i = 0; i < sortedByScore.length && detectedLensIndices.size < maxLenses; i++) {
        if (sortedByScore[i].score > 3) { // Minimum threshold
          detectedLensIndices.add(sortedByScore[i].index);
          console.log(`🔵 Selected as lens: ${sortedByScore[i].name} (score: ${sortedByScore[i].score})`);
        }
      }
      
      // If no lenses detected by score, try geometry-based detection
      if (detectedLensIndices.size === 0) {
        // Look for symmetrical thin pieces
        for (let i = 0; i < meshAnalysis.length && detectedLensIndices.size < maxLenses; i++) {
          const analysis = meshAnalysis[i];
          if (analysis.size) {
            const { x, y, z } = analysis.size;
            const minDim = Math.min(x, y, z);
            const maxDim = Math.max(x, y, z);
            if (minDim < maxDim * 0.1) {
              // Check for symmetrical pair
              const hasPair = meshAnalysis.some((other, j) => 
                j !== i && 
                Math.abs(other.center.x + analysis.center.x) < 0.3 &&
                Math.abs(other.center.y - analysis.center.y) < 0.2
              );
              if (hasPair) {
                detectedLensIndices.add(i);
                console.log(`🔵 Detected lens by symmetry: ${meshes[i].name}`);
              }
            }
          }
        }
      }
      
      console.log(`Detected ${detectedLensIndices.size} lenses out of ${meshes.length} meshes`);
      
      meshes.forEach((child, idx) => {
        const isLens = detectedLensIndices.has(idx);
        
        if (isLens) {
          // Apply lens material with transparency and tint
          console.log(`🔵 Lens: ${child.name} - color: ${lensColor}, opacity: ${tintOpacity}`);
          
          // Calculate proper opacity - lower opacity = more transparent
          const adjustedOpacity = Math.max(0.15, Math.min(0.6, tintOpacity));
          
          child.material = new THREE.MeshPhysicalMaterial({
            color: lensColorThree,
            transparent: true,
            opacity: adjustedOpacity,
            roughness: 0.0,
            metalness: 0.0,
            transmission: 0.85,
            thickness: 0.3,
            ior: 1.5,
            clearcoat: 1.0,
            clearcoatRoughness: 0.0,
            envMapIntensity: 0.8,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          child.renderOrder = 1;
        } else {
          // Apply frame material with the extracted color
          console.log(`🖼️ Frame: ${child.name} - material: ${frameMaterial}, color: ${frameColor}`);
          
          if (frameMaterial === "metal") {
            child.material = new THREE.MeshStandardMaterial({
              color: frameColorThree,
              roughness: 0.25,
              metalness: Math.max(0.6, frameMetalness || 0.7),
              envMapIntensity: 1.0,
              side: THREE.DoubleSide
            });
          } else {
            // Plastic/acetate material
            child.material = new THREE.MeshStandardMaterial({
              color: frameColorThree,
              roughness: 0.5,
              metalness: 0.0,
              side: THREE.DoubleSide
            });
          }
        }
        
        child.castShadow = true;
        child.receiveShadow = true;
      });
      
      scene.add(current);
      
      camera.position.set(0, 0, 4);
      camera.lookAt(0, 0, 0);
      controls.target.set(0, 0, 0);
      controls.update();
      
    }, progress => {
      if (progress.total > 0) {
        console.log("Loading:", (progress.loaded / progress.total * 100).toFixed(0) + "%");
      }
    }, err => {
      setLoading(false);
      setError("Failed to load 3D model");
      console.error("Load error:", err);
    });
    
    return () => {
      stop = true;
      window.removeEventListener("resize", resize);
      clearCurrent();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [modelUrl, lensColor, frameColor, tintOpacity, frameScale, frameMaterial, frameMetalness]);
  
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '400px' }}>
      {loading && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)', zIndex: 10,
          padding: '1rem 2rem', background: 'rgba(255,255,255,0.95)',
          borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          display: 'flex', alignItems: 'center', gap: '0.75rem'
        }}>
          <div style={{
            width: '20px', height: '20px',
            border: '3px solid #e2e8f0', borderTopColor: '#667eea',
            borderRadius: '50%', animation: 'spin 0.8s linear infinite'
          }}></div>
          Loading 3D model...
        </div>
      )}
      {error && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)', color: '#e53e3e',
          textAlign: 'center', padding: '1rem'
        }}>
          {error}
        </div>
      )}
      <div ref={ref} style={{ width: '100%', height: '100%', minHeight: '400px' }} />
    </div>
  );
}
