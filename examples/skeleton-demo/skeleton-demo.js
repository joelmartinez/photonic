/**
 * 3D skeleton demo for PhotonicSkeleton (roadmap F3).
 * A standing figure in world units inside a PhotonicScene. The right knee
 * and right ankle carry low confidence, so they show as hollow joints and
 * their bones show as dashed lines instead of solid cylinders.
 */

import { PhotonicScene, PhotonicSkeleton } from '@codecube/photonic';

const params = new URLSearchParams(window.location.search);
const still = params.get('still') === '1';

const scene = new PhotonicScene(document.getElementById('app'));
scene.setBackgroundColor(0x10151a);
scene.grid.setColor(0x33505c);
scene.grid.setOpacity(0.45);
// Narrow the default field of view so the standing figure fills the stage.
scene.camera.camera.fov = 50;
scene.camera.camera.updateProjectionMatrix();
scene.setCameraPosition(0.95, 1.25, 2.05);
scene.setCameraTarget(0, 0.85, 0);

function basePose(t) {
  const sway = still ? 0 : Math.sin(t / 700) * 0.02;
  const j = (x, y, z = 0, confidence = 0.95) => ({ x: x + sway, y, z, confidence });
  return {
    nose: j(0, 1.62), left_eye: j(-0.04, 1.65), right_eye: j(0.04, 1.65),
    left_ear: j(-0.09, 1.63), right_ear: j(0.09, 1.63),
    left_shoulder: j(-0.22, 1.45), right_shoulder: j(0.22, 1.45),
    left_elbow: j(-0.33, 1.16), right_elbow: j(0.33, 1.16),
    left_wrist: j(-0.37, 0.9), right_wrist: j(0.37, 0.9),
    left_hip: j(-0.1, 1.0), right_hip: j(0.1, 1.0),
    left_knee: j(-0.12, 0.55), right_knee: j(0.12, 0.55, 0, 0.1),
    left_ankle: j(-0.13, 0.08), right_ankle: j(0.13, 0.08, 0, 0.1)
  };
}

const skeleton = new PhotonicSkeleton(scene);
skeleton.setPose(basePose(0));

if (!still) {
  scene.setFrameCallback((delta, frameState) => {
    skeleton.setPose(basePose(frameState.elapsedTime * 1000));
  });
}

document.getElementById('toggle-dashed').addEventListener('change', (e) => skeleton.setShowNotSeenBones(e.target.checked));
document.getElementById('toggle-hollow').addEventListener('change', (e) => skeleton.setShowHollowJoints(e.target.checked));

window.PhotonicSkeletonDemo = {
  scene,
  skeleton,
  setStillPose() { skeleton.setPose(basePose(0)); },
  basePose: () => basePose(0)
};
