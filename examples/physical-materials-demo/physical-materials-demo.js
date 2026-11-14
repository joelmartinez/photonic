/**
 * Physical materials and studio environment demo (roadmap F12).
 *
 * The machined part is built the way JSCAD data arrives in HootCAD — a soup
 * of convex polygons with flat normals — and adopted through
 * scene.addGeometry. The red knob is a caller-built THREE mesh adopted
 * through scene.addMesh. The toggles switch the adopted objects between a
 * plain standard material lit only by the direct lights, and a physical
 * material with clearcoat under the studio environment
 * (scene.setStudioEnvironment), which is the F-2 case from the HootCAD test
 * space: metalness, roughness, and clearcoat reading correctly under an
 * environment, proven on F10-adopted meshes.
 */

import { PhotonicScene, createStudioEnvironment } from '@codecube/photonic';
import * as THREE from 'three';

// ---------- JSCAD-shaped polygon soup: a machined plate with a boss, a counterbore, and a step pad ----------

function faceNormal(points) {
  const [a, b, c] = points;
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const length = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / length, n[1] / length, n[2] / length];
}

function poly(points, wantDir) {
  const n = faceNormal(points);
  const dot = n[0] * wantDir[0] + n[1] * wantDir[1] + n[2] * wantDir[2];
  return dot < 0 ? [...points].reverse() : points;
}

function boxPolys(cx, cy, cz, sx, sy, sz) {
  const x0 = cx - sx / 2;
  const x1 = cx + sx / 2;
  const y0 = cy - sy / 2;
  const y1 = cy + sy / 2;
  const z0 = cz - sz / 2;
  const z1 = cz + sz / 2;
  return [
    poly([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0]),
    poly([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]),
    poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]),
    poly([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]),
    poly([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0]),
    poly([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0])
  ];
}

function ringPoint(cx, cz, r, angle, y) {
  return [cx + r * Math.cos(angle), y, cz + r * Math.sin(angle)];
}

function cupPolys(cx, cz, yBase, yTop, yBoreFloor, rOuter, rInner, segments) {
  const polys = [];
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const mid = (a0 + a1) / 2;
    const radial = [Math.cos(mid), 0, Math.sin(mid)];
    polys.push(poly([
      ringPoint(cx, cz, rOuter, a0, yBase), ringPoint(cx, cz, rOuter, a1, yBase),
      ringPoint(cx, cz, rOuter, a1, yTop), ringPoint(cx, cz, rOuter, a0, yTop)
    ], radial));
    polys.push(poly([
      ringPoint(cx, cz, rOuter, a0, yTop), ringPoint(cx, cz, rOuter, a1, yTop),
      ringPoint(cx, cz, rInner, a1, yTop), ringPoint(cx, cz, rInner, a0, yTop)
    ], [0, 1, 0]));
    polys.push(poly([
      ringPoint(cx, cz, rInner, a0, yTop), ringPoint(cx, cz, rInner, a1, yTop),
      ringPoint(cx, cz, rInner, a1, yBoreFloor), ringPoint(cx, cz, rInner, a0, yBoreFloor)
    ], [-radial[0], 0, -radial[2]]));
  }
  const floor = [];
  for (let i = 0; i < segments; i++) floor.push(ringPoint(cx, cz, rInner, (i / segments) * Math.PI * 2, yBoreFloor));
  polys.push(poly(floor, [0, 1, 0]));
  return polys;
}

function buildPartSoup() {
  return [
    ...boxPolys(0, 0.12, 0, 2.4, 0.24, 1.6),
    ...cupPolys(-0.55, 0, 0.24, 0.54, 0.38, 0.34, 0.21, 28),
    ...boxPolys(0.72, 0.30, 0.28, 0.72, 0.12, 0.72)
  ];
}

