import { estimateSplatCamera } from '../../src/splatCameraHeuristics.js';

/**
 * Splat Scene – Gaussian Splat viewer Photonic module
 *
 * Loads a Gaussian Splat asset (e.g. Scaniverse .spz) into a Three.js scene
 * using @sparkjsdev/spark via PhotonicScene.loadSplat().
 *
 * Configuration:
 *   Set window.PhotonicSplatConfig before the module is loaded.
 *   All fields are optional; sensible defaults are provided.
 *
 *   window.PhotonicSplatConfig = {
 *     url:          "room.spz",  // path to splat file (required; no asset ships with Photonic)
 *     format:       "auto",                    // "spz"|"ply"|"splat"|"ksplat"|"auto"
 *     position:     [0, 0, 0],                 // world offset [x, y, z]
 *     rotation:     [0, 0, 0],                 // Euler rotation in radians [x, y, z]
 *     scale:        1,                         // uniform or [sx, sy, sz]
 *     moveSpeed:    1.8,                       // FPS move speed (m/s)
 *     mouseSens:    0.002,                     // mouse look sensitivity
 *     autoCamera:   true,                      // infer floor/eye-height from splats
 *     cameraStart:  [0, 1.7, 3],              // fallback camera position [x, y, z]
 *     showGrid:     true,                      // show/hide debug grid
 *     showFloor:    true,                      // show/hide floor plane
 *   };
 *
 * Asset path:
 *   No splat asset ships with Photonic. Point url at your own Scaniverse
 *   .spz (or .ply / .splat / .ksplat) file, served from a path your page
 *   can reach, and set it through window.PhotonicSplatConfig before load.
 *   With no url configured the module loads, explains what is missing,
 *   and shows nothing.
 *
 * Controls (desktop):
 *   Click to lock mouse → WASD to move → mouse to look → ESC to release
 * Controls (mobile):
 *   Drag to look · Double-tap+hold to move forward · Two-finger to back up
 */

const Metadata = {
  title: 'Splat Viewer',
  description: 'Gaussian Splat scene. Desktop supports FPS navigation, and supported headsets can enter WebXR from the splat-derived starting pose.'
};

// ─────────────────────────────────────────────────────────────────
// Default configuration
// ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  url:         null,
  format:      'auto',
  position:    [0, 0, 0],
  rotation:    [0, 0, 0],
  scale:       1,
  moveSpeed:   1.8,
  mouseSens:   0.002,
  autoCamera:  true,
  cameraStart: [0, 1.7, 3],
  showGrid:    true,
  showFloor:   true
};

function getConfig() {
  const override = (typeof window !== 'undefined') ? (window.PhotonicSplatConfig || {}) : {};
  return Object.assign({}, DEFAULT_CONFIG, override);
}

// ─────────────────────────────────────────────────────────────────
// On-screen overlay helpers
// ─────────────────────────────────────────────────────────────────

let overlayEl    = null;
let errorEl      = null;
let loadingEl    = null;
let instructEl   = null;

function createOverlay() {
  if (overlayEl) return;
  overlayEl = document.createElement('div');
  Object.assign(overlayEl.style, {
    position:       'absolute',
    top:            '0',
    left:           '0',
    width:          '100%',
    height:         '100%',
    pointerEvents:  'none',
    fontFamily:     'sans-serif'
  });

  // Loading indicator
  loadingEl = document.createElement('div');
  Object.assign(loadingEl.style, {
    position:   'absolute',
    top:        '50%',
    left:       '50%',
    transform:  'translate(-50%,-50%)',
    color:      '#fff',
    fontSize:   '18px',
    background: 'rgba(0,0,0,0.55)',
    padding:    '12px 24px',
    borderRadius: '8px'
  });
  loadingEl.textContent = 'Loading splat…';
  overlayEl.appendChild(loadingEl);

  // Error message (hidden by default)
  errorEl = document.createElement('div');
  Object.assign(errorEl.style, {
    position:    'absolute',
    top:         '50%',
    left:        '50%',
    transform:   'translate(-50%,-50%)',
    color:       '#ff6b6b',
    fontSize:    '16px',
    background:  'rgba(0,0,0,0.75)',
    padding:     '16px 28px',
    borderRadius: '8px',
    maxWidth:    '70%',
    textAlign:   'center',
    display:     'none'
  });
  overlayEl.appendChild(errorEl);

  // Instruction hint (hidden until pointer lock)
  instructEl = document.createElement('div');
  Object.assign(instructEl.style, {
    position:    'absolute',
    bottom:      '20px',
    left:        '50%',
    transform:   'translateX(-50%)',
    color:       '#fff',
    fontSize:    '14px',
    background:  'rgba(0,0,0,0.5)',
    padding:     '8px 18px',
    borderRadius: '6px',
    whiteSpace:  'nowrap',
    display:     'none'
  });
  instructEl.textContent = 'Click to look around  ·  WASD to move  ·  Space↑  Shift↓  ·  ESC to exit';
  overlayEl.appendChild(instructEl);
}

