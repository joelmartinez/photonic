# Changelog

All notable changes to Photonic are recorded in this file. The format follows Keep a Changelog, and the project follows Semantic Versioning: the version in package.json is the single source of truth, every release gets a dated section here before it is published, breaking changes to the public exports in src/index.js require a major version bump once the package is past 1.0 (and a minor bump with a clear breaking note while it is still 0.x), and nothing is published to npm except on the owner's explicit word in an interactive session.

## [Unreleased]

## [0.4.0] - 2026-11-13

### Changed

- The engine moves to three 0.187.0 and Spark 2.4.0 (the Dependency Currency roll, 2026-11-13): the three peer requirement is now ^0.187.0, so a consumer on an older three moves with it — that is this minor version's breaking note. Spark moves from ^0.1.10 to ^2.4.0, and the docs site's vendored copies of three and its addons move to 0.187.0 with it.
- `scene.loadSplat()` now creates the scene's SparkRenderer itself, or adopts one the host already added: Spark 2 no longer creates it automatically (0.1's SplatMesh did), and without one splats loaded but never drew. `scene.dispose()` removes and disposes that renderer with the rest of the scene.
- The default shadow map type is PCFShadowMap, named honestly: three 0.187 removed the soft shadow shader path and silently substituted this type for the old PCFSoftShadowMap setting, so the renderer now asks for what it gets. Shadows read marginally crisper than before.

## [0.3.0] - 2026-11-13

### Added

- A public way to add externally supplied geometry to a scene (roadmap F10, requested by HootCAD): `scene.addGeometry({ positions, normals, indices, colors, uvs })` builds a mesh from raw arrays in the shape polygon data arrives in (normals computed when absent, per-vertex colours honoured, a ready BufferGeometry accepted instead), and `scene.addMesh(mesh, options)` adopts a caller-built THREE.Mesh, Group, or Object3D whole. Both return the standard scene handle — transforms, materials, cast and receive shadows under the creators' rule, click handlers, removal through the handle, removeObject, and clearObjects — and a group handle recolours and reflags every mesh inside it. Handles also gain getMesh(), returning the underlying THREE object. Design and verification in design/F10-F11-EXTERNAL-GEOMETRY.md, runnable proof in examples/custom-geometry-demo/.
- Baked ambient occlusion over externally supplied geometry (roadmap F11, requested by HootCAD): the bake now collects every mesh under a registered object (adopted groups included), a single solid occludes itself so a merged CAD part shades its own recesses, vertex colours a geometry arrives with are darkened by the bake and restored exactly on clear instead of being replaced, and adopted geometry's footprint reaches the ground texture like a created object's. The bake's ray casts run against a BVH over the occluders' world-space triangles, so a CAD-sized model stays in the same cost order as the engine's own shapes (about 1.3 seconds for a 38,800-triangle part with the ground pass, measured in the design record), and getBakedAOInfo() reports the occluder triangle count.

### Fixed

- A scene object's handle.remove() now drops the object from the scene's registry as removeObject already did, so a removed object no longer counts in scene.objects or reaches a later bake with disposed geometry.

## [0.2.0] - 2026-11-12

### Added

