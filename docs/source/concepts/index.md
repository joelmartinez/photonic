---
template: Default
title: Concepts
subtitle: "The ideas the library is built from: scenes, handles, modules, and the camera handoff."
---

# Concepts

## A scene owns the loop

A `PhotonicScene` is built over one container element and owns everything a page would otherwise wire up by hand: the Three.js scene, the renderer, the camera rig, the floor and grid, the default lights, the input and control systems, the XR manager, and the render loop, which starts the moment the scene is constructed. The page's job is content: create objects, place the camera, and react to frames. Cleanup is one call — `scene.dispose()` stops the loop and releases the lot.

## Handles, not meshes

Every create call returns a handle, not a raw mesh. A handle moves its object (`setPosition`, `setRotation`, `setScale`), reports where it is (`getPosition`, `getRotation`), restyles it, and removes it. That indirection is deliberate: scene code stays in authoring vocabulary, the engine stays free to change how an object is built underneath, and scene modules — which run against many host pages — never depend on Three.js object shapes. When a scene genuinely needs the underlying world, `scene.THREE` and the scene's own properties are right there; the handle API is the front door, not a wall.

## Scene modules: linkable scenes

A host page rarely wants one hard-coded scene. Photonic's answer is the scene module: an ordinary ES module that exports four things.

- `Load(scene)` builds the scene's content against the scene API and may return a state object.
- `Update(scene, state, deltaTime)` runs every frame with the state `Load` returned.
- `Unload(scene, state)` tears the content down when the host switches scenes.
- `Metadata` names and describes the scene for selectors and listings.

Modules load by name through `PhotonicSceneLoader`, which resolves the name against a configurable base URL (or an explicit name-to-URL map) and imports it natively at runtime. A module written for one host page therefore works on any other host page — that is the pattern the /viz surface of codecube.net runs on, with a selector switching between scenes that were never bundled together. The library-usage page runs this live: the box and solar-system modules from the repo's own examples, loaded by name on this page.

## The camera handoff

Photonic scenes are meant to be entered, not just viewed. The camera lives on a rig, and the pose math in the engine captures where the viewer is standing on the desktop so that entering a WebXR session starts from the same place and viewpoint instead of snapping to an origin. `setDefaultView` records the scene's intended starting pose, the XR manager handles session entry and exit, and the control system swaps between orbit controls on the desktop, pointer-lock movement when a scene asks for it, and the headset's own tracking while presenting — one scene, three ways of standing in it.

## The output step: grading, shadows, and occlusion

A Photonic frame is graded, not raw. Three choices run by default on every scene: ACES filmic tone mapping, so bright colors roll off instead of clipping to flat saturation; a pixel-ratio cap of 2, so high-density displays do not pay for sharpness past the visible gain; and real shadows, because the default directional light casts and the object creators set cast and receive flags on what they build. On top of that, a scene can opt into a post-processing chain — render pass, GTAO ambient occlusion, output pass — which darkens the contact areas where objects meet surfaces. The chain costs frames, so it is off by default, it is a scene-level switch, and it steps aside on its own while a WebXR session is presenting, because the composer is a flat-screen chain. The library-usage page runs all of this live.

## Splats as scenes

Gaussian splats are first-class scene content: `scene.loadSplat(...)` loads a .spz, .ply, .splat, or .ksplat asset through the Spark renderer, and the engine's splat camera heuristics infer a floor plane and an eye height from the point cloud so a captured room starts at a believable viewpoint instead of inside a wall. A splat scene is still a Photonic scene — modules, lights, and the camera handoff all apply around it.

## Poses have two stages

Pose data gets two renderers because it has two homes. Over a camera feed, `PhotonicOverlay` draws the skeleton on a transparent canvas that exactly covers the video's content area, in normalized video coordinates, so the drawing is resolution-independent and adds no jitter of its own. Inside a 3D scene, `PhotonicSkeleton` draws the same pose in world units. Both share one honesty rule: a joint the camera did not measure must look unmeasured — a hollow wireframe marker in the overlay, a gray dashed bone and a hollow joint in 3D — never a faint version of the confident drawing, which a reader would mistake for a real measurement.
