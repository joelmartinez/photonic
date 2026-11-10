/**
 * Liminal Spaces Photonics Module
 *
 * An infinite backrooms / liminal-space explorer featuring:
 * - Six room types: office hallway, open-plan office, pool backroom,
 *   stairwell, yellow wallpaper room, empty hotel lobby
 * - Doors that physically swing open as you approach them, revealing
 *   the next room already rendered on the other side
 * - Room memory: the room you just came from stays stable; go deeper
 *   and the older rooms dissolve and regenerate randomly
 * - Dramatic flickering overhead fluorescent lights
 * - Wall collision so you cannot walk through surfaces
 *
 * Controls (Desktop): Click to lock mouse - WASD to move - ESC to pause
 * Controls (Mobile):  Drag to look - Double-tap+hold to walk forward
 */

const Metadata = {
  title: 'Liminal Spaces',
  description: 'Explore endless corridors and abandoned rooms. Desktop and mobile support movement controls, while supported headsets can step into the hallway with room-scale WebXR.'
};

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const ROOM_TYPE = {
  HALLWAY:    'hallway',
  OFFICE:     'office',
  POOL:       'pool',
  STAIRWELL:  'stairwell',
  YELLOW_ROOM:'yellow',
  LOBBY:      'lobby',
  CLOSET:     'closet'
};

const C = {
  WALL_BEIGE:   0xe8e4d9,
  FLOOR_GREY:   0x8b8878,
  CEIL_CREAM:   0xf5f5dc,
  TRIM_DARK:    0x696969,
  FLUOR_WHITE:  0xf0fff0,
  FLUOR_WARM:   0xfffaf0,
  DOOR_WOOD:    0x5a3610,
  DOOR_FRAME:   0xb0a898,
  POOL_TILE:    0x9fd3dc,
  POOL_WALL:    0xaad4dc,
  POOL_FLOOR:   0x4a7a98,
  POOL_WATER:   0x1860a0,
  POOL_GLOW:    0x00b0c8,
  POOL_CEIL:    0xcce4e8,
  YELL_WALL:    0xc0ae30,
  YELL_FLOOR:   0x8b7355,
  YELL_CEIL:    0xd0bc38,
  YELL_TRIM:    0x6b5a38,
  LOBB_FLOOR:   0xc8b898,
  LOBB_WALL:    0xd4c9b8,
  LOBB_CEIL:    0xe0ddd6,
  LOBB_ACCENT:  0x9b8070,
  STAIR_CONC:   0x909090,
  STAIR_METAL:  0x686868
};

const DOOR   = { WIDTH: 0.9, HEIGHT: 2.1, DEPTH: 0.045, FRAME_T: 0.07 };
const PLAYER = { HEIGHT: 1.6, RADIUS: 0.28 };
const ROOM_SEPARATION   = 0.01;
const COLLISION_PUSHBACK = 0.02;
const TRANSITION_MARGIN  = 0.08;
const CLOSET_CHANCE      = 0.08;
const DOOR_ALIGN_ZONE    = 0.42;
const DOOR_ALIGN_CAPTURE = 1.4;
const DOOR_ALIGN_SPEED   = 2.4;
const DOOR_PASS_PADDING  = 0.05;
const DOOR_ALIGN_STICKY_ZONE = 0.58;
const DOOR_ALIGN_STICKY_CAPTURE = 1.6;
const DOOR_CLEARANCE_WIDTH = 2.1;
const DOOR_CLEARANCE_DEPTH = 2.4;
const MIN_SAME_WALL_DOOR_SPACING = 3.8;
const MAX_ACTIONS_PER_FRAME     = 3;
const MAX_GENERATIONS_PER_FRAME = 1;
const MAX_EVICTIONS_PER_FRAME   = 2;

const DOOR_OPEN_START     = 5.0;   // door begins swinging open (metres from player)
const DOOR_FULL_OPEN_DIST = 1.8;   // door reaches 90 degrees
const DOOR_MIN_PASS_ANGLE = 0.48;  // minimum open angle to allow player through
const DOOR_HOLD_OPEN_ZONE = 1.15;
const TITLE_CARD_WIDTH = 2.25;
const TITLE_CARD_HEIGHT = 0.62;
const AUDIO_MIN_DELTA_TIME = 0.0001;
const WALK_SPEED_THRESHOLD = 0.08;
const WALK_SPEED_RANGE = 1.55;
const FOOTSTEP_INTERVAL_SLOW = 0.64;
const FOOTSTEP_INTERVAL_FAST = 0.27;
const FOOTSTEP_VARIANCE_MIN = 0.94;
const FOOTSTEP_VARIANCE_MAX = 1.08;
const FOOTSTEP_PITCH_TRANSITION_THRESHOLD = 0.55;
const DOOR_PROXIMITY_MAX_DISTANCE = 8.5;
const DOOR_PROXIMITY_FALLOFF_RANGE = 7.5;
const HEARTBEAT_BPM_CALM = 70;
const HEARTBEAT_BPM_INTENSE = 104;
const HEARTBEAT_CYCLE_INTERVAL_MIN = 0.42;
const HEARTBEAT_DOUBLE_PULSE_GAP_CALM = 0.18;
const HEARTBEAT_DOUBLE_PULSE_GAP_INTENSE = 0.12;
const HEARTBEAT_CYCLE_JITTER_MAX = 0.025;
const HEARTBEAT_NOTE_PRIMARY = 'A2';
const HEARTBEAT_NOTE_SECONDARY = 'G2';
const AUDIO_START_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'ShiftLeft', 'ShiftRight'
]);

const ROOM_CONFIGS = {
  hallway:   { width: 3,  height: 3,   depth: 30, extraDoors: [0, 0] },
  office:    { width: 10, height: 3,   depth: 13, extraDoors: [1, 3] },
  pool:      { width: 18, height: 4,   depth: 22, extraDoors: [1, 2] },
  stairwell: { width: 4,  height: 4,   depth: 7,  extraDoors: [1, 2] },
  yellow:    { width: 8,  height: 2.7, depth: 11, extraDoors: [2, 4] },
  lobby:     { width: 16, height: 5,   depth: 18, extraDoors: [3, 5] },
  closet:    { width: 2.6, height: 2.5, depth: 3.4, extraDoors: [0, 0] }
};

// Weighted random pool for room type selection (hallway is start-only)
const ROOM_POOL = [
  'office','office','office','office',
  'yellow','yellow','yellow',
  'pool',
  'lobby'
];
const ROOM_TYPE_CANDIDATES = [...new Set(ROOM_POOL)];

// ─────────────────────────────────────────────
// Module state
// ─────────────────────────────────────────────

let rooms          = new Map();
let currentRoomId  = null;
let previousRoomId = null;
let roomIdCounter  = 0;
let allFlickerLights = [];
let elapsedTime    = 0;
let descTimer      = 0;
let lastDescIdx    = -1;
let actionQueue    = [];
let queuedGenerationDoors = new Set();
let queuedEvictions = new Set();
let nextActionId   = 0;
let frameCounter   = 0;
let activeDoorAssistKey = null;
let audioEngine    = null;
let ambientTrack   = null;
let footstepSound  = null;
let footstepReverbNode = null;
let heartbeatPrimarySound = null;
let heartbeatSecondarySound = null;
let acFilterNode   = null;
let roomReverbNode = null;
let ambienceVolumeNode = null;
let heartbeatPrimaryVolumeNode = null;
let heartbeatSecondaryVolumeNode = null;
let lastCameraPos  = null;
let smoothedMoveSpeed = 0;
let footstepTimer  = 0;
let heartbeatTimer = 0;
let heartbeatSecondPulsePending = false;
let threeLib       = null;
let audioStarted   = false;
let audioStartPending = false;
let audioStartListeners = [];

// ─────────────────────────────────────────────
// Seeded RNG (xorshift32) — gives reproducible room layouts per ID
// ─────────────────────────────────────────────

function mkRng(seed) {
  let s = (seed ^ 0x12345678) >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}

