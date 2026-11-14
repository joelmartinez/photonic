/**
 * PhotonicModelLoader - Load an existing model file for a Photonic scene (roadmap F13, extended by F14).
 *
 * Formats: glTF/GLB through Three's GLTFLoader, STL (binary and ASCII) through STLLoader, and OBJ through OBJLoader with its MTL material file where the format carries one. Every loader is lazy-loaded on first use the way loadSplat lazy-loads Spark, so the core bundle and the Node import of the library entry never carry them. PhotonicScene.loadModel is the usual entry point; these helpers are exported for callers who want a parsed result raw.
 */

// Resolve the model source a load call was given: a URL string, an options bag, raw data (an ArrayBuffer or a glTF JSON string), or a Blob/File of model bytes.
export function resolveModelSource(source, options = {}) {
  let url = null;
  let data = null;
  if (typeof source === 'string') {
    url = source;
  } else if (source instanceof ArrayBuffer) {
    data = source;
  } else if (typeof Blob !== 'undefined' && source instanceof Blob) {
    data = source;
  } else if (source && typeof source === 'object') {
    url = source.url ?? source.href ?? null;
    data = source.data ?? source.buffer ?? null;
  }
  if (options.url) url = options.url;
  if (options.data !== undefined && options.data !== null) data = options.data;
  if (options.buffer !== undefined && options.buffer !== null) data = options.buffer;
  return { url, data };
}

// Normalize a caller-named format ('.STL', 'OBJ', ...) to its short name, or null when it names no supported format.
export function normalizeModelFormat(format) {
  if (typeof format !== 'string') return null;
  const name = format.trim().toLowerCase().replace(/^\./, '');
  if (name === 'gltf' || name === 'glb' || name === 'stl' || name === 'obj') return name;
  return null;
}

// The format a URL names, from its extension: 'glb', 'gltf', 'stl', or 'obj', or null when the extension names none of them.
function formatForUrl(url) {
  if (typeof url !== 'string') return null;
  const match = /\.(glb|gltf|stl|obj)($|[?#])/i.exec(url);
  return match ? match[1].toLowerCase() : null;
}

// The format raw model bytes name, sniffed from their content: the glTF binary magic, an STL's opening or its binary size equation, a JSON opening for glTF, or OBJ's line keywords. Returns null when nothing matches.
function formatForData(data) {
  let bytes = null;
  let text = null;
  if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else if (typeof data === 'string') {
    text = data;
  } else if (data && ArrayBuffer.isView(data)) {
    bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (bytes) {
    if (bytes.byteLength >= 4 && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true) === 0x46546c67) return 'glb'; // 'glTF' little-endian
    text = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 1024));
  }
  if (typeof text === 'string') {
    const head = text.replace(/^\uFEFF/, '').trimStart();
    if (/^solid(\s|$)/i.test(head)) return 'stl'; // an ASCII STL opens with its solid name
    if (head.startsWith('{')) return 'gltf';
    if (/(^|\n)\s*(v|vn|vt|f|o|g|mtllib|usemtl)\s/.test(text)) return 'obj';
  }
  if (bytes && bytes.byteLength >= 84) {
    // A binary STL's length is exact: an 80-byte header, a triangle count, then 50 bytes a triangle.
    const count = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true);
    if (count > 0 && 84 + count * 50 === bytes.byteLength) return 'stl';
  }
  return null;
}

// The format a source names: an explicit options.format wins, then the URL's extension, then the data's own content, with 'gltf' as the default the parse path has always used.
export function modelFormatFor(url, data, explicitFormat = null) {
  return normalizeModelFormat(explicitFormat) || formatForUrl(url) || formatForData(data) || 'gltf';
}

// Model data as an ArrayBuffer: Blobs read out, strings encode as UTF-8, views narrow to their bytes.
async function dataToArrayBuffer(data) {
  if (data instanceof ArrayBuffer) return data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) return data.arrayBuffer();
  if (typeof data === 'string') return new TextEncoder().encode(data).buffer;
  if (data && ArrayBuffer.isView(data)) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  throw new Error('model data must be an ArrayBuffer, a Blob, or a string');
}

// Model data as text: strings pass through, Blobs read out, buffers decode as UTF-8.
async function dataToText(data) {
  if (typeof data === 'string') return data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) return data.text();
  const buffer = await dataToArrayBuffer(data);
  return new TextDecoder('utf-8').decode(buffer);
}

