/**
 * PhotonicBakedAO - Baked ambient occlusion for static scenes (roadmap F9).
 *
 * Computes occlusion from the real geometry by ray casting a hemisphere of
 * directions at every vertex of the receiving meshes, then writes the result
 * into the vertex colour channel, so a corner gets a deep wide soft pool, an
 * object's contact patch matches its actual size, and open floor stays clean.
 * The engine's default floor is a single huge plane that cannot be tessellated,
 * so its contact patches are baked into a transparent ground texture instead.
 * Deterministic: the sample directions are a fixed Fibonacci hemisphere, so
 * the same scene bakes to the same occlusion on any machine. Externally
 * supplied geometry (roadmap F11) takes the same path: it occludes, it
 * receives, a single solid occludes itself, and vertex colours it arrived
 * with are darkened by the bake rather than replaced.
 */

import * as THREE from 'three';

export const DEFAULT_BAKED_AO_OPTIONS = {
  radius: 2.2,
  samples: 20,
  intensity: 0.9,
  minVisibility: 0.22,
  tessellation: 0.3,
  groundTexture: true,
  groundResolution: 128,
  groundSamples: 12
};

// Fixed hemisphere directions in tangent space (y is the surface normal).
function hemisphereDirections(count) {
  const directions = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = (i + 0.5) / count;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * goldenAngle;
    directions.push(new THREE.Vector3(r * Math.cos(phi), y, r * Math.sin(phi)));
  }
  return directions;
}

// Orthonormal basis (tangent, bitangent) around a normal.
function tangentBasis(normal) {
  const helper = Math.abs(normal.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const tangent = new THREE.Vector3().crossVectors(helper, normal).normalize();
  const bitangent = new THREE.Vector3().crossVectors(normal, tangent);
  return { tangent, bitangent };
}

// Occluder index over the world-space triangles of every occluder, built once per bake from the geometry as authored (before tessellation). A small BVH keeps a dense externally supplied mesh (F11) in the same cost order as the engine's own low-poly shapes: a ray tests tens of triangles, not every triangle in the model.
function buildOccluderIndex(meshes) {
  const vertex = new THREE.Vector3();
  let triCount = 0;
  const counts = meshes.map((mesh) => {
    const geometry = mesh.geometry;
    const count = Math.floor((geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3);
    triCount += count;
    return count;
  });
  const tris = new Float32Array(triCount * 9);
  const centroids = new Float32Array(triCount * 3);
  let tri = 0;
  meshes.forEach((mesh, meshIndex) => {
    const geometry = mesh.geometry;
    const position = geometry.attributes.position;
    const index = geometry.index;
    for (let k = 0; k < counts[meshIndex]; k++) {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let corner = 0; corner < 3; corner++) {
        const vertexIndex = index ? index.getX(k * 3 + corner) : k * 3 + corner;
        vertex.fromBufferAttribute(position, vertexIndex).applyMatrix4(mesh.matrixWorld);
        tris[(tri + k) * 9 + corner * 3] = vertex.x;
        tris[(tri + k) * 9 + corner * 3 + 1] = vertex.y;
        tris[(tri + k) * 9 + corner * 3 + 2] = vertex.z;
        cx += vertex.x;
        cy += vertex.y;
        cz += vertex.z;
      }
      centroids[(tri + k) * 3] = cx / 3;
      centroids[(tri + k) * 3 + 1] = cy / 3;
      centroids[(tri + k) * 3 + 2] = cz / 3;
    }
    tri += counts[meshIndex];
  });

  const order = new Uint32Array(triCount);
  for (let i = 0; i < triCount; i++) order[i] = i;
  const nodes = [];
  const LEAF_SIZE = 8;
  function build(start, count, depth) {
    const nodeIndex = nodes.length;
    const node = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity, left: -1, right: -1, start, count };
    nodes.push(node);
    let cMinX = Infinity;
    let cMinY = Infinity;
    let cMinZ = Infinity;
    let cMaxX = -Infinity;
    let cMaxY = -Infinity;
    let cMaxZ = -Infinity;
    for (let i = start; i < start + count; i++) {
      const t = order[i];
      for (let corner = 0; corner < 3; corner++) {
        const x = tris[t * 9 + corner * 3];
        const y = tris[t * 9 + corner * 3 + 1];
        const z = tris[t * 9 + corner * 3 + 2];
        if (x < node.minX) node.minX = x;
        if (y < node.minY) node.minY = y;
        if (z < node.minZ) node.minZ = z;
        if (x > node.maxX) node.maxX = x;
        if (y > node.maxY) node.maxY = y;
        if (z > node.maxZ) node.maxZ = z;
      }
      const cx = centroids[t * 3];
      const cy = centroids[t * 3 + 1];
      const cz = centroids[t * 3 + 2];
      if (cx < cMinX) cMinX = cx;
      if (cy < cMinY) cMinY = cy;
      if (cz < cMinZ) cMinZ = cz;
      if (cx > cMaxX) cMaxX = cx;
      if (cy > cMaxY) cMaxY = cy;
      if (cz > cMaxZ) cMaxZ = cz;
    }
    if (count <= LEAF_SIZE || depth >= 24) return nodeIndex;
    const extentX = cMaxX - cMinX;
    const extentY = cMaxY - cMinY;
    const extentZ = cMaxZ - cMinZ;
    const axis = extentX >= extentY && extentX >= extentZ ? 0 : (extentY >= extentZ ? 1 : 2);
    if ((axis === 0 ? extentX : axis === 1 ? extentY : extentZ) <= 0) return nodeIndex;
    const slice = order.subarray(start, start + count);
    slice.sort((a, b) => centroids[a * 3 + axis] - centroids[b * 3 + axis]);
    const mid = count >> 1;
    node.left = build(start, mid, depth + 1);
    node.right = build(start + mid, count - mid, depth + 1);
    node.count = 0;
    return nodeIndex;
  }
  if (triCount > 0) build(0, triCount, 0);
  return { tris, nodes, order, triCount };
}

