---
template: Default
title: Using the Library
subtitle: The authoring API in detail, with the library running live on the page.
---

# Using the library

## Creating a scene

One import, one container, one scene. Construction starts the render loop, lays down the floor and grid, lights the stage, and fits the renderer to the container.

```js
import { PhotonicScene } from '@codecube/photonic';

const scene = new PhotonicScene(document.getElementById('app'));
```

Construction options ride along when a scene wants them from the first frame: `{ exposure: 1.1 }` sets the graded brightness, `{ toneMapping: 'aces' }` picks the curve, `{ pixelRatioCap: 2 }` moves the cap, and `{ postProcessing: true }` turns the ambient-occlusion chain on immediately. Every one of those also has a setter for later changes, covered under the output controls below.

## Authoring calls and handles

The create calls cover the standard stage vocabulary: `createBox`, `createSphere`, `createCylinder`, `createPlane`, `createWall`, and `createArrow`, plus `createMaterial` and `loadTexture` for surfaces. Options follow one shape — size fields for the geometry, a `color`, a `position`, a `rotation` — and each call returns a handle.

```js
const box = scene.createBox({ width: 1, height: 1, depth: 1, color: 0x38bdf8, position: { x: 0, y: 0.5, z: 0 } });
box.setPosition(0, 1, 0);
box.setRotation(0, Math.PI / 4, 0);
scene.removeObject(box);
```

Per-frame work goes in the frame callback, which receives the delta time and a frame info object; `scene.clearObjects()` empties the stage, and `scene.setRenderingEnabled(false)` pauses drawing without tearing anything down.

## The authoring demo, running live

The stage below runs the real library: the same create calls as above, a spinning box driven by the frame callback, and the output controls wired to the page — the exposure slider calls `scene.setExposure(...)` and the checkbox calls `scene.enablePostProcessing()` and `scene.disablePostProcessing()`. Nothing here is a recording.

<script type="importmap">
{
  "imports": {
    "three": "../assets/photonic/three/build/three.module.js",
    "three/addons/": "../assets/photonic/three/examples/jsm/",
    "three/examples/jsm/": "../assets/photonic/three/examples/jsm/",
    "@sparkjsdev/spark": "../assets/photonic/spark/dist/spark.module.js",
    "@codecube/photonic": "../assets/photonic/photonic/index.js"
  }
}
</script>

<div class="live-example">
    <div id="ph-scene-stage" class="live-stage"></div>
    <div class="live-controls">
        <label>Exposure <input type="range" id="ph-exposure" min="0.3" max="2" step="0.05" value="1"> <span id="ph-exposure-value">1.00</span></label>
        <label><input type="checkbox" id="ph-ao"> Ambient occlusion</label>
    </div>
    <p id="ph-scene-status" class="live-status">Loading the live demo...</p>
</div>

<script type="module" src="../assets/demos/scene-demo.js"></script>

## Camera and controls

`setCameraPosition(x, y, z)` and `setCameraTarget(x, y, z)` place the desktop view, and `getCameraPosition()` and `getCameraTarget()` read it back. Orbit controls are on by default. A scene that wants first-person movement calls `scene.enableFPSControls()` for pointer-lock WASD controls and `disableFPSControls()` to hand the camera back. `setDefaultView({ position, target })` records where a viewer should start — the pose the WebXR handoff carries into a headset session — and `enterXR()` and `exitXR()` drive the session, with `getXRState()` and `onXRStateChange(...)` reporting where things stand.

## Lights and shadows

A new scene already has an ambient light and a directional light, and the directional light casts shadows by default with a 2048-pixel shadow map fitted to the stage. Objects from the create calls cast and receive automatically; casting stays off for transparent or emissive materials, which would otherwise throw false shadows, and both flags can be set per call with `castShadow` and `receiveShadow` options or later through the handle's `setCastShadow` and `setReceiveShadow`. `setAmbientLight(...)` restyles the ambient fill, `createPointLight(...)` and `createSpotLight(...)` add lights of their own — each takes `castShadow` and `shadowMapSize` options and returns a light handle with its own `setCastShadow` switch — and `setBackgroundColor(...)`, `setGridVisible(...)`, and `setFloorVisible(...)` handle the stage dressing.

## The output controls

Grading is a scene-level control surface, mirrored on the renderer for lower-level consumers.

```js
scene.setExposure(1.1);                 // brighten or darken the graded output
scene.setToneMapping('aces');           // 'aces' or 'none' for the old ungraded look
scene.setPixelRatioCap(2);              // cap the renderer's pixel ratio
scene.enablePostProcessing();           // composer chain: render, GTAO, output
scene.setPostProcessingOptions({ blendIntensity: 0.8 });  // occlusion strength, radius, and friends
scene.getPostProcessingInfo();          // the whole output state, as data
scene.disablePostProcessing();          // back to direct rendering
```

The composer chain is off by default because it costs frames — how much depends on the GPU, and the design record in the repo's `design/F8-GRADING-AO.md` states a measured cost with its rig. While a WebXR session is presenting, the scene renders direct no matter what the switch says.

## Loading scene modules

A host page builds one loader over its scene and loads modules by name. The loader resolves a name against its base URL (or an explicit name-to-URL map) and imports the module natively at runtime — the runtime import carries the comments bundlers need to leave it alone, so webpack, Vite, and plain browser pages all load modules the same way.

```js
import { PhotonicScene, PhotonicSceneLoader } from '@codecube/photonic';

const scene = new PhotonicScene(document.getElementById('app'));
const loader = new PhotonicSceneLoader(scene, { moduleBaseUrl: './modules/' });
await loader.loadModule('box.js');
loader.getCurrentModuleName();  // 'box.js'
```