function mountOverlay(container) {
  if (!overlayEl || !container) return;
  const parent = container.parentElement || container;
  parent.style.position = parent.style.position || 'relative';
  parent.appendChild(overlayEl);
}

function showLoading(visible) {
  if (loadingEl) loadingEl.style.display = visible ? '' : 'none';
}

function showError(msg) {
  if (errorEl) {
    errorEl.style.display = msg ? '' : 'none';
    if (msg) errorEl.textContent = `⚠ ${msg}`;
  }
  if (loadingEl) loadingEl.style.display = 'none';
}

function showInstructions(visible) {
  if (instructEl) instructEl.style.display = visible ? '' : 'none';
}

function removeOverlay() {
  if (overlayEl && overlayEl.parentElement) {
    overlayEl.parentElement.removeChild(overlayEl);
  }
  overlayEl = loadingEl = errorEl = instructEl = null;
}

// ─────────────────────────────────────────────────────────────────
// Module state
// ─────────────────────────────────────────────────────────────────

let splatHandle  = null;
let loadError    = false;
let config       = null;

function applyAutoCamera(scene, handle, activeConfig) {
  if (!handle || activeConfig.autoCamera === false) {
    return false;
  }

  const estimate = estimateSplatCamera({
    getSplatCount: () => handle.getSplatCount(),
    getSplat: (index) => handle.getSplat(index),
    transform: {
      translation: activeConfig.position,
      rotation: activeConfig.rotation,
      scale: activeConfig.scale
    }
  });

  if (!estimate?.camera || !estimate?.target) {
    return false;
  }

  scene.setDefaultView({
    position: estimate.camera,
    target: estimate.target
  });
  console.log('[Splat] Auto camera estimate:', estimate.diagnostics);
  return true;
}

// ─────────────────────────────────────────────────────────────────
// Module lifecycle
// ─────────────────────────────────────────────────────────────────

async function Load(scene) {
  config     = getConfig();
  splatHandle = null;
  loadError   = false;

  // ── Scene setup ──────────────────────────────────────────────

  scene.setBackgroundColor(0x111111); // Dark environment for splat viewing
  scene.setAmbientLight({ intensity: 0.4, color: 0xffffff });
  scene.setGridVisible(config.showGrid);
  scene.setFloorVisible(config.showFloor);

  // Position camera using the fallback view until the splat-based estimate is ready.
  const [cx, cy, cz] = config.cameraStart;
  scene.setDefaultView({
    position: { x: cx, y: cy, z: cz },
    target: {
      x: config.position[0],
      y: config.position[1],
      z: config.position[2]
    }
  });

  // ── FPS controls ─────────────────────────────────────────────

  scene.enableFPSControls({
    moveSpeed: config.moveSpeed,
    onLockChange: (locked) => {
      showInstructions(!locked); // hide hint while navigating
    }
  });

  // ── Overlay ───────────────────────────────────────────────────

  createOverlay();
  const canvas = scene.renderer?.renderer?.domElement;
  mountOverlay(canvas);
  showLoading(true);
  showInstructions(false);

  // ── Load splat ────────────────────────────────────────────────

  if (!config.url) {
    loadError = true;
    const msg = 'No splat asset configured. Set window.PhotonicSplatConfig.url to a .spz, .ply, .splat, or .ksplat file before loading this module.';
    console.error('[Splat]', msg);
    showLoading(false);
    showError(msg);
    return { splatHandle: null, config };
  }

  try {
    splatHandle = await scene.loadSplat({
      url:      config.url,
      position: config.position,
      rotation: config.rotation,
      scale:    config.scale,
      onLoad:   (_mesh) => {
        applyAutoCamera(scene, splatHandle, config);
        console.log('[Splat] Loaded:', config.url);
        showLoading(false);
        showInstructions(true);
      },
      onError:  (err) => {
        loadError = true;
        const msg = `Could not load splat: "${config.url}"\n${err.message}`;
        console.error('[Splat]', msg, err);
        showError(msg);
      }
    });
  } catch (err) {
    loadError = true;
    const msg = `Could not initialise splat loader: ${err.message}`;
    console.error('[Splat]', msg, err);
    showError(msg);
  }

  return {
    splatHandle,
    config
  };
}

function Update(_scene, _state, _deltaTime) {
  // Camera movement is handled automatically by PhotonicInput.
  // Spark splat sorting/rendering is handled by the SparkRenderer loadSplat adds to the scene.
}

function Unload(scene, _state) {
  // Stop FPS mode and restore orbit controls.
  scene.disableFPSControls();

  // Dispose the splat object.
  if (splatHandle) {
    try { splatHandle.dispose(); } catch (err) {
      console.warn('[Splat] Error during splat disposal:', err);
    }
    splatHandle = null;
  }

  // Remove the overlay.
  removeOverlay();

  loadError  = false;
  config     = null;
}

// ─────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────

export { Load, Update, Unload, Metadata };

// Compatibility shim: also register in the global PhotonicModules namespace
(function () {
  if (typeof window === 'undefined') return;
  if (!window.PhotonicModules) {
    window.PhotonicModules = {};
  }

  window.PhotonicModules.splat = {
    Metadata,
    Load,
    Update,
    Unload
  };
})();
