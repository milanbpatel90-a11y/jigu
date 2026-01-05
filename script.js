import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { API_CONFIG, validateApiKeys, getAuthHeaders, fetchModelFromAPI, fetchAllModelsFromAPI } from './config.js';

document.addEventListener('DOMContentLoaded', () => {

    // Validate API keys on startup
    if (validateApiKeys()) {
        console.log('✅ API keys configured');
    } else {
        console.warn('⚠️ Please configure your API keys in config.js');
    }

    const video = document.getElementById('video');
    const canvas = document.getElementById('three-canvas');
    const statusEl = document.getElementById('status');
    const btnScreenshot = document.getElementById('btn-screenshot');
    const startCameraBtn = document.getElementById('start-camera');

    // Three.js setup
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.physicallyCorrectLights = true;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 0, 1000);

    // Full-screen video background
    const videoTexture = new THREE.VideoTexture(video);
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.format = THREE.RGBAFormat;

    const bgMat = new THREE.MeshBasicMaterial({ map: videoTexture });
    bgMat.depthTest = false;
    bgMat.depthWrite = false;

    // Calculate frustum size
    const distance = camera.position.z;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    let frustumHeight = 2 * distance * Math.tan(vFov / 2);
    let frustumWidth = frustumHeight * camera.aspect;

    let bgGeometry = new THREE.PlaneGeometry(frustumWidth, frustumHeight);
    const bgMesh = new THREE.Mesh(bgGeometry, bgMat);
    bgMesh.frustumCulled = false;
    bgMesh.renderOrder = -10;
    bgMesh.position.z = -100; // Push background behind glasses
    bgMesh.scale.x = -1; // Mirror video
    scene.add(bgMesh);

    // Lighting + environment
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(0.5, 1, 0.8);
    dir.castShadow = false;
    scene.add(dir);

    // Subtle HDR environment for realistic reflections
    const rgbe = new RGBELoader();
    const HDR_URL = 'https://cdn.jsdelivr.net/gh/pmndrs/drei-assets@master/hdri/venice_sunset_1k.hdr';
    rgbe.load(HDR_URL, (tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = tex;
    });

    // Parent for glasses - set initial position so it's visible
    const glassesParent = new THREE.Group();
    glassesParent.position.set(0, 0, 100); // Start in front of camera
    glassesParent.visible = true;
    glassesParent.renderOrder = 10; // Render after background
    scene.add(glassesParent);

    let currentModel = null;
    let baseModelWidth = 1; // computed from model's bounding box for autoscale
    let modelReady = false;
    let userScale = 1.0;
    let userWidth = 1.0; // non-uniform width adjustment for calibration
    let userYOffset = 0.0;
    let userZOffset = 0.0;

    // Models navigation
    let allModels = [];
    let currentModelIndex = 0;
    const glassesInfoEl = document.getElementById('glasses-info');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');

    const loader = new GLTFLoader();

    // Update glasses info display
    function updateGlassesInfo() {
        if (allModels.length > 0 && glassesInfoEl) {
            const model = allModels[currentModelIndex];
            glassesInfoEl.textContent = `${currentModelIndex + 1}/${allModels.length}: ${model.name}`;
            glassesInfoEl.style.display = 'block';
        }
    }

    function applyPBRMaterials(root) {
        root.traverse((n) => {
            if (!n.isMesh) return;
            const name = (n.name || '').toLowerCase();
            const matName = (n.material && n.material.name) ? n.material.name.toLowerCase() : '';
            
            // Detect lens parts - ONLY if specifically named "lens" (not "glasses" or "glass" in general)
            // Be very strict - only hide actual lens geometry
            const isLens = (name.includes('lens') && !name.includes('frame')) || 
                           (name === 'lens') || 
                           (name === 'lense') ||
                           (name.includes('lens_') || name.includes('_lens'));
            
            console.log(`  Mesh: ${n.name}, Material: ${matName}, isLens: ${isLens}`);
            
            if (isLens) {
                console.log(`  🔍 LENS (hidden): ${n.name}`);
                // Make lens COMPLETELY INVISIBLE
                n.visible = false;
            } else {
                // Frame - ALWAYS visible with solid material
                const origMat = n.material;
                let baseColor = 0x222222; // Dark frame color
                if (origMat && origMat.color) {
                    const c = origMat.color.getHex();
                    // Only use original color if it's not too light
                    if (c < 0xaaaaaa) {
                        baseColor = c;
                    }
                }
                console.log(`  🖼️ FRAME (visible): ${n.name}, color: #${baseColor.toString(16)}`);
                
                n.material = new THREE.MeshStandardMaterial({
                    color: baseColor,
                    roughness: 0.3,
                    metalness: 0.2,
                    envMapIntensity: 1.0,
                    side: THREE.DoubleSide
                });
                n.visible = true;
                n.frustumCulled = false;
                n.renderOrder = 10;
            }
        });
    }

    // ✅ Load local model (served from /assets/) or create fallback
    function createFallbackGlasses() {
        console.log('🔥 Creating fallback glasses geometry');
        
        // Create simple glasses geometry
        const glassesGroup = new THREE.Group();
        
        // Frame material (PBR)
        const frameMaterial = new THREE.MeshStandardMaterial({
            color: 0x222222,
            roughness: 0.35,
            metalness: 0.15
        });
        
        // Glass material (physical transmission)
        const glassMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            roughness: 0.05,
            metalness: 0,
            transmission: 0.9,
            thickness: 1.2,
            ior: 1.5,
            transparent: true,
            side: THREE.DoubleSide
        });
        
        // Left lens
        const leftLens = new THREE.Mesh(
            new THREE.RingGeometry(5, 15, 16),
            frameMaterial
        );
        leftLens.position.set(-20, 0, 0);
        
        const leftGlass = new THREE.Mesh(
            new THREE.CircleGeometry(12, 16),
            glassMaterial
        );
        leftGlass.position.set(-20, 0, -0.5);
        
        // Right lens
        const rightLens = new THREE.Mesh(
            new THREE.RingGeometry(5, 15, 16),
            frameMaterial
        );
        rightLens.position.set(20, 0, 0);
        
        const rightGlass = new THREE.Mesh(
            new THREE.CircleGeometry(12, 16),
            glassMaterial
        );
        rightGlass.position.set(20, 0, -0.5);
        
        // Bridge
        const bridge = new THREE.Mesh(
            new THREE.CylinderGeometry(1, 1, 10),
            frameMaterial
        );
        bridge.rotation.z = Math.PI / 2;
        bridge.position.set(0, 0, 0);
        
        // Temple arms
        const leftTemple = new THREE.Mesh(
            new THREE.CylinderGeometry(1, 1, 30),
            frameMaterial
        );
        leftTemple.rotation.z = Math.PI / 2;
        leftTemple.position.set(-30, 0, 0);
        
        const rightTemple = new THREE.Mesh(
            new THREE.CylinderGeometry(1, 1, 30),
            frameMaterial
        );
        rightTemple.rotation.z = Math.PI / 2;
        rightTemple.position.set(30, 0, 0);
        
        glassesGroup.add(leftLens, leftGlass, rightLens, rightGlass, bridge, leftTemple, rightTemple);
        
        // Recentre fallback to origin
        const tmpBox = new THREE.Box3().setFromObject(glassesGroup);
        const tmpCenter = new THREE.Vector3();
        tmpBox.getCenter(tmpCenter);
        glassesGroup.position.sub(tmpCenter);
        
        // Let the autoscale drive final size; keep child at scale 1
        glassesGroup.scale.set(1, 1, 1);
        
        glassesParent.add(glassesGroup);
        currentModel = glassesGroup;

        // Measure model width once for autoscaling
        const size = new THREE.Vector3();
        new THREE.Box3().setFromObject(glassesGroup).getSize(size);
        baseModelWidth = Math.max(size.x, 1e-3);
        modelReady = true;

        statusEl.textContent = '✅ Fallback glasses loaded';
        console.log('✅ Fallback glasses created successfully');
    }
    
    // Load a specific model by URL
    function loadModelByUrl(MODEL_URL, modelName = '') {
        // Remove existing model
        if (currentModel) {
            glassesParent.remove(currentModel);
            currentModel = null;
            modelReady = false;
        }

        statusEl.textContent = `🔄 Loading ${modelName || 'model'}...`;
        statusEl.style.display = 'block';

        loader.load(MODEL_URL, gltf => {
            const model = gltf.scene;
            
            // Log model structure for debugging
            console.log('📦 Model loaded:', modelName);
            let meshCount = 0;
            model.traverse(n => {
                if (n.isMesh) {
                    meshCount++;
                    n.castShadow = false;
                    n.receiveShadow = false;
                    n.visible = true;
                    n.frustumCulled = false; // Prevent culling
                    console.log(`  - Mesh: ${n.name}, Material: ${n.material?.name || 'unnamed'}`);
                }
            });
            console.log(`  Total meshes: ${meshCount}`);
            
            applyPBRMaterials(model);

            // Recentre model so its geometric center is at origin
            const tmpBox = new THREE.Box3().setFromObject(model);
            const tmpCenter = new THREE.Vector3();
            tmpBox.getCenter(tmpCenter);
            model.position.sub(tmpCenter);

            // Normalize transforms
            model.rotation.set(0, 0, 0);
            model.scale.set(1, 1, 1);
            model.visible = true;
            
            glassesParent.add(model);
            currentModel = model;

            // Measure model width once for autoscaling
            const size = new THREE.Vector3();
            new THREE.Box3().setFromObject(model).getSize(size);
            baseModelWidth = Math.max(size.x, 1e-3);
            console.log(`  Model width: ${baseModelWidth.toFixed(2)}`);
            
            modelReady = true;

            statusEl.textContent = '✅ Model ready';
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 1000);
            updateGlassesInfo();
        }, 
        // Progress callback
        (progress) => {
            if (progress.total > 0) {
                const pct = Math.round((progress.loaded / progress.total) * 100);
                statusEl.textContent = `🔄 Loading ${modelName}: ${pct}%`;
            }
        },
        err => {
            console.error('GLB model load failed:', err);
            statusEl.textContent = '❌ Failed to load model';
        });
    }

    // Load all models from API and start with first one
    async function loadGlassesModel() {
        try {
            statusEl.textContent = '🔄 Fetching models from API...';
            allModels = await fetchAllModelsFromAPI();
            console.log(`✅ Loaded ${allModels.length} models`);
            
            if (allModels.length > 0) {
                currentModelIndex = 0;
                loadModelByUrl(allModels[0].url, allModels[0].name);
            } else {
                throw new Error('No models found');
            }
        } catch (error) {
            console.warn('⚠️ API fetch failed, using local model:', error);
            // Fallback to local model
            const localUrl = new URL('./assets/models/glasses2.glb', import.meta.url).href;
            allModels = [{ name: 'Local Model', url: localUrl }];
            loadModelByUrl(localUrl, 'Local Model');
        }
    }

    // Navigation functions
    function loadNextModel() {
        if (allModels.length === 0) return;
        currentModelIndex = (currentModelIndex + 1) % allModels.length;
        const model = allModels[currentModelIndex];
        loadModelByUrl(model.url, model.name);
    }

    function loadPrevModel() {
        if (allModels.length === 0) return;
        currentModelIndex = (currentModelIndex - 1 + allModels.length) % allModels.length;
        const model = allModels[currentModelIndex];
        loadModelByUrl(model.url, model.name);
    }

    // Navigation button handlers
    btnPrev.addEventListener('click', loadPrevModel);
    btnNext.addEventListener('click', loadNextModel);

    // Start loading the models
    loadGlassesModel();

    // Smoothing helper
    function smooth(prev, next, alpha = 0.4) {
        if (prev == null) return next;
        return {
            x: alpha * next.x + (1 - alpha) * prev.x,
            y: alpha * next.y + (1 - alpha) * prev.y,
            z: alpha * next.z + (1 - alpha) * prev.z
        };
    }

    // Start webcam
    async function startCamera() {
        try {
            statusEl.textContent = '📹 Requesting camera access...';
            startCameraBtn.style.display = 'none';

            const constraints = {
                video: {
                    facingMode: 'user',
                    width: { ideal: 1280, min: 640 },
                    height: { ideal: 720, min: 480 }
                },
                audio: false
            };

            if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
                constraints.video.width = { ideal: 640 };
                constraints.video.height = { ideal: 480 };
            }

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;
            console.log('✅ Camera stream acquired');

            video.addEventListener('canplay', () => {
                console.log('🎥 Video ready — initializing FaceMesh');
                statusEl.textContent = 'Initializing FaceMesh...';
                initFaceMesh();
            }, { once: true });

            await video.play();
        } catch (e) {
            console.error('⛔ Camera error:', e);
            statusEl.textContent = '⛔ Camera access denied';
            alert('Please allow camera access and try again.');
        }
    }

    // FaceMesh setup
    let faceMesh = null;
    let processing = false;
    let prevLandmarks = null;

    function initFaceMesh() {
        if (!window.FaceMesh) {
            console.error('❌ FaceMesh not available');
            statusEl.classList.add('error');
            statusEl.textContent = '❌ FaceMesh not loaded. Check your internet connection or CDN availability.';
            return;
        }

        faceMesh = new window.FaceMesh({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.6,
            minTrackingConfidence: 0.5
        });

        faceMesh.onResults(onResults);
        requestAnimationFrame(frameLoop);
        // Hide status overlay once FaceMesh is ready
        statusEl.textContent = '';
        statusEl.style.display = 'none';
        console.log('✅ FaceMesh initialized');
    }

    async function frameLoop() {
        if (video.readyState >= 2 && faceMesh && !processing) {
            processing = true;
            try {
                await faceMesh.send({ image: video });
            } catch (e) {
                console.warn('⚠️ faceMesh send error:', e);
            } finally {
                processing = false;
            }
        }
        requestAnimationFrame(frameLoop);
    }

    // Landmark indices - MediaPipe FaceMesh 468 landmarks
    // Eyes
    const LEFT_EYE_OUTER = 33;
    const LEFT_EYE_INNER = 133;
    const RIGHT_EYE_INNER = 362;
    const RIGHT_EYE_OUTER = 263;
    
    // Temples (side of face - for glasses width)
    const LEFT_TEMPLE = 234;
    const RIGHT_TEMPLE = 454;
    
    // Nose landmarks
    const NOSE_BRIDGE = 168;    // Between eyes
    const NOSE_TIP = 1;
    const LEFT_NOSE_SIDE = 129;  // Left side of nose bridge
    const RIGHT_NOSE_SIDE = 358; // Right side of nose bridge
    
    // Face orientation
    const FOREHEAD = 10;
    const CHIN = 152;
    
    // Eye centers (iris)
    const LEFT_IRIS = 468;   // Left iris center (if refineLandmarks enabled)
    const RIGHT_IRIS = 473;  // Right iris center

    function onResults(results) {
        processing = false;
        if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
            return;
        }

        const lm = results.multiFaceLandmarks[0];
        const w = video.videoWidth || 640;
        const h = video.videoHeight || 480;

        // Convert normalized coords to world space
        let world = lm.map(p => ({
            x: (p.x - 0.5) * w,
            y: -(p.y - 0.5) * h,
            z: (p.z || 0) * w * 0.5 // Reduce Z scale for more natural depth
        }));

        // Scale to match frustum (mirror X to match mirrored video background)
        const scaleX = frustumWidth / w;
        const scaleY = frustumHeight / h;
        world.forEach(p => {
            p.x *= -scaleX;
            p.y *= scaleY;
            p.z *= scaleX;
        });

        if (!prevLandmarks) prevLandmarks = world;
        prevLandmarks = prevLandmarks.map((pv, i) => smooth(pv, world[i], 0.35));

        updatePose(prevLandmarks);
    }

    // ✅ GLASSES ALIGNMENT - Jeeliz VTO style approach
    function updatePose(landmarks) {
        if (!modelReady) return;

        // Key facial points
        const leftEyeOuter = new THREE.Vector3(landmarks[LEFT_EYE_OUTER].x, landmarks[LEFT_EYE_OUTER].y, landmarks[LEFT_EYE_OUTER].z);
        const rightEyeOuter = new THREE.Vector3(landmarks[RIGHT_EYE_OUTER].x, landmarks[RIGHT_EYE_OUTER].y, landmarks[RIGHT_EYE_OUTER].z);
        const leftEyeInner = new THREE.Vector3(landmarks[LEFT_EYE_INNER].x, landmarks[LEFT_EYE_INNER].y, landmarks[LEFT_EYE_INNER].z);
        const rightEyeInner = new THREE.Vector3(landmarks[RIGHT_EYE_INNER].x, landmarks[RIGHT_EYE_INNER].y, landmarks[RIGHT_EYE_INNER].z);
        const noseBridge = new THREE.Vector3(landmarks[NOSE_BRIDGE].x, landmarks[NOSE_BRIDGE].y, landmarks[NOSE_BRIDGE].z);
        const noseTip = new THREE.Vector3(landmarks[NOSE_TIP].x, landmarks[NOSE_TIP].y, landmarks[NOSE_TIP].z);
        const forehead = new THREE.Vector3(landmarks[FOREHEAD].x, landmarks[FOREHEAD].y, landmarks[FOREHEAD].z);
        const chin = new THREE.Vector3(landmarks[CHIN].x, landmarks[CHIN].y, landmarks[CHIN].z);
        const leftTemple = new THREE.Vector3(landmarks[LEFT_TEMPLE].x, landmarks[LEFT_TEMPLE].y, landmarks[LEFT_TEMPLE].z);
        const rightTemple = new THREE.Vector3(landmarks[RIGHT_TEMPLE].x, landmarks[RIGHT_TEMPLE].y, landmarks[RIGHT_TEMPLE].z);

        // Calculate eye center (midpoint between inner eye corners - where nose pads sit)
        const eyeCenter = new THREE.Vector3()
            .addVectors(leftEyeInner, rightEyeInner)
            .multiplyScalar(0.5);

        // Use temple-to-temple width for more stable scaling (less affected by eye movement)
        const templeWidth = leftTemple.distanceTo(rightTemple);
        const eyeWidth = leftEyeOuter.distanceTo(rightEyeOuter);
        
        // Glasses should span approximately the temple width
        // FIT_RATIO calibrated for typical glasses frame
        const FIT_RATIO = 1.15; // Glasses are slightly wider than temple-to-temple
        const desiredWidth = templeWidth * FIT_RATIO;
        
        // Calculate scale - handle very large models (some are 200+ units wide)
        let scaleValue = (desiredWidth / baseModelWidth) * userScale;
        scaleValue = Math.max(scaleValue, 1e-6);
        
        console.log(`📐 Scale: ${scaleValue.toFixed(6)}, temple: ${templeWidth.toFixed(1)}, model: ${baseModelWidth.toFixed(1)}`);

        // === FACE ORIENTATION (Rotation) ===
        // X-axis: horizontal, left to right across face
        const X = new THREE.Vector3().subVectors(rightEyeOuter, leftEyeOuter).normalize();
        
        // Calculate face forward direction using nose
        const faceForward = new THREE.Vector3().subVectors(noseTip, noseBridge);
        
        // Y-axis: vertical, chin to forehead
        const faceUp = new THREE.Vector3().subVectors(forehead, chin).normalize();
        
        // Z-axis: face forward (perpendicular to face plane)
        // Use cross product of X and faceUp for accurate Z
        const Z = new THREE.Vector3().crossVectors(X, faceUp).normalize();
        
        // Recalculate Y to ensure orthogonality
        const Y = new THREE.Vector3().crossVectors(Z, X).normalize();

        const rotationMatrix = new THREE.Matrix4().makeBasis(X, Y, Z);
        const q = new THREE.Quaternion().setFromRotationMatrix(rotationMatrix);

        // === POSITION (Where glasses sit on face) ===
        // Anchor point: blend between nose bridge and eye center (weighted more towards nose for deeper positioning)
        // This places glasses at the natural resting position like men wearing glasses
        const anchorPoint = new THREE.Vector3()
            .addVectors(noseBridge.clone().multiplyScalar(0.6), eyeCenter.clone().multiplyScalar(0.4));

        // Vertical offset: move glasses slightly DOWN to sit on nose properly (less for men)
        // Negative = down, positive = up
        const verticalOffset = eyeWidth * -0.08 + userYOffset;

        // Depth offset: push glasses DEEPER into the face for natural fit
        // Positive Z in face-local space = deeper (away from camera)
        const depthOffset = eyeWidth * 0.15 + userZOffset;

        // Apply offsets in face-local coordinate system
        const localOffset = new THREE.Vector3(0, verticalOffset, depthOffset);
        const worldOffset = localOffset.clone().applyQuaternion(q);
        
        const targetPosition = anchorPoint.clone().add(worldOffset);

        // === SMOOTH UPDATES ===
        // Higher lerp = more responsive, lower = smoother
        glassesParent.position.lerp(targetPosition, 0.7);
        glassesParent.quaternion.slerp(q, 0.6);
        glassesParent.scale.lerp(new THREE.Vector3(scaleValue * userWidth, scaleValue, scaleValue), 0.7);
        
        // Debug position (uncomment to see)
        // console.log(`Pos: ${targetPosition.x.toFixed(0)}, ${targetPosition.y.toFixed(0)}, ${targetPosition.z.toFixed(0)}`);
    }

    // Handle resize
    window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight, false);

        frustumHeight = 2 * distance * Math.tan(vFov / 2);
        frustumWidth = frustumHeight * camera.aspect;

        bgGeometry.dispose();
        bgGeometry = new THREE.PlaneGeometry(frustumWidth, frustumHeight);
        bgMesh.geometry = bgGeometry;
    });

    // Render loop
    function render() {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            videoTexture.needsUpdate = true;
        }
        renderer.render(scene, camera);
        requestAnimationFrame(render);
    }
    render();

    // Screenshot
    btnScreenshot.addEventListener('click', () => {
        renderer.setClearColor(0x000000);
        renderer.render(scene, camera);
        const data = canvas.toDataURL('image/png');
        renderer.setClearColor(0x000000, 0);

        const a = document.createElement('a');
        a.href = data;
        a.download = 'tryon-' + Date.now() + '.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
    });

    // UI Controls
    const settingsBtn = document.getElementById('settingsBtn');
    const controlPanel = document.getElementById('controlPanel');
    const scaleSlider = document.getElementById('scaleSlider');
    const widthSlider = document.getElementById('widthSlider');
    const yOffsetSlider = document.getElementById('yOffsetSlider');
    const zOffsetSlider = document.getElementById('zOffsetSlider');

    settingsBtn.addEventListener('click', () => {
        controlPanel.style.display = controlPanel.style.display === 'none' ? 'block' : 'none';
    });

    scaleSlider.addEventListener('input', (e) => { userScale = parseFloat(e.target.value); });
    yOffsetSlider.addEventListener('input', (e) => { userYOffset = parseFloat(e.target.value); });
    zOffsetSlider.addEventListener('input', (e) => { userZOffset = parseFloat(e.target.value); });
    widthSlider.addEventListener('input', (e) => { userWidth = parseFloat(e.target.value); });

    // Start camera on button click
    startCameraBtn.addEventListener('click', () => {
        startCamera();
    });

});