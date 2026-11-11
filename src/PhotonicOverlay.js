/**
 * PhotonicOverlay - Clean pose/annotation graphics composited over a video element.
 * A separate transparent renderer stacked over the video: no scene background,
 * no grid, no debug helpers. Pose positions are exact functions of the input
 * data, so the overlay adds no jitter or flicker of its own.
 */

import * as THREE from 'three';

export const COCO17_JOINT_NAMES = [
  'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
  'left_knee', 'right_knee', 'left_ankle', 'right_ankle'
];

export const POSE_CONNECTIONS = [
  ['nose', 'left_eye'], ['nose', 'right_eye'], ['left_eye', 'left_ear'], ['right_eye', 'right_ear'],
  ['left_shoulder', 'right_shoulder'], ['left_shoulder', 'left_hip'], ['right_shoulder', 'right_hip'], ['left_hip', 'right_hip'],
  ['left_shoulder', 'left_elbow'], ['left_elbow', 'left_wrist'], ['right_shoulder', 'right_elbow'], ['right_elbow', 'right_wrist'],
  ['left_hip', 'left_knee'], ['left_knee', 'left_ankle'], ['right_hip', 'right_knee'], ['right_knee', 'right_ankle']
];

export const DEFAULT_OVERLAY_STYLE = {
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
  confidenceThreshold: 0.2,
  deviationWarnAt: 0.05,
  deviationAlertAt: 0.12,
  deviationWarnColor: 0xfacc15,
  deviationAlertColor: 0xef4444,
  arrowColor: 0xfacc15,
  showArrows: true,
  minArrowLength: 0.01
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function deviationColorHex(magnitude, style = {}) {
  const s = { ...DEFAULT_OVERLAY_STYLE, ...style };
  if (magnitude == null || !Number.isFinite(magnitude)) return s.jointColor;
  const ok = new THREE.Color(s.jointColor);
  if (magnitude <= s.deviationWarnAt) return ok.getHex();
  const warn = new THREE.Color(s.deviationWarnColor);
  if (magnitude <= s.deviationAlertAt) {
    const t = (magnitude - s.deviationWarnAt) / Math.max(1e-9, s.deviationAlertAt - s.deviationWarnAt);
    return ok.lerp(warn, t).getHex();
  }
  const alert = new THREE.Color(s.deviationAlertColor);
  const t = clamp01((magnitude - s.deviationAlertAt) / Math.max(1e-9, s.deviationAlertAt));
  return warn.lerp(alert, Math.min(1, 0.35 + t)).getHex();
}

function readPoint(raw, index) {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    return { x: raw[0] ?? 0, y: raw[1] ?? 0, z: raw[2] ?? 0, confidence: raw[3] };
  }
  const p = raw.position || raw.point || raw;
  const name = raw.name || raw.keypoint || (index != null ? COCO17_JOINT_NAMES[index] : undefined);
  return {
    name,
    x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0,
    confidence: raw.confidence ?? raw.score,
    deviation: raw.deviation,
    offset: raw.offset || raw.offsetVector || null
  };
}

function readOffset(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) return { x: raw[0] ?? 0, y: raw[1] ?? 0, z: raw[2] ?? 0 };
  return { x: raw.x ?? 0, y: raw.y ?? 0, z: raw.z ?? 0 };
}

// Normalize every accepted pose shape into a Map of name -> joint record in normalized video coordinates (x right, y down, both 0..1 in frame; z is a relative depth in the same units).
export function normalizePose(pose) {
  const out = new Map();
  if (!pose) return out;
  const source = pose.joints || pose.keypoints || pose;
  const add = (raw, index, keyName) => {
    const p = readPoint(raw, index);
    if (!p) return;
    const name = p.name || keyName || (index != null ? COCO17_JOINT_NAMES[index] : undefined);
    if (!name) return;
    out.set(name, {
      name,
      x: p.x, y: p.y, z: p.z ?? 0,
      confidence: p.confidence,
      deviation: p.deviation,
      offset: readOffset(p.offset)
    });
  };
  if (Array.isArray(source)) {
    source.forEach((raw, i) => add(raw, i));
  } else if (typeof source === 'object') {
    Object.entries(source).forEach(([key, raw], i) => add(raw, null, key));
  }
  return out;
}

const UP = new THREE.Vector3(0, 1, 0);

export class PhotonicOverlay {
  constructor(container, options = {}) {
    if (!container) throw new Error('PhotonicOverlay: a container element is required');
    this.container = container;
    this.style = { ...DEFAULT_OVERLAY_STYLE, ...(options.style || {}) };
    this.connections = options.connections || POSE_CONNECTIONS;
    this.smoothing = options.smoothing ?? 0;
    this.video = null;
    this._worldHeight = 2;
    this._aspect = options.aspect || 16 / 9;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.camera.position.set(0, 0, 10);
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.domElement.className = 'photonic-overlay-canvas';
    Object.assign(this.renderer.domElement.style, {
      position: 'absolute', pointerEvents: 'none', display: 'block'
    });
    if (getComputedStyle(this.container).position === 'static') {
      this.container.style.position = 'relative';
    }
    this.container.appendChild(this.renderer.domElement);

    this._joints = new Map();
    this._bones = new Map();
    this._arrows = new Map();
    this._pose = new Map();
    this._targetPose = null;
    this._showArrows = options.showArrows ?? this.style.showArrows;
    this._colorByDeviation = options.colorByDeviation ?? true;
    this._raf = 0;
    this._running = false;

    this._resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => this.resize())
      : null;
    this._resizeObserver?.observe(this.container);
    if (options.video) this.attachToVideo(options.video);
    this.resize();
  }

  attachToVideo(video) {
    this.video = video || null;
    if (video) {
      if (video.videoWidth && video.videoHeight) this._aspect = video.videoWidth / video.videoHeight;
      video.addEventListener?.('loadedmetadata', this._onVideoMeta);
      this._resizeObserver?.observe(video);
    }
    this.resize();
    return this;
  }

  _onVideoMeta = () => {
    if (this.video?.videoWidth && this.video?.videoHeight) {
      this._aspect = this.video.videoWidth / this.video.videoHeight;
    }
    this.resize();
  };

  setStyle(partial = {}) {
    this.style = { ...this.style, ...partial };
    this._applyPose();
    this.render();
    return this;
  }

  getStyle() { return { ...this.style }; }
  setShowArrows(show) { this._showArrows = !!show; this._applyPose(); this.render(); return this; }
  setColorByDeviation(on) { this._colorByDeviation = !!on; this._applyPose(); this.render(); return this; }
  setTargetPose(pose) { this._targetPose = pose ? normalizePose(pose) : null; this._applyPose(); this.render(); return this; }

  setPose(pose, options = {}) {
    if (options.targetPose !== undefined) this._targetPose = options.targetPose ? normalizePose(options.targetPose) : null;
    if (options.showArrows !== undefined) this._showArrows = !!options.showArrows;
    if (options.colorByDeviation !== undefined) this._colorByDeviation = !!options.colorByDeviation;
    this._pose = normalizePose(pose);
    this._applyPose();
    this.render();
    return this;
  }

  clear() { this._pose = new Map(); this._applyPose(); this.render(); return this; }

  _worldFromNormalized(j) {
    const w = this._worldHeight * this._aspect;
    return new THREE.Vector3((j.x - 0.5) * w, (0.5 - j.y) * this._worldHeight, (j.z || 0) * this._worldHeight);
  }

  _worldOffset(o) {
    const w = this._worldHeight * this._aspect;
    return new THREE.Vector3(o.x * w, -o.y * this._worldHeight, (o.z || 0) * this._worldHeight);
  }

  _jointRecord(name) {
    let rec = this._joints.get(name);
    if (rec) return rec;
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshBasicMaterial({ color: this.style.jointColor })
    );
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshBasicMaterial({ color: this.style.glowColor, transparent: true, opacity: this.style.glowOpacity, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    const g = new THREE.Group();
    g.add(glow); g.add(core);
    g.userData.kind = 'joint'; g.userData.jointName = name;
    this.group.add(g);
    rec = { name, group: g, core, glow, world: new THREE.Vector3(), deviation: null, offsetWorld: null, visible: false };
    this._joints.set(name, rec);
    return rec;
  }

  _boneRecord(a, b) {
    const key = a + '|' + b;
    let rec = this._bones.get(key);
    if (rec) return rec;
    const geo = new THREE.CylinderGeometry(1, 1, 1, 16, 1);
    const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: this.style.boneColor, transparent: true, opacity: this.style.boneOpacity, depthWrite: false }));
    const shell = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: this.style.outlineColor, transparent: true, opacity: this.style.outlineOpacity, side: THREE.BackSide, depthWrite: false }));
    const g = new THREE.Group();
    g.add(shell); g.add(fill);
    g.userData.kind = 'bone'; g.userData.connection = key;
    this.group.add(g);
    rec = { key, group: g, fill, shell };
    this._bones.set(key, rec);
    return rec;
  }

  _arrowRecord(name) {
    let rec = this._arrows.get(name);
    if (rec) return rec;
    const shaftGeo = new THREE.CylinderGeometry(0.32, 0.32, 1, 10, 1);
    shaftGeo.translate(0, 0.5, 0);
    const shaft = new THREE.Mesh(shaftGeo, new THREE.MeshBasicMaterial({ color: this.style.arrowColor }));
    const headGeo = new THREE.ConeGeometry(1, 1, 14);
    headGeo.translate(0, 0.5, 0);
    const head = new THREE.Mesh(headGeo, new THREE.MeshBasicMaterial({ color: this.style.arrowColor }));
    const g = new THREE.Group();
    g.add(shaft); g.add(head);
    g.userData.kind = 'arrow'; g.userData.jointName = name;
    this.group.add(g);
    rec = { name, group: g, shaft, head, direction: new THREE.Vector3(0, 1, 0), length: 0 };
    this._arrows.set(name, rec);
    return rec;
  }

  _applyPose() {
    const s = this.style;
    const seen = new Set();
    for (const [name, j] of this._pose) {
      seen.add(name);
      const rec = this._jointRecord(name);
      const targetWorld = this._worldFromNormalized(j);
      if (this.smoothing > 0 && rec.visible) {
        rec.world.lerp(targetWorld, 1 - this.smoothing);
      } else {
        rec.world.copy(targetWorld);
      }
      let offset = j.offset;
      if (!offset && this._targetPose?.has(name)) {
        const t = this._targetPose.get(name);
        offset = { x: t.x - j.x, y: t.y - j.y, z: (t.z || 0) - (j.z || 0) };
      }
      rec.offsetWorld = offset ? this._worldOffset(offset) : null;
      rec.deviation = j.deviation != null ? j.deviation
        : offset ? Math.hypot(offset.x, offset.y, offset.z || 0) : null;
      rec.visible = j.confidence == null || j.confidence >= s.confidenceThreshold;
      rec.group.visible = rec.visible;
      rec.group.position.copy(rec.world);
      rec.core.scale.setScalar(s.jointRadius);
      rec.glow.scale.setScalar(s.jointRadius * s.glowScale);
      const color = this._colorByDeviation && rec.deviation != null ? deviationColorHex(rec.deviation, s) : s.jointColor;
      rec.core.material.color.setHex(color);
      rec.glow.material.color.setHex(color);
      rec.glow.material.opacity = s.glowOpacity;
    }
    for (const [name, rec] of this._joints) {
      if (!seen.has(name)) { rec.visible = false; rec.group.visible = false; rec.deviation = null; rec.offsetWorld = null; }
    }
    for (const [a, b] of this.connections) {
      const ra = this._joints.get(a); const rb = this._joints.get(b);
      const rec = this._boneRecord(a, b);
      const ok = ra?.visible && rb?.visible;
      rec.group.visible = !!ok;
      if (ok) {
        const dir = new THREE.Vector3().subVectors(rb.world, ra.world);
        const len = dir.length();
        const center = ra.world.clone().add(rb.world).multiplyScalar(0.5);
        const quat = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
        for (const [mesh, r] of [[rec.fill, s.boneRadius], [rec.shell, s.boneRadius * s.outlineScale]]) {
          mesh.position.copy(center); mesh.quaternion.copy(quat); mesh.scale.set(r, len, r); mesh.visible = len >= 1e-7;
        }
        const maxDev = Math.max(ra.deviation ?? 0, rb.deviation ?? 0);
        const tint = this._colorByDeviation && (ra.deviation != null || rb.deviation != null) ? deviationColorHex(maxDev, s) : s.boneColor;
        rec.fill.material.color.setHex(tint);
        rec.fill.material.opacity = s.boneOpacity;
        rec.shell.material.color.setHex(tint);
        rec.shell.material.opacity = s.outlineOpacity;
      }
    }
    for (const [name, rec] of this._joints) {
      const arrow = this._arrowRecord(name);
      const off = rec.offsetWorld;
      const len = off ? off.length() : 0;
      const show = this._showArrows && rec.visible && off && len >= s.minArrowLength;
      arrow.group.visible = !!show;
      if (show) {
        arrow.length = len;
        arrow.direction.copy(off).normalize();
        arrow.group.position.copy(rec.world);
        arrow.group.quaternion.setFromUnitVectors(UP, arrow.direction);
        const shaftLen = Math.max(0.001, len - Math.min(0.07, len * 0.35));
        arrow.shaft.scale.set(s.jointRadius * 0.45, shaftLen, s.jointRadius * 0.45);
        arrow.head.position.set(0, shaftLen, 0);
        const headLen = len - shaftLen;
        arrow.head.scale.set(s.jointRadius * 1.1, headLen, s.jointRadius * 1.1);
        const c = deviationColorHex(rec.deviation, s) === s.jointColor ? s.arrowColor : deviationColorHex(rec.deviation, s);
        arrow.shaft.material.color.setHex(c);
        arrow.head.material.color.setHex(c);
        arrow.group.userData.direction = { x: arrow.direction.x, y: arrow.direction.y, z: arrow.direction.z };
        arrow.group.userData.length = len;
      } else {
        arrow.length = 0;
      }
    }
  }

  getJointWorldPosition(name) {
    const rec = this._joints.get(name);
    if (!rec || !rec.visible) return null;
    return { x: rec.world.x, y: rec.world.y, z: rec.world.z };
  }

  getDeviation(name) {
    const rec = this._joints.get(name);
    return rec ? rec.deviation : null;
  }

  getArrow(name) {
    const rec = this._arrows.get(name);
    if (!rec || !rec.group.visible) return null;
    return { direction: { x: rec.direction.x, y: rec.direction.y, z: rec.direction.z }, length: rec.length };
  }

  getCounts() {
    let joints = 0; let bones = 0; let arrows = 0;
    for (const r of this._joints.values()) if (r.visible) joints += 1;
    for (const r of this._bones.values()) if (r.group.visible) bones += 1;
    for (const r of this._arrows.values()) if (r.group.visible) arrows += 1;
    return { joints, bones, arrows };
  }

  _videoContentRect() {
    const cw = this.container.clientWidth; const ch = this.container.clientHeight;
    if (!this.video || !this.video.videoWidth) return { left: 0, top: 0, width: cw, height: ch };
    const v = this.video;
    const rect = v.getBoundingClientRect();
    const crect = this.container.getBoundingClientRect();
    const ex = rect.left - crect.left; const ey = rect.top - crect.top;
    const ew = rect.width; const eh = rect.height;
    const fit = getComputedStyle(v).objectFit || 'contain';
    if (fit === 'fill') return { left: ex, top: ey, width: ew, height: eh };
    const scale = fit === 'cover'
      ? Math.max(ew / v.videoWidth, eh / v.videoHeight)
      : Math.min(ew / v.videoWidth, eh / v.videoHeight);
    const w = v.videoWidth * scale; const h = v.videoHeight * scale;
    return { left: ex + (ew - w) / 2, top: ey + (eh - h) / 2, width: w, height: h };
  }

  resize() {
    const rect = this._videoContentRect();
    if (rect.width > 0 && rect.height > 0) {
      this._aspect = rect.width / rect.height;
      const canvas = this.renderer.domElement;
      canvas.style.left = rect.left + 'px';
      canvas.style.top = rect.top + 'px';
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      this.renderer.setPixelRatio(window.devicePixelRatio || 1);
      this.renderer.setSize(rect.width, rect.height, false);
    } else if (this.container.clientWidth > 0) {
      this._aspect = this.container.clientWidth / Math.max(1, this.container.clientHeight);
      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight, false);
      Object.assign(this.renderer.domElement.style, { left: '0px', top: '0px', width: '100%', height: '100%' });
    }
    const w = this._worldHeight * this._aspect;
    this.camera.left = -w / 2; this.camera.right = w / 2;
    this.camera.top = this._worldHeight / 2; this.camera.bottom = -this._worldHeight / 2;
    this.camera.updateProjectionMatrix();
    this._applyPose();
    this.render();
    return this;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    return this;
  }

  start() {
    if (this._running) return this;
    this._running = true;
    const tick = () => {
      if (!this._running) return;
      this.render();
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
    return this;
  }

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    return this;
  }

  dispose() {
    this.stop();
    this._resizeObserver?.disconnect();
    this.video?.removeEventListener?.('loadedmetadata', this._onVideoMeta);
    this.scene.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    this.renderer.dispose();
    this.renderer.domElement.parentNode?.removeChild(this.renderer.domElement);
  }
}

export function createPoseOverlay(container, options = {}) {
  return new PhotonicOverlay(container, options);
}