// Double-sided Möller–Trumbore test (wall planes block from either face, as the F9 proxy materials did).
function intersectTriangle(tris, t, ox, oy, oz, dx, dy, dz) {
  const o = t * 9;
  const ax = tris[o];
  const ay = tris[o + 1];
  const az = tris[o + 2];
  const e1x = tris[o + 3] - ax;
  const e1y = tris[o + 4] - ay;
  const e1z = tris[o + 5] - az;
  const e2x = tris[o + 6] - ax;
  const e2y = tris[o + 7] - ay;
  const e2z = tris[o + 8] - az;
  const px = dy * e2z - dz * e2y;
  const py = dz * e2x - dx * e2z;
  const pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (det > -1e-9 && det < 1e-9) return -1;
  const invDet = 1 / det;
  const tx = ox - ax;
  const ty = oy - ay;
  const tz = oz - az;
  const u = (tx * px + ty * py + tz * pz) * invDet;
  if (u < -1e-6 || u > 1 + 1e-6) return -1;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * invDet;
  if (v < -1e-6 || u + v > 1 + 1e-6) return -1;
  const distance = (e2x * qx + e2y * qy + e2z * qz) * invDet;
  return distance > 1e-4 ? distance : -1;
}

// Nearest hit distance along a ray through the occluder index, or Infinity.
function raycastIndex(index, origin, direction, maxDistance) {
  const { tris, nodes, order } = index;
  if (nodes.length === 0) return Infinity;
  const ox = origin.x;
  const oy = origin.y;
  const oz = origin.z;
  const dx = direction.x;
  const dy = direction.y;
  const dz = direction.z;
  const invX = 1 / dx;
  const invY = 1 / dy;
  const invZ = 1 / dz;
  let best = maxDistance;
  const stack = [0];
  while (stack.length > 0) {
    const node = nodes[stack.pop()];
    const tMinX = ((dx < 0 ? node.maxX : node.minX) - ox) * invX;
    const tMaxX = ((dx < 0 ? node.minX : node.maxX) - ox) * invX;
    const tMinY = ((dy < 0 ? node.maxY : node.minY) - oy) * invY;
    const tMaxY = ((dy < 0 ? node.minY : node.maxY) - oy) * invY;
    const tMinZ = ((dz < 0 ? node.maxZ : node.minZ) - oz) * invZ;
    const tMaxZ = ((dz < 0 ? node.minZ : node.maxZ) - oz) * invZ;
    const tNear = Math.max(tMinX, tMinY, tMinZ);
    const tFar = Math.min(tMaxX, tMaxY, tMaxZ);
    if (tFar < Math.max(tNear, 0) || tNear > best) continue;
    if (node.left === -1) {
      for (let i = node.start; i < node.start + node.count; i++) {
        const hit = intersectTriangle(tris, order[i], ox, oy, oz, dx, dy, dz);
        if (hit > 0 && hit < best) best = hit;
      }
    } else {
      stack.push(node.left, node.right);
    }
  }
  return best;
}

