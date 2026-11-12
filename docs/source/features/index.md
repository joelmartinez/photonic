---
template: Default
title: Features
subtitle: "The headline features: pose overlay, 3D skeleton, virtual camera, WebXR, and splats."
---

# Features

## The pose overlay over video

`PhotonicOverlay` draws a pose skeleton over a video element with a transparent, resolution-independent canvas that exactly covers the video's content area — no background, no grid, and no debug marks by default. Poses arrive in normalized video coordinates, as a name-keyed object, a COCO 17 array, or a joints/keypoints wrapper, and the drawing is an exact function of the latest pose, so the overlay adds no jitter of its own. The default style is a clean production look: translucent outlined cylinders for bones and glowing joint spheres, in a cyan-blue scheme, with every style value overridable.

```js
import { PhotonicOverlay } from '@codecube/photonic';

const overlay = new PhotonicOverlay(stageElement, { video: videoElement });
overlay.setPose(pose);
overlay.setTargetPose(targetPose);  // turns on the deviation display below
overlay.start();
```

Setting a target pose turns on the deviation display. Each joint and bone recolors by how far the measured pose sits from the target — cyan at rest, blending through yellow, to red past the alert threshold — and an arrow glyph at each joint points along its 3D offset vector, so a reader can compare color-only against arrows. Two honesty cues ride along. A joint the pose carries but the camera did not measure renders as a hollow wireframe marker instead of a filled joint, so not-measured never looks measured. And an offset that points mostly toward or away from the camera, whose arrow would project to almost nothing, draws a ring at the joint that grows toward the camera and shrinks away from it.

### The overlay, running live

The stage below is the real overlay over a synthetic video feed — an animated canvas standing in for a camera, so the demo needs no device. The figure's left wrist and right knee sit off their targets and carry arrows; the right wrist's offset points at the camera and the left knee's away from it, so rings carry those two; the left elbow and left ankle are below the confidence threshold and render hollow. The checkboxes call the overlay's own toggles.

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
    <div id="ph-overlay-stage" class="live-stage">
        <video id="ph-overlay-video" autoplay muted playsinline></video>
    </div>
    <div class="live-controls">
        <label><input type="checkbox" id="ph-toggle-arrows" checked> Offset arrows</label>
        <label><input type="checkbox" id="ph-toggle-deviation" checked> Color by deviation</label>
        <label><input type="checkbox" id="ph-toggle-hollow" checked> Hollow joints</label>
        <label><input type="checkbox" id="ph-toggle-rings" checked> Depth rings</label>
    </div>
    <p id="ph-overlay-status" class="live-status">Loading the live demo...</p>
</div>

<script type="module" src="../assets/demos/overlay-demo.js"></script>

## The 3D skeleton

`PhotonicSkeleton` draws the same pose inside a `PhotonicScene` or any Three.js scene, in world units and in the same cyan-blue look. The not-seen rule is stronger in 3D, because a faint solid bone reads as a real limb from most angles: a bone that touches an unmeasured joint is drawn as a gray dashed line, and that joint is a hollow wireframe sphere, so an absent or low-confidence limb reads as not measured from any camera angle. The repo's skeleton demo shows a standing figure whose unmeasured right leg renders dashed.

```js
import { PhotonicSkeleton } from '@codecube/photonic';

const skeleton = new PhotonicSkeleton(scene);
skeleton.setPose(pose);
skeleton.getBoneState('right_knee', 'right_ankle');  // 'seen', 'dashed', or null
```

## The virtual camera

`PhotonicVirtualCamera` emits any scene as a live `MediaStream` a consumer can use as a camera source in the browser: build one from a `PhotonicScene`, from a canvas, or from a `PhotonicOverlay` with its video for the full video-plus-overlay composite, call `getStream()`, and hand the stream to a video element, a WebRTC peer connection, or the built-in `startRecording` / `stopRecording` pair, which returns a playable recording.

```js
import { PhotonicVirtualCamera } from '@codecube/photonic';

const camera = PhotonicVirtualCamera.fromScene(scene);
videoElement.srcObject = camera.getStream();
```

The labeling is honest, in the docs and in the code: this is a browser captured stream, not an OS-level virtual camera device. It does not show up in other apps or in a camera picker, and a device like that would need a separate native companion. What it does, it does cleanly: anything the engine renders can become a live feed inside the browser — a pose review streamed as the clean skeleton view, a scene streamed as a spectator feed.

## WebXR

Every scene carries the XR path with it. `scene.enterXR()` opens an immersive session from the scene's default view, so the viewer starts where the desktop camera was looking; the control system hands movement to the headset while presenting; and the grading chain steps aside for the session, because the post-processing composer is a flat-screen chain. Session state is observable through `getXRState()` and `onXRStateChange(...)`, and the engine's focus is the headsets its consumers run on — Quest and Vision Pro class devices through the standard WebXR API.

## Gaussian splats

`scene.loadSplat({ url })` brings a captured space into a scene through the Spark renderer, in .spz, .ply, .splat, or .ksplat form. The splat camera heuristics read the cloud and place the opening camera at a plausible floor and eye height, and from there the splat is ordinary scene content: modules can build around it, lights and objects join it, and the camera handoff carries it into XR like anything else the engine draws.
