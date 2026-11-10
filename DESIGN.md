# Photonic — design as extracted (2026-11-05)

## What it is
A Three.js-based (peer: three ^0.170.0) scene engine and module runtime for the web.
A host page loads the engine; scene *modules* are discovered and loaded by name
(in the SSG, webpack auto-discovers them and /viz/ selects via `?module=`), each module
gets the same starting pose on desktop and in immersive WebXR ("camera handoff"), and
`window.Photonic` is exposed for console-driven prototyping.

## Engine map (src/, from SSG frontend/src/viz/)
- `PhotonicScene.js` (~33 KB, the core) — scene graph wrapper with a high-level
  authoring API (boxes, spheres, planes, arrows, materials, lights, placement) and
  `loadSplat()` for Gaussian splats via `@sparkjsdev/spark` (.spz/.ply/.splat/.ksplat).
- `PhotonicRenderer.js` — render loop / renderer setup.
- `PhotonicCamera.js` + `xrPoseMath.js` — camera model and the desktop→XR pose handoff math.
- `PhotonicXRManager.js` — WebXR session lifecycle (Quest / Vision Pro focus).
- `PhotonicControlSystem.js` + `PhotonicInput.js` (~20 KB) — controls and input
  (OrbitControls / PointerLockControls from three examples).
- `PhotonicGrid.js` — debug grid/floor helpers.
- `PhotonicSceneLoader.js` — module loading.
- `splatCameraHeuristics.js` (~15 KB) — infers floor plane and eye height from a
  splat cloud so scenes start at a believable viewpoint automatically.
- `index.js`, `moduleSelector.js`, `viewportScroll.js` — the SSG /viz/ page wiring
  (host glue, not engine; first candidates to separate in the library spin-off).

## Module contract (examples/modules/)
Modules define scene content against the engine API with Load/Update/Unload-style
lifecycle hooks, a default viewer pose, click handlers, and parent-child object
attachment. `splat.js` is the reference splat module: config via
`window.PhotonicSplatConfig` (asset url/format, transform, move speed, autoCamera).

## Known couplings — decoupling backlog for the spin-off
1. `src/index.js` imports the Modulation workstream (`../modulation/index.js`,
   frame context) — host glue coupling, not engine.
2. `examples/modules/audio-demo.js` and `synth-designer.js` depend on the Sonance /
   Modulation workstreams (`SonanceSceneManager`, `createPhotonicFrameContext`) that
   are NOT part of Photonic; they were extracted as-is for reference and will not run
   standalone until those are stubbed or the modules are trimmed to engine-only.
3. Example modules import engine helpers via SSG-relative paths (`../viz/...`);
   in this repo the engine is `src/` — import remapping is part of the first
   packaging task, deliberately not done during faithful extraction.
4. Module discovery is webpack-based in the SSG; the standalone library needs its
   own loader story (the SceneLoader is the seam).

## Intended consumers
- The Vomitorium (WebXR endurance experience) — builds on this engine + splat pipeline.
- Eventually: a published npm package (owner's call, later).
