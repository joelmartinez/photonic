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

## Versions and changes

Photonic follows Semantic Versioning, the version in package.json is the single source of truth, and every change that will ship is written into CHANGELOG.md in the same commit that makes it, with breaking changes to the public exports called out in plain words. The current prepared version is 0.1.0; it has not been published to npm yet, because publishing happens only on the owner's explicit word.

## Running the examples standalone

The supported examples are box, solar-system, liminal, and splat, in examples/modules/. They are ordinary ES modules that export Load, Update, Unload, and Metadata, and they also keep a window.PhotonicModules registration as a compatibility shim. Install this package's dependencies plus its three peer dependency, serve this folder with any static file server, and open examples/host-page/index.html, picking a module in the selector or with a ?module=box.js style URL. The demo host page carries an import map that resolves three, three/addons/, and @sparkjsdev/spark into the installed node_modules, which is also the resolution story a standalone consumer page should use. The splat example needs a splat asset supplied through window.PhotonicSplatConfig, because no asset ships with the library, and liminal's ambient audio uses the Sonance engine only when a host page provides it, as an optional integration.

## Clean overlay over video

PhotonicOverlay (src/PhotonicOverlay.js, exported from the library entry) draws a pose skeleton over a video element with a transparent, resolution-independent canvas that exactly covers the video's content area: no background, no grid, and no debug marks by default. Poses are handed to setPose in normalized video coordinates as a name-keyed object, a COCO 17 array, or a joints/keypoints wrapper; the default style is the KataPose MVP look of translucent outlined cylinders for bones and glowing joint spheres in a cyan-blue scheme, and every style value can be overridden. Setting a target pose (or supplying per-joint offsets) turns on the deviation primitives: joints and bones recolor by offset magnitude, and arrow glyphs point along each joint's 3D offset vector. The full design, coordinate contract, and limits are in design/OVERLAY.md, and examples/overlay-demo/ runs the skeleton over a synthetic video stream with both deviation primitives visible and toggleable.

## Virtual camera mode (browser stream)

PhotonicVirtualCamera (src/PhotonicVirtualCamera.js, exported from the library entry) emits any scene as a live MediaStream a consumer can use as a camera source in the browser: build one from a PhotonicScene, a canvas, or a PhotonicOverlay with its video for the full video-plus-overlay composite, call getStream(), and hand the stream to a video element, a WebRTC peer connection, or the built-in startRecording / stopRecording pair. This is a browser captured stream, not an OS-level virtual camera device: it does not show up in other apps or in a camera picker, and a device like that would need a separate native companion. The full design, consumer pattern, and honest limits are in design/VIRTUAL-CAMERA.md, and examples/virtual-camera-demo/ shows the overlay composite live in a second video element and records it.

Two extracted modules, audio-demo and synth-designer, sit in examples/unsupported/ and do not run standalone. They depend on the Sonance and Modulation workstreams, which are not part of Photonic. They are kept for reference, with the reason and a possible salvage path written in that folder.
