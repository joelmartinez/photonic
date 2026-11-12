// Live overlay demo: PhotonicOverlay over a synthetic video feed, running the real library.
// The "video" is an animated canvas captured as a MediaStream, so the demo needs no camera.
import { PhotonicOverlay } from '@codecube/photonic';

const status = document.getElementById('ph-overlay-status');
try {
  const video = document.getElementById('ph-overlay-video');
  const stage = document.getElementById('ph-overlay-stage');
  const source = document.createElement('canvas');
  source.width = 640; source.height = 360;
  const sctx = source.getContext('2d');
  function drawSource(t) {
    const g = sctx.createLinearGradient(0, 0, 640, 360);
    g.addColorStop(0, '#334155'); g.addColorStop(1, '#0f172a');
    sctx.fillStyle = g; sctx.fillRect(0, 0, 640, 360);
    sctx.fillStyle = '#475569';
    for (let i = 0; i < 6; i += 1) {
      sctx.beginPath();
      sctx.arc(60 + i * 100, 300 - Math.sin(t / 900 + i) * 30, 22, 0, Math.PI * 2);
      sctx.fill();
    }
    sctx.fillStyle = '#e2e8f0'; sctx.font = '20px system-ui';
    sctx.fillText('synthetic video feed', 18, 34);
  }
  drawSource(0);
  video.srcObject = source.captureStream(30);
  video.play().catch(() => {});

  // Standing figure in normalized video coordinates. The target pose moves some joints, so
  // they recolor by offset and grow arrows; two offsets are mostly depth and get rings instead.
  // The left elbow and left ankle sit below the confidence threshold and render hollow.
  function basePose(t) {
    const sway = Math.sin(t / 700) * 0.008;
    const j = (x, y, confidence = 0.95) => ({ x: x + sway, y, z: 0, confidence });
    return {
      nose: j(0.5, 0.16), left_eye: j(0.485, 0.145), right_eye: j(0.515, 0.145),
      left_ear: j(0.47, 0.155), right_ear: j(0.53, 0.155),
      left_shoulder: j(0.44, 0.26), right_shoulder: j(0.56, 0.26),
      left_elbow: j(0.40, 0.42, 0.12), right_elbow: j(0.60, 0.42),
      left_wrist: j(0.38, 0.58), right_wrist: j(0.62, 0.58),
      left_hip: j(0.46, 0.52), right_hip: j(0.54, 0.52),
      left_knee: j(0.45, 0.72), right_knee: j(0.55, 0.72),
      left_ankle: j(0.44, 0.92, 0.08), right_ankle: j(0.56, 0.92)
    };
  }
  function targetPose() {
    const p = basePose(0);
    p.left_wrist = { ...p.left_wrist, x: p.left_wrist.x - 0.02, y: p.left_wrist.y - 0.16 };
    p.right_knee = { ...p.right_knee, x: p.right_knee.x + 0.09, y: p.right_knee.y - 0.03 };
    p.right_wrist = { ...p.right_wrist, z: 0.18 };
    p.left_knee = { ...p.left_knee, z: -0.15 };
    return p;
  }

  const overlay = new PhotonicOverlay(stage, { video });
  overlay.setTargetPose(targetPose());
  function frame(t) {
    drawSource(t);
    overlay.setPose(basePose(t));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  overlay.start();

  const arrows = document.getElementById('ph-toggle-arrows');
  if (arrows) arrows.addEventListener('change', () => overlay.setShowArrows(arrows.checked));
  const deviation = document.getElementById('ph-toggle-deviation');
  if (deviation) deviation.addEventListener('change', () => overlay.setColorByDeviation(deviation.checked));
  const hollow = document.getElementById('ph-toggle-hollow');
  if (hollow) hollow.addEventListener('change', () => overlay.setShowHollowJoints(hollow.checked));
  const rings = document.getElementById('ph-toggle-rings');
  if (rings) rings.addEventListener('change', () => overlay.setShowDepthRings(rings.checked));

  window.__photonicDocs = window.__photonicDocs || {};
  window.__photonicDocs.overlayDemo = { overlay, video };
  if (status) status.textContent = 'Live: the overlay is drawing over the synthetic feed, driven by the toggles above.';
} catch (error) {
  if (status) status.textContent = 'The live demo could not start: ' + error.message;
  console.error(error);
}
