/**
 * Photonic demo host page - page wiring for the standalone demo.
 * This is a host page, not the library entry (that is src/index.js).
 */

import { PhotonicScene } from '../../src/PhotonicScene.js';
import { PhotonicSceneLoader } from '../../src/PhotonicSceneLoader.js';
import { syncModuleSelector, wireModuleSelector } from './moduleSelector.js';
import { scrollViewportIntoView } from './viewportScroll.js';

const wireXRControls = async (scene) => {
  const xrControls = document.getElementById('viz-xr-controls');
  const button = document.getElementById('viz-enter-xr');
  const status = document.getElementById('viz-xr-status');

  if (!xrControls || !button || !status) {
    return;
  }

  const renderXRState = (xrState) => {
    const shouldShowControls =
      xrState.presenting ||
      xrState.entering ||
      xrState.supported ||
      !!xrState.error;

    xrControls.hidden = !shouldShowControls;

    if (!shouldShowControls) {
      return;
    }

    if (xrState.error && !xrState.entering && !xrState.presenting) {
      button.disabled = false;
      button.textContent = 'Enter XR';
      status.textContent = `Could not start XR: ${xrState.error.message}`;
      return;
    }

    if (xrState.presenting) {
      button.disabled = false;
      button.textContent = 'Exit XR';
      status.textContent = 'Immersive session active. Head tracking and room-scale movement are live from the module start pose.';
      return;
    }

    if (xrState.entering) {
      button.disabled = true;
      button.textContent = 'Entering XR…';
      status.textContent = 'Waiting for the browser to hand the scene over to your headset…';
      return;
    }

    if (xrState.supported) {
      button.disabled = false;
      button.textContent = 'Enter XR';
      status.textContent = 'Supports immersive WebXR. Best tested for Apple Vision Pro and Meta Quest. Camera-only room scale for now.';
      return;
    }

    button.disabled = true;
    button.textContent = 'XR Unavailable';
    status.textContent = xrState.available
      ? 'This browser does not currently expose immersive-vr for this page.'
      : 'WebXR is not available in this browser. Try Safari on Apple Vision Pro or Meta Quest Browser.';
  };

  button.addEventListener('click', async () => {
    try {
      const currentState = scene.getXRState();
      if (currentState.presenting) {
        await scene.exitXR();
      } else {
        await scene.enterXR();
      }
    } catch (error) {
      renderXRState(scene.getXRState());
    }
  });

  scene.onXRStateChange(renderXRState);
  await scene.refreshXRSupport();
  renderXRState(scene.getXRState());
};

// Initialize Photonic when DOM is ready
const initPhotonic = () => {
  const container = document.getElementById('photonic-container');
  
  if (container) {
    const moduleSelect = document.getElementById('viz-module-select');

    if (moduleSelect) {
      syncModuleSelector(moduleSelect);
      wireModuleSelector(moduleSelect);
    }

    const modulePicker = moduleSelect?.closest('.nav-module-picker');
    scrollViewportIntoView(modulePicker || container);

    // Create the scene
    const scene = new PhotonicScene(container);
    
    // Create the scene loader
    const loader = new PhotonicSceneLoader(scene, {
      moduleBaseUrl: new URL('../modules/', window.location.href).href
    });
    
    // Remove loading state after scene is initialized
    container.classList.remove('photonic-loading');
    
    // Make scene globally accessible for debugging/interaction
      window.Photonic = {
        scene: scene,
        loader: loader,

        // Expose main API methods at top level for convenience
        createBox: (options) => scene.createBox(options),
      createArrow: (options) => scene.createArrow(options),
      removeObject: (handle) => scene.removeObject(handle),
      clearObjects: () => scene.clearObjects(),
      loadSplat: (options) => scene.loadSplat(options),
      
      // Expose loader methods
      loadModule: (moduleName) => loader.loadModule(moduleName),
      unloadModule: () => loader.unloadModule(),
      getCurrentModule: () => loader.getCurrentModuleName(),
      getModuleUrl: (moduleName) => loader.getModuleUrl(moduleName),
      getLastRequestedModuleUrl: () => loader.getLastRequestedModuleUrl(),
      enterXR: () => scene.enterXR(),
      exitXR: () => scene.exitXR(),
      getXRState: () => scene.getXRState(),
      refreshXRSupport: () => scene.refreshXRSupport()
    };

    wireXRControls(scene);
    
    // Check for module query parameter
    const urlParams = new URLSearchParams(window.location.search);
    const moduleName = urlParams.get('module');
    
    if (moduleName) {
      // Load the specified module
      loader.loadModule(moduleName)
        .then(() => {
          console.log(`Module loaded: ${moduleName}`);
        })
        .catch((error) => {
          console.error(`Failed to load module: ${moduleName}`, error);
        });
    }
    
    console.log('Photonic 3D visualization framework initialized');
    console.log('Access via window.Photonic');
    console.log('Load a module with: Photonic.loadModule("box.js")');
    console.log('Or use URL parameter: ?module=box.js');
  } else {
    console.error('Photonic container element not found');
  }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPhotonic);
} else {
  initPhotonic();
}
