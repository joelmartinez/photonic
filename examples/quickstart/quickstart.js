/**
 * Photonic quickstart: the smallest useful scene.
 * This is the README quickstart code. It imports the package by name;
 * the page's import map resolves that name (in this repo, to src/index.js;
 * in a consumer install, to node_modules/@codecube/photonic).
 */

import { PhotonicScene } from '@codecube/photonic';

const container = document.getElementById('app');
const scene = new PhotonicScene(container);

const box = scene.createBox({ width: 1, height: 1, depth: 1, color: 0x38bdf8, position: { x: 0, y: 0.5, z: 0 } });
scene.createSphere({ radius: 0.4, color: 0xfacc15, position: { x: 1.4, y: 0.4, z: 0 } });
scene.setCameraPosition(3, 2, 4);
scene.setCameraTarget(0, 0.5, 0);

let frames = 0;
scene.setFrameCallback(() => { frames += 1; });

// Exposed so tests (and curious readers in the console) can verify the scene is live.
window.__photonicQuickstart = { scene, box, get frames() { return frames; } };