// Visibility at one surface point: 1 is fully open, lower is more occluded. A hit counts less the farther away it lands, so near geometry pools deep and distant geometry only shades. A mesh occludes itself too (F11): the origin offset along the normal keeps convex surfaces clean, and concave parts of one solid — a bore, a recess — shade themselves the way separate meshes do.
function sampleVisibility(index, origin, normal, directions, opts) {
  if (!index || index.triCount === 0) return { visibility: 1, rays: 0 };
  const { tangent, bitangent } = tangentBasis(normal);
  const direction = new THREE.Vector3();
  let blocked = 0;
  for (const local of directions) {
    direction.set(0, 0, 0)
      .addScaledVector(tangent, local.x)
      .addScaledVector(normal, local.y)
      .addScaledVector(bitangent, local.z)
      .normalize();
    const hit = raycastIndex(index, origin, direction, opts.radius);
    if (hit <= opts.radius) blocked += 1 - hit / opts.radius;
  }
  const visibility = Math.min(1, Math.max(opts.minVisibility, 1 - opts.intensity * (blocked / directions.length)));
  return { visibility, rays: directions.length };
}

// Subdivide authored planes and boxes so per-vertex occlusion has somewhere to live; spheres and cylinders already carry enough vertices. Geometry carrying its own vertex colours is left alone (F11): it arrives already tessellated, and subdividing would throw its colours away.
function tessellate(mesh, step) {
  const geometry = mesh.geometry;
  if (geometry.attributes.color) return;
  const params = geometry.parameters;
  if (!params) return;
  const segments = (size, cap) => Math.max(1, Math.min(cap, Math.round(size / step)));
  if (geometry.type === 'PlaneGeometry') {
    const segX = segments(params.width, 96);
    const segY = segments(params.height, 96);
    if (segX <= (params.widthSegments || 1) && segY <= (params.heightSegments || 1)) return;
    mesh.geometry = new THREE.PlaneGeometry(params.width, params.height, segX, segY);
  } else if (geometry.type === 'BoxGeometry') {
    const segX = segments(params.width, 24);
    const segY = segments(params.height, 24);
    const segZ = segments(params.depth, 24);
    if (segX <= (params.widthSegments || 1) && segY <= (params.heightSegments || 1) && segZ <= (params.depthSegments || 1)) return;
    mesh.geometry = new THREE.BoxGeometry(params.width, params.height, params.depth, segX, segY, segZ);
  }
}

/**
 * Bake occlusion for a set of meshes. Returns the baked state (originals kept
 * for clearing) plus honest statistics the caller can report.
 */
