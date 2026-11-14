/**
 * PhotonicModelLoader - Load an existing model file for a Photonic scene (roadmap F13).
 *
 * First format: glTF/GLB, the web standard, through Three's GLTFLoader, lazy-loaded
 * on first use the way loadSplat lazy-loads Spark, so the core bundle and the Node
 * import of the library entry never carry it. PhotonicScene.loadModel is the usual
 * entry point; this helper is exported for callers who want the parsed result raw.
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

// The format a source names, from its extension where it has one: 'glb' for the binary container, 'gltf' otherwise (the JSON form, and the parse path's default).
export function modelFormatFor(url, data) {
  if (data instanceof ArrayBuffer && data.byteLength >= 4) {
    const magic = new DataView(data).getUint32(0, true);
    if (magic === 0x46546c67) return 'glb'; // 'glTF' little-endian
  }
  if (typeof url === 'string' && /\.glb($|[?#])/i.test(url)) return 'glb';
  return 'gltf';
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