// Count the meshes under a parsed root, the same walk the scene's adoption uses.
function countMeshes(root) {
  let count = 0;
  if (root && typeof root.traverse === 'function') root.traverse((child) => { if (child.isMesh) count++; });
  else if (root && root.isMesh) count = 1;
  return count;
}

// Load and parse a glTF/GLB model file. Returns the parser's result: the loaded scene graph plus its animations, cameras, and asset metadata. Throws a named error when neither a URL nor data is given, or when the file cannot be fetched or parsed.
export async function loadGLTFModel(source, options = {}) {
  const { url, data } = resolveModelSource(source, options);
  if (!url && data === null) {
    throw new Error('loadGLTFModel: pass a model URL or model data (options.url / options.data)');
  }

  let GLTFLoader;
  try {
    ({ GLTFLoader } = await import('three/addons/loaders/gltfloader.js'));
  } catch (err) {
    throw new Error(`loadGLTFModel: failed to load the glTF loader from three/addons – ${err.message}. Ensure three is installed and its addons path resolves (three/addons/ in an import map, or the three package's own exports).`);
  }

  const loader = new GLTFLoader();
  if (options.resourcePath) loader.setResourcePath(options.resourcePath);
  if (options.dracoDecoderPath) {
    try {
      const { DRACOLoader } = await import('three/addons/loaders/dracoloader.js');
      const draco = new DRACOLoader();
      draco.setDecoderPath(options.dracoDecoderPath);
      loader.setDRACOLoader(draco);
    } catch (err) {
      throw new Error(`loadGLTFModel: failed to load the Draco decoder loader – ${err.message}`);
    }
  }

  const label = url || 'model data';
  try {
    if (data !== null) {
      const bytes = typeof Blob !== 'undefined' && data instanceof Blob ? await data.arrayBuffer() : data;
      return await new Promise((resolve, reject) => {
        loader.parse(bytes, options.resourcePath || '', resolve, reject);
      });
    }
    return await loader.loadAsync(url, options.onProgress || undefined);
  } catch (err) {
    const wrapped = new Error(`loadGLTFModel: failed to load model from "${label}" – ${err?.message || err}`);
    wrapped.cause = err;
    throw wrapped;
  }
}

// Load and parse an STL model file, binary or ASCII. STL carries geometry only — no materials, no hierarchy — so the result's scene is a single Mesh wearing the engine's default material treatment (the addGeometry defaults: a light machine grey, roughness 0.65, metalness 0.15, per-vertex colours honoured when a binary file carries them), which the scene's adoption then treats like any other material: an adoption material override replaces it and the physical options upgrade it. Callers who know the finish can steer that default with color, roughness, and metalness load options. Returns { scene, geometry, format, url, meshCount, hasColors, animations, cameras, asset } in the shape scene.loadModel adopts.
export async function loadSTLModel(source, options = {}) {
  const { url, data } = resolveModelSource(source, options);
  if (!url && data === null) {
    throw new Error('loadSTLModel: pass a model URL or model data (options.url / options.data)');
  }

  let STLLoader, THREE;
  try {
    ({ STLLoader } = await import('three/addons/loaders/stlloader.js'));
    THREE = await import('three');
  } catch (err) {
    throw new Error(`loadSTLModel: failed to load the STL loader from three/addons – ${err.message}. Ensure three is installed and its addons path resolves (three/addons/ in an import map, or the three package's own exports).`);
  }

  const loader = new STLLoader();
  const label = url || 'model data';
  let geometry;
  try {
    if (data !== null) {
      geometry = loader.parse(await dataToArrayBuffer(data));
    } else {
      geometry = await loader.loadAsync(url, options.onProgress || undefined);
    }
  } catch (err) {
    const wrapped = new Error(`loadSTLModel: failed to load model from "${label}" – ${err?.message || err}`);
    wrapped.cause = err;
    throw wrapped;
  }
  if (!geometry || !geometry.attributes || !geometry.attributes.position) {
    throw new Error(`loadSTLModel: the model from "${label}" parsed without geometry`);
  }

  const hasColors = Boolean(geometry.hasColors || geometry.attributes.color);
  const material = new THREE.MeshStandardMaterial({
    color: options.color !== undefined ? options.color : (hasColors ? 0xffffff : 0xb8bcc2),
    roughness: options.roughness ?? 0.65,
    metalness: options.metalness ?? 0.15,
    vertexColors: hasColors,
    ...(options.envMapIntensity !== undefined ? { envMapIntensity: options.envMapIntensity } : {})
  });
  const mesh = new THREE.Mesh(geometry, material);
  return {
    scene: mesh,
    geometry,
    format: 'stl',
    url: url || null,
    meshCount: 1,
    hasColors,
    animations: [],
    cameras: [],
    asset: null
  };
}