function soupToArrays(polys) {
  const positions = [];
  const normals = [];
  for (const polygon of polys) {
    if (polygon.length < 3) continue;
    const normal = faceNormal(polygon);
    for (let i = 1; i < polygon.length - 1; i++) {
      for (const vertexIndex of [0, i, i + 1]) {
        const v = polygon[vertexIndex];
        positions.push(v[0], v[1], v[2]);
        normals.push(normal[0], normal[1], normal[2]);
      }
    }
  }
  return { positions, normals };
}

// ---------- The scene ----------

const params = new URLSearchParams(window.location.search);
const mode = params.get('mode'); // 'before' | 'after' | null (interactive)

const scene = new PhotonicScene(document.getElementById('app'));
scene.setBackgroundColor(0x14120f);
scene.setExposure(1.0);
scene.camera.camera.fov = 42;
scene.camera.camera.updateProjectionMatrix();
scene.setCameraPosition(2.15, 1.55, 2.45);
scene.setCameraTarget(0, 0.25, 0);

const plinth = scene.createCylinder({ radiusTop: 1.9, radiusBottom: 2.0, height: 0.08, color: 0x4a4238, position: { x: 0, y: 0.04, z: 0 } });

const soup = soupToArrays(buildPartSoup());

let part = null;
let knobHandle = null;
let knobMesh = null;

function buildPart(physical) {
  if (part) part.remove();
  part = scene.addGeometry({
    positions: soup.positions,
    normals: soup.normals,
    name: 'machined-part',
    position: { x: 0, y: 0.08, z: 0 },
    color: 0xb9c0c9,
    metalness: 0.9,
    roughness: 0.32,
    ...(physical ? { physical: true, clearcoat: 1, clearcoatRoughness: 0.08 } : {})
  });
  return part;
}

function buildKnob(physical) {
  if (knobHandle) knobHandle.remove();
  knobMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 40, 28),
    new THREE.MeshStandardMaterial({ color: 0x9e1b1b, roughness: 0.35, metalness: 0.1 })
  );
  knobHandle = scene.addMesh(knobMesh, {
    name: 'painted-knob',
    position: { x: 1.35, y: 0.38, z: 0.55 },
    ...(physical ? { physical: true, clearcoat: 1, clearcoatRoughness: 0.06 } : {})
  });
  return knobHandle;
}

const physicalCheckbox = document.getElementById('toggle-physical');
const envCheckbox = document.getElementById('toggle-env');
const intensitySlider = document.getElementById('env-intensity');
const statusEl = document.getElementById('status');

function syncStatus() {
  const info = scene.getEnvironmentInfo();
  const mat = part.getMesh().material;
  statusEl.textContent = `Material: ${mat.isMeshPhysicalMaterial ? `physical, clearcoat ${mat.clearcoat} / roughness ${mat.clearcoatRoughness}` : 'standard'} · Environment: ${info.enabled ? `${info.source} at intensity ${info.intensity}` : 'off'}`;
}

function applyState() {
  buildPart(physicalCheckbox.checked);
  buildKnob(physicalCheckbox.checked);
  if (envCheckbox.checked) {
    scene.setStudioEnvironment({ intensity: Number(intensitySlider.value) });
  } else {
    scene.clearEnvironment();
  }
  syncStatus();
}

physicalCheckbox.addEventListener('change', applyState);
envCheckbox.addEventListener('change', applyState);
intensitySlider.addEventListener('input', () => {
  if (envCheckbox.checked) scene.setEnvironmentIntensity(Number(intensitySlider.value));
  syncStatus();
});

if (mode === 'before') {
  physicalCheckbox.checked = false;
  envCheckbox.checked = false;
} else {
  physicalCheckbox.checked = true;
  envCheckbox.checked = true;
}
applyState();

window.PhotonicPhysicalDemo = {
  scene,
  THREE,
  PhotonicScene,
  createStudioEnvironment,
  plinth,
  get part() { return part; },
  get knobHandle() { return knobHandle; },
  get knobMesh() { return knobMesh; },
  applyState
};