export function bakeAmbientOcclusion({ receivers, occluders, floorMesh = null, options = {} }) {
  const opts = { ...DEFAULT_BAKED_AO_OPTIONS, ...options };
  const startedAt = performance.now();
  const directions = hemisphereDirections(opts.samples);
  const groundDirections = hemisphereDirections(opts.groundSamples);

  // Occluder index first, from the geometry as authored, before tessellation fattens it.
  const occluderIndex = buildOccluderIndex(occluders);

  const bakedMeshes = [];
  let vertices = 0;
  let raysCast = 0;
  let visibilitySum = 0;
  let visibilityMin = 1;

  const origin = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const worldPosition = new THREE.Vector3();

  for (const mesh of receivers) {
    const geometryBefore = mesh.geometry;
    tessellate(mesh, opts.tessellation);
    const geometry = mesh.geometry;
    const position = geometry.attributes.position;
    const normalAttribute = geometry.attributes.normal;
    if (!position || !normalAttribute) {
      mesh.geometry = geometryBefore;
      continue;
    }
    // Existing vertex colours (externally supplied geometry, F11) are kept and darkened by the visibility; geometry without them gets the plain visibility grey F9 wrote.
    const sourceColor = geometry.attributes.color || null;
    const record = {
      mesh,
      geometry: geometryBefore,
      material: mesh.material,
      sourceColors: sourceColor ? { array: Float32Array.from(sourceColor.array), itemSize: sourceColor.itemSize } : null
    };
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const colorItemSize = sourceColor ? sourceColor.itemSize : 3;
    const colors = new Float32Array(position.count * colorItemSize);

    for (let i = 0; i < position.count; i++) {
      worldPosition.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      normal.fromBufferAttribute(normalAttribute, i).applyMatrix3(normalMatrix).normalize();
      origin.copy(worldPosition).addScaledVector(normal, 0.02);
      const { visibility, rays } = sampleVisibility(occluderIndex, origin, normal, directions, opts);
      raysCast += rays;
      for (let c = 0; c < 3; c++) {
        const base = sourceColor ? sourceColor.getComponent(i, c) : 1;
        colors[i * colorItemSize + c] = base * visibility;
      }
      if (colorItemSize > 3) colors[i * colorItemSize + 3] = sourceColor.getComponent(i, 3);
      vertices++;
      visibilitySum += visibility;
      if (visibility < visibilityMin) visibilityMin = visibility;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, colorItemSize));
    mesh.material = mesh.material.clone();
    mesh.material.vertexColors = true;
    mesh.material.needsUpdate = true;
    bakedMeshes.push(record);
  }

  // The default floor cannot be tessellated, so its contact patches go into a ground texture sized to the occluders.
  let ground = null;
  if (opts.groundTexture && floorMesh && occluders.length > 0) {
    const bounds = new THREE.Box3();
    for (const mesh of occluders) bounds.expandByObject(mesh);
    if (Number.isFinite(bounds.min.x) && bounds.min.x <= bounds.max.x) {
      const centre = bounds.getCenter(new THREE.Vector3());
      const size = Math.max(4, Math.min(30, Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) + opts.radius * 2));
      const res = opts.groundResolution;
      const data = new Uint8Array(res * res * 4);
      const up = new THREE.Vector3(0, 1, 0);
      let groundTexels = 0;
      for (let row = 0; row < res; row++) {
        for (let col = 0; col < res; col++) {
          const x = centre.x - size / 2 + ((col + 0.5) / res) * size;
          // Texture row 0 is v=0, which the rotated plane maps to the far (+z) edge.
          const z = centre.z + size / 2 - ((row + 0.5) / res) * size;
          origin.set(x, 0.02, z);
          const { visibility, rays } = sampleVisibility(occluderIndex, origin, up, groundDirections, opts);
          raysCast += rays;
          const alpha = Math.round((1 - visibility) * 255);
          if (alpha > 0) groundTexels++;
          const index = (row * res + col) * 4;
          data[index] = 0;
          data[index + 1] = 0;
          data[index + 2] = 0;
          data[index + 3] = alpha;
        }
      }
      const texture = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.needsUpdate = true;
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
      const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
      groundMesh.rotation.x = -Math.PI / 2;
      groundMesh.position.set(centre.x, 0.004, centre.z);
      groundMesh.renderOrder = 1;
      groundMesh.userData.photonicBakedAOGround = true;
      ground = { mesh: groundMesh, size, resolution: res, texelsShaded: groundTexels };
    }
  }

  const durationMs = performance.now() - startedAt;
  return {
    bakedMeshes,
    ground,
    stats: {
      vertices,
      raysCast,
      triangles: occluderIndex.triCount,
      meshes: bakedMeshes.length,
      occluders: occluders.length,
      durationMs: Math.round(durationMs * 10) / 10,
      meanVisibility: vertices > 0 ? Math.round((visibilitySum / vertices) * 1000) / 1000 : 1,
      minVisibilityObserved: Math.round(visibilityMin * 1000) / 1000
    },
    options: { radius: opts.radius, samples: opts.samples, intensity: opts.intensity, minVisibility: opts.minVisibility, tessellation: opts.tessellation, groundTexture: opts.groundTexture, groundResolution: opts.groundResolution, groundSamples: opts.groundSamples }
  };
}

// Undo a bake: restore original geometry and material, put back any vertex colours the geometry arrived with (F11), and drop the ground texture mesh.
export function clearBakedAmbientOcclusion(state) {
  if (!state) return;
  for (const record of state.bakedMeshes) {
    const current = record.mesh.geometry;
    if (current !== record.geometry) {
      current.dispose();
    } else if (record.sourceColors) {
      current.setAttribute('color', new THREE.BufferAttribute(record.sourceColors.array, record.sourceColors.itemSize));
    } else if (current.attributes.color) {
      current.deleteAttribute('color');
    }
    record.mesh.geometry = record.geometry;
    record.mesh.material.dispose();
    record.mesh.material = record.material;
  }
  if (state.ground) {
    state.ground.mesh.parent?.remove(state.ground.mesh);
    state.ground.mesh.geometry.dispose();
    state.ground.mesh.material.map?.dispose();
    state.ground.mesh.material.dispose();
  }
}
