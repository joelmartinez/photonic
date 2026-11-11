/**
 * Virtual camera demo for PhotonicVirtualCamera (roadmap F2).
 * Source is a synthetic video feed plus the F1 pose overlay. The composite
 * is emitted as a MediaStream, shown in a second video element, and can be
 * recorded with MediaRecorder. No real camera is used.
 */

import { PhotonicOverlay } from '../../src/PhotonicOverlay.js';
import { PhotonicScene } from '../../src/PhotonicScene.js';
import { PhotonicVirtualCamera } from '../../src/PhotonicVirtualCamera.js';

const video = document.getElementById('stage-video');
const stage = document.getElementById('stage');
const outputVideo = document.getElementById('output-video');
const recordedVideo = document.getElementById('recorded-video');
const statusEl = document.getElementById('status');

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

function basePose(t) {
  const sway = Math.sin(t / 700) * 0.008;
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

const overlay = new PhotonicOverlay(stage, { video });
function frame(t) {
  drawSource(t);
  overlay.setPose(basePose(t));
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
overlay.start();

// The F2 step: emit the video-plus-overlay composite as a stream.
const virtualCamera = PhotonicVirtualCamera.fromOverlay(overlay, { video, frameRate: 30 });
const stream = virtualCamera.getStream();
outputVideo.srcObject = stream;
outputVideo.play().catch(() => {});

function refreshStatus(extra = '') {
  const track = stream.getVideoTracks()[0];
  const info = virtualCamera.getInfo();
  statusEl.textContent = [
    `Stream: ${stream.active ? 'active' : 'inactive'} · track: ${track?.readyState || 'none'} · ${info.width}x${info.height} at ${info.frameRate} fps`,
    `Kind: ${info.kind} · OS camera device: ${info.isOSVirtualCameraDevice ? 'yes' : 'no'}`,
    info.limits,
    extra
  ].filter(Boolean).join('\n');
}
refreshStatus();
video.addEventListener('loadedmetadata', () => refreshStatus());
setInterval(() => { if (!virtualCamera.isRecording()) refreshStatus(); }, 1000);

let lastBlob = null;
document.getElementById('record-btn').addEventListener('click', async () => {
  virtualCamera.startRecording();
  refreshStatus('Recording…');
  await new Promise((r) => setTimeout(r, 2000));
  lastBlob = await virtualCamera.stopRecording();
  const url = URL.createObjectURL(lastBlob);
  recordedVideo.src = url;
  const link = document.getElementById('download-link');
  link.href = url; link.download = 'photonic-virtual-camera.webm'; link.hidden = false;
  refreshStatus(`Recorded: ${lastBlob.type || 'video/webm'}, ${lastBlob.size} bytes`);
});

// A plain 3D scene can be emitted the same way. Built lazily so the test can
// prove the scene path without paying for a second WebGL context up front.
let sceneCamera = null;
function makeSceneCamera() {
  if (sceneCamera) return sceneCamera;
  const holder = document.createElement('div');
  holder.style.cssText = 'position:absolute;width:320px;height:180px;left:-9999px;top:0';
  document.body.appendChild(holder);
  const scene = new PhotonicScene(holder);
  scene.createBox({});
  sceneCamera = PhotonicVirtualCamera.fromScene(scene, { frameRate: 30 });
  sceneCamera._scene = scene;
  return sceneCamera;
}

window.PhotonicVirtualCameraDemo = {
  overlay, video, outputVideo, recordedVideo, virtualCamera, stream,
  getLastBlob: () => lastBlob,
  recordFor: async (ms) => {
    virtualCamera.startRecording();
    await new Promise((r) => setTimeout(r, ms));
    lastBlob = await virtualCamera.stopRecording();
    return lastBlob;
  },
  makeSceneCamera
};