The stage below proves it on this page: the buttons load the repo's own example modules — the spinning box and the solar system — by name, through the loader, against the library copy this site carries.

<div class="live-example">
    <div id="ph-module-stage" class="live-stage"></div>
    <div class="live-controls">
        <button type="button" data-ph-module="box.js">Box</button>
        <button type="button" data-ph-module="solar-system.js">Solar system</button>
    </div>
    <p id="ph-module-status" class="live-status">Loading the live demo...</p>
</div>

<script type="module" src="../assets/demos/module-demo.js"></script>

## Loading a splat

```js
const splat = await scene.loadSplat({ url: './room.spz' });
```

`loadSplat` accepts the Spark-supported formats (.spz, .ply, .splat, .ksplat) and options for the asset's transform and the automatic camera placement. With no direction from the caller, the camera heuristics infer the floor and eye height from the cloud itself, so a captured space opens at standing height facing into the room.

## Adding your own geometry

A scene can take geometry the caller built somewhere else — the case that matters most today is a CAD model produced by another tool, arriving as raw arrays or as ready THREE meshes. Two calls cover both shapes, and both return the same handle the create calls return, with the same transforms, shadow flags, and removal.

```js
// Raw arrays, in the shape a polygon soup arrives in. Normals and indices are
// optional; colors carries per-vertex colours when the source has them.
const part = scene.addGeometry({
  positions,          // xyz triples (required)
  normals,            // optional; computed when absent
  indices,            // optional
  colors,             // optional per-vertex colours
  position: { x: 0, y: 0.08, z: 0 }
});

// Or adopt a mesh — or a whole group — built with THREE directly.
const handle = scene.addMesh(group, { name: 'model' });
handle.setCastShadow(true);
scene.removeObject(handle);
```

Adopted geometry is a full citizen of the scene: it casts and receives shadows under the same rules as a created object, and `scene.bakeAmbientOcclusion()` covers it exactly like one — it occludes its neighbours, it receives per-vertex darkening (a single solid shades its own recesses, such as a bore), vertex colours it arrived with are darkened rather than replaced, and the ground texture accounts for its footprint. The worked example is `examples/custom-geometry-demo/` in the repo, and the full record is in the repo's `design/F10-F11-EXTERNAL-GEOMETRY.md`.

## Physical materials and the studio environment

Clearcoat finishes — glossy paint, coated machined parts — use a physical material, available on every material path with the same options. Metals need an environment to reflect, and the scene can build a neutral studio one.

```js
// The factory, the geometry call, and adoption all take the same shape.
const paint = scene.createMaterial({ type: 'physical', clearcoat: 1, clearcoatRoughness: 0.1 });
const part = scene.addGeometry({ positions, normals, physical: true, clearcoat: 1, metalness: 0.9, roughness: 0.32 });
const knob = scene.addMesh(mesh, { clearcoat: 0.8 }); // upgrades the mesh's own material, colour kept

// A neutral studio environment as image-based light, with its strength as a plain control.
scene.setStudioEnvironment({ intensity: 1 });
scene.setEnvironmentIntensity(0.7);
scene.getEnvironmentInfo(); // { enabled: true, source: 'studio', intensity: 0.7 }
scene.clearEnvironment();
```

The worked example is `examples/physical-materials-demo/` in the repo, and the full record is in the repo's `design/F12-PHYSICAL-ENVIRONMENT.md`.

## Loading a model file

A model that already exists as a file loads with one call. Three format families load through it: glTF/GLB, the web standard, which carries hierarchy and materials; STL in both its binary and ASCII encodings; and OBJ with its MTL material file. The format is read from an explicit `format` option, the URL's extension, or the data's own content, and the parsed model is adopted through the same registration as everything else, so the handle is the standard one — transforms, shadow flags, removal, and the baked occlusion included.

```js
const part = await scene.loadModel('./reference-part.glb', {
  name: 'reference-part',
  position: { x: 0, y: 0.08, z: 0 }
});
part.getModelInfo(); // { format: 'glb', url, animations, cameras, asset, meshCount }
part.setRotation(0, Math.PI / 4, 0);
scene.bakeAmbientOcclusion(); // covers the loaded model like a created object

// STL carries no materials and no hierarchy, so it arrives in the engine's
// default material; colour and finish options steer that default.
const bracket = await scene.loadModel('./bracket.stl', { color: 0xb8bcc2, roughness: 0.65 });

// An OBJ model's groups arrive wearing their MTL materials, resolved from
// the file's own material-library lines against its folder.
const knob = await scene.loadModel('./knob.obj');
knob.getModelInfo(); // { format: 'obj', url, meshCount, materialLibraries: ['knob.mtl'], ... }
```

The options-bag and raw-bytes forms (`scene.loadModel({ url })`, `scene.loadModel({ data })` for an ArrayBuffer or Blob) work the same way, and the exported `loadGLTFModel`, `loadSTLModel`, and `loadOBJModel` helpers return a parser's raw result for callers who manage their own adoption. Animations are carried and reported through getModelInfo, not played; drive a THREE.AnimationMixer over the handle's mesh to play one. The worked example is `examples/model-loader-demo/` in the repo — a glTF reference part, a binary and an ASCII STL, and an OBJ knob with its material file on one plinth — and the full records are in the repo's `design/F13-MODEL-LOADING.md` and `design/F14-MODEL-FORMATS.md`.
