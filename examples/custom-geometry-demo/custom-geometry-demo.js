/**
 * Custom geometry demo for addGeometry / addMesh (roadmap F10) and baked
 * occlusion over external geometry (roadmap F11).
 *
 * The part is built the way JSCAD data arrives in HootCAD: a soup of convex
 * polygons with a flat colour per part. The demo fan-triangulates the soup
 * the way HootCAD's own converter does, hands the resulting positions,
 * normals, and per-vertex colours to scene.addGeometry, and also adopts a
 * caller-built THREE.Group through scene.addMesh. The bake checkbox runs
 * scene.bakeAmbientOcclusion over everything, engine-made and external alike.
 */

import { PhotonicScene } from '@codecube/photonic';
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

// A convex polygon whose winding is fixed so its normal points along wantDir.
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

// A cup: outer wall, top annulus, inner wall, and an inner floor — a counterbore bored into a boss, with no boolean step.
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

// The part, as named polygon groups with one flat colour each, in JSCAD units read as metres on the stage.
function buildPartSoup() {
  const groups = [
    { name: 'plate', color: [0.62, 0.66, 0.70], polys: boxPolys(0, 0.12, 0, 2.4, 0.24, 1.6) },
    { name: 'boss', color: [0.85, 0.64, 0.34], polys: cupPolys(-0.55, 0, 0.24, 0.54, 0.38, 0.34, 0.21, 28) },
    { name: 'pad', color: [0.36, 0.42, 0.50], polys: boxPolys(0.72, 0.30, 0.28, 0.72, 0.12, 0.72) }
  ];
  return groups;
}

// Fan-triangulate the soup the way HootCAD's webview converter does: flat per-face normals, non-indexed positions, per-vertex colours carried from the part colour.
function soupToArrays(groups) {
  const positions = [];
  const normals = [];
  const colors = [];
  const ranges = {};
  for (const group of groups) {
    const startVertex = positions.length / 3;
    for (const polygon of group.polys) {
      if (polygon.length < 3) continue;
      const normal = faceNormal(polygon);
      for (let i = 1; i < polygon.length - 1; i++) {
        for (const vertexIndex of [0, i, i + 1]) {
          const v = polygon[vertexIndex];
          positions.push(v[0], v[1], v[2]);
          normals.push(normal[0], normal[1], normal[2]);
          colors.push(group.color[0], group.color[1], group.color[2]);
        }
      }
    }
    ranges[group.name] = { startVertex, endVertex: positions.length / 3 };
  }
  return { positions, normals, colors, ranges };
}

// ---------- The scene ----------

const params = new URLSearchParams(window.location.search);
const still = params.get('still') === '1';

const scene = new PhotonicScene(document.getElementById('app'));
scene.setBackgroundColor(0x14120f);
scene.setAmbientLight({ intensity: 0.3, color: 0xffe8c8 });
scene.setExposure(0.95);
scene.camera.camera.fov = 42;
scene.camera.camera.updateProjectionMatrix();
scene.setCameraPosition(2.15, 1.55, 2.45);
scene.setCameraTarget(0, 0.25, 0);

// An engine-made plinth and an engine-made neighbour box: the external part must shade and be shaded alongside them.
const plinth = scene.createCylinder({ radiusTop: 1.9, radiusBottom: 2.0, height: 0.08, color: 0x4a4238, position: { x: 0, y: 0.04, z: 0 } });
const neighbour = scene.createBox({ width: 0.5, height: 0.5, depth: 0.5, color: 0x7a8ba0, position: { x: 1.55, y: 0.33, z: -0.55 } });

// F10, route one: raw arrays in JSCAD shape.
const soup = soupToArrays(buildPartSoup());
const partBaseColors = Float32Array.from(soup.colors);
const part = scene.addGeometry({
  positions: soup.positions,
  normals: soup.normals,
  colors: soup.colors,
  name: 'machined-part',
  position: { x: 0, y: 0.08, z: 0 }
});

// F10, route two: a caller-built group, JSCAD-style — a Z-up knob in a group turned -90 degrees about X, adopted whole.
const knobGroup = new THREE.Group();
knobGroup.rotation.x = -Math.PI / 2;
const knobGeometry = new THREE.CylinderGeometry(0.16, 0.19, 0.3, 24);
knobGeometry.rotateX(Math.PI / 2); // cylinder axis onto the group's local Z, so the group turn stands it upright in the scene
const knob = new THREE.Mesh(knobGeometry, new THREE.MeshStandardMaterial({ color: 0xb0563a, roughness: 0.55, metalness: 0.2 }));
knob.position.set(-1.45, -0.55, 0.15); // JSCAD frame inside the group: x across, y back (world +z after the turn), z up from the stage
knobGroup.add(knob);
knobGroup.position.set(0, 0.08, 0);
const knobHandle = scene.addMesh(knobGroup, { name: 'knob-group' });

// F10, route three: an indexed BufferGeometry with no normals supplied (the scene computes them), adopted as a mesh.
const indexedGeometry = new THREE.BoxGeometry(0.34, 0.34, 0.34);
indexedGeometry.deleteAttribute('normal');
indexedGeometry.deleteAttribute('uv');
const indexedMesh = new THREE.Mesh(indexedGeometry, new THREE.MeshStandardMaterial({ color: 0x5f9e7a, roughness: 0.6, metalness: 0.1 }));
const indexed = scene.addMesh(indexedMesh, { position: { x: -1.5, y: 0.25, z: -0.6 }, name: 'indexed-box' });

if (!still) {
  let angle = 0;
  scene.setFrameCallback((delta) => {
    angle += delta * 0.15;
    part.setRotation(0, Math.sin(angle) * 0.12, 0);
  });
}

const bakeCheckbox = document.getElementById('toggle-bake');
function syncBake() {
  if (bakeCheckbox.checked) {
    scene.bakeAmbientOcclusion();
  } else {
    scene.clearBakedAmbientOcclusion();
  }
  const info = scene.getBakedAOInfo();
  document.getElementById('bake-status').textContent = info.baked
    ? `Baked: ${info.vertices} vertices, ${info.triangles} triangles, ${info.durationMs} ms, mean visibility ${info.meanVisibility}.`
    : 'Not baked.';
}
bakeCheckbox.addEventListener('change', syncBake);
if (params.get('baked') === '1') {
  bakeCheckbox.checked = true;
  syncBake();
}

window.PhotonicCustomGeometryDemo = {
  scene,
  part,
  knobHandle,
  knobGroup,
  knob,
  indexed,
  plinth,
  neighbour,
  soupRanges: soup.ranges,
  partBaseColors,
  partVertexCount: soup.positions.length / 3
};
