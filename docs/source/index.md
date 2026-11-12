---
template: Default
title: Photonic
subtitle: A browser-native 3D and WebXR scene engine with linkable scene modules.
---

# Welcome to Photonic!

**Photonic** is a browser 3D scene engine built on Three.js. You write a scene with plain authoring calls — create a box, place a light, point the camera — and Photonic handles the render loop, the controls, the desktop-to-headset camera handoff for WebXR, and the output grading. Scenes can also be packaged as linkable modules that a host page loads by name, and the engine carries three headline features on top of the scene core: a clean pose overlay that draws over a video element, a 3D skeleton with an honest not-seen style, and a virtual camera that emits any scene as a live video stream.

Every live demo on this site runs the real library in your browser. There are no screenshots standing in for the engine and no pre-rendered data: the pages carry a copy of the library and its dependencies in the site's own assets, and the demos execute it on the spot.

## Key features

- **Approachable authoring**: one `PhotonicScene` over a container element, with create calls for boxes, spheres, cylinders, planes, walls, arrows, materials, textures, and lights, each returning a handle you can move and restyle.
- **Scene modules**: a scene can be an ordinary ES module exporting `Load`, `Update`, `Unload`, and `Metadata`, loaded by name through the scene loader from a configurable base — the pattern codecube.net's /viz surface runs on.
- **WebXR handoff**: the same scene and the same starting pose work on the desktop and inside an immersive session, with entry and exit handled by the XR manager.
- **Graded output**: ACES filmic tone mapping and a pixel-ratio cap run by default, shadows happen with no hand-wiring, and an optional ambient-occlusion composer chain adds contact depth when a scene wants it.
- **Pose tooling**: `PhotonicOverlay` draws a pose skeleton over video with deviation colors, offset arrows, hollow markers for joints the camera did not measure, and depth rings; `PhotonicSkeleton` draws the same pose inside a 3D scene with a dashed not-seen bone style.
- **Virtual camera**: `PhotonicVirtualCamera` emits a scene, a canvas, or the video-plus-overlay composite as a browser `MediaStream` you can hand to a video element, a WebRTC call, or a recorder.

## The quickstart, running live

The quickstart below is the smallest useful Photonic scene, and the stage under it runs that same code against the real library on this page — a blue box and a yellow sphere on the default floor and grid, lit, shadowed, and orbitable.

```js
import { PhotonicScene } from '@codecube/photonic';

const scene = new PhotonicScene(document.getElementById('app'));
scene.createBox({ width: 1, height: 1, depth: 1, color: 0x38bdf8, position: { x: 0, y: 0.5, z: 0 } });
scene.createSphere({ radius: 0.4, color: 0xfacc15, position: { x: 1.4, y: 0.4, z: 0 } });
scene.setCameraPosition(3, 2, 4);
scene.setCameraTarget(0, 0.5, 0);
```

<script type="importmap">
{
  "imports": {
    "three": "./assets/photonic/three/build/three.module.js",
    "three/addons/": "./assets/photonic/three/examples/jsm/",
    "three/examples/jsm/": "./assets/photonic/three/examples/jsm/",
    "@sparkjsdev/spark": "./assets/photonic/spark/dist/spark.module.js",
    "@codecube/photonic": "./assets/photonic/photonic/index.js"
  }
}
</script>

<div class="live-example">
    <div id="ph-quickstart-stage" class="live-stage"></div>
    <p id="ph-quickstart-status" class="live-status">Loading the live demo...</p>
</div>

<script type="module" src="assets/demos/quickstart-demo.js"></script>

## Explore the documentation

- [Install](install/) — how to get the package, what it needs, and the peer-checkout route that works today.
- [Concepts](concepts/) — scenes, handles, scene modules, the camera handoff, splats, and how the output step grades a frame.
- [Using the library](library-usage/) — the authoring API in detail, the loader, lights and shadows, and the output controls, with live demos.
- [Features](features/) — the pose overlay, the 3D skeleton, the virtual camera, WebXR, and Gaussian splats, with the overlay running live.

The source code can be found here: https://github.com/joelmartinez/photonic
