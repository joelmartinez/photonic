/**
 * Model loading demo (roadmap F13, extended by F14).
 *
 * Every model on the plinth is an existing file loaded by the same call,
 * scene.loadModel: the reference part is a binary glTF (assets/reference-part.glb,
 * with the same model kept beside it as reference-part.gltf) carrying a
 * hierarchy, three materials, and one animation; the bracket is a binary STL
 * (assets/bracket.stl) and the wedge an ASCII STL (assets/wedge.stl), both
 * geometry-only files that arrive wearing the engine's default material; and
 * the knob is an OBJ (assets/knob.obj) whose two groups take their materials
 * from its MTL file (assets/knob.mtl). Each load is adopted into the scene
 * with the standard handle, so the bake toggle runs
 * scene.bakeAmbientOcclusion over all of them exactly like a created object.
 * Query modes for headless checks: ?mode=loaded (plain) and ?mode=baked
 * (bake applied on load).
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
    position: { x: 0, y: 0.08, z: -0.15 }
  });
  const stlHandle = await scene.loadModel('./assets/bracket.stl', {
    name: 'bracket-stl',
    position: { x: 1.38, y: 0.08, z: 0.95 },
    rotation: { x: 0, y: -0.5, z: 0 }
  });
  const wedgeHandle = await scene.loadModel('./assets/wedge.stl', {
    name: 'wedge-stl',
    position: { x: 0, y: 0.08, z: 1.3 }
  });
  const objHandle = await scene.loadModel('./assets/knob.obj', {
    name: 'knob-obj',
    position: { x: -1.38, y: 0.08, z: 0.95 }
  });
  const info = modelHandle.getModelInfo();
  const stlInfo = stlHandle.getModelInfo();
  const wedgeInfo = wedgeHandle.getModelInfo();
  const objInfo = objHandle.getModelInfo();
  statusEl.textContent = `Loaded ${info.format} model: ${info.meshCount} meshes, ${info.animations.length} animation (${info.animations[0]?.name || 'none'}), asset generator: ${info.asset?.generator || 'unknown'} · ${stlInfo.format} bracket and ${wedgeInfo.format} wedge: ${stlInfo.meshCount + wedgeInfo.meshCount} meshes in the default material · ${objInfo.format} knob: ${objInfo.meshCount} meshes, materials from ${(objInfo.materialLibraries || []).join(', ') || 'none'}`;
  window.__modelHandle = modelHandle;
  window.__stlHandle = stlHandle;
  window.__wedgeHandle = wedgeHandle;
  window.__objHandle = objHandle;
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