function moveTowards(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

function getThreeLib() {
  if (!threeLib) {
    throw new Error('[Liminal] Shared Three.js instance is unavailable.');
  }
  return threeLib;
}

// ─────────────────────────────────────────────
// Material helpers
// ─────────────────────────────────────────────

function stdMat(scene, color, roughness, metalness) {
  return scene.createMaterial({
    type: 'standard', color,
    roughness: roughness !== undefined ? roughness : 0.85,
    metalness: metalness !== undefined ? metalness : 0,
    side: 'double'
  });
}

function emisMat(scene, color, emissive, intensity) {
  return scene.createMaterial({
    type: 'standard', color, emissive,
    emissiveIntensity: intensity !== undefined ? intensity : 0.8,
    roughness: 0.2, metalness: 0, side: 'double'
  });
}

function transMat(scene, color, opacity) {
  return scene.createMaterial({
    type: 'standard', color, roughness: 0.08, metalness: 0.15,
    opacity, transparent: true
  });
}

function rectsIntersect(a, b) {
  return !(a.maxX <= b.minX || a.minX >= b.maxX || a.maxZ <= b.minZ || a.minZ >= b.maxZ);
}

function makeRect(centerX, centerZ, width, depth, padding = 0) {
  return {
    minX: centerX - width / 2 - padding,
    maxX: centerX + width / 2 + padding,
    minZ: centerZ - depth / 2 - padding,
    maxZ: centerZ + depth / 2 + padding
  };
}

function getDoorInteriorClearanceRect(door, width = DOOR_CLEARANCE_WIDTH, depth = DOOR_CLEARANCE_DEPTH) {
  if (door.wallSide === 'front') {
    return {
      minX: door.worldX - width / 2,
      maxX: door.worldX + width / 2,
      minZ: door.worldZ - depth,
      maxZ: door.worldZ + 0.2
    };
  }
  if (door.wallSide === 'back') {
    return {
      minX: door.worldX - width / 2,
      maxX: door.worldX + width / 2,
      minZ: door.worldZ - 0.2,
      maxZ: door.worldZ + depth
    };
  }
  if (door.wallSide === 'left') {
    return {
      minX: door.worldX - 0.2,
      maxX: door.worldX + depth,
      minZ: door.worldZ - width / 2,
      maxZ: door.worldZ + width / 2
    };
  }
  return {
    minX: door.worldX - depth,
    maxX: door.worldX + 0.2,
    minZ: door.worldZ - width / 2,
    maxZ: door.worldZ + width / 2
  };
}

function placementIntersectsDoorClearance(room, centerX, centerZ, width, depth, padding = 0.15) {
  const rect = makeRect(centerX, centerZ, width, depth, padding);
  return room.doors.some(door => rectsIntersect(rect, getDoorInteriorClearanceRect(door)));
}

function addStaticCollider(room, centerX, centerZ, width, depth, padding = 0.02) {
  room.colliders.push(makeRect(centerX, centerZ, width, depth, padding));
}

function addCollidableBox(scene, room, options, padding = 0.02) {
  const handle = scene.createBox(options);
  room.objects.push(handle);
  addStaticCollider(room, options.position.x, options.position.z, options.width, options.depth, padding);
  return handle;
}

function createTitleCardTexture(text) {
  const THREE = getThreeLib();
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 124px monospace';
  ctx.fillStyle = '#050505';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 8;

  const chars = [...text];
  const spacing = canvas.width / (chars.length + 1);
  chars.forEach((char, index) => {
    const x = spacing * (index + 1);
    const y = canvas.height / 2 + (index % 2 === 0 ? -6 : 6);
    ctx.fillText(char, x, y);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function attachHallwayTitleCard(scene, room) {
  const THREE = getThreeLib();
  const { worldX: wx, worldZ: wz, width: W, depth: D } = room;
  const texture = createTitleCardTexture('LIMINAL');
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
    alphaTest: 0.02,
    side: THREE.FrontSide,
    depthWrite: false
  });
  const geometry = new THREE.PlaneGeometry(TITLE_CARD_WIDTH, TITLE_CARD_HEIGHT);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(wx + W / 2, PLAYER.HEIGHT + 0.22, wz + D * 0.67);
  mesh.rotation.y = Math.PI;
  mesh.renderOrder = 10;
  scene.scene.add(mesh);

  room.titleCard = {
    mesh,
    material,
    texture,
    appearStartZ: wz + D * 0.33,
    appearFullZ: wz + D * 0.48,
    fadeStartZ: wz + D * 0.56,
    hideZ: wz + D * 0.67,
    spent: false
  };

  room.disposables.push(() => {
    room.titleCard = null;
    scene.scene.remove(mesh);
    geometry.dispose();
    material.dispose();
    texture.dispose();
  });
}

function buildXTrimSegments(scene, room, x1, x2, wallZ, y, depth, material, cutouts) {
  const openings = (cutouts || [])
    .map(c => ({ start: c.centerX - c.width / 2, end: c.centerX + c.width / 2 }))
    .sort((a, b) => a.start - b.start);

  let cur = x1;
  for (const opening of openings) {
    const width = opening.start - cur;
    if (width > 0.01) {
      room.objects.push(scene.createBox({
        width, height: 0.05, depth,
        position: { x: cur + width / 2, y, z: wallZ }, material
      }));
    }
    cur = opening.end;
  }

  const width = x2 - cur;
  if (width > 0.01) {
    room.objects.push(scene.createBox({
      width, height: 0.05, depth,
      position: { x: cur + width / 2, y, z: wallZ }, material
    }));
  }
}

// ─────────────────────────────────────────────
// Wall builders — planes with door-sized cutouts
// ─────────────────────────────────────────────

/**
 * Build wall sections along X axis (front/back walls).
 * cutouts: [{centerX, width}]
 */
function buildXWall(scene, objects, x1, x2, wallZ, wallH, rotY, material, cutouts) {
  const dh = DOOR.HEIGHT;
  const openings = (cutouts || [])
    .map(c => ({ start: c.centerX - c.width / 2, end: c.centerX + c.width / 2 }))
    .sort((a, b) => a.start - b.start);

  let cur = x1;
  for (const o of openings) {
    const lw = o.start - cur;
    if (lw > 0.01) objects.push(scene.createPlane({
      width: lw, height: wallH,
      position: { x: cur + lw / 2, y: wallH / 2, z: wallZ },
      rotation: { x: 0, y: rotY, z: 0 }, material, doubleSided: true
    }));
    const topH = wallH - dh;
    if (topH > 0.01) {
      const ow = o.end - o.start;
      objects.push(scene.createPlane({
        width: ow, height: topH,
        position: { x: (o.start + o.end) / 2, y: dh + topH / 2, z: wallZ },
        rotation: { x: 0, y: rotY, z: 0 }, material, doubleSided: true
      }));
    }
    cur = o.end;
  }
  const rw = x2 - cur;
  if (rw > 0.01) objects.push(scene.createPlane({
    width: rw, height: wallH,
    position: { x: cur + rw / 2, y: wallH / 2, z: wallZ },
    rotation: { x: 0, y: rotY, z: 0 }, material, doubleSided: true
  }));
}

/**
 * Build wall sections along Z axis (left/right walls).
 * cutouts: [{centerZ, width}]
 */
function buildZWall(scene, objects, z1, z2, wallX, wallH, rotY, material, cutouts) {
  const dh = DOOR.HEIGHT;
  const openings = (cutouts || [])
    .map(c => ({ start: c.centerZ - c.width / 2, end: c.centerZ + c.width / 2 }))
    .sort((a, b) => a.start - b.start);

  let cur = z1;
  for (const o of openings) {
    const lw = o.start - cur;
    if (lw > 0.01) objects.push(scene.createPlane({
      width: lw, height: wallH,
      position: { x: wallX, y: wallH / 2, z: cur + lw / 2 },
      rotation: { x: 0, y: rotY, z: 0 }, material, doubleSided: true
    }));
    const topH = wallH - dh;
    if (topH > 0.01) {
      const ow = o.end - o.start;
      objects.push(scene.createPlane({
        width: ow, height: topH,
        position: { x: wallX, y: dh + topH / 2, z: (o.start + o.end) / 2 },
        rotation: { x: 0, y: rotY, z: 0 }, material, doubleSided: true
      }));
    }
    cur = o.end;
  }
  const rw = z2 - cur;
  if (rw > 0.01) objects.push(scene.createPlane({
    width: rw, height: wallH,
    position: { x: wallX, y: wallH / 2, z: cur + rw / 2 },
    rotation: { x: 0, y: rotY, z: 0 }, material, doubleSided: true
  }));
}

function cutoutsForSide(room, side) {
  return room.doors
    .filter(d => d.wallSide === side)
    .map(d => (side === 'front' || side === 'back')
      ? { centerX: d.worldX, width: DOOR.WIDTH }
      : { centerZ: d.worldZ, width: DOOR.WIDTH });
}

function buildAllWalls(scene, room, wallMat) {
  const { worldX: wx, worldZ: wz, width: W, height: H, depth: D } = room;
  buildXWall(scene, room.objects, wx, wx + W, wz,     H, 0,            wallMat, cutoutsForSide(room, 'back'));
  buildXWall(scene, room.objects, wx, wx + W, wz + D, H, Math.PI,      wallMat, cutoutsForSide(room, 'front'));
  buildZWall(scene, room.objects, wz, wz + D, wx,     H, Math.PI / 2,  wallMat, cutoutsForSide(room, 'left'));
  buildZWall(scene, room.objects, wz, wz + D, wx + W, H, -Math.PI / 2, wallMat, cutoutsForSide(room, 'right'));
}

// ─────────────────────────────────────────────
// Door creation — hinge pivot + swinging panel + jamb frame
// ─────────────────────────────────────────────

/**
 * Build a physical door at door.worldX / door.worldZ on door.wallSide.
 *
 * The door panel is parented to a tiny hinge pivot box.  Rotating the
 * hinge around Y swings the panel open.  swingSign encodes direction:
 *   front/left walls  → +1  (door swings away from approaching player)
 *   back/right walls  → -1
 *
 * Returns { hinge, panel, frameObjects, swingSign }
 * frameObjects (jambs + header) are added to room.objects by the caller.
 */
function createDoor(scene, door) {
  const DW = DOOR.WIDTH, DH = DOOR.HEIGHT, DD = DOOR.DEPTH, FT = DOOR.FRAME_T;
  const { wallSide: side, worldX: wx, worldZ: wz } = door;
  const frameObjects = [];

  const frameMat = stdMat(scene, C.DOOR_FRAME, 0.5);
  const panelMat = stdMat(scene, C.DOOR_WOOD,  0.65);

  // Three frame boxes: left jamb, right jamb, top header
  if (side === 'front' || side === 'back') {
    frameObjects.push(scene.createBox({ width: FT, height: DH, depth: FT * 2,
      position: { x: wx - DW / 2 - FT / 2, y: DH / 2, z: wz }, material: frameMat }));
    frameObjects.push(scene.createBox({ width: FT, height: DH, depth: FT * 2,
      position: { x: wx + DW / 2 + FT / 2, y: DH / 2, z: wz }, material: frameMat }));
    frameObjects.push(scene.createBox({ width: DW + FT * 2, height: FT, depth: FT * 2,
      position: { x: wx, y: DH + FT / 2, z: wz }, material: frameMat }));
  } else {
    frameObjects.push(scene.createBox({ width: FT * 2, height: DH, depth: FT,
      position: { x: wx, y: DH / 2, z: wz - DW / 2 - FT / 2 }, material: frameMat }));
    frameObjects.push(scene.createBox({ width: FT * 2, height: DH, depth: FT,
      position: { x: wx, y: DH / 2, z: wz + DW / 2 + FT / 2 }, material: frameMat }));
    frameObjects.push(scene.createBox({ width: FT * 2, height: FT, depth: DW + FT * 2,
      position: { x: wx, y: DH + FT / 2, z: wz }, material: frameMat }));
  }

  // Hinge point and swing direction
  let hingeX, hingeZ, swingSign, panelW, panelD;
  if (side === 'front' || side === 'back') {
    hingeX = wx - DW / 2;  hingeZ = wz;
    panelW = DW;            panelD = DD;
    swingSign = (side === 'front') ? 1 : -1;
  } else {
    hingeX = wx;  hingeZ = wz - DW / 2;
    panelW = DD;  panelD = DW;
    swingSign = (side === 'left') ? 1 : -1;
  }

  // Invisible pivot
  const hinge = scene.createBox({ width: 0.01, height: 0.01, depth: 0.01,
    color: 0x000000, position: { x: hingeX, y: 0, z: hingeZ } });

  // Panel placed at origin; positioned in hinge-local space after attach
  const panel = scene.createBox({ width: panelW, height: DH, depth: panelD,
    material: panelMat, position: { x: 0, y: 0, z: 0 } });

  hinge.attach(panel);
  if (side === 'front' || side === 'back') {
    panel.setPosition(DW / 2, DH / 2, 0);   // panel extends in +X from hinge
  } else {
    panel.setPosition(0, DH / 2, DW / 2);   // panel extends in +Z from hinge
  }

  return { hinge, panel, frameObjects, swingSign };
}

// ─────────────────────────────────────────────
// Flicker light helpers
// ─────────────────────────────────────────────

function addFlickerLight(scene, room, opts, baseIntensity) {
  const handle = scene.createPointLight(opts);
  room.lights.push(handle);
  const info = { handle, baseIntensity, phase: Math.random() * Math.PI * 2 };
  room.flickerLights.push(info);
  allFlickerLights.push(info);
  return handle;
}

function updateFlickerLights(dt) {
  elapsedTime += dt;
  for (const fl of allFlickerLights) {
    // Multi-layer flicker: 120 Hz electrical buzz + slow sag + mid flicker + random dropout
    const buzz    = Math.sin(elapsedTime * 118 + fl.phase) * 0.045;
    const slow    = Math.sin(elapsedTime * 3.6 + fl.phase * 0.5) * 0.08;
    const mid     = Math.sin(elapsedTime * 11  + fl.phase) * 0.06
                  + Math.sin(elapsedTime * 19  + fl.phase * 1.4) * 0.04;
    const dropout = Math.random() < 0.009 ? -(Math.random() * 0.65) : 0;
    fl.handle.setIntensity(Math.max(0, fl.baseIntensity * (1 + buzz + slow + mid + dropout)));
  }
}

// ─────────────────────────────────────────────
// Room geometry builders
// ─────────────────────────────────────────────

function buildHallway(scene, room) {
  const { worldX: wx, worldZ: wz, width: W, height: H, depth: D } = room;
  const wallM  = stdMat(scene, C.WALL_BEIGE);
  const floorM = stdMat(scene, C.FLOOR_GREY);
  const ceilM  = stdMat(scene, C.CEIL_CREAM);

  room.objects.push(scene.createPlane({ width: W, height: D,
    position: { x: wx + W / 2, y: 0.01, z: wz + D / 2 },
    rotation: { x: -Math.PI / 2, y: 0, z: 0 }, material: floorM }));
  room.objects.push(scene.createPlane({ width: W, height: D,
    position: { x: wx + W / 2, y: H, z: wz + D / 2 },
    rotation: { x: Math.PI / 2, y: 0, z: 0 }, material: ceilM }));

  // Back wall solid; front wall has door cutout
  buildXWall(scene, room.objects, wx, wx + W, wz,     H, 0,       wallM, []);
  buildXWall(scene, room.objects, wx, wx + W, wz + D, H, Math.PI, wallM, cutoutsForSide(room, 'front'));
  buildZWall(scene, room.objects, wz, wz + D, wx,     H,  Math.PI / 2,  wallM, []);
  buildZWall(scene, room.objects, wz, wz + D, wx + W, H, -Math.PI / 2, wallM, []);

  // Fluorescent light panels + point lights every 6 metres
  for (let z = wz + 3; z < wz + D; z += 6) {
    room.objects.push(scene.createPlane({ width: 0.5, height: 1.3,
      position: { x: wx + W / 2, y: H - 0.01, z },
      rotation: { x: Math.PI / 2, y: 0, z: 0 },
      material: emisMat(scene, C.FLUOR_WHITE, C.FLUOR_WHITE, 0.7) }));
    addFlickerLight(scene, room,
      { color: C.FLUOR_WARM, intensity: 1.5, distance: 9, decay: 2,
        position: { x: wx + W / 2, y: H - 0.4, z } }, 1.5);
  }

  // Baseboards
  const trimM = stdMat(scene, C.TRIM_DARK);
  room.objects.push(scene.createBox({ width: 0.05, height: 0.1, depth: D,
    position: { x: wx + 0.025, y: 0.05, z: wz + D / 2 }, material: trimM }));
  room.objects.push(scene.createBox({ width: 0.05, height: 0.1, depth: D,
    position: { x: wx + W - 0.025, y: 0.05, z: wz + D / 2 }, material: trimM }));
}

function buildOffice(scene, room) {
  const { worldX: wx, worldZ: wz, width: W, height: H, depth: D } = room;
  const wallM  = stdMat(scene, C.WALL_BEIGE);
  const floorM = stdMat(scene, C.FLOOR_GREY, 0.8);
  const ceilM  = stdMat(scene, C.CEIL_CREAM, 0.7);

  room.objects.push(scene.createPlane({ width: W, height: D,
    position: { x: wx + W / 2, y: 0.01, z: wz + D / 2 },
    rotation: { x: -Math.PI / 2, y: 0, z: 0 }, material: floorM }));
  room.objects.push(scene.createPlane({ width: W, height: D,
    position: { x: wx + W / 2, y: H, z: wz + D / 2 },
    rotation: { x: Math.PI / 2, y: 0, z: 0 }, material: ceilM }));
  buildAllWalls(scene, room, wallM);

  const divM = stdMat(scene, 0x9c9280, 0.7);
  const deskM = stdMat(scene, 0x6b5f50, 0.78);
  const chairM = stdMat(scene, 0x454545, 0.45, 0.08);
  const trimM = stdMat(scene, C.TRIM_DARK);
  const aisleHalfWidth = 1.15;
  const leftDividerX = wx + W / 2 - aisleHalfWidth;
  const rightDividerX = wx + W / 2 + aisleHalfWidth;
  const bayCenters = [wz + 2.6, wz + D / 2, wz + D - 2.6];

  const addWorkstation = (side, centerZ) => {
    const podCenterX = side === 'left' ? wx + 2.0 : wx + W - 2.0;
    const dividerX = side === 'left' ? leftDividerX : rightDividerX;
    const chairOffsetX = side === 'left' ? 0.45 : -0.45;
    const deskX = podCenterX + (side === 'left' ? -0.15 : 0.15);
    const chairX = deskX + chairOffsetX;

    if (placementIntersectsDoorClearance(room, podCenterX, centerZ, 2.8, 2.7)) return;

    addCollidableBox(scene, room, {
      width: 0.08, height: 1.35, depth: 2.15,
      position: { x: dividerX, y: 0.675, z: centerZ }, material: divM
    }, 0.03);
    addCollidableBox(scene, room, {
      width: 1.9, height: 1.35, depth: 0.08,
      position: { x: podCenterX, y: 0.675, z: centerZ - 1.03 }, material: divM
    }, 0.03);
    addCollidableBox(scene, room, {
      width: 1.25, height: 0.76, depth: 0.68,
      position: { x: deskX, y: 0.38, z: centerZ + 0.18 }, material: deskM
    }, 0.04);
    addCollidableBox(scene, room, {
      width: 0.52, height: 0.52, depth: 0.52,
      position: { x: chairX, y: 0.26, z: centerZ + 0.82 }, material: chairM
    }, 0.03);

    room.objects.push(scene.createBox({
      width: 0.3, height: 0.05, depth: 0.3,
      position: { x: deskX, y: 0.78, z: centerZ + 0.18 }, material: trimM
    }));
  };

  for (const centerZ of bayCenters) {
    addWorkstation('left', centerZ);
    addWorkstation('right', centerZ);
  }

  room.objects.push(scene.createBox({ width: 0.05, height: 0.1, depth: D,
    position: { x: wx + 0.025, y: 0.05, z: wz + D / 2 }, material: trimM }));
  room.objects.push(scene.createBox({ width: 0.05, height: 0.1, depth: D,
    position: { x: wx + W - 0.025, y: 0.05, z: wz + D / 2 }, material: trimM }));

  // 2x3 fluorescent grid
  for (let ix = 0; ix < 2; ix++) {
    for (let iz = 0; iz < 3; iz++) {
      const lx = wx + W * (ix + 1) / 3;
      const lz = wz + D * (iz + 1) / 4;
      room.objects.push(scene.createPlane({ width: 0.4, height: 1.2,
        position: { x: lx, y: H - 0.01, z: lz },
        rotation: { x: Math.PI / 2, y: 0, z: 0 },
        material: emisMat(scene, C.FLUOR_WHITE, C.FLUOR_WHITE, 0.6) }));
      addFlickerLight(scene, room,
        { color: C.FLUOR_WARM, intensity: 1.2, distance: 8, decay: 2,
          position: { x: lx, y: H - 0.4, z: lz } }, 1.2);
    }
  }
}

function buildPool(scene, room) {
  const { worldX: wx, worldZ: wz, width: W, height: H, depth: D } = room;
  const tileM  = stdMat(scene, C.POOL_TILE, 0.35, 0.1);
  const wallM  = stdMat(scene, C.POOL_WALL, 0.4);
  const ceilM  = stdMat(scene, C.POOL_CEIL, 0.6);
  const poolFM = stdMat(scene, C.POOL_FLOOR, 0.4, 0.1);
  const wd = 1.5;
  const pw = W * 0.5, pd = D * 0.6;
  const pxo = wx + (W - pw) / 2, pzo = wz + (D - pd) / 2;

  room.objects.push(scene.createPlane({ width: W, height: D,
    position: { x: wx + W / 2, y: 0.01, z: wz + D / 2 },
    rotation: { x: -Math.PI / 2, y: 0, z: 0 }, material: tileM }));
  room.objects.push(scene.createPlane({ width: pw, height: pd,
    position: { x: pxo + pw / 2, y: -wd, z: pzo + pd / 2 },
    rotation: { x: -Math.PI / 2, y: 0, z: 0 }, material: poolFM }));
  room.objects.push(scene.createPlane({ width: pw - 0.1, height: pd - 0.1,
    position: { x: pxo + pw / 2, y: -0.08, z: pzo + pd / 2 },
    rotation: { x: -Math.PI / 2, y: 0, z: 0 },
    material: transMat(scene, C.POOL_WATER, 0.72) }));
  room.objects.push(scene.createPlane({ width: W, height: D,
    position: { x: wx + W / 2, y: H, z: wz + D / 2 },
    rotation: { x: Math.PI / 2, y: 0, z: 0 }, material: ceilM }));
  buildAllWalls(scene, room, wallM);

  // Pool basin side walls
  const bsM = stdMat(scene, C.POOL_TILE, 0.35);
  room.objects.push(scene.createPlane({ width: pw, height: wd,
    position: { x: pxo + pw / 2, y: -wd / 2, z: pzo },
    rotation: { x: 0, y: 0, z: 0 }, material: bsM }));
  room.objects.push(scene.createPlane({ width: pw, height: wd,
    position: { x: pxo + pw / 2, y: -wd / 2, z: pzo + pd },
    rotation: { x: 0, y: Math.PI, z: 0 }, material: bsM }));
  room.objects.push(scene.createPlane({ width: pd, height: wd,
    position: { x: pxo, y: -wd / 2, z: pzo + pd / 2 },
    rotation: { x: 0, y: Math.PI / 2, z: 0 }, material: bsM }));
  room.objects.push(scene.createPlane({ width: pd, height: wd,
    position: { x: pxo + pw, y: -wd / 2, z: pzo + pd / 2 },
    rotation: { x: 0, y: -Math.PI / 2, z: 0 }, material: bsM }));

  // Underwater glow lights
  for (let xi = 0; xi < 2; xi++) {
    for (let zi = 0; zi < 3; zi++) {
      room.lights.push(scene.createPointLight({
        color: C.POOL_GLOW, intensity: 0.9, distance: 10, decay: 2,
        position: { x: pxo + pw * (xi + 1) / 3, y: -wd + 0.3, z: pzo + pd * (zi + 1) / 4 }
      }));
    }
  }
  for (let li = 0; li < 3; li++) {
    addFlickerLight(scene, room,
      { color: C.FLUOR_WARM, intensity: 0.9, distance: 12, decay: 2,
        position: { x: wx + W * (li + 1) / 4, y: H - 0.5, z: wz + D / 2 } }, 0.9);
  }
}

function buildStairwell(scene, room) {
  const { worldX: wx, worldZ: wz, width: W, height: H, depth: D } = room;
  const conM = stdMat(scene, C.STAIR_CONC, 0.95);
  const metM = stdMat(scene, C.STAIR_METAL, 0.45, 0.5);

  room.objects.push(scene.createPlane({ width: W, height: D,
    position: { x: wx + W / 2, y: 0.01, z: wz + D / 2 },
    rotation: { x: -Math.PI / 2, y: 0, z: 0 }, material: conM }));
  room.objects.push(scene.createPlane({ width: W, height: D,
    position: { x: wx + W / 2, y: H, z: wz + D / 2 },
    rotation: { x: Math.PI / 2, y: 0, z: 0 }, material: conM }));
  buildAllWalls(scene, room, conM);

  const sh = 0.18, sd = 0.26, steps = 8;
  for (let si = 0; si < steps; si++) {
    room.objects.push(scene.createBox({
      width: W - 0.3, height: sh, depth: sd,
      position: { x: wx + W / 2, y: sh * (si + 0.5), z: wz + 0.3 + sd * (si + 0.5) },
      material: conM }));
    room.objects.push(scene.createBox({ width: 0.04, height: 0.9, depth: 0.04,
      position: { x: wx + W - 0.2, y: sh * si + 0.45, z: wz + 0.3 + sd * si },
      material: metM }));
  }
  room.objects.push(scene.createBox({ width: 0.04, height: 0.04, depth: sd * steps,
    position: { x: wx + W - 0.2, y: sh * steps + 0.88, z: wz + 0.3 + sd * steps / 2 },
    material: metM }));
  addFlickerLight(scene, room,
    { color: 0xffe8c0, intensity: 0.85, distance: 10, decay: 2,
      position: { x: wx + W / 2, y: H - 0.5, z: wz + D / 2 } }, 0.85);
}

function buildYellowRoom(scene, room) {
  const { worldX: wx, worldZ: wz, width: W, height: H, depth: D } = room;
  const wallM  = stdMat(scene, C.YELL_WALL, 0.95);
  const floorM = stdMat(scene, C.YELL_FLOOR, 0.9);
  const ceilM  = stdMat(scene, C.YELL_CEIL, 0.9);

  room.objects.push(scene.createPlane({ width: W, height: D,
    position: { x: wx + W / 2, y: 0.01, z: wz + D / 2 },
    rotation: { x: -Math.PI / 2, y: 0, z: 0 }, material: floorM }));
  room.objects.push(scene.createPlane({ width: W, height: D,
    position: { x: wx + W / 2, y: H, z: wz + D / 2 },
    rotation: { x: Math.PI / 2, y: 0, z: 0 }, material: ceilM }));
  buildAllWalls(scene, room, wallM);

  const wainM = stdMat(scene, C.YELL_TRIM, 0.8);
  buildXTrimSegments(scene, room, wx, wx + W, wz + 0.02, 0.9, 0.04, wainM, cutoutsForSide(room, 'back'));
  buildXTrimSegments(scene, room, wx, wx + W, wz + D - 0.02, 0.9, 0.04, wainM, cutoutsForSide(room, 'front'));

  for (let yi = 0; yi < 2; yi++) {
    const lz = wz + D * (yi + 1) / 3;
    addFlickerLight(scene, room,
      { color: 0xffe090, intensity: 0.75, distance: 9, decay: 2,
        position: { x: wx + W / 2, y: H - 0.4, z: lz } }, 0.75);
    room.objects.push(scene.createBox({ width: 0.12, height: 0.12, depth: 0.12,
      position: { x: wx + W / 2, y: H - 0.25, z: lz },
      material: emisMat(scene, 0xffee80, 0xffdd40, 1.1) }));
  }
}

function buildCloset(scene, room) {
  const { worldX: wx, worldZ: wz, width: W, height: H, depth: D } = room;
  const wallM  = stdMat(scene, 0xb6ad8a, 0.92);
  const floorM = stdMat(scene, 0x6f6556, 0.95);
  const ceilM  = stdMat(scene, 0xd3ccb9, 0.85);
  const shelfM = stdMat(scene, 0x857a66, 0.8);

  room.objects.push(scene.createPlane({ width: W, height: D,
    position: { x: wx + W / 2, y: 0.01, z: wz + D / 2 },
    rotation: { x: -Math.PI / 2, y: 0, z: 0 }, material: floorM }));
  room.objects.push(scene.createPlane({ width: W, height: D,
    position: { x: wx + W / 2, y: H, z: wz + D / 2 },
    rotation: { x: Math.PI / 2, y: 0, z: 0 }, material: ceilM }));
  buildAllWalls(scene, room, wallM);

  room.objects.push(scene.createBox({ width: W - 0.35, height: 0.08, depth: 0.35,
    position: { x: wx + W / 2, y: 1.15, z: wz + D - 0.28 }, material: shelfM }));
  room.objects.push(scene.createBox({ width: W - 0.45, height: 0.08, depth: 0.3,
    position: { x: wx + W / 2, y: 1.75, z: wz + D - 0.32 }, material: shelfM }));

  addFlickerLight(scene, room,
    { color: 0xffe7b8, intensity: 0.45, distance: 5, decay: 2,
      position: { x: wx + W / 2, y: H - 0.35, z: wz + D / 2 } }, 0.45);
  room.objects.push(scene.createBox({ width: 0.14, height: 0.14, depth: 0.14,
    position: { x: wx + W / 2, y: H - 0.2, z: wz + D / 2 },
    material: emisMat(scene, 0xfff2c0, 0xffd980, 0.7) }));
}

function buildLobby(scene, room) {
  const { worldX: wx, worldZ: wz, width: W, height: H, depth: D } = room;
  const floorM  = stdMat(scene, C.LOBB_FLOOR, 0.3, 0.1);
  const wallM   = stdMat(scene, C.LOBB_WALL, 0.8);
  const ceilM   = stdMat(scene, C.LOBB_CEIL, 0.6);
  const accentM = stdMat(scene, C.LOBB_ACCENT, 0.7);
  const chairM  = stdMat(scene, 0x6e5d4f, 0.78);

  room.objects.push(scene.createPlane({ width: W, height: D,
    position: { x: wx + W / 2, y: 0.01, z: wz + D / 2 },
    rotation: { x: -Math.PI / 2, y: 0, z: 0 }, material: floorM }));
  room.objects.push(scene.createPlane({ width: W, height: D,
    position: { x: wx + W / 2, y: H, z: wz + D / 2 },
    rotation: { x: Math.PI / 2, y: 0, z: 0 }, material: ceilM }));
  buildAllWalls(scene, room, wallM);

  if (!placementIntersectsDoorClearance(room, wx + W / 2, wz + D * 0.3, 4.2, 1.4)) {
    addCollidableBox(scene, room, { width: 4, height: 1.1, depth: 1.2,
      position: { x: wx + W / 2, y: 0.55, z: wz + D * 0.3 }, material: accentM }, 0.05);
  }

  const seatingRows = [wz + D * 0.62, wz + D * 0.8];
  const seatingColumns = [wx + W * 0.28, wx + W * 0.72];
  for (const seatZ of seatingRows) {
    for (const seatX of seatingColumns) {
      if (placementIntersectsDoorClearance(room, seatX, seatZ, 2.4, 1.8)) continue;

      addCollidableBox(scene, room, { width: 0.85, height: 0.46, depth: 0.8,
        position: { x: seatX, y: 0.23, z: seatZ }, material: chairM }, 0.04);
      addCollidableBox(scene, room, { width: 0.85, height: 0.55, depth: 0.08,
        position: { x: seatX, y: 0.68, z: seatZ - 0.34 }, material: chairM }, 0.03);
      addCollidableBox(scene, room, { width: 0.45, height: 0.32, depth: 0.45,
        position: { x: seatX, y: 0.16, z: seatZ + 0.95 }, material: accentM }, 0.03);
    }
  }

  for (let lix = 0; lix < 3; lix++) {
    for (let liz = 0; liz < 3; liz++) {
      const lx = wx + W * (lix + 1) / 4;
      const lz = wz + D * (liz + 1) / 4;
      addFlickerLight(scene, room,
        { color: C.FLUOR_WARM, intensity: 1.1, distance: 12, decay: 2,
          position: { x: lx, y: H - 0.6, z: lz } }, 1.1);
      room.objects.push(scene.createBox({ width: 0.28, height: 0.14, depth: 0.28,
        position: { x: lx, y: H - 0.42, z: lz },
        material: emisMat(scene, 0xfffff8, 0xffff80, 0.45) }));
    }
  }
}

// ─────────────────────────────────────────────
// Door slot generation
// ─────────────────────────────────────────────

function oppositeSide(side) {
  return { front: 'back', back: 'front', left: 'right', right: 'left' }[side];
}

function getDoorState(door) {
  return door.sharedDoorState || door;
}

function getDoorLateralOffset(pos, door) {
  return (door.wallSide === 'front' || door.wallSide === 'back')
    ? Math.abs(pos.x - door.worldX)
    : Math.abs(pos.z - door.worldZ);
}

function isInsideDoorPassage(pos, door) {
  const passageHalfWidth = Math.max(0.14, DOOR.WIDTH / 2 - PLAYER.RADIUS + DOOR_PASS_PADDING);
  return getDoorLateralOffset(pos, door) <= passageHalfWidth;
}

function hasCrossedDoorThreshold(pos, door) {
  if (door.wallSide === 'front') return pos.z >= door.worldZ + TRANSITION_MARGIN;
  if (door.wallSide === 'back')  return pos.z <= door.worldZ - TRANSITION_MARGIN;
  if (door.wallSide === 'left')  return pos.x <= door.worldX - TRANSITION_MARGIN;
  if (door.wallSide === 'right') return pos.x >= door.worldX + TRANSITION_MARGIN;
  return false;
}

/**
 * Generate door slot descriptors for a room.
 * entranceSide = null for the starting hallway (no door behind you).
 */
function generateDoorSlots(type, cfg, entranceSide, rng) {
  const W = cfg.width, D = cfg.depth;
  const slots = [];

  if (entranceSide) {
    const cp = (entranceSide === 'front' || entranceSide === 'back') ? W / 2 : D / 2;
    slots.push({ wallSide: entranceSide, localPos: cp, isEntrance: true });
  }

  // Hallway: one fixed exit door only
  if (type === 'hallway') {
    slots.push({ wallSide: 'front', localPos: W / 2, isEntrance: false });
    return slots;
  }

  if (type === 'closet') {
    return slots;
  }

  const [minE, maxE] = cfg.extraDoors;
  const avail = ['front', 'back', 'left', 'right'].filter(s => s !== entranceSide);
  const extraCount   = Math.min(avail.length, minE + Math.floor(rng() * (maxE - minE + 1)));

  // Shuffle
  for (let i = avail.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [avail[i], avail[j]] = [avail[j], avail[i]];
  }

  for (let e = 0; e < extraCount; e++) {
    const side    = avail[e % avail.length];
    const wallLen = (side === 'front' || side === 'back') ? W : D;
    const margin  = 0.8;
    const minP    = DOOR.WIDTH / 2 + margin;
    const maxP    = wallLen - DOOR.WIDTH / 2 - margin;
    if (maxP <= minP) continue;

    let pos, tries = 0;
    do {
      pos = minP + rng() * (maxP - minP);
      tries++;
    } while (tries < 12 &&
             slots.some(s => s.wallSide === side && Math.abs(s.localPos - pos) < MIN_SAME_WALL_DOOR_SPACING));
    if (slots.some(s => s.wallSide === side && Math.abs(s.localPos - pos) < MIN_SAME_WALL_DOOR_SPACING)) continue;
    slots.push({ wallSide: side, localPos: pos, isEntrance: false });
  }

  return slots;
}

function assignClosetDoorTarget(room, rng) {
  const candidateDoors = room.doors.filter(d => !d.isEntrance);
  if (room.type === ROOM_TYPE.CLOSET || candidateDoors.length < 2) return;
  if (rng() >= CLOSET_CHANCE) return;

  const closetDoor = candidateDoors[Math.floor(rng() * candidateDoors.length)];
  closetDoor.targetRoomType = ROOM_TYPE.CLOSET;
}

function doorWorldPos(room, slot) {
  const { worldX: wx, worldZ: wz, width: W, depth: D } = room;
  if (slot.wallSide === 'back')  return { x: wx + slot.localPos, z: wz };
  if (slot.wallSide === 'front') return { x: wx + slot.localPos, z: wz + D };
  if (slot.wallSide === 'left')  return { x: wx,                 z: wz + slot.localPos };
  if (slot.wallSide === 'right') return { x: wx + W,             z: wz + slot.localPos };
  return { x: wx + W / 2, z: wz + D / 2 }; // fallback to room centre
}

/** World origin for a new room whose entrance aligns with `door`. */
function computeAdjacentOrigin(door, newCfg) {
  const NW = newCfg.width, ND = newCfg.depth;
  const ent = oppositeSide(door.wallSide);
  if (ent === 'back')  return { worldX: door.worldX - NW / 2, worldZ: door.worldZ + ROOM_SEPARATION,      entranceSide: 'back'  };
  if (ent === 'front') return { worldX: door.worldX - NW / 2, worldZ: door.worldZ - ND - ROOM_SEPARATION, entranceSide: 'front' };
  if (ent === 'left')  return { worldX: door.worldX + ROOM_SEPARATION,      worldZ: door.worldZ - ND / 2, entranceSide: 'left' };
  if (ent === 'right') return { worldX: door.worldX - NW - ROOM_SEPARATION, worldZ: door.worldZ - ND / 2, entranceSide: 'right'};
  return { worldX: door.worldX - NW / 2, worldZ: door.worldZ - ND / 2, entranceSide: 'back' }; // fallback
}

function boundsOverlap(a, b, padding = 0.12) {
  return !(a.maxX <= b.minX + padding || a.minX >= b.maxX - padding ||
           a.maxZ <= b.minZ + padding || a.minZ >= b.maxZ - padding);
}

function makeRoomBounds(worldX, worldZ, cfg) {
  return {
    minX: worldX,
    maxX: worldX + cfg.width,
    minZ: worldZ,
    maxZ: worldZ + cfg.depth
  };
}

function findCompatibleRoomPlacement(door, parentId) {
  const baseSeed = door.roomId * 1619 + Math.round(door.localPos * 1000);
  const rng = mkRng(baseSeed);
  const candidates = [];
  const seen = new Set();

  const pushType = (type) => {
    if (!type || seen.has(type)) return;
    seen.add(type);
    candidates.push(type);
  };

  pushType(door.targetRoomType);

  const shuffledPool = [...ROOM_TYPE_CANDIDATES];
  for (let i = shuffledPool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffledPool[i], shuffledPool[j]] = [shuffledPool[j], shuffledPool[i]];
  }
  shuffledPool.forEach(pushType);

  for (const type of candidates) {
    const cfg = ROOM_CONFIGS[type];
    const origin = computeAdjacentOrigin(door, cfg);
    const bounds = makeRoomBounds(origin.worldX, origin.worldZ, cfg);
    let conflicts = false;
    for (const room of rooms.values()) {
      if (room.id !== parentId && boundsOverlap(bounds, room.bounds)) {
        conflicts = true;
        break;
      }
    }

    if (!conflicts) {
      return { type, origin };
    }
  }

  return null;
}

// ─────────────────────────────────────────────
// Room construction
// ─────────────────────────────────────────────

function buildRoomGeometry(scene, room) {
  if      (room.type === 'hallway')    buildHallway(scene, room);
  else if (room.type === 'office')     buildOffice(scene, room);
  else if (room.type === 'pool')       buildPool(scene, room);
  else if (room.type === 'stairwell')  buildStairwell(scene, room);
  else if (room.type === 'yellow')     buildYellowRoom(scene, room);
  else if (room.type === 'closet')     buildCloset(scene, room);
  else if (room.type === 'lobby')      buildLobby(scene, room);
}

/**
 * Fully construct a room and register it in `rooms`.
 * entranceSide may be null for the starting hallway.
 */
function generateRoom(scene, type, worldX, worldZ, entranceSide, entranceLink = null) {
  const id  = ++roomIdCounter;
  const cfg = ROOM_CONFIGS[type];
  const rng = mkRng(id * 2053 + 7);

  const room = {
    id, type, worldX, worldZ,
    width: cfg.width, height: cfg.height, depth: cfg.depth,
    objects: [], lights: [], flickerLights: [], doorObjects: [], doors: [], colliders: [],
    disposables: [], titleCard: null, acoustics: null,
    bounds: { minX: worldX, maxX: worldX + cfg.width, minZ: worldZ, maxZ: worldZ + cfg.depth }
  };

  const slots = generateDoorSlots(type, cfg, entranceSide, rng);
  for (const slot of slots) {
    const wp = doorWorldPos(room, slot);
    const sharedDoorState = slot.isEntrance && entranceLink ? getDoorState(entranceLink) : null;
    room.doors.push({
      roomId: id,
      wallSide: slot.wallSide, localPos: slot.localPos,
      worldX: wp.x, worldZ: wp.z,
      connectedRoomId: null,
      hingeHandle: null, panelHandle: null,
      openAngle: 0, swingSign: 0,
      isEntrance: slot.isEntrance,
      sharedDoorState,
      targetRoomType: null,
      isBlocked: false
    });
  }

  assignClosetDoorTarget(room, rng);

  buildRoomGeometry(scene, room);
  room.acoustics = computeRoomAcoustics(room);
  if (type === ROOM_TYPE.HALLWAY && entranceSide === null) {
    attachHallwayTitleCard(scene, room);
  }

  for (const door of room.doors) {
    if (door.sharedDoorState) continue;
    const { hinge, panel, frameObjects, swingSign } = createDoor(scene, door);
    door.hingeHandle = hinge;
    door.panelHandle = panel;
    door.swingSign   = swingSign;
    room.doorObjects.push({ hinge, panel });
    room.objects.push(...frameObjects);
  }

  return room;
}

// ─────────────────────────────────────────────
// Room graph management
// ─────────────────────────────────────────────

function getDoorKey(door) {
  return `${door.roomId}:${door.wallSide}:${door.localPos.toFixed(3)}`;
}

function enqueueAction(action) {
  actionQueue.push({
    ...action,
    id: ++nextActionId,
    readyFrame: frameCounter + 1
  });
}

function queueDoorGeneration(roomId, door) {
  if (!door || door.connectedRoomId !== null || door.isBlocked) return;
  const doorKey = getDoorKey(door);
  if (queuedGenerationDoors.has(doorKey)) return;

  queuedGenerationDoors.add(doorKey);
  enqueueAction({ type: 'generate-room', roomId, doorKey });
}

function queueRoomExpansion(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  for (const door of room.doors) {
    if (door.connectedRoomId === null && !door.isBlocked) {
      queueDoorGeneration(roomId, door);
    }
  }
}

function queueRoomEviction(roomId) {
  if (roomId === null || roomId === undefined) return;
  if (roomId === currentRoomId || roomId === previousRoomId) return;
  if (!rooms.has(roomId) || queuedEvictions.has(roomId)) return;

  queuedEvictions.add(roomId);
  enqueueAction({ type: 'evict-room', roomId });
}

function removeQueuedActionsForRoom(roomId) {
  actionQueue = actionQueue.filter(action => {
    if (action.type === 'generate-room' && action.roomId === roomId) {
      queuedGenerationDoors.delete(action.doorKey);
      return false;
    }
    if (action.type === 'evict-room' && action.roomId === roomId) {
      queuedEvictions.delete(action.roomId);
      return false;
    }
    return true;
  });
}

function removeQueuedGenerationsForRoom(roomId) {
  actionQueue = actionQueue.filter(action => {
    if (action.type === 'generate-room' && action.roomId === roomId) {
      queuedGenerationDoors.delete(action.doorKey);
      return false;
    }
    return true;
  });
}

function dequeueNextAction(evictionsProcessed, generationsProcessed) {
  if (evictionsProcessed < MAX_EVICTIONS_PER_FRAME) {
    const evictIdx = actionQueue.findIndex(action =>
      action.readyFrame <= frameCounter && action.type === 'evict-room');
    if (evictIdx !== -1) {
      return actionQueue.splice(evictIdx, 1)[0];
    }
  }

  if (generationsProcessed < MAX_GENERATIONS_PER_FRAME) {
    const genIdx = actionQueue.findIndex(action =>
      action.readyFrame <= frameCounter && action.type === 'generate-room');
    if (genIdx !== -1) {
      return actionQueue.splice(genIdx, 1)[0];
    }
  }

  return null;
}

function processActionQueue(scene) {
  let actionsProcessed = 0;
  let evictionsProcessed = 0;
  let generationsProcessed = 0;

  while (actionsProcessed < MAX_ACTIONS_PER_FRAME) {
    const action = dequeueNextAction(evictionsProcessed, generationsProcessed);
    if (!action) break;

    if (action.type === 'evict-room') {
      queuedEvictions.delete(action.roomId);
      if (action.roomId !== currentRoomId && action.roomId !== previousRoomId) {
        evictRoom(scene, action.roomId);
      }
      evictionsProcessed++;
      actionsProcessed++;
      continue;
    }

    if (action.type === 'generate-room') {
      queuedGenerationDoors.delete(action.doorKey);
      const room = rooms.get(action.roomId);
      const door = room?.doors.find(d => getDoorKey(d) === action.doorKey) || null;
      if (room && door && door.connectedRoomId === null) {
        generateAndConnect(scene, action.roomId, door);
      }
      generationsProcessed++;
      actionsProcessed++;
    }
  }
}

function queueRoomLifecycleForEntry(newRoomId, fromRoomId) {
  const keep = new Set([newRoomId]);
  if (fromRoomId !== null && fromRoomId !== undefined) keep.add(fromRoomId);

  rooms.forEach((room) => {
    if (room.id !== newRoomId) {
      removeQueuedGenerationsForRoom(room.id);
    }
    if (!keep.has(room.id)) {
      queueRoomEviction(room.id);
    }
  });

  queueRoomExpansion(newRoomId);
}

/** Spawn a room on the far side of `door` and wire the bidirectional link. */
function generateAndConnect(scene, parentId, door) {
  if (door.connectedRoomId !== null) {
    return rooms.get(door.connectedRoomId) || null;
  }

  const placement = findCompatibleRoomPlacement(door, parentId);
  if (!placement) {
    door.isBlocked = true;
    return null;
  }

  const newRoom = generateRoom(
    scene,
    placement.type,
    placement.origin.worldX,
    placement.origin.worldZ,
    placement.origin.entranceSide,
    door
  );

  door.connectedRoomId = newRoom.id;
  const entDoor = newRoom.doors.find(d => d.isEntrance);
  if (entDoor) {
    entDoor.connectedRoomId = parentId;
    entDoor.sharedDoorState = getDoorState(door);
  }

  rooms.set(newRoom.id, newRoom);
  return newRoom;
}

/** Destroy a room — remove its scene objects, disconnect references. */
function evictRoom(scene, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  removeQueuedActionsForRoom(roomId);

  // Remove door panels before hinges (panel is a child of hinge mesh)
  for (const { hinge, panel } of room.doorObjects) {
    try { panel.remove(); } catch (e) { /* already gone */ }
    try { hinge.remove(); } catch (e) { /* already gone */ }
  }
  for (const dispose of room.disposables) { try { dispose(); } catch (e) {} }
  for (const obj of room.objects)  { try { obj.remove();  } catch (e) {} }
  for (const lt  of room.lights)   { try { lt.remove();   } catch (e) {} }

  allFlickerLights = allFlickerLights.filter(fl => !room.flickerLights.includes(fl));

  rooms.forEach(r => {
    for (const d of r.doors) {
      if (d.connectedRoomId === roomId) d.connectedRoomId = null;
    }
  });

  room.objects.length = 0;
  room.lights.length = 0;
  room.flickerLights.length = 0;
  room.doorObjects.length = 0;
  room.doors.length = 0;
  room.colliders.length = 0;
  room.disposables.length = 0;

  rooms.delete(roomId);
}

/**
 * Called when the player crosses the threshold into newRoomId.
 * Evicts the old-previous room (2 hops back) and generates rooms
 * for any unconnected doors in the newly entered room.
 */
function enterRoom(scene, newRoomId, fromRoomId) {
  previousRoomId = fromRoomId;
  currentRoomId  = newRoomId;

  const cur = rooms.get(newRoomId);
  if (cur) {
    queueRoomLifecycleForEntry(newRoomId, fromRoomId);
    setAtmosphere(scene, cur.type);
  }
}

// ─────────────────────────────────────────────
// Atmosphere
// ─────────────────────────────────────────────

function setAtmosphere(scene, type) {
  if (type === 'hallway' || type === 'office') {
    scene.setBackgroundColor(0x0d0d12);
    scene.setAmbientLight({ intensity: 0.14, color: 0xfff8e0 });
  } else if (type === 'pool') {
    scene.setBackgroundColor(0x050c14);
    scene.setAmbientLight({ intensity: 0.12, color: 0x87ceeb });
  } else if (type === 'stairwell') {
    scene.setBackgroundColor(0x060606);
    scene.setAmbientLight({ intensity: 0.10, color: 0xffffff });
  } else if (type === 'yellow') {
    scene.setBackgroundColor(0x0e0d00);
    scene.setAmbientLight({ intensity: 0.18, color: 0xffee88 });
  } else if (type === 'closet') {
    scene.setBackgroundColor(0x090806);
    scene.setAmbientLight({ intensity: 0.09, color: 0xfff1cc });
  } else if (type === 'lobby') {
    scene.setBackgroundColor(0x0a0a10);
    scene.setAmbientLight({ intensity: 0.18, color: 0xfff5e0 });
  }
}

// ─────────────────────────────────────────────
// Door animation update (runs every frame)
// ─────────────────────────────────────────────

function updateDoors(scene, dt) {
  const pos = scene.getCameraPosition();
  const updatedStates = new Set();
  const openStartSq = DOOR_OPEN_START * DOOR_OPEN_START;

  rooms.forEach(room => {
    for (const door of room.doors) {
      if (door.isBlocked) continue;
      const doorState = getDoorState(door);

      const dx   = pos.x - door.worldX;
      const dz   = pos.z - door.worldZ;
      const distSq = dx * dx + dz * dz;

      const { normalDistance, lateralDistance } = getDoorThresholdMetrics(pos, door);
      const holdOpen = door.connectedRoomId !== null &&
        normalDistance <= DOOR_HOLD_OPEN_ZONE &&
        lateralDistance <= DOOR_ALIGN_STICKY_CAPTURE;

      // Smoothstep toward target open angle based on player distance
      let target = 0;
      if (holdOpen) {
        target = Math.PI / 2;
      } else if (distSq < openStartSq) {
        const dist = Math.sqrt(distSq);
        const t = Math.max(0, (DOOR_OPEN_START - dist) / (DOOR_OPEN_START - DOOR_FULL_OPEN_DIST));
        target  = (Math.PI / 2) * t * t * (3 - 2 * t);
      }

      if (!updatedStates.has(doorState) && doorState.hingeHandle) {
        doorState.openAngle += (target - doorState.openAngle) * Math.min(1, 3.5 * dt);
        doorState.hingeHandle.setRotation(0, doorState.openAngle * doorState.swingSign, 0);
        updatedStates.add(doorState);
      }

    }
  });
}

// ─────────────────────────────────────────────
// Collision — keep player inside current room
// ─────────────────────────────────────────────

function isDoorTraversable(pos, door) {
  if (door.connectedRoomId === null) return false;
  const { normalDistance, lateralDistance } = getDoorThresholdMetrics(pos, door);
  return getDoorState(door).openAngle >= DOOR_MIN_PASS_ANGLE ||
    (normalDistance <= DOOR_HOLD_OPEN_ZONE && lateralDistance <= DOOR_ALIGN_STICKY_CAPTURE);
}

function canPassWall(pos, room, side) {
  for (const door of room.doors) {
    if (door.wallSide !== side) continue;
    if (!isDoorTraversable(pos, door)) continue;
    if (isInsideDoorPassage(pos, door)) return true;
  }
  return false;
}

function resolveObstacleCollisions(x, z, room) {
  let nx = x;
  let nz = z;

  for (let iteration = 0; iteration < 3; iteration++) {
    let adjusted = false;

    for (const collider of room.colliders) {
      const expanded = {
        minX: collider.minX - PLAYER.RADIUS,
        maxX: collider.maxX + PLAYER.RADIUS,
        minZ: collider.minZ - PLAYER.RADIUS,
        maxZ: collider.maxZ + PLAYER.RADIUS
      };

      if (nx <= expanded.minX || nx >= expanded.maxX || nz <= expanded.minZ || nz >= expanded.maxZ) {
        continue;
      }

      const distLeft = Math.abs(nx - expanded.minX);
      const distRight = Math.abs(expanded.maxX - nx);
      const distBack = Math.abs(nz - expanded.minZ);
      const distFront = Math.abs(expanded.maxZ - nz);
      const minDist = Math.min(distLeft, distRight, distBack, distFront);

      if (minDist === distLeft) {
        nx = expanded.minX - COLLISION_PUSHBACK;
      } else if (minDist === distRight) {
        nx = expanded.maxX + COLLISION_PUSHBACK;
      } else if (minDist === distBack) {
        nz = expanded.minZ - COLLISION_PUSHBACK;
      } else {
        nz = expanded.maxZ + COLLISION_PUSHBACK;
      }

      adjusted = true;
    }

    if (!adjusted) break;
  }

  return { x: nx, z: nz };
}

function getDoorThresholdMetrics(pos, door) {
  if (door.wallSide === 'front' || door.wallSide === 'back') {
    return {
      normalDistance: Math.abs(pos.z - door.worldZ),
      lateralDistance: getDoorLateralOffset(pos, door)
    };
  }

  return {
    normalDistance: Math.abs(pos.x - door.worldX),
    lateralDistance: getDoorLateralOffset(pos, door)
  };
}

function isAssistDoorCandidate(pos, door, sticky = false) {
  if (!isDoorTraversable(pos, door)) return false;

  const { normalDistance, lateralDistance } = getDoorThresholdMetrics(pos, door);
  const zone = sticky ? DOOR_ALIGN_STICKY_ZONE : DOOR_ALIGN_ZONE;
  const capture = sticky ? DOOR_ALIGN_STICKY_CAPTURE : DOOR_ALIGN_CAPTURE;
  return normalDistance <= zone && lateralDistance <= capture;
}

function findThresholdAssistDoor(room, pos) {
  if (activeDoorAssistKey) {
    const activeDoor = room.doors.find(door => getDoorKey(door) === activeDoorAssistKey);
    if (activeDoor && isAssistDoorCandidate(pos, activeDoor, true)) {
      return activeDoor;
    }
    activeDoorAssistKey = null;
  }

  let bestDoor = null;
  let bestScore = Infinity;

  for (const door of room.doors) {
    if (!isAssistDoorCandidate(pos, door)) continue;

    const { normalDistance, lateralDistance } = getDoorThresholdMetrics(pos, door);
    const score = normalDistance + lateralDistance * 0.35;
    if (score < bestScore) {
      bestDoor = door;
      bestScore = score;
    }
  }

  activeDoorAssistKey = bestDoor ? getDoorKey(bestDoor) : null;
  return bestDoor;
}

function constrainPlayer(scene) {
  const pos  = scene.getCameraPosition();
  const room = rooms.get(currentRoomId);
  if (!room) return;

  const { minX, maxX, minZ, maxZ } = room.bounds;
  const m  = PLAYER.RADIUS;
  let nx = pos.x, nz = pos.z;
  const ny = PLAYER.HEIGHT;

  if (nx < minX + m && !canPassWall({ x: nx, z: nz }, room, 'left'))  nx = minX + m + COLLISION_PUSHBACK;
  if (nx > maxX - m && !canPassWall({ x: nx, z: nz }, room, 'right')) nx = maxX - m - COLLISION_PUSHBACK;
  if (nz < minZ + m && !canPassWall({ x: nx, z: nz }, room, 'back'))  nz = minZ + m + COLLISION_PUSHBACK;
  if (nz > maxZ - m && !canPassWall({ x: nx, z: nz }, room, 'front')) nz = maxZ - m - COLLISION_PUSHBACK;

  ({ x: nx, z: nz } = resolveObstacleCollisions(nx, nz, room));

  if (nx !== pos.x || nz !== pos.z || ny !== pos.y) scene.setCameraPosition(nx, ny, nz);
}

function applyDoorThresholdAssist(scene, dt) {
  const room = rooms.get(currentRoomId);
  if (!room) return;

  const inputState = scene.getInputState ? scene.getInputState() : null;
  if (!inputState || !(inputState.forward || inputState.backward || inputState.left || inputState.right)) {
    activeDoorAssistKey = null;
    return;
  }

  const pos = scene.getCameraPosition();
  const assistDoor = findThresholdAssistDoor(room, pos);
  if (!assistDoor) return;

  let nx = pos.x;
  let nz = pos.z;
  const { normalDistance, lateralDistance } = getDoorThresholdMetrics(pos, assistDoor);
  const assistStrength = 0.4 + 0.6 * (1 - Math.min(1, normalDistance / DOOR_ALIGN_STICKY_ZONE));
  const maxDelta = Math.min(lateralDistance, DOOR_ALIGN_SPEED * assistStrength * dt);

  if (assistDoor.wallSide === 'front' || assistDoor.wallSide === 'back') {
    nx = moveTowards(nx, assistDoor.worldX, maxDelta);
  } else {
    nz = moveTowards(nz, assistDoor.worldZ, maxDelta);
  }

  if (nx !== pos.x || nz !== pos.z) {
    scene.setCameraPosition(nx, PLAYER.HEIGHT, nz);
  }
}

// ─────────────────────────────────────────────
// Room transition detection
// ─────────────────────────────────────────────

function checkRoomTransition(scene) {
  const pos  = scene.getCameraPosition();
  const room = rooms.get(currentRoomId);
  if (!room) return;

  for (const door of room.doors) {
    if (door.connectedRoomId === null)        continue;
    if (!isDoorTraversable(pos, door)) continue;
    if (!isInsideDoorPassage(pos, door)) continue;
    if (!hasCrossedDoorThreshold(pos, door)) continue;
    activeDoorAssistKey = null;
    enterRoom(scene, door.connectedRoomId, currentRoomId);
    return;
  }
}

// ─────────────────────────────────────────────
// Atmospheric descriptions
// ─────────────────────────────────────────────

const DESCS = {
  hallway: [
    'The fluorescent lights hum. Beige carpet. The corridor stretches endlessly ahead.',
    'You know this hallway. You have walked it before. Have you not?',
    'The lights flicker. Somewhere, a vent rattles. Nothing else moves.',
    'The smell of old carpet and stale air. How long has no one been here?',
    'Each section of hallway looks exactly the same as the last.',
    'The fluorescent tube at the far end sputters. Then holds. Then sputters again.'
  ],
  office: [
    'Empty cubicles. Chairs still at their desks. Monitors long dark.',
    'The office is still. Coffee cups sit on desks, never collected.',
    'Fluorescent buzz. The carpet pattern seems to repeat. And repeat.',
    'File cabinets hang open. Papers on the floor, unread for years.',
    'A single chair has rolled slightly from its desk. No reason for that.'
  ],
  pool: [
    'The pool water is impossibly still. Reflections dance on the ceiling.',
    'Lane markers on the bottom. No one has swum here in a very long time.',
    'The glow from beneath the water illuminates nothing useful.',
    'Chlorine and damp concrete. The lights under the water never turn off.',
    'You can see the far wall perfectly. The distance seems wrong.'
  ],
  stairwell: [
    'The stairs go up. Or down. It is hard to tell which way is which.',
    'Each step echoes twice. The second echo takes too long to return.',
    'The railing is cold. The concrete walls press close.',
    'You can hear footsteps above. Or below. Or is that just the building?',
    'There is no window. There never was a window.'
  ],
  yellow: [
    'Yellow wallpaper. The pattern breathes if you do not look directly at it.',
    'The carpet is moist underfoot. The walls are impossibly, wrongly yellow.',
    'No windows. No reason to be here. No memory of arriving.',
    'The smell: damp paper and something sweet and wrong.',
    'The low ceiling presses. It has always been this low.'
  ],
  closet: [
    'A shallow utility closet. Shelves. Dust. Barely enough room to turn around.',
    'It ends here: one door in, no second way out, only the hum of the light.',
    'The air is still and close. Someone stored something here once, then forgot it.',
    'A dead-end room, cramped and private, as if the building swallowed a breath.'
  ],
  lobby: [
    'An empty lobby. No one at reception. The chandelier flickers.',
    'The check-in desk is abandoned. Keys on hooks for rooms you will never see.',
    'Chairs arranged for guests who never arrived. Or already left.',
    'There is an elevator. The buttons do not light up. They never did.',
    'Marble floor. Or is it linoleum? Either way, it is impeccably clean.'
  ]
};

function updateDescription(scene, dt) {
  descTimer += dt;
  if (descTimer < 4.5) return;
  descTimer = 0;

  const room = rooms.get(currentRoomId);
  if (!room) return;
  const list = DESCS[room.type];
  if (!list) return;

  let idx;
  do { idx = Math.floor(Math.random() * list.length); }
  while (idx === lastDescIdx && list.length > 1);
  lastDescIdx = idx;
  scene.setDescription(list[idx]);
}

function smoothStep01(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function lerp(min, max, t) {
  return min + (max - min) * t;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function intervalFromBpm(bpm) {
  return 60 / bpm;
}

function nearestDoorDistance(room, pos) {
  if (!room || !room.doors || room.doors.length === 0) return Infinity;
  let nearest = Infinity;
  for (const door of room.doors) {
    const dx = pos.x - door.worldX;
    const dz = pos.z - door.worldZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < nearest) nearest = dist;
  }
  return nearest;
}

function getVolumeNode(modulationTargets) {
  return modulationTargets?.nodes?.volume ?? modulationTargets?.volume ?? null;
}

function computeRoomAcoustics(room) {
  if (!room || room.type === ROOM_TYPE.CLOSET) {
    return {
      footstepReverbWet: 0,
      footstepReverbDecay: 0.15
    };
  }

  const floorArea = Math.max(1, room.width * room.depth);
  const roomVolume = floorArea * room.height;
  const colliderArea = room.colliders.reduce((sum, collider) => {
    return sum + Math.max(0, collider.maxX - collider.minX) * Math.max(0, collider.maxZ - collider.minZ);
  }, 0);

  const volumeFactor = clamp01((roomVolume - 22) / (1600 - 22));
  const clutterCoverage = clamp01(colliderArea / floorArea);
  const clutterCountFactor = clamp01(room.colliders.length / 18);
  const clutterFactor = clamp01(clutterCoverage * 1.7 + clutterCountFactor * 0.45);

  return {
    footstepReverbWet: clamp01(lerp(0.03, 0.26, volumeFactor) - clutterFactor * 0.16),
    footstepReverbDecay: Math.max(0.2, lerp(0.45, 3.4, volumeFactor) - clutterFactor * 1.2)
  };
}

function createHeartbeatVoice(id, volume) {
  return audioEngine.createSound(id, {
    volume,
    duration: 0.09,
    layers: [
      {
        id: 'heartBody',
        type: 'membrane',
        volume: -2,
        pitchDecay: 0.022,
        octaves: 1.7,
        envelope: { attack: 0.001, decay: 0.09, sustain: 0, release: 0.03 }
      },
      {
        id: 'heartPulse',
        type: 'noise',
        volume: -9,
        envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.015 },
        effects: [{ type: 'filter', filterType: 'bandpass', frequency: 1400, Q: 1.1 }]
      },
      {
        id: 'heartClick',
        type: 'synth',
        oscillator: 'triangle',
        polyphonic: false,
        volume: -15,
        envelope: { attack: 0.001, decay: 0.025, sustain: 0, release: 0.015 },
        effects: [{ type: 'filter', filterType: 'highpass', frequency: 900, Q: 0.6 }]
      }
    ],
    effects: [
      { type: 'filter', filterType: 'lowpass', frequency: 900, Q: 0.35 },
      { type: 'reverb', decay: 1.1, wet: 0.06 }
    ]
  });
}

function removeAudioStartListeners() {
  audioStartListeners.forEach(dispose => dispose());
  audioStartListeners = [];
}

async function startLiminalAudio() {
  if (!audioEngine || audioStarted || audioStartPending) return;

  audioStartPending = true;

  try {
    await audioEngine.start();
    if (ambientTrack) {
      await ambientTrack.play();
    }
    audioStarted = true;
    removeAudioStartListeners();
    console.info('[LiminalAudio] Ambient audio started.');
  } catch (error) {
    console.warn('[LiminalAudio] Audio start was blocked. Waiting for another user gesture.', error);
  } finally {
    audioStartPending = false;
  }
}

function registerAudioStartListeners(scene) {
  removeAudioStartListeners();

  const interactionTarget = scene?.input?.domElement ?? scene?.container ?? null;
  if (!interactionTarget || !audioEngine) return;

  const onPointerGesture = () => {
    void startLiminalAudio();
  };
  const onKeyDown = (event) => {
    if (event.repeat || !AUDIO_START_KEYS.has(event.code)) {
      return;
    }

    void startLiminalAudio();
  };

  interactionTarget.addEventListener('pointerdown', onPointerGesture, { passive: true });
  interactionTarget.addEventListener('touchstart', onPointerGesture, { passive: true });
  document.addEventListener('keydown', onKeyDown);

  audioStartListeners = [
    () => interactionTarget.removeEventListener('pointerdown', onPointerGesture),
    () => interactionTarget.removeEventListener('touchstart', onPointerGesture),
    () => document.removeEventListener('keydown', onKeyDown)
  ];
}

function createLiminalAudio(scene) {
  if (!window.Sonance) {
    console.error('[LiminalAudio] Sonance audio engine not found. Expected window.Sonance from sonance.gen.js.');
    return;
  }

  audioEngine = window.Sonance.createEngine();

  ambientTrack = audioEngine.createSoundtrack('liminal-ambient', { bpm: 56 });

  const acChannel = ambientTrack.addChannel('ac-bed', {
    volume: -18,
    effects: [
      { id: 'acFilter', type: 'filter', filterType: 'lowpass', frequency: 620, Q: 0.7 },
      { id: 'acRoomReverb', type: 'reverb', decay: 4.1, wet: 0.2 }
    ],
    instrument: {
      layers: [
        {
          id: 'acDrone',
          type: 'synth',
          oscillator: 'triangle',
          polyphonic: false,
          detune: -7,
          volume: -5,
          envelope: { attack: 2.5, decay: 0.8, sustain: 0.92, release: 3.4 }
        },
        {
          id: 'acBuzz',
          type: 'noise',
          volume: -29,
          envelope: { attack: 0.8, decay: 0.4, sustain: 0.94, release: 2.8 },
          effects: [{ type: 'filter', filterType: 'bandpass', frequency: 180, Q: 0.8 }]
        }
      ]
    }
  });
  acFilterNode = acChannel.modulationTargets?.nodes?.acFilter ?? null;
  roomReverbNode = acChannel.modulationTargets?.nodes?.acRoomReverb ?? null;
  ambienceVolumeNode = getVolumeNode(acChannel.modulationTargets);
  acChannel.playSequence([
    { note: 'D2', duration: '2m', velocity: 0.56 },
    { note: 'D#2', duration: '2m', velocity: 0.52 },
    { note: 'D2', duration: '2m', velocity: 0.5 },
    { note: 'C#2', duration: '2m', velocity: 0.48 }
  ], { loop: true });

  const roomTail = ambientTrack.addChannel('room-tail', {
    volume: -20,
    effects: [
      { type: 'filter', filterType: 'highpass', frequency: 150, Q: 0.7 },
      { type: 'reverb', decay: 6.4, wet: 0.38 }
    ],
    instrument: {
      layers: [
        {
          type: 'noise',
          volume: -24,
          envelope: { attack: 1.3, decay: 0.6, sustain: 0.96, release: 2.8 }
        },
        {
          type: 'synth',
          oscillator: 'triangle',
          polyphonic: false,
          detune: 9,
          volume: -10,
          envelope: { attack: 2.2, decay: 0.7, sustain: 0.7, release: 2.6 }
        }
      ]
    }
  });
  roomTail.playSequence([
    { note: 'A2', duration: '2m', velocity: 0.34 },
    { note: 'G2', duration: '2m', velocity: 0.32 }
  ], { loop: true });

  footstepSound = audioEngine.createSound('liminal-footstep', {
    volume: -8,
    duration: '16n',
    layers: [
      {
        id: 'impact',
        type: 'membrane',
        volume: -8,
        pitchDecay: 0.02,
        octaves: 1.6,
        envelope: { attack: 0.001, decay: 0.09, sustain: 0, release: 0.03 }
      },
      {
        id: 'shoe',
        type: 'noise',
        volume: -15,
        envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.04 },
        effects: [{ type: 'filter', filterType: 'highpass', frequency: 460, Q: 0.8 }]
      },
      {
        id: 'roomTick',
          type: 'synth',
          oscillator: 'triangle',
          polyphonic: false,
          detune: 3,
          volume: -24,
          envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.03 }
        }
      ],
    effects: [{ type: 'reverb', decay: 1.8, wet: 0.08 }]
  });
  footstepReverbNode = footstepSound?.modulationTargets?.nodes?.reverb ?? null;

  heartbeatPrimarySound = createHeartbeatVoice('liminal-heartbeat-primary', -5.5);
  heartbeatSecondarySound = createHeartbeatVoice('liminal-heartbeat-secondary', -8.5);
  heartbeatPrimaryVolumeNode = getVolumeNode(heartbeatPrimarySound?.modulationTargets);
  heartbeatSecondaryVolumeNode = getVolumeNode(heartbeatSecondarySound?.modulationTargets);
  registerAudioStartListeners(scene);
  console.info('[LiminalAudio] Ready. Click, touch, or press a movement key to start ambient audio.');
}

function updateLiminalAudio(scene, dt) {
  if (!audioStarted || !audioEngine) return;

  const pos = scene.getCameraPosition();
  if (!lastCameraPos) {
    lastCameraPos = { x: pos.x, z: pos.z };
    return;
  }

  const dx = pos.x - lastCameraPos.x;
  const dz = pos.z - lastCameraPos.z;
  lastCameraPos = { x: pos.x, z: pos.z };
  const instantSpeed = Math.sqrt(dx * dx + dz * dz) / Math.max(dt, AUDIO_MIN_DELTA_TIME);
  smoothedMoveSpeed = lerp(smoothedMoveSpeed, instantSpeed, clamp01(dt * 9));

  const walkNorm = clamp01((smoothedMoveSpeed - WALK_SPEED_THRESHOLD) / WALK_SPEED_RANGE);
  if (walkNorm > 0.03 && footstepSound) {
    footstepTimer -= dt;
    if (footstepTimer <= 0) {
      const cadence = lerp(FOOTSTEP_INTERVAL_SLOW, FOOTSTEP_INTERVAL_FAST, walkNorm);
      footstepTimer = cadence * lerp(FOOTSTEP_VARIANCE_MIN, FOOTSTEP_VARIANCE_MAX, Math.random());
      const velocity = lerp(0.4, 0.8, walkNorm);
      const note = walkNorm > FOOTSTEP_PITCH_TRANSITION_THRESHOLD
        ? (Math.random() > 0.5 ? 'D1' : 'C#1')
        : (Math.random() > 0.5 ? 'C1' : 'B0');
      footstepSound.trigger(note, '16n', undefined, velocity);
    }
  } else {
    footstepTimer = 0;
  }

  const room = rooms.get(currentRoomId);
  const doorDist = nearestDoorDistance(room, pos);
  const doorProximity = clamp01((DOOR_PROXIMITY_MAX_DISTANCE - doorDist) / DOOR_PROXIMITY_FALLOFF_RANGE);
  const roomAcoustics = room?.acoustics ?? computeRoomAcoustics(null);

  if (acFilterNode?.frequency) {
    acFilterNode.frequency.rampTo(lerp(580, 740, doorProximity), 0.16);
  }
  if (roomReverbNode?.wet) {
    roomReverbNode.wet.rampTo(lerp(0.18, 0.28, doorProximity), 0.24);
  }
  if (ambienceVolumeNode) {
    ambienceVolumeNode.rampTo(lerp(-18, -14, walkNorm), 0.2);
  }
  if (footstepReverbNode) {
    if (footstepReverbNode.wet?.rampTo) {
      footstepReverbNode.wet.rampTo(roomAcoustics.footstepReverbWet, 0.14);
    }
    if ('decay' in footstepReverbNode) {
      footstepReverbNode.decay = roomAcoustics.footstepReverbDecay;
    }
  }

  const heartbeatBaseVolume = lerp(-10, -4.5, doorProximity);
  if (heartbeatPrimaryVolumeNode) {
    heartbeatPrimaryVolumeNode.rampTo(heartbeatBaseVolume, 0.1);
  }
  if (heartbeatSecondaryVolumeNode) {
    heartbeatSecondaryVolumeNode.rampTo(heartbeatBaseVolume - 2.5, 0.1);
  }

  heartbeatTimer -= dt;
  if (heartbeatTimer <= 0 && (heartbeatPrimarySound || heartbeatSecondarySound)) {
    const cycleInterval = intervalFromBpm(lerp(HEARTBEAT_BPM_CALM, HEARTBEAT_BPM_INTENSE, doorProximity));
    const secondPulseGap = lerp(HEARTBEAT_DOUBLE_PULSE_GAP_CALM, HEARTBEAT_DOUBLE_PULSE_GAP_INTENSE, doorProximity);

    if (heartbeatSecondPulsePending) {
      heartbeatSecondPulsePending = false;
      heartbeatTimer = Math.max(
        HEARTBEAT_CYCLE_INTERVAL_MIN,
        cycleInterval - secondPulseGap + ((Math.random() * 2) - 1) * HEARTBEAT_CYCLE_JITTER_MAX
      );
      if (heartbeatSecondarySound) {
        heartbeatSecondarySound.trigger(
          HEARTBEAT_NOTE_SECONDARY,
          0.07,
          undefined,
          lerp(0.32, 0.52, doorProximity)
        );
      }
    } else if (heartbeatPrimarySound) {
      heartbeatSecondPulsePending = true;
      heartbeatTimer = secondPulseGap;
      heartbeatPrimarySound.trigger(
        HEARTBEAT_NOTE_PRIMARY,
        0.09,
        undefined,
        lerp(0.5, 0.72, doorProximity)
      );
    }
  }
}

function disposeLiminalAudio() {
  removeAudioStartListeners();
  if (ambientTrack) {
    ambientTrack.stop();
    ambientTrack.dispose();
  }
  if (audioEngine) {
    audioEngine.dispose();
  }
  audioEngine = null;
  ambientTrack = null;
  footstepSound = null;
  footstepReverbNode = null;
  heartbeatPrimarySound = null;
  heartbeatSecondarySound = null;
  acFilterNode = null;
  roomReverbNode = null;
  ambienceVolumeNode = null;
  heartbeatPrimaryVolumeNode = null;
  heartbeatSecondaryVolumeNode = null;
  lastCameraPos = null;
  smoothedMoveSpeed = 0;
  footstepTimer = 0;
  heartbeatTimer = 0;
  heartbeatSecondPulsePending = false;
  threeLib = null;
  audioStarted = false;
  audioStartPending = false;
}

function updateTitleCards(scene) {
  const pos = scene.getCameraPosition();

  rooms.forEach((room) => {
    const card = room.titleCard;
    if (!card) return;

    if (card.spent || pos.z >= card.hideZ) {
      card.spent = true;
      card.material.opacity = 0;
      card.mesh.visible = false;
      return;
    }

    let opacity = 0;
    if (pos.z >= card.appearStartZ && pos.z < card.appearFullZ) {
      opacity = smoothStep01((pos.z - card.appearStartZ) / (card.appearFullZ - card.appearStartZ));
    } else if (pos.z >= card.appearFullZ && pos.z < card.fadeStartZ) {
      opacity = 1;
    } else if (pos.z >= card.fadeStartZ && pos.z < card.hideZ) {
      opacity = 1 - smoothStep01((pos.z - card.fadeStartZ) / (card.hideZ - card.fadeStartZ));
    }

    card.mesh.visible = opacity > 0.001;
    card.material.opacity = opacity * 0.92;
  });
}

// ─────────────────────────────────────────────
// Module lifecycle
// ─────────────────────────────────────────────

function Load(scene) {
  scene.setGridVisible(false);
  scene.setFloorVisible(false);

  const isMobile = !!(scene.input && scene.input.isMobile);
  scene.enableFPSControls({
    moveSpeed: 2.25,
    movementTuning: {
      mode: 'target-speed',
      maxSpeed: 2.25,
      acceleration: 4.4,
      deceleration: 6.8,
      initialSpeedFactor: 0.22,
      rampTime: 0.65,
      backwardSpeedMultiplier: 0.78,
      strafeSpeedMultiplier: 0.72
    },
    onLockChange: (locked) => {
      if (isMobile) return;
      scene.setDescription(locked
        ? 'WASD to walk - approach a door to open it - ESC to pause'
        : 'Click to re-enter the liminal spaces.');
    }
  });
  if (isMobile) scene.setDescription('Drag to look - double-tap+hold to walk - approach doors to open them');

  // Reset all state
  rooms = new Map();
  currentRoomId = null;  previousRoomId = null;
  roomIdCounter = 0;     allFlickerLights = [];
  elapsedTime = 0;       descTimer = 0;          lastDescIdx = -1;
  actionQueue = [];      queuedGenerationDoors = new Set();
  queuedEvictions = new Set();
  nextActionId = 0;      frameCounter = 0;
  activeDoorAssistKey = null;
  disposeLiminalAudio();
  threeLib = scene.THREE ?? window.THREE ?? null;
  createLiminalAudio(scene);

  // Starting hallway
  const hallway = generateRoom(scene, 'hallway', -1.5, 0, null);
  rooms.set(hallway.id, hallway);
  currentRoomId = hallway.id;

  // Queue the first room beyond the end door so it appears on the next frame
  const frontDoor = hallway.doors.find(d => d.wallSide === 'front');
  if (frontDoor) queueRoomExpansion(hallway.id);

  setAtmosphere(scene, 'hallway');
  scene.setDefaultView({
    position: { x: 0, y: PLAYER.HEIGHT, z: 2.5 },
    target: frontDoor
      ? { x: frontDoor.worldX, y: PLAYER.HEIGHT, z: frontDoor.worldZ }
      : { x: 0, y: PLAYER.HEIGHT, z: -4 }
  });
  scene.setDescription(
    'The fluorescent lights hum. The corridor stretches endlessly. A door waits at the far end.'
  );

  return { isMobile };
}

function Update(scene, state, deltaTime) {
  frameCounter++;
  processActionQueue(scene);
  updateFlickerLights(deltaTime);
  updateDoors(scene, deltaTime);
  updateTitleCards(scene);
  if (!scene.isXRPresenting()) {
    constrainPlayer(scene);
    applyDoorThresholdAssist(scene, deltaTime);
  }
  checkRoomTransition(scene);
  updateDescription(scene, deltaTime);
  updateLiminalAudio(scene, deltaTime);
}

function Unload(scene, state) {
  const ids = [...rooms.keys()];
  for (const id of ids) evictRoom(scene, id);
  rooms.clear();
  allFlickerLights = [];
  currentRoomId = null;  previousRoomId = null;
  elapsedTime   = 0;
  actionQueue = [];
  queuedGenerationDoors = new Set();
  queuedEvictions = new Set();
  nextActionId = 0;
  frameCounter = 0;
  activeDoorAssistKey = null;
  disposeLiminalAudio();
  scene.disableFPSControls();
}

// ─────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────

(function () {
  if (!window.PhotonicModules) window.PhotonicModules = {};
  window.PhotonicModules['liminal'] = { Load, Update, Unload, Metadata };
})();
