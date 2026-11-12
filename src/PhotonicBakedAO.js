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
 * the same scene bakes to the same occlusion on any machine.
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

const PROXY_MATERIAL = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

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

// Occluder stand-ins with the geometry a mesh had before any tessellation, double-sided so wall planes block from either face.
function buildProxies(meshes) {
  return meshes.map((mesh) => {
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    const proxy = new THREE.Mesh(mesh.geometry, PROXY_MATERIAL);
    proxy.matrixAutoUpdate = false;
    proxy.matrix.copy(mesh.matrixWorld);
    proxy.matrixWorld.copy(mesh.matrixWorld);
    const sphere = mesh.geometry.boundingSphere.clone().applyMatrix4(mesh.matrixWorld);
    return { source: mesh, mesh: proxy, sphere };
  });
}

// Visibility at one surface point: 1 is fully open, lower is more occluded. A hit counts less the farther away it lands, so near geometry pools deep and distant geometry only shades.
function sampleVisibility(raycaster, proxies, origin, normal, directions, opts, excludeSource) {
  const targets = [];
  for (const proxy of proxies) {
    if (proxy.source === excludeSource) continue;
    if (origin.distanceTo(proxy.sphere.center) <= proxy.sphere.radius + opts.radius) targets.push(proxy.mesh);
  }
  if (targets.length === 0) return { visibility: 1, rays: 0 };
  const { tangent, bitangent } = tangentBasis(normal);
  const direction = new THREE.Vector3();
  let blocked = 0;
  for (const local of directions) {
    direction.set(0, 0, 0)
      .addScaledVector(tangent, local.x)
      .addScaledVector(normal, local.y)
      .addScaledVector(bitangent, local.z)
      .normalize();
    raycaster.set(origin, direction);
    raycaster.far = opts.radius;
    const hits = raycaster.intersectObjects(targets, false);
    if (hits.length > 0) blocked += 1 - hits[0].distance / opts.radius;
  }
  const visibility = Math.min(1, Math.max(opts.minVisibility, 1 - opts.intensity * (blocked / directions.length)));
  return { visibility, rays: directions.length };
}

// Subdivide authored planes and boxes so per-vertex occlusion has somewhere to live; spheres and cylinders already carry enough vertices.
function tessellate(mesh, step) {
  const geometry = mesh.geometry;
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
  const raycaster = new THREE.Raycaster();
  const directions = hemisphereDirections(opts.samples);
  const groundDirections = hemisphereDirections(opts.groundSamples);

  // Proxies first, from the geometry as authored, before tessellation fattens it.
  const proxies = buildProxies(occluders);

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
    const record = { mesh, geometry: geometryBefore, material: mesh.material };
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const colors = new Float32Array(position.count * 3);

    for (let i = 0; i < position.count; i++) {
      worldPosition.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      normal.fromBufferAttribute(normalAttribute, i).applyMatrix3(normalMatrix).normalize();
      origin.copy(worldPosition).addScaledVector(normal, 0.02);
      const { visibility, rays } = sampleVisibility(raycaster, proxies, origin, normal, directions, opts, mesh);
      raysCast += rays;
      colors[i * 3] = visibility;
      colors[i * 3 + 1] = visibility;
      colors[i * 3 + 2] = visibility;
      vertices++;
      visibilitySum += visibility;
      if (visibility < visibilityMin) visibilityMin = visibility;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
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
          const { visibility, rays } = sampleVisibility(raycaster, proxies, origin, up, groundDirections, opts, floorMesh);
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
      meshes: bakedMeshes.length,
      occluders: occluders.length,
      durationMs: Math.round(durationMs * 10) / 10,
      meanVisibility: vertices > 0 ? Math.round((visibilitySum / vertices) * 1000) / 1000 : 1,
      minVisibilityObserved: Math.round(visibilityMin * 1000) / 1000
    },
    options: { radius: opts.radius, samples: opts.samples, intensity: opts.intensity, minVisibility: opts.minVisibility, tessellation: opts.tessellation, groundTexture: opts.groundTexture, groundResolution: opts.groundResolution, groundSamples: opts.groundSamples }
  };
}

// Undo a bake: restore original geometry and material, drop the colour channel and the ground texture mesh.
export function clearBakedAmbientOcclusion(state) {
  if (!state) return;
  for (const record of state.bakedMeshes) {
    const current = record.mesh.geometry;
    if (current.attributes.color) current.deleteAttribute('color');
    if (current !== record.geometry) current.dispose();
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
