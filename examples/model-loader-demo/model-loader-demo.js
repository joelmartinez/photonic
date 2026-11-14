/**
 * Model loading demo (roadmap F13).
 *
 * The reference part is an existing model file (assets/reference-part.glb, with
 * the same model kept beside it as reference-part.gltf): a binary glTF carrying
 * a hierarchy (a root over a plate and a boss, the boss carrying a knob), three
 * materials (steel, red paint, brass), and one animation. scene.loadModel
 * fetches and parses it and adopts the result with the standard handle, so the
 * bake toggle runs scene.bakeAmbientOcclusion over the loaded model exactly
 * like a created object. Query modes for headless checks: ?mode=loaded (plain)
 * and ?mode=baked (bake applied on load).
 */

import { PhotonicScene } from '@codecube/photonic';

const params = new URLSearchParams(window.location.search);
const mode = params.get('mode'); // 'loaded' | 'baked' | null (interactive)

const scene = new PhotonicScene(document.getElementById('app'));
scene.setBackgroundColor(0x14120f);
scene.setExposure(1.0);
scene.camera.camera.fov = 42;
scene.camera.camera.updateProjectionMatrix();
scene.setCameraPosition(2.15, 1.55, 2.45);
scene.setCameraTarget(0, 0.25, 0);

const plinth = scene.createCylinder({ radiusTop: 1.9, radiusBottom: 2.0, height: 0.08, color: 0x4a4238, position: { x: 0, y: 0.04, z: 0 } });

const statusEl = document.getElementById('status');
const bakeToggle = document.getElementById('toggle-bake');

let modelHandle = null;

async function start() {
  modelHandle = await scene.loadModel('./assets/reference-part.glb', {
    name: 'reference-part',
    position: { x: 0, y: 0.08, z: 0 }
  });
  const info = modelHandle.getModelInfo();
  statusEl.textContent = `Loaded ${info.format} model: ${info.meshCount} meshes, ${info.animations.length} animation (${info.animations[0]?.name || 'none'}), asset generator: ${info.asset?.generator || 'unknown'}`;
  window.__modelHandle = modelHandle;
  window.__modelScene = scene;
  if (mode === 'baked') {
    scene.bakeAmbientOcclusion();
    bakeToggle.checked = true;
    window.__bakeInfo = scene.getBakedAOInfo();
  }
  window.__modelReady = true;
}

bakeToggle.addEventListener('change', () => {
  if (bakeToggle.checked) {
    scene.bakeAmbientOcclusion();
  } else {
    scene.clearBakedAmbientOcclusion();
  }
  window.__bakeInfo = scene.getBakedAOInfo();
});

start().catch((err) => {
  statusEl.textContent = `Model load failed: ${err.message}`;
  window.__modelError = err;
  console.error(err);
});
