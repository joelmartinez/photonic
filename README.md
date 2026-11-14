# Photonic

Browser-native 3D experience layer: linkable scene modules, approachable scene authoring,
camera handoff between desktop and immersive WebXR, and Gaussian-splat scene support.

## Provenance
Extracted 2026-11-05 at the owner's direction from `joelmartinez/Static-Site-Generator`,
where Photonic lives integrated into codecube.net (it powers the site's /viz/ surface):
- `src/` ← `frontend/src/viz/` — the engine (PhotonicScene, Renderer, Camera, XRManager,
  ControlSystem, Input, Grid, SceneLoader, pose math, splat camera heuristics).
- `examples/modules/` ← `frontend/src/photonics/` — scene modules written against the
  engine (box, liminal, solar-system, splat, audio-demo, synth-designer).
- `extraction-notes/` ← the SSG frontend package.json and webpack config at extraction
  time (dependency and module-discovery reference).
Files were byte-identical to the source at extraction. The decoupling work (roadmap item D2, plan in design/DECOUPLING-PLAN.md) has since severed every host coupling: the library entry in src/index.js exports the engine only, the module loader uses dynamic import() from a configurable base, and the examples below run standalone. This library is MIT licensed (see LICENSE). Its canonical repo
lives on this machine; the public GitHub repo joelmartinez/photonic is its mirror.
It is the future npm library (publishing only on Joel's word) and the rendering
foundation for the Vomitorium and for the KataPose platform's pose visualization.

## Consuming Photonic before npm publishing

Until Photonic is published to npm, consumers work with an assumed peer checkout: the photonic repo sits in a sibling folder next to the consuming project (same parent folder), and the consumer references it by relative path under its package name — in package.json, `"@codecube/photonic": "file:../photonic"`. Imports stay `from "@codecube/photonic"` everywhere, so switching to the published package later is a one-line dependency change with no code edits. On Muse's machine all repos already live side by side in ~/workspace/repos/, so the layout holds as-is.

## Quickstart

Install the package and its three peer dependency in your own project with `npm install @codecube/photonic three@^0.170.0` (until the first publish, use the peer checkout described above instead; the import code below is identical either way). Photonic is an ES module package with no build step, and a browser page resolves the bare `three` and `@codecube/photonic` names with an import map like this one, which points both names into the installed node_modules:

```html
<script type="importmap">
{
  "imports": {
    "three": "./node_modules/three/build/three.module.js",
    "three/addons/": "./node_modules/three/examples/jsm/",
    "three/examples/jsm/": "./node_modules/three/examples/jsm/",
    "@sparkjsdev/spark": "./node_modules/@sparkjsdev/spark/dist/spark.module.js",
    "@codecube/photonic": "./node_modules/@codecube/photonic/src/index.js"
  }
}
</script>
<div id="app" style="width: 100%; height: 100vh"></div>
<script type="module" src="./main.js"></script>
```

The smallest useful scene is a container, one PhotonicScene, and the authoring calls; this is the same code that runs in examples/quickstart/ and that the package checks run from the packed tarball:

```js
import { PhotonicScene } from '@codecube/photonic';

const scene = new PhotonicScene(document.getElementById('app'));
scene.createBox({ width: 1, height: 1, depth: 1, color: 0x38bdf8, position: { x: 0, y: 0.5, z: 0 } });
scene.createSphere({ radius: 0.4, color: 0xfacc15, position: { x: 1.4, y: 0.4, z: 0 } });
scene.setCameraPosition(3, 2, 4);
scene.setCameraTarget(0, 0.5, 0);
```

That page shows a blue box and a yellow sphere on the default floor and grid, lit and orbitable, with the render loop already running; scene modules, splats, WebXR, the overlay, and the virtual camera all build on this same starting point. TypeScript consumers get hand-written declarations for the full public surface with the package (src/index.d.ts, recorded in design/PACKAGING.md), and two feature subpaths keep the headline features importable on their own: `@codecube/photonic/overlay` for PhotonicOverlay and `@codecube/photonic/virtual-camera` for PhotonicVirtualCamera.

## Documentation

The full documentation lives at https://joelmartinez.github.io/photonic/ — concepts, an install guide, the authoring API in detail, and the headline features, with live demos that run the library in the page (the quickstart scene, an authoring demo with the grading controls wired up, the scene loader switching example modules, and the pose overlay over a synthetic feed). The site is a Chloroplast site whose source is the docs/ folder in this repo; it publishes through the workflow in .github/workflows/docs.yml when the repo's GitHub Pages is set to build from Actions.

## Versions and changes

Photonic follows Semantic Versioning, the version in package.json is the single source of truth, and every change that will ship is written into CHANGELOG.md in the same commit that makes it, with breaking changes to the public exports called out in plain words. The current prepared version is 0.1.0; it has not been published to npm yet, because publishing happens only on the owner's explicit word.

## Running the examples standalone

The supported examples are box, solar-system, liminal, and splat, in examples/modules/. They are ordinary ES modules that export Load, Update, Unload, and Metadata, and they also keep a window.PhotonicModules registration as a compatibility shim. Install this package's dependencies plus its three peer dependency, serve this folder with any static file server, and open examples/host-page/index.html, picking a module in the selector or with a ?module=box.js style URL. The demo host page carries an import map that resolves three, three/addons/, and @sparkjsdev/spark into the installed node_modules, which is also the resolution story a standalone consumer page should use. The splat example needs a splat asset supplied through window.PhotonicSplatConfig, because no asset ships with the library, and liminal's ambient audio uses the Sonance engine only when a host page provides it, as an optional integration.

## Clean overlay over video

PhotonicOverlay (src/PhotonicOverlay.js, exported from the library entry) draws a pose skeleton over a video element with a transparent, resolution-independent canvas that exactly covers the video's content area: no background, no grid, and no debug marks by default. Poses are handed to setPose in normalized video coordinates as a name-keyed object, a COCO 17 array, or a joints/keypoints wrapper; the default style is the KataPose MVP look of translucent outlined cylinders for bones and glowing joint spheres in a cyan-blue scheme, and every style value can be overridden. Setting a target pose (or supplying per-joint offsets) turns on the deviation primitives: joints and bones recolor by offset magnitude, and arrow glyphs point along each joint's 3D offset vector. Two honesty cues ride along by default: a joint the pose carries but the camera did not measure renders as a hollow wireframe marker instead of a filled joint, and an offset that points mostly toward or away from the camera, whose arrow would project to almost nothing, draws a ring at the joint that grows toward the camera and shrinks away from it. The full design, coordinate contract, and limits are in design/OVERLAY.md, and examples/overlay-demo/ runs the skeleton over a synthetic video stream with the deviation primitives, the hollow markers, and the depth rings all visible and toggleable.

## 3D skeleton with a not-seen bone style

PhotonicSkeleton (src/PhotonicSkeleton.js, exported from the library entry) draws a pose skeleton inside a PhotonicScene or any THREE scene, in world units and in the same cyan-blue look as the overlay. A bone that touches a joint the pose did not measure is drawn as a gray dashed line instead of a cylinder, and that joint is a hollow wireframe sphere, so an absent or low-confidence limb reads as not measured from any camera angle instead of as a faint solid bone. The full design is in design/SKELETON-3D.md, and examples/skeleton-demo/ shows a standing figure whose unmeasured right leg renders dashed.

## Virtual camera mode (browser stream)

PhotonicVirtualCamera (src/PhotonicVirtualCamera.js, exported from the library entry) emits any scene as a live MediaStream a consumer can use as a camera source in the browser: build one from a PhotonicScene, a canvas, or a PhotonicOverlay with its video for the full video-plus-overlay composite, call getStream(), and hand the stream to a video element, a WebRTC peer connection, or the built-in startRecording / stopRecording pair. This is a browser captured stream, not an OS-level virtual camera device: it does not show up in other apps or in a camera picker, and a device like that would need a separate native companion. The full design, consumer pattern, and honest limits are in design/VIRTUAL-CAMERA.md, and examples/virtual-camera-demo/ shows the overlay composite live in a second video element and records it.

## Grading and ambient occlusion

Every PhotonicScene is graded by default: the renderer runs ACES filmic tone mapping, the pixel ratio is capped at 2 so high-density displays do not pay for sharpness past the visible gain, and both are plain controls on the scene — `scene.setExposure(1.1)` brightens or darkens the graded output, `scene.setToneMapping('aces')` picks the curve (or `'none'` for the old ungraded look), and `scene.setPixelRatioCap(2)` moves the cap. An optional post-processing step adds ground-truth ambient occlusion for contact depth: `scene.enablePostProcessing()` routes rendering through a composer chain (render pass, GTAO pass, output pass) and `scene.disablePostProcessing()` returns to direct rendering; `scene.setPostProcessingOptions({ blendIntensity: 0.8 })` tunes the occlusion strength and radius, and `scene.getPostProcessingInfo()` reports the whole output state. The step is off by default because it costs frames, it can also be requested at construction with `new PhotonicScene(container, { postProcessing: true, exposure: 1.1 })`, and it steps aside on its own while a WebXR session is presenting, because the composer is a flat-screen chain. The full design, defaults, and measured frame cost are in design/F8-GRADING-AO.md.

Static scenes get the more honest occlusion: `scene.bakeAmbientOcclusion()` computes occlusion from the real geometry by ray casting at scene build time — per-vertex on the created objects and authored planes, plus a ground texture that carries contact patches onto the default floor — so a corner gets a deep wide soft pool, an object's contact patch matches its actual size, and open floor stays clean; `scene.getBakedAOInfo()` reports the bake and `scene.clearBakedAmbientOcclusion()` undoes it, and objects that move can be named in the bake's exclude list so they neither receive nor cast baked occlusion. With the bake carrying the static story, the screen-space chain is tuned down to contact darkening for things that move: a wider radius that fades with distance, a wider denoise pass so it is never a hard band, and a blend ceiling it cannot cross toward black. Real shadows do the main grounding work; occlusion is the garnish. The full record is in design/F9-AO.md.

## Adding your own geometry

Scenes are not limited to the shapes the creators know. `scene.addGeometry({ positions, normals, indices, colors })` builds a mesh from raw arrays in the shape external geometry arrives in — positions are required, normals are computed when absent, indices are optional, and colors carries per-vertex colours — while `scene.addMesh(mesh)` adopts a THREE.Mesh, Group, or Object3D the caller built itself, group and all, which is the route a converter that already produces meshes (HootCAD's JSCAD bridge is the first) should take. Both return the same handle the creators return, with the same transforms, material and shadow behaviour, click handlers, and removal, and adopted geometry takes part in everything a created object does, including the baked occlusion above: it occludes, it receives per-vertex darkening (a single solid shades its own recesses, and vertex colours it arrived with are darkened rather than replaced), and the ground texture accounts for it. The full record is in design/F10-F11-EXTERNAL-GEOMETRY.md, and examples/custom-geometry-demo/ runs a JSCAD-shaped machined part — a plate, a boss with a counterbore, a step pad — through both entry points on one stage.

## Physical materials and the studio environment

Clearcoat — the glossy coat over a painted or machined finish — needs a physical material, and Photonic offers one on every material path with the same option shape: `scene.createMaterial({ type: 'physical', clearcoat: 1, clearcoatRoughness: 0.1 })` returns a MeshPhysicalMaterial, `scene.addGeometry({ ..., physical: true, clearcoat: 1 })` builds its default material as one, and `scene.addMesh(mesh, { clearcoat: 0.8 })` gives an adopted mesh's own material the physical surface, copying its colour, roughness, and metalness. Asking for clearcoat by itself selects the physical type, and a physical request with no clearcoat value defaults the coat to fully on, with `clearcoat: 0` as the opt-out. Metals also need something to reflect: `scene.setStudioEnvironment()` builds a neutral studio environment (Three's RoomEnvironment through PMREM) and applies it as the scene's environment, `scene.setEnvironmentIntensity(0.7)` turns that light up or down, `scene.setEnvironment(texture)` adopts a caller's own environment texture, and `scene.clearEnvironment()` and `scene.getEnvironmentInfo()` remove and report it. The full record is in design/F12-PHYSICAL-ENVIRONMENT.md, and examples/physical-materials-demo/ runs a machined part and a painted knob through both states — standard material under direct lights only, then physical under the environment — with toggles and an intensity slider.

## Loading an existing model file

A scene can also take a model that already exists as a file. `await scene.loadModel(url)` fetches and parses the file and adopts the result through the same registration the creators and addMesh use, so the promise resolves to the standard handle: transforms, the file's own hierarchy and materials, shadow flags under the creators' rule, click handlers, removal, and the baked occlusion all work on a loaded model exactly as on a created object, with no second-class path. Three format families load through the one call: glTF/GLB, the web standard, in both its binary (.glb) and JSON (.gltf) forms; STL in both its binary and ASCII encodings; and OBJ with its MTL material file where the format carries one. The format is read from an explicit format option, the URL's extension, or the data's own content. STL carries no materials and no hierarchy, so an STL model arrives as a single mesh wearing the engine's default material (the addGeometry default, with per-vertex colours honoured when a binary file carries them; color, roughness, and metalness load options steer that default, and the usual material override and physical upgrade options apply on top). An OBJ model's groups arrive as named meshes wearing their MTL materials, resolved from the file's own mtllib lines against its folder, or from an mtlUrl or mtlData the caller supplies. The call also takes an options-bag form (`scene.loadModel({ url, ... })`) and a raw-bytes form (`scene.loadModel({ data })` for an ArrayBuffer or Blob the caller already holds), the adoption options addMesh takes (position, rotation, scale, name, shadow overrides, a material override, the physical upgrade options), and loading options of its own (resourcePath for a .gltf file's external resources or an .obj file's material file, dracoDecoderPath for glTF, onProgress, onLoad, onError). The parse result rides on the handle as data: `handle.getModelInfo()` reports the format honestly per file, the source URL, the animation clips and cameras the file carried, its asset metadata, and its mesh count, plus an OBJ file's material libraries and an STL file's colour flag. Animations are carried, not played — a consumer drives a standard THREE.AnimationMixer over handle.getMesh() when it wants a clip to move. The lower-level helpers are exported as loadGLTFModel, loadSTLModel, and loadOBJModel for callers who want a parser's raw result. The full records are in design/F13-MODEL-LOADING.md and design/F14-MODEL-FORMATS.md, and examples/model-loader-demo/ loads a real .glb reference part (hierarchy, three materials, one animation), a binary and an ASCII STL, and an OBJ knob with its material file onto one plinth and bakes occlusion over all of them.

Two extracted modules, audio-demo and synth-designer, sit in examples/unsupported/ and do not run standalone. They depend on the Sonance and Modulation workstreams, which are not part of Photonic. They are kept for reference, with the reason and a possible salvage path written in that folder.
