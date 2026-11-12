// Live module demo: loads the library's own example scene modules through PhotonicSceneLoader.
import { PhotonicScene, PhotonicSceneLoader } from '@codecube/photonic';

const status = document.getElementById('ph-module-status');
try {
  const container = document.getElementById('ph-module-stage');
  const scene = new PhotonicScene(container);
  scene.setCameraPosition(3, 2, 4);
  scene.setCameraTarget(0, 0.5, 0);
  const scriptUrl = document.querySelector('script[src*="module-demo"]')?.src || window.location.href;
  const modulesBase = new URL('../photonic/modules/', scriptUrl).href;
  const loader = new PhotonicSceneLoader(scene, { moduleBaseUrl: modulesBase });
  const buttons = document.querySelectorAll('[data-ph-module]');
  buttons.forEach((button) => {
    button.addEventListener('click', async () => {
      const name = button.getAttribute('data-ph-module');
      if (status) status.textContent = 'Loading ' + name + '...';
      await loader.loadModule(name);
      if (status) status.textContent = 'Live: module ' + loader.getCurrentModuleName() + ' is loaded and running.';
    });
  });
  await loader.loadModule('box.js');
  window.__photonicDocs = window.__photonicDocs || {};
  window.__photonicDocs.moduleDemo = { scene, loader };
  if (status) status.textContent = 'Live: module ' + loader.getCurrentModuleName() + ' is loaded and running.';
} catch (error) {
  if (status) status.textContent = 'The live demo could not start: ' + error.message;
  console.error(error);
}
