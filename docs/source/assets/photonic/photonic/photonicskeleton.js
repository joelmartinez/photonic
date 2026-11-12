/**
 * PhotonicSkeleton - A pose skeleton inside a 3D scene (PhotonicScene or any
 * THREE scene/group). Seen bones are translucent outlined cylinders and seen
 * joints are glowing spheres, the same look as PhotonicOverlay. A bone that
 * touches a joint the pose did not measure is drawn as a dashed line instead
 * of a cylinder (F3), and that joint is a hollow wireframe sphere, so
 * not-measured reads as not-measured from any camera angle.
 */

import * as THREE from 'three';
import { POSE_CONNECTIONS, COCO17_JOINT_NAMES } from './photonicoverlay.js';

export const DEFAULT_SKELETON_STYLE = {
  boneColor: 0x38bdf8,
  boneOpacity: 0.45,
  boneRadius: 0.016,
  outlineColor: 0x7dd3fc,
  outlineOpacity: 0.3,
  outlineScale: 1.45,
  jointColor: 0x22d3ee,
  jointRadius: 0.03,
  glowColor: 0x22d3ee,
  glowOpacity: 0.32,
  glowScale: 2.1,
  confidenceThreshold: 0.5,
  notSeenBoneColor: 0xa0aab4,
  notSeenBoneOpacity: 0.9,
  notSeenDashSize: 0.05,
  notSeenGapSize: 0.035,
  hollowJointColor: 0xa0aab4,
  hollowJointOpacity: 0.8,
  hollowJointScale: 1.05,
  showHollowJoints: true,
  showNotSeenBones: true
};

function readJoint(raw, index, jointNames) {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    return { x: raw[0] ?? 0, y: raw[1] ?? 0, z: raw[2] ?? 0, confidence: raw[3] };
  }
  const p = raw.position || raw.point || raw;
  let confidence = raw.confidence ?? raw.score ?? raw.visibility ?? raw.v;
  if (confidence == null && (raw.seen === false || raw.visible === false)) confidence = 0;
  if (confidence == null && (raw.seen === true || raw.visible === true)) confidence = 1;
  return {
    name: raw.name || (index != null ? (jointNames[index] || COCO17_JOINT_NAMES[index]) : undefined),
    x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0,
    confidence
  };
}

// Normalize a 3D pose (world units, passed through unchanged) into a Map of name -> joint record.
export function normalizeSkeletonPose(pose, jointNames = COCO17_JOINT_NAMES) {
  const out = new Map();
  if (!pose) return out;
  if (pose instanceof Map) {
    for (const [key, raw] of pose) {
      const p = readJoint(raw, null, jointNames);
      if (p) out.set(p.name || key, { name: p.name || key, x: p.x, y: p.y, z: p.z, confidence: p.confidence });
    }
    return out;
  }
  const source = pose.joints || pose.keypoints || pose;
  const add = (raw, index, keyName) => {
    const p = readJoint(raw, index, jointNames);
    if (!p) return;
    const name = p.name || keyName || (index != null ? jointNames[index] : undefined);
    if (!name) return;
    out.set(name, { name, x: p.x, y: p.y, z: p.z ?? 0, confidence: p.confidence });
  };
  if (Array.isArray(source)) source.forEach((raw, i) => add(raw, i));
  else if (typeof source === 'object') Object.entries(source).forEach(([key, raw]) => add(raw, null, key));
  return out;
}

const UP = new THREE.Vector3(0, 1, 0);

export class PhotonicSkeleton {
  constructor(parent, options = {}) {
    const host = parent?.scene && typeof parent.scene.add === 'function' ? parent.scene
      : parent && typeof parent.add === 'function' ? parent : null;
    if (!host) throw new Error('PhotonicSkeleton: a PhotonicScene, THREE scene, or THREE group is required');
    this.style = { ...DEFAULT_SKELETON_STYLE, ...(options.style || {}) };
    this.connections = options.connections || POSE_CONNECTIONS;
    this.jointNames = options.jointNames || COCO17_JOINT_NAMES;
    this._showHollowJoints = options.showHollowJoints ?? this.style.showHollowJoints;
    this._showNotSeenBones = options.showNotSeenBones ?? this.style.showNotSeenBones;
    this.group = new THREE.Group();
    this.group.userData.kind = 'skeleton';
    host.add(this.group);
    this._joints = new Map();
    this._bones = new Map();
    this._pose = new Map();
    this._sphereGeo = new THREE.SphereGeometry(1, 24, 16);
    this._hollowGeo = new THREE.SphereGeometry(1, 16, 10);
    this._cylGeo = new THREE.CylinderGeometry(1, 1, 1, 16, 1);
  }

