import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const DEG2RAD = Math.PI / 180;
const EPSILON = 0.001;
const VISUAL_PRESETS = {
  white: {
    background: "#ffffff",
    exposure: 1.05,
    hemisphere: { sky: "#ffffff", ground: "#e9e3d2", intensity: 0.9 },
    key: { color: "#ffffff", intensity: 1.35 },
    fill: { color: "#f5f4ee", intensity: 0.6 },
    shadow: { color: "#8e8b83", opacity: 0.18 }
  },
  sand: {
    background: "#fcf7ef",
    exposure: 1.08,
    hemisphere: { sky: "#fff8ea", ground: "#e8dfca", intensity: 0.95 },
    key: { color: "#fff8e9", intensity: 1.3 },
    fill: { color: "#f3ecdd", intensity: 0.68 },
    shadow: { color: "#9c8f79", opacity: 0.2 }
  },
  sky: {
    background: "#f3f8ff",
    exposure: 1.02,
    hemisphere: { sky: "#f4f8ff", ground: "#dce5ef", intensity: 0.88 },
    key: { color: "#f9fbff", intensity: 1.32 },
    fill: { color: "#e7eef8", intensity: 0.66 },
    shadow: { color: "#7e8792", opacity: 0.16 }
  }
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class ArtifactViewer {
  constructor({ canvas, hotspotLayer, callbacks }) {
    this.canvas = canvas;
    this.hotspotLayer = hotspotLayer;
    this.callbacks = callbacks;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#ffffff");

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.01, 300);
    this.camera.position.set(0, 1.4, 3.6);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance"
    });
    this.pixelRatioCap = 2;
    this.lowLoadMode = false;
    this.shadowsEnabled = true;
    this.renderer.setPixelRatio(this._getTargetPixelRatio());
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = this.shadowsEnabled;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = true;
    this.controls.dampingFactor = 0.06;
    this.controls.rotateSpeed = 0.8;
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 25;
    this.controls.addEventListener("change", () => {
      this._notifyCameraChange();
    });

    this.clock = new THREE.Clock();
    this.loader = new GLTFLoader();

    this.raycaster = new THREE.Raycaster();
    this.tmpVector = new THREE.Vector3();
    this.tmpVectorB = new THREE.Vector3();

    this.currentArtifact = null;
    this.modelRoot = null;
    this.modelBox = new THREE.Box3();
    this.modelCenter = new THREE.Vector3();
    this.modelSize = new THREE.Vector3(1, 1, 1);
    this.modelRadius = 1;
    this.defaultView = {
      position: new THREE.Vector3(0, 1.4, 3.6),
      target: new THREE.Vector3(0, 0.6, 0)
    };

    this.hotspots = [];
    this.hotspotsEnabled = true;
    this.selectedHotspotId = null;

    this.tourActive = false;
    this.tourIndex = 0;

    this.cameraAnimation = null;
    this.cameraEventMuted = false;
    this.visualPreset = "white";

    this._initLighting();
    this._initGroundShadow();
    this.setVisualPreset(this.visualPreset);
    this._animate();
  }

  _getTargetPixelRatio() {
    const cap = Number.isFinite(this.pixelRatioCap) ? this.pixelRatioCap : 2;
    return Math.min(window.devicePixelRatio || 1, cap);
  }

  setLowLoadMode(enabled) {
    const next = Boolean(enabled);
    if (this.lowLoadMode === next) {
      return;
    }

    this.lowLoadMode = next;
    this.pixelRatioCap = this.lowLoadMode ? 1 : 2;
    this.shadowsEnabled = !this.lowLoadMode;

    this.renderer.shadowMap.enabled = this.shadowsEnabled;
    if (this.keyLight) {
      this.keyLight.castShadow = this.shadowsEnabled;
    }

    if (!this.shadowsEnabled && this.shadowPlane) {
      this.shadowPlane.visible = false;
    }

    this.renderer.setPixelRatio(this._getTargetPixelRatio());
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
  }

  _notifyCameraChange() {
    if (this.cameraEventMuted) {
      return;
    }
    this.callbacks.onCameraChange?.();
  }

  _initLighting() {
    this.hemisphereLight = new THREE.HemisphereLight(0xffffff, 0xe9e3d2, 0.9);
    this.hemisphereLight.position.set(0, 2.4, 0);
    this.scene.add(this.hemisphereLight);

    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
    this.keyLight.position.set(4.2, 7.8, 4.6);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.near = 0.4;
    this.keyLight.shadow.camera.far = 40;
    this.keyLight.shadow.camera.left = -8;
    this.keyLight.shadow.camera.right = 8;
    this.keyLight.shadow.camera.top = 8;
    this.keyLight.shadow.camera.bottom = -8;
    this.keyLight.shadow.bias = -0.0008;
    this.scene.add(this.keyLight);

    this.fillLight = new THREE.DirectionalLight(0xf5f4ee, 0.6);
    this.fillLight.position.set(-5.4, 2.2, -4.6);
    this.scene.add(this.fillLight);
  }

  _initGroundShadow() {
    const plane = new THREE.PlaneGeometry(1, 1);
    this.shadowMaterial = new THREE.ShadowMaterial({
      color: 0x8e8b83,
      opacity: 0.18
    });
    this.shadowPlane = new THREE.Mesh(plane, this.shadowMaterial);
    this.shadowPlane.rotation.x = -Math.PI / 2;
    this.shadowPlane.receiveShadow = true;
    this.shadowPlane.position.y = -0.02;
    this.shadowPlane.visible = false;
    this.scene.add(this.shadowPlane);
  }

  setVisualPreset(presetId = "white") {
    const normalizedPreset = VISUAL_PRESETS[presetId] ? presetId : "white";
    const preset = VISUAL_PRESETS[normalizedPreset];
    this.visualPreset = normalizedPreset;

    this.scene.background = new THREE.Color(preset.background);
    this.renderer.toneMappingExposure = preset.exposure;

    if (this.hemisphereLight) {
      this.hemisphereLight.color.set(preset.hemisphere.sky);
      this.hemisphereLight.groundColor.set(preset.hemisphere.ground);
      this.hemisphereLight.intensity = preset.hemisphere.intensity;
    }

    if (this.keyLight) {
      this.keyLight.color.set(preset.key.color);
      this.keyLight.intensity = preset.key.intensity;
    }

    if (this.fillLight) {
      this.fillLight.color.set(preset.fill.color);
      this.fillLight.intensity = preset.fill.intensity;
    }

    if (this.shadowMaterial) {
      this.shadowMaterial.color.set(preset.shadow.color);
      this.shadowMaterial.opacity = preset.shadow.opacity;
    }
  }

  async loadArtifact(artifact) {
    this.currentArtifact = artifact;
    this.tourActive = false;
    this.tourIndex = 0;
    this.selectedHotspotId = null;

    this._removeCurrentModel();
    this._clearHotspots();

    const group = await this._loadModel(artifact.modelUrl);
    this.modelRoot = group;

    if (artifact.modelRotation?.length === 3) {
      this.modelRoot.rotation.set(
        artifact.modelRotation[0],
        artifact.modelRotation[1],
        artifact.modelRotation[2]
      );
    }

    this.modelRoot.traverse((node) => {
      if (!node.isMesh) {
        return;
      }
      node.castShadow = true;
      node.receiveShadow = true;
      if (node.material) {
        node.material.needsUpdate = true;
      }
    });

    this.scene.add(this.modelRoot);

    this.modelBox.setFromObject(this.modelRoot);
    this.modelBox.getCenter(this.modelCenter);
    this.modelRoot.position.sub(this.modelCenter);

    this.modelBox.setFromObject(this.modelRoot);
    const minY = this.modelBox.min.y;
    this.modelRoot.position.y -= minY;

    this.modelBox.setFromObject(this.modelRoot);
    this.modelBox.getCenter(this.modelCenter);
    this.modelBox.getSize(this.modelSize);

    const sphere = this.modelBox.getBoundingSphere(new THREE.Sphere());
    this.modelRadius = Math.max(sphere.radius, 0.01);

    this.controls.target.copy(this.modelCenter);
    this._setDefaultCameraView();
    this.resetView(true);

    this._placeShadowPlane();
    this._createHotspots(artifact.hotspots);

    this.callbacks.onArtifactLoad?.({
      artifact,
      hotspotCount: this.hotspots.length
    });
  }

  async _loadModel(url) {
    return await this.loader.loadAsync(
      url,
      (xhr) => {
        if (!xhr?.total) {
          this.callbacks.onLoadProgress?.(0.45);
          return;
        }
        this.callbacks.onLoadProgress?.(xhr.loaded / xhr.total);
      }
    ).then((gltf) => {
      this.callbacks.onLoadProgress?.(1);
      return gltf.scene;
    });
  }

  _removeCurrentModel() {
    if (!this.modelRoot) {
      return;
    }

    this.scene.remove(this.modelRoot);
    this.modelRoot.traverse((node) => {
      if (!node.isMesh) {
        return;
      }

      node.geometry?.dispose();
      const material = node.material;
      if (Array.isArray(material)) {
        material.forEach((item) => item.dispose());
      } else {
        material?.dispose();
      }
    });

    this.modelRoot = null;
  }

  _setDefaultCameraView() {
    const fov = this.camera.fov * DEG2RAD;
    const fitHeightDistance = this.modelRadius / Math.sin(fov / 2);
    const distance = fitHeightDistance * 1.2;

    this.defaultView.position.set(
      this.modelCenter.x + distance * 0.4,
      this.modelCenter.y + distance * 0.3,
      this.modelCenter.z + distance * 1.02
    );
    this.defaultView.target.copy(this.modelCenter);

    this.controls.minDistance = this.modelRadius * 0.4;
    this.controls.maxDistance = this.modelRadius * 4.8;
  }

  _placeShadowPlane() {
    if (!this.shadowPlane) {
      return;
    }

    if (!this.shadowsEnabled) {
      this.shadowPlane.visible = false;
      return;
    }

    this.shadowPlane.visible = true;
    this.shadowPlane.position.y = this.modelBox.min.y + EPSILON;
    const radiusScale = Math.max(this.modelRadius * 3.4, 1.2);
    this.shadowPlane.scale.set(radiusScale, radiusScale, radiusScale);
  }

  _createHotspots(hotspotData) {
    this.hotspots = hotspotData.map((hotspot) => {
      const button = document.createElement("button");
      button.className = "hotspot-dot";
      button.type = "button";
      button.setAttribute("aria-label", hotspot.label);
      button.dataset.id = hotspot.id;
      button.innerHTML = '<span class="hotspot-ping"></span><span class="hotspot-center"></span>';

      button.addEventListener("click", () => {
        this.selectHotspot(hotspot.id, {
          focus: true,
          fromTour: false
        });
      });

      this.hotspotLayer.appendChild(button);

      return {
        data: hotspot,
        button,
        worldPosition: this._normToWorldPosition(hotspot.norm)
      };
    });

    this.callbacks.onHotspotData?.(this.hotspots.map(({ data }) => data));
  }

  _clearHotspots() {
    this.hotspots.forEach(({ button }) => button.remove());
    this.hotspots = [];
    this.callbacks.onHotspotData?.([]);
  }

  _normToWorldPosition(norm) {
    return new THREE.Vector3(
      this.modelCenter.x + norm[0] * (this.modelSize.x * 0.5),
      this.modelCenter.y + norm[1] * (this.modelSize.y * 0.5),
      this.modelCenter.z + norm[2] * (this.modelSize.z * 0.5)
    );
  }

  setHotspotVisibility(enabled) {
    this.hotspotsEnabled = enabled;
    this.hotspots.forEach(({ button }) => {
      button.classList.toggle("is-hidden", !enabled);
    });
    this.callbacks.onHotspotVisibilityChange?.(enabled);
  }

  toggleHotspots() {
    this.setHotspotVisibility(!this.hotspotsEnabled);
  }

  selectHotspot(hotspotId, options = {}) {
    const hotspot = this.hotspots.find(({ data }) => data.id === hotspotId);
    if (!hotspot) {
      return;
    }

    this.selectedHotspotId = hotspotId;

    this.hotspots.forEach(({ button, data }) => {
      button.classList.toggle("is-selected", data.id === hotspotId);
    });

    if (options.focus) {
      this.focusHotspot(hotspotId, { duration: options.duration ?? 950 });
    }

    if (!options.fromTour && this.tourActive) {
      const tourIndex = this.currentArtifact.tour.findIndex((step) => step.hotspotId === hotspotId);
      if (tourIndex >= 0) {
        this.tourIndex = tourIndex;
      }
    }

    const tourStep = this.currentArtifact.tour[this.tourIndex];
    const tourCaption = this.tourActive ? tourStep?.caption ?? "" : "";

    this.callbacks.onHotspotSelect?.({
      hotspot: hotspot.data,
      tourActive: this.tourActive,
      tourIndex: this.tourIndex,
      tourTotal: this.currentArtifact.tour.length,
      tourCaption
    });

    this._notifyCameraChange();
  }

  focusHotspot(hotspotId, options = {}) {
    const hotspot = this.hotspots.find(({ data }) => data.id === hotspotId);
    if (!hotspot) {
      return;
    }

    const { focus = {} } = hotspot.data;
    const phi = clamp(focus.phi ?? 65, 10, 88) * DEG2RAD;
    const theta = (focus.theta ?? 12) * DEG2RAD;
    const radius = this.modelRadius * (focus.radius ?? 1.22);

    const target = focus.targetNorm
      ? this._normToWorldPosition(focus.targetNorm)
      : hotspot.worldPosition.clone();

    const offset = new THREE.Vector3(
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.cos(theta)
    );

    const destination = target.clone().add(offset);

    this._animateCameraTo(destination, target, options.duration ?? 900);
  }

  startTour(index = 0) {
    if (!this.currentArtifact?.tour?.length) {
      return;
    }

    this.tourActive = true;
    this.goToTourStep(index);
  }

  stopTour() {
    if (!this.tourActive) {
      return;
    }

    this.tourActive = false;
    this.callbacks.onTourStateChange?.({
      active: false,
      index: this.tourIndex,
      total: this.currentArtifact.tour.length
    });

    if (this.selectedHotspotId) {
      this.selectHotspot(this.selectedHotspotId, {
        focus: false,
        fromTour: true
      });
    }
  }

  goToTourStep(index) {
    if (!this.currentArtifact?.tour?.length) {
      return;
    }

    const clampedIndex = ((index % this.currentArtifact.tour.length) + this.currentArtifact.tour.length) % this.currentArtifact.tour.length;
    this.tourIndex = clampedIndex;

    const step = this.currentArtifact.tour[this.tourIndex];
    this.selectHotspot(step.hotspotId, {
      focus: true,
      duration: 1200,
      fromTour: true
    });

    this.callbacks.onTourStateChange?.({
      active: this.tourActive,
      index: this.tourIndex,
      total: this.currentArtifact.tour.length,
      caption: step.caption
    });

    this._notifyCameraChange();
  }

  nextTourStep() {
    this.goToTourStep(this.tourIndex + 1);
  }

  previousTourStep() {
    this.goToTourStep(this.tourIndex - 1);
  }

  resetView(immediate = false) {
    if (immediate) {
      this.camera.position.copy(this.defaultView.position);
      this.controls.target.copy(this.defaultView.target);
      this.controls.update();
      this._notifyCameraChange();
      return;
    }

    this._animateCameraTo(this.defaultView.position, this.defaultView.target, 950);
  }

  _animateCameraTo(position, target, duration = 900) {
    this.cameraAnimation = {
      fromPosition: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      toPosition: position.clone(),
      toTarget: target.clone(),
      duration,
      elapsed: 0
    };
  }

  applyCameraPose(pose, options = {}) {
    if (!pose) {
      return;
    }

    const position = pose.position;
    const target = pose.target;

    if (!Array.isArray(position) || !Array.isArray(target) || position.length !== 3 || target.length !== 3) {
      return;
    }

    if (position.some((value) => Number.isNaN(value)) || target.some((value) => Number.isNaN(value))) {
      return;
    }

    const emitCameraChange = options.emitCameraChange !== false;
    this.cameraEventMuted = !emitCameraChange;
    this.camera.position.set(position[0], position[1], position[2]);
    this.controls.target.set(target[0], target[1], target[2]);
    this.controls.update();
    this.cameraEventMuted = false;
    if (emitCameraChange) {
      this._notifyCameraChange();
    }
  }

  getCameraPose() {
    return {
      position: [
        Number(this.camera.position.x.toFixed(4)),
        Number(this.camera.position.y.toFixed(4)),
        Number(this.camera.position.z.toFixed(4))
      ],
      target: [
        Number(this.controls.target.x.toFixed(4)),
        Number(this.controls.target.y.toFixed(4)),
        Number(this.controls.target.z.toFixed(4))
      ]
    };
  }

  resize(width, height) {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    this.camera.aspect = safeWidth / safeHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(safeWidth, safeHeight, false);
    this.renderer.setPixelRatio(this._getTargetPixelRatio());
  }

  _updateCameraAnimation(delta) {
    if (!this.cameraAnimation) {
      return;
    }

    this.cameraAnimation.elapsed += delta * 1000;
    const progress = clamp(this.cameraAnimation.elapsed / this.cameraAnimation.duration, 0, 1);
    const eased = easeInOutCubic(progress);

    this.camera.position.lerpVectors(this.cameraAnimation.fromPosition, this.cameraAnimation.toPosition, eased);
    this.controls.target.lerpVectors(this.cameraAnimation.fromTarget, this.cameraAnimation.toTarget, eased);
    this.controls.update();

    if (progress >= 1) {
      this.cameraAnimation = null;
      this._notifyCameraChange();
    }
  }

  _updateHotspotPositions() {
    if (!this.hotspots.length || !this.modelRoot) {
      return;
    }

    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;

    for (const hotspot of this.hotspots) {
      const projected = hotspot.worldPosition.clone().project(this.camera);
      const visible =
        projected.z < 1 &&
        projected.z > -1 &&
        projected.x >= -1.2 &&
        projected.x <= 1.2 &&
        projected.y >= -1.2 &&
        projected.y <= 1.2;

      const occluded = visible ? this._isOccluded(hotspot.worldPosition) : true;

      hotspot.button.classList.toggle("is-occluded", occluded);
      hotspot.button.classList.toggle("is-hidden", !this.hotspotsEnabled || !visible);

      if (!visible) {
        continue;
      }

      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (projected.y * -0.5 + 0.5) * height;
      hotspot.button.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
    }
  }

  _isOccluded(worldPosition) {
    if (!this.modelRoot) {
      return false;
    }

    const direction = this.tmpVector.copy(worldPosition).sub(this.camera.position);
    const distanceToPoint = direction.length();
    direction.normalize();

    this.raycaster.set(this.camera.position, direction);
    const intersections = this.raycaster.intersectObject(this.modelRoot, true);

    if (!intersections.length) {
      return false;
    }

    return intersections[0].distance < distanceToPoint - this.modelRadius * 0.02;
  }

  _animate() {
    const tick = () => {
      const delta = this.clock.getDelta();

      this._updateCameraAnimation(delta);
      this.controls.update();
      this._updateHotspotPositions();
      this.renderer.render(this.scene, this.camera);

      requestAnimationFrame(tick);
    };

    tick();
  }
}
