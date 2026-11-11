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

Resolved by D2 (2026-11-10), which executed design/DECOUPLING-PLAN.md in full. That plan is the record: it inventories eleven verified couplings (C1 to C11) and their fixes. In short, the library entry now exports the engine only with no host-page wiring and no Modulation import, relative imports carry .js extensions, the loader loads ES modules with dynamic import() from a configurable base instead of the host's script path, the demo host page and its selector helpers live under examples/host-page/, Spark is pinned and its error text names this package, the supported examples export their lifecycle functions, splat takes its asset only from its config, and audio-demo and synth-designer sit in examples/unsupported/ because they belong to the Sonance and Modulation workstreams. The standalone-consumption test in the plan passes; its evidence is in PROGRESS.md.

## Intended consumers
- The Vomitorium (WebXR endurance experience) — builds on this engine + splat pipeline.
- Eventually: a published npm package (owner's call, later).

## Feature requirements added 2026-11-10 (Joel)

**Clean overlay rendering.** Photonic must render a clean overlay composited over live video: pose skeletons and similar annotation graphics drawn over a camera feed with crisp, resolution-independent lines and joints, stable frame to frame (no jitter or flicker beyond the data itself), configurable styling, and no debug cruft in the default appearance. This is the rendering path the KataPose visualization uses over the student's camera view, and it must stay clean enough to show to end users, not just developers.

**Virtual camera mode.** A Photonic scene — including the video-plus-overlay composite — must be emittable as a video stream a consumer can use as a camera source: in the browser this is a captured stream of the rendered output (canvas capture into a MediaStream, usable by WebRTC, recording, or downstream apps that accept a stream). A true OS-level virtual camera device would need a native companion and is explicitly a later, separate piece; the engine's job is to produce the stream cleanly and label the mode honestly. Consumers decide what the virtual camera shows: a KataPose creator might stream the clean skeleton view as their class camera feed; a Vomitorium run might stream the spectator view.