// The material libraries an OBJ text names on its mtllib lines, as file names in order.
function objMaterialLibraries(text) {
  const libraries = [];
  for (const match of text.matchAll(/^\s*mtllib\s+(.+)$/gm)) {
    for (const name of match[1].trim().split(/\s+/)) {
      if (name && !libraries.includes(name)) libraries.push(name);
    }
  }
  return libraries;
}

// Load and parse an OBJ model file, with its MTL material file where the format carries one. The OBJ text's own mtllib names resolve against the OBJ's folder (or options.resourcePath); a caller can instead name the material file with options.mtlUrl, supply its text with options.mtlData, or turn material loading off with options.loadMaterials: false. A material file that cannot be loaded does not fail the model: the geometry still arrives, with the OBJ loader's own default materials, the same standing a glTF model keeps when its materials are plain. Returns { scene, format, url, meshCount, materialLibraries, animations, cameras, asset } in the shape scene.loadModel adopts; the scene is the loader's Group, whose children are the file's objects and groups with their materials applied.
export async function loadOBJModel(source, options = {}) {
  const { url, data } = resolveModelSource(source, options);
  if (!url && data === null) {
    throw new Error('loadOBJModel: pass a model URL or model data (options.url / options.data)');
  }

  let OBJLoader, MTLLoader;
  try {
    ({ OBJLoader } = await import('three/addons/loaders/objloader.js'));
    ({ MTLLoader } = await import('three/addons/loaders/mtlloader.js'));
  } catch (err) {
    throw new Error(`loadOBJModel: failed to load the OBJ loader from three/addons – ${err.message}. Ensure three is installed and its addons path resolves (three/addons/ in an import map, or the three package's own exports).`);
  }

  const label = url || 'model data';
  let text;
  try {
    if (data !== null) {
      text = await dataToText(data);
    } else {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
      text = await response.text();
      if (typeof options.onProgress === 'function') {
        try { options.onProgress({ loaded: text.length, total: text.length }); } catch { /* a progress callback never fails a load */ }
      }
    }
  } catch (err) {
    const wrapped = new Error(`loadOBJModel: failed to load model from "${label}" – ${err?.message || err}`);
    wrapped.cause = err;
    throw wrapped;
  }

  const materialLibraries = objMaterialLibraries(text);
  const basePath = options.resourcePath || (url ? url.slice(0, url.lastIndexOf('/') + 1) : '');

  let materials = null;
  if (options.loadMaterials !== false) {
    try {
      const mtlLoader = new MTLLoader();
      if (basePath) mtlLoader.setResourcePath(basePath);
      if (options.mtlData !== undefined && options.mtlData !== null) {
        materials = mtlLoader.parse(await dataToText(options.mtlData), basePath);
      } else {
        const mtlUrl = options.mtlUrl || options.materialsUrl || null;
        const names = mtlUrl ? [mtlUrl] : materialLibraries.map((name) => (/^([a-z]+:)?\/\//i.test(name) || name.startsWith('/') || name.startsWith('data:') ? name : basePath + name));
        for (const name of names) {
          const creator = await mtlLoader.loadAsync(name);
          if (!materials) materials = creator;
          else if (creator && creator.materialsInfo) Object.assign(materials.materialsInfo, creator.materialsInfo);
        }
      }
      if (materials) materials.preload();
    } catch (err) {
      if (options.mtlUrl || options.materialsUrl || (options.mtlData !== undefined && options.mtlData !== null)) {
        const wrapped = new Error(`loadOBJModel: failed to load the material file for "${label}" – ${err?.message || err}`);
        wrapped.cause = err;
        throw wrapped;
      }
      materials = null; // an mtllib the file names but the server lost: the geometry still loads
    }
  }

  let group;
  try {
    const loader = new OBJLoader();
    if (materials) loader.setMaterials(materials);
    group = loader.parse(text);
  } catch (err) {
    const wrapped = new Error(`loadOBJModel: failed to parse model from "${label}" – ${err?.message || err}`);
    wrapped.cause = err;
    throw wrapped;
  }
  if (!group) {
    throw new Error(`loadOBJModel: the model from "${label}" parsed without a scene`);
  }
  return {
    scene: group,
    format: 'obj',
    url: url || null,
    meshCount: countMeshes(group),
    materialLibraries,
    animations: [],
    cameras: [],
    asset: null
  };
}
