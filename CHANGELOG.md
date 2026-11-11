# Changelog

All notable changes to Photonic are recorded in this file. The format follows Keep a Changelog, and the project follows Semantic Versioning: the version in package.json is the single source of truth, every release gets a dated section here before it is published, breaking changes to the public exports in src/index.js require a major version bump once the package is past 1.0 (and a minor bump with a clear breaking note while it is still 0.x), and nothing is published to npm except on the owner's explicit word in an interactive session.

## [Unreleased]

Nothing yet. Changes land here first, in the section of the version they will ship in, as part of the same commit that makes them.

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