  setStyle(partial = {}) { this.style = { ...this.style, ...partial }; this._applyPose(); return this; }
  getStyle() { return { ...this.style }; }
  setShowHollowJoints(show) { this._showHollowJoints = !!show; this._applyPose(); return this; }
  setShowNotSeenBones(show) { this._showNotSeenBones = !!show; this._applyPose(); return this; }

  setPose(pose, options = {}) {
    if (options.showHollowJoints !== undefined) this._showHollowJoints = !!options.showHollowJoints;
    if (options.showNotSeenBones !== undefined) this._showNotSeenBones = !!options.showNotSeenBones;
    this._pose = normalizeSkeletonPose(pose, this.jointNames);
    this._applyPose();
    return this;
  }

  clear() { this._pose = new Map(); this._applyPose(); return this; }

  _jointRecord(name) {
    let rec = this._joints.get(name);
    if (rec) return rec;
    const s = this.style;
    const core = new THREE.Mesh(this._sphereGeo, new THREE.MeshBasicMaterial({ color: s.jointColor }));
    const glow = new THREE.Mesh(this._sphereGeo, new THREE.MeshBasicMaterial({ color: s.glowColor, transparent: true, opacity: s.glowOpacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    const hollow = new THREE.Mesh(this._hollowGeo, new THREE.MeshBasicMaterial({ color: s.hollowJointColor, wireframe: true, transparent: true, opacity: s.hollowJointOpacity }));
    const g = new THREE.Group();
    g.add(glow); g.add(hollow); g.add(core);
    g.userData.kind = 'joint'; g.userData.jointName = name;
    this.group.add(g);
    rec = { name, group: g, core, glow, hollow, world: new THREE.Vector3(), visible: false, present: false, hollowShown: false };
    this._joints.set(name, rec);
    return rec;
  }

  _boneRecord(a, b) {
    const key = a + '|' + b;
    let rec = this._bones.get(key);
    if (rec) return rec;
    const s = this.style;
    const fill = new THREE.Mesh(this._cylGeo, new THREE.MeshBasicMaterial({ color: s.boneColor, transparent: true, opacity: s.boneOpacity, depthWrite: false }));
    const shell = new THREE.Mesh(this._cylGeo, new THREE.MeshBasicMaterial({ color: s.outlineColor, transparent: true, opacity: s.outlineOpacity, side: THREE.BackSide, depthWrite: false }));
    const g = new THREE.Group();
    g.add(shell); g.add(fill);
    g.userData.kind = 'bone'; g.userData.connection = key;
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({ color: s.notSeenBoneColor, transparent: true, opacity: s.notSeenBoneOpacity, dashSize: s.notSeenDashSize, gapSize: s.notSeenGapSize }));
    line.frustumCulled = false;
    line.visible = false;
    line.userData.kind = 'not-seen-bone'; line.userData.connection = key;
    this.group.add(g);
    this.group.add(line);
    rec = { key, group: g, fill, shell, line, state: null };
    this._bones.set(key, rec);
    return rec;
  }

  _applyPose() {
    const s = this.style;
    const seen = new Set();
    for (const [name, j] of this._pose) {
      seen.add(name);
      const rec = this._jointRecord(name);
      rec.world.set(j.x, j.y, j.z || 0);
      rec.visible = j.confidence == null || j.confidence >= s.confidenceThreshold;
      rec.present = true;
      rec.hollowShown = !rec.visible && this._showHollowJoints;
      rec.group.visible = rec.visible || rec.hollowShown;
      rec.core.visible = rec.visible;
      rec.glow.visible = rec.visible;
      rec.hollow.visible = rec.hollowShown;
      rec.group.position.copy(rec.world);
      rec.core.scale.setScalar(s.jointRadius);
      rec.glow.scale.setScalar(s.jointRadius * s.glowScale);
      rec.glow.material.color.setHex(s.glowColor);
      rec.glow.material.opacity = s.glowOpacity;
      rec.core.material.color.setHex(s.jointColor);
      rec.hollow.scale.setScalar(s.jointRadius * s.hollowJointScale);
      rec.hollow.material.color.setHex(s.hollowJointColor);
      rec.hollow.material.opacity = s.hollowJointOpacity;
    }
    for (const [name, rec] of this._joints) {
      if (!seen.has(name)) { rec.visible = false; rec.present = false; rec.hollowShown = false; rec.group.visible = false; }
    }
    for (const [a, b] of this.connections) {
      const ra = this._joints.get(a); const rb = this._joints.get(b);
      const rec = this._boneRecord(a, b);
      const bothPresent = !!ra?.present && !!rb?.present;
      const bothSeen = !!ra?.visible && !!rb?.visible;
      if (bothSeen) {
        rec.state = 'seen';
        rec.group.visible = true;
        rec.line.visible = false;
        const dir = new THREE.Vector3().subVectors(rb.world, ra.world);
        const len = dir.length();
        const center = ra.world.clone().add(rb.world).multiplyScalar(0.5);
        const quat = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
        for (const [mesh, r] of [[rec.fill, s.boneRadius], [rec.shell, s.boneRadius * s.outlineScale]]) {
          mesh.position.copy(center); mesh.quaternion.copy(quat); mesh.scale.set(r, len, r); mesh.visible = len >= 1e-7;
        }
        rec.fill.material.color.setHex(s.boneColor);
        rec.fill.material.opacity = s.boneOpacity;
        rec.shell.material.color.setHex(s.outlineColor);
        rec.shell.material.opacity = s.outlineOpacity;
      } else if (bothPresent && this._showNotSeenBones) {
        // F3: a bone touching an unmeasured joint is a dashed line, never a faint cylinder that could pass for measured.
        rec.state = 'dashed';
        rec.group.visible = false;
        rec.line.visible = true;
        rec.line.geometry.setFromPoints([ra.world, rb.world]);
        rec.line.computeLineDistances();
        rec.line.material.color.setHex(s.notSeenBoneColor);
        rec.line.material.opacity = s.notSeenBoneOpacity;
        rec.line.material.dashSize = s.notSeenDashSize;
        rec.line.material.gapSize = s.notSeenGapSize;
      } else {
        rec.state = null;
        rec.group.visible = false;
        rec.line.visible = false;
      }
    }
  }

  getJointState(name) {
    const rec = this._joints.get(name);
    if (!rec || !rec.present) return null;
    return rec.visible ? 'seen' : 'hollow';
  }

  getBoneState(a, b) {
    const rec = this._bones.get(a + '|' + b) || this._bones.get(b + '|' + a);
    return rec ? rec.state : null;
  }

  getCounts() {
    let joints = 0; let hollowJoints = 0; let bones = 0; let dashedBones = 0;
    for (const r of this._joints.values()) {
      if (r.visible) joints += 1;
      if (r.hollowShown && r.group.visible) hollowJoints += 1;
    }
    for (const r of this._bones.values()) {
      if (r.state === 'seen' && r.group.visible) bones += 1;
      if (r.state === 'dashed' && r.line.visible) dashedBones += 1;
    }
    return { joints, hollowJoints, bones, dashedBones };
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.group.traverse((o) => {
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      if (o.geometry && o.geometry !== this._sphereGeo && o.geometry !== this._hollowGeo && o.geometry !== this._cylGeo) o.geometry.dispose();
    });
    this._sphereGeo.dispose();
    this._hollowGeo.dispose();
    this._cylGeo.dispose();
    this._joints.clear();
    this._bones.clear();
  }
}

export function createSkeleton(parent, options = {}) {
  return new PhotonicSkeleton(parent, options);
}
