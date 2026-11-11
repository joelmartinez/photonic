/**
 * Pose-skeleton-over-video demo for PhotonicOverlay (roadmap F1).
 * The "video" is a synthetic canvas stream, so the demo needs no camera
 * and no video asset: it proves the overlay path, not a capture device.
 */

import { PhotonicOverlay } from '../../src/PhotonicOverlay.js';

const video = document.getElementById('stage-video');
const stage = document.getElementById('stage');

// Synthetic video source: an animated canvas captured as a MediaStream.
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

// A standing figure in normalized video coordinates. The target pose moves
// the left wrist up and the right knee out, so those joints carry a real
// offset: they recolor by magnitude and grow direction arrows.
function basePose(t, still) {
  const sway = still ? 0 : Math.sin(t / 700) * 0.008;
  const j = (x, y) => ({ x: x + sway, y });
  return {
    nose: j(0.5, 0.16), left_eye: j(0.485, 0.145), right_eye: j(0.515, 0.145),
    left_ear: j(0.47, 0.155), right_ear: j(0.53, 0.155),
    left_shoulder: j(0.44, 0.26), right_shoulder: j(0.56, 0.26),
    left_elbow: j(0.40, 0.42), right_elbow: j(0.60, 0.42),
    left_wrist: j(0.38, 0.58), right_wrist: j(0.62, 0.58),
    left_hip: j(0.46, 0.52), right_hip: j(0.54, 0.52),
    left_knee: j(0.45, 0.72), right_knee: j(0.55, 0.72),
    left_ankle: j(0.44, 0.92), right_ankle: j(0.56, 0.92)
  };
}
function targetPose(t, still) {
  const p = basePose(t, still);
  p.left_wrist = { x: p.left_wrist.x - 0.02, y: p.left_wrist.y - 0.16 };
  p.right_knee = { x: p.right_knee.x + 0.09, y: p.right_knee.y - 0.03 };
  p.right_elbow = { x: p.right_elbow.x + 0.03, y: p.right_elbow.y - 0.02 };
  return p;
}

const params = new URLSearchParams(window.location.search);
const still = params.get('still') === '1';
const overlay = new PhotonicOverlay(stage, { video });
overlay.setTargetPose(targetPose(0, true));

function frame(t) {
  drawSource(t);
  overlay.setPose(basePose(t, still));
  if (!still) requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
overlay.start();

document.getElementById('toggle-arrows').addEventListener('change', (e) => overlay.setShowArrows(e.target.checked));
document.getElementById('toggle-deviation').addEventListener('change', (e) => overlay.setColorByDeviation(e.target.checked));

window.PhotonicOverlayDemo = {
  overlay,
  video,
  setStillPose() { overlay.setPose(basePose(0, true)); },
  basePose: () => basePose(0, true),
  targetPose: () => targetPose(0, true)
};
