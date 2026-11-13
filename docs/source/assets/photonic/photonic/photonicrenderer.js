/**
 * PhotonicRenderer - Renderer management for Photonic framework
 *
 * Handles WebGL renderer setup with responsive sizing that matches device aspect ratio.
 * Expands viewable area on resize rather than scaling pixels.
 * Owns the output step (roadmap F8): ACES filmic tone mapping with an exposure
 * control, a pixel-ratio cap, and an optional GTAO composer chain.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/effectcomposer.js';
import { RenderPass } from 'three/addons/postprocessing/renderpass.js';
import { GTAOPass } from 'three/addons/postprocessing/gtaopass.js';
import { OutputPass } from 'three/addons/postprocessing/outputpass.js';

// Tone mapping modes by friendly name (F8); a raw THREE constant is also accepted.
const TONE_MAPPING_MODES = {
  none: THREE.NoToneMapping,
  linear: THREE.LinearToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  cineon: THREE.CineonToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping
};

const DEFAULT_PIXEL_RATIO_CAP = 2;

// Screen-space AO defaults (F9 retune): the GTAO pass now only does contact darkening for things that move, so it runs wider and softer than the F8 defaults and its strength is capped below black. Static occlusion is the baked pass's job (PhotonicScene.bakeAmbientOcclusion).
const AO_BLEND_CEILING = 0.85;
const DEFAULT_AO_OPTIONS = {
  blendIntensity: 0.55,
  radius: 0.9,
  distanceExponent: 1.5,
  distanceFallOff: 0.5,
  scale: 0.9,
  denoiseRadius: 14,
  denoiseSamples: 24
};

function resolveToneMapping(mode) {
  if (typeof mode === 'number') return mode;
  const value = TONE_MAPPING_MODES[String(mode).toLowerCase()];
  if (value === undefined) throw new Error(`PhotonicRenderer: unknown tone mapping mode "${mode}"`);
  return value;
}

function toneMappingName(value) {
  for (const [name, constant] of Object.entries(TONE_MAPPING_MODES)) {
    if (constant === value) return name;
  }
  return value;
}

export class PhotonicRenderer {
  constructor(containerElement, options = {}) {
    this.container = containerElement;

    // Create WebGL renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false
    });

    // Enable shadows for better visual quality
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    // Grading (F8): ACES filmic tone mapping by default, exposure is a plain control.
    this.renderer.toneMapping = resolveToneMapping(options.toneMapping ?? 'aces');
    this.renderer.toneMappingExposure = options.exposure ?? 1;

    // Enable WebXR rendering when a session is active.
    this.renderer.xr.enabled = true;

    // Pixel ratio (F8): capped so high-density displays do not pay past the visible gain.
    this.pixelRatioCap = options.pixelRatioCap ?? DEFAULT_PIXEL_RATIO_CAP;
    this._applyPixelRatio();

    // Post-processing state (F8): the composer is built lazily on first use.
    this._postProcessingEnabled = false;
    this._aoOptions = { ...DEFAULT_AO_OPTIONS, ...(options.aoOptions || {}) };
    this._composer = null;
    this._renderPass = null;
    this._aoPass = null;
    this._outputPass = null;
    this._composerScene = null;
    this._composerCamera = null;

    // Calculate initial size using container dimensions
    this._updateSize();

    // Append canvas to container
    this.container.appendChild(this.renderer.domElement);
  }

  _applyPixelRatio() {
    const ratio = Math.min(window.devicePixelRatio || 1, this.pixelRatioCap);
    this.renderer.setPixelRatio(ratio);
    if (this._composer) this._composer.setPixelRatio(ratio);
  }

  // ==================== Grading controls (F8) ====================

  setToneMapping(mode) {
    this.renderer.toneMapping = resolveToneMapping(mode);
    return this;
  }

  getToneMapping() {
    return toneMappingName(this.renderer.toneMapping);
  }

  setExposure(exposure) {
    this.renderer.toneMappingExposure = exposure;
    return this;
  }

  getExposure() {
    return this.renderer.toneMappingExposure;
  }

  setPixelRatioCap(cap) {
    this.pixelRatioCap = cap;
    this._applyPixelRatio();
    this._updateSize();
    return this;
  }

  getPixelRatioCap() {
    return this.pixelRatioCap;
  }

  getPixelRatio() {
    return this.renderer.getPixelRatio();
  }

  // ==================== Post-processing: GTAO composer chain (F8) ====================

  // Turn the composer chain on. Options tune the ambient occlusion pass: blendIntensity, radius, distanceExponent, thickness, scale, samples.
  enablePostProcessing(scene, camera, options = {}) {
    if (options && Object.keys(options).length > 0) {
      this._aoOptions = { ...this._aoOptions, ...options };
    }
    this._postProcessingEnabled = true;
    if (scene && camera) this._buildComposer(scene, camera);
    return this;
  }

  disablePostProcessing() {
    this._postProcessingEnabled = false;
    return this;
  }

  isPostProcessingEnabled() {
    return this._postProcessingEnabled;
  }

  setPostProcessingOptions(options = {}) {
    this._aoOptions = { ...this._aoOptions, ...options };
    if (this._aoPass) this._applyAOOptions();
    return this;
  }

  getPostProcessingInfo() {
    return {
      enabled: this._postProcessingEnabled,
      active: this._postProcessingEnabled && this._composer !== null && !this.renderer.xr.isPresenting,
      ao: 'gtao',
      blendCeiling: AO_BLEND_CEILING,
      aoOptions: { ...this._aoOptions },
      toneMapping: this.getToneMapping(),
      exposure: this.getExposure(),
      pixelRatio: this.getPixelRatio(),
      pixelRatioCap: this.pixelRatioCap
    };
  }

  _applyAOOptions() {
    const { blendIntensity, denoiseRadius, denoiseSamples, denoiseRings, denoiseRadiusExponent, ...gtaoParameters } = this._aoOptions;
    // Intensity ceiling (F9): the dynamic pass may darken contact, never crush it toward black, however it is tuned.
    if (blendIntensity !== undefined) this._aoPass.blendIntensity = Math.min(blendIntensity, AO_BLEND_CEILING);
    const parameters = Object.fromEntries(Object.entries(gtaoParameters).filter(([, v]) => v !== undefined));
    if (Object.keys(parameters).length > 0) this._aoPass.updateGtaoMaterial(parameters);
    // Softening (F9): the pass's Poisson denoise runs wider than stock so the result is a soft contact shade, never a hard band.
    const pdParameters = {};
    if (denoiseRadius !== undefined) pdParameters.radius = denoiseRadius;
    if (denoiseSamples !== undefined) pdParameters.samples = denoiseSamples;
    if (denoiseRings !== undefined) pdParameters.rings = denoiseRings;
    if (denoiseRadiusExponent !== undefined) pdParameters.radiusExponent = denoiseRadiusExponent;
    if (Object.keys(pdParameters).length > 0) this._aoPass.updatePdMaterial(pdParameters);
  }

  _buildComposer(scene, camera) {
    if (this._composer && this._composerScene === scene && this._composerCamera === camera) {
      this._applyAOOptions();
      return;
    }
    this._disposeComposer();
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this._composer = new EffectComposer(this.renderer);
    this._renderPass = new RenderPass(scene, camera);
    this._aoPass = new GTAOPass(scene, camera, width, height);
    this._outputPass = new OutputPass();
    this._composer.addPass(this._renderPass);
    this._composer.addPass(this._aoPass);
    this._composer.addPass(this._outputPass);
    this._applyAOOptions();
    this._composer.setPixelRatio(this.renderer.getPixelRatio());
    this._composer.setSize(width, height);
    this._composerScene = scene;
    this._composerCamera = camera;
  }

  _disposeComposer() {
    if (!this._composer) return;
    this._aoPass?.dispose();
    this._outputPass?.dispose();
    this._composer.dispose();
    this._composer = null;
    this._renderPass = null;
    this._aoPass = null;
    this._outputPass = null;
    this._composerScene = null;
    this._composerCamera = null;
  }

  /**
   * Calculate size based on actual container dimensions
   * This allows the canvas to adapt to any aspect ratio
   */
  _updateSize() {
    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;

    this.renderer.setSize(containerWidth, containerHeight);
    if (this._composer) this._composer.setSize(containerWidth, containerHeight);
  }

  /**
   * Render the scene. Through the composer when post-processing is on;
   * direct while XR is presenting, because the composer is a flat-screen chain.
   */
  render(scene, camera) {
    if (this._postProcessingEnabled && !this.renderer.xr.isPresenting) {
      this._buildComposer(scene, camera);
      this._composer.render();
      return;
    }
    this.renderer.render(scene, camera);
  }

  /**
   * Install the shared render loop used by both standard rendering and WebXR.
   */
  setAnimationLoop(callback) {
    this.renderer.setAnimationLoop(callback);
  }

  /**
   * Handle container resize
   * Expands viewable area rather than scaling pixels
   */
  handleResize() {
    this._updateSize();
  }

  setXRReferenceSpaceType(referenceSpaceType) {
    this.renderer.xr.setReferenceSpaceType(referenceSpaceType);
  }

  setXRSession(session) {
    return this.renderer.xr.setSession(session);
  }

  getXRReferenceSpace() {
    return this.renderer.xr.getReferenceSpace?.() ?? null;
  }

  isXRPresenting() {
    return this.renderer.xr.isPresenting === true;
  }

  /**
   * Clean up resources
   */
  dispose() {
    this.renderer.setAnimationLoop(null);
    this._disposeComposer();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
