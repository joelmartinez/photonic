# Changelog

All notable changes to Photonic are recorded in this file. The format follows Keep a Changelog, and the project follows Semantic Versioning: the version in package.json is the single source of truth, every release gets a dated section here before it is published, breaking changes to the public exports in src/index.js require a major version bump once the package is past 1.0 (and a minor bump with a clear breaking note while it is still 0.x), and nothing is published to npm except on the owner's explicit word in an interactive session.

## [Unreleased]

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
