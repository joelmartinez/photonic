// Live quickstart demo: runs the landing page's quickstart code against the real library.
import { PhotonicScene } from '@codecube/photonic';

const status = document.getElementById('ph-quickstart-status');
try {
  const container = document.getElementById('ph-quickstart-stage');
  const scene = new PhotonicScene(container);
  scene.createBox({ width: 1, height: 1, depth: 1, color: 0x38bdf8, position: { x: 0, y: 0.5, z: 0 } });
  scene.createSphere({ radius: 0.4, color: 0xfacc15, position: { x: 1.4, y: 0.4, z: 0 } });
  scene.setCameraPosition(3, 2, 4);
  scene.setCameraTarget(0, 0.5, 0);
  let frames = 0;
  scene.setFrameCallback(() => { frames += 1; });
  window.__photonicDocs = window.__photonicDocs || {};
  window.__photonicDocs.quickstart = { scene, get frames() { return frames; } };
  if (status) status.textContent = 'Live: the quickstart scene is running on this page. Drag to orbit it.';
} catch (error) {
  if (status) status.textContent = 'The live demo could not start: ' + error.message;
  console.error(error);
}