- Baked ambient occlusion for static scenes, and a retuned screen-space pass (roadmap F9): `scene.bakeAmbientOcclusion()` computes occlusion from the real geometry by ray casting at scene build time — per-vertex on the created objects and authored planes (which are subdivided first, so a corner gets a deep wide soft pool and a contact patch matches the object's actual size), plus a ground texture that carries contact patches onto the engine's default floor — and `scene.clearBakedAmbientOcclusion()` and `scene.getBakedAOInfo()` undo and report it; objects that move can be named in the bake's exclude list so they neither receive nor cast baked occlusion. The GTAO composer chain is retuned down to dynamic contact work: a wider radius with distance falloff, a wider Poisson-denoise softening pass, gentler defaults, and a blend ceiling of 0.85 that no tuning can cross, so the pass can darken a contact but never crush it toward black; real shadows remain the main grounding and occlusion the garnish. Design, defaults, and measured bake and frame costs in design/F9-AO.md, captures in design/evidence/.
- A documentation site (roadmap DOCS): a Chloroplast docs folder in `docs/` (SiteConfig, templates, markdown source pages for the home page, install, concepts, library usage, and features, plus the site menu) following the Modulator library's docs pattern, with a GitHub Actions workflow in `.github/workflows/docs.yml` that builds the site with the Chloroplast docs action and publishes it to GitHub Pages at https://joelmartinez.github.io/photonic/. The pages run the real library live in the reader's browser — the quickstart scene, an authoring demo with working exposure and ambient-occlusion controls, the scene loader switching example modules by name, and the pose overlay over a synthetic feed — from a vendored copy of the library and its dependencies in the site's assets, filename-normalized for the engine's lowercased output by `docs/refresh-vendored.mjs`. The site publishes when the docs and the workflow land on the public repo and Pages is set to build from Actions.
- Grading and ambient occlusion as an engine output step (roadmap F8): the renderer now runs ACES filmic tone mapping by default with an exposure control on the renderer and the scene (`setExposure`, `setToneMapping`, also settable as construction options), the pixel ratio is capped at 2 with a matching control (`setPixelRatioCap`), and an optional composer chain (render pass, GTAO ambient occlusion, output pass) can be turned on with `enablePostProcessing` on the scene or at construction, tuned through `setPostProcessingOptions`, and reported by `getPostProcessingInfo`; the chain is off by default and steps aside while a WebXR session is presenting. Design and measured frame cost in design/F8-GRADING-AO.md, captures in design/evidence/.
- Shadows that happen by default (roadmap F7): the default directional light now casts with a 2048-pixel shadow map and a shadow camera fitted to the stage, the box, sphere, cylinder, and plane creators set cast and receive on the objects they make (casting stays off for transparent or emissive materials, and both flags can be set per call or through the object handle), and the point and spot light creators take castShadow and shadowMapSize options with a matching light-handle switch. A standard scene now shows soft shadows with no hand-wiring; the root-cause record (the filing session's "shadow receiving never happens" report turned out to be a camera-side artifact, verified in design/F7-SHADOWS.md) and the evidence captures live in design/F7-SHADOWS.md and design/evidence/.

## [0.1.1] - 2026-11-11

### Fixed

- The packaged scene loader's runtime import now carries webpack's ignore comment beside the Vite one (roadmap F6, requested by the codecube.net integration project): webpack no longer replaces the loader's dynamic import of a scene URL with an empty context that throws "Cannot find module" for every URL, so webpack-bundled consumers can load scene modules. Vite and Rollup are unaffected.

### Added

- A 3D skeleton with a not-seen bone style (roadmap F3): the new PhotonicSkeleton in src/PhotonicSkeleton.js, exported from the library entry with createSkeleton, normalizeSkeletonPose, and DEFAULT_SKELETON_STYLE, draws a pose in a PhotonicScene or any THREE scene in the same cyan-blue look as the overlay, except that a bone touching an unmeasured joint is a gray dashed line and that joint is a hollow wireframe sphere, so not-measured reads as not-measured from any angle (design in design/SKELETON-3D.md, demo in examples/skeleton-demo/).
- Hollow joint markers in the overlay, first-class (roadmap F4): PhotonicOverlay now renders a present but below-confidence joint as a gray wireframe sphere instead of hiding it, matching the behavior the KataPose Lab carried as a local patch on its vendored copy, with the patch's geometry, color, and opacity as the default style; the marker is on by default and toggleable, getJointState reports seen, hollow, or absent per joint, and getCounts counts hollow markers separately (design in design/OVERLAY.md).
- A depth ring cue in the overlay (roadmap F5): when at least half of a joint's offset points toward or away from the camera, PhotonicOverlay draws a deviation-colored ring at the joint that grows with a toward-camera offset and shrinks with an away offset, so depth misses read clearly where the offset arrow projects to almost nothing; getDepthRing reports the ring per joint and getCounts counts the rings shown (design in design/OVERLAY.md).

## [0.1.0] — not yet published (prepared 2026-11-10)

The first package-ready build, prepared for the owner's publish gate. It has not been published to npm; until the owner says the word, consumers keep using the assumed peer checkout described in the README.

### Added

- The decoupled library entry in src/index.js, which exports the engine only (scene, renderer, camera, grid, input, XR manager, control system, and scene loader), with no host-page wiring, no auto-run, and no imports from any host site (roadmap D2, plan in design/DECOUPLING-PLAN.md).
- Clean overlay rendering (roadmap F1): PhotonicOverlay draws a pose skeleton over a video element with a transparent, resolution-independent canvas, the KataPose MVP default style, per-joint deviation color encoding, and offset arrow glyphs (design in design/OVERLAY.md, demo in examples/overlay-demo/).
- Virtual camera mode (roadmap F2): PhotonicVirtualCamera emits a scene, a canvas, an overlay, or the full video-plus-overlay composite as a browser MediaStream, with recording through MediaRecorder and honest labeling that this is a browser captured stream and not an OS-level virtual camera device (design in design/VIRTUAL-CAMERA.md, demo in examples/virtual-camera-demo/).
- Package readiness (roadmap P1): an exports map with the root entry plus overlay and virtual-camera subpaths, hand-written type declarations in src/index.d.ts that were checked against the runtime exports and compiled against a test consumer, a README quickstart that runs from the packed tarball, a standalone quickstart example in examples/quickstart/, and a files allowlist so the published tarball carries the library, its types, the runnable examples, and the feature designs, and nothing else (record in design/PACKAGING.md).

### Changed

- The scene loader loads modules with dynamic import() from a configurable base instead of the original host site's script path, and the supported examples are ordinary ES modules that export their lifecycle functions.
- The Gaussian-splat dependency @sparkjsdev/spark is pinned to ^0.1.10 instead of accepting any version.

### Removed

- The original host page wiring moved out of the library and into examples/host-page/, where it belongs; two extracted examples that depend on the Sonance and Modulation workstreams (audio-demo and synth-designer) moved to examples/unsupported/ and are not part of the published package's runnable examples.
