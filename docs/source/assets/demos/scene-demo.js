// Live scene demo: authoring calls plus the grading controls, all against the real library.
import { PhotonicScene } from '@codecube/photonic';

const status = document.getElementById('ph-scene-status');
try {
  const container = document.getElementById('ph-scene-stage');
  const scene = new PhotonicScene(container);
  const box = scene.createBox({ width: 1, height: 1, depth: 1, color: 0x38bdf8, position: { x: 0, y: 0.5, z: 0 } });
  scene.createSphere({ radius: 0.4, color: 0xfacc15, position: { x: 1.4, y: 0.4, z: 0 } });
  scene.createCylinder({ radiusTop: 0.25, radiusBottom: 0.25, height: 0.9, color: 0xf472b6, position: { x: -1.4, y: 0.45, z: 0 } });
  scene.setCameraPosition(3, 2, 4);
  scene.setCameraTarget(0, 0.5, 0);
  scene.setFrameCallback((deltaTime) => {
    const rotation = box.getRotation();
    box.setRotation(rotation.x, rotation.y + deltaTime * 0.6, rotation.z);
  });

  const exposure = document.getElementById('ph-exposure');
  const exposureValue = document.getElementById('ph-exposure-value');
  if (exposure) {
    exposure.addEventListener('input', () => {
      scene.setExposure(Number(exposure.value));
      if (exposureValue) exposureValue.textContent = Number(exposure.value).toFixed(2);
    });
  }
  const ao = document.getElementById('ph-ao');
  if (ao) {
    ao.addEventListener('change', () => {
      if (ao.checked) { scene.enablePostProcessing(); } else { scene.disablePostProcessing(); }
    });
  }
  window.__photonicDocs = window.__photonicDocs || {};
  window.__photonicDocs.sceneDemo = { scene, box };
  if (status) status.textContent = 'Live: drag to orbit. The box spins through the frame callback.';
} catch (error) {
  if (status) status.textContent = 'The live demo could not start: ' + error.message;
  console.error(error);
}
