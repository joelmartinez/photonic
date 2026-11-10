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
Files are byte-identical to the source at extraction; decoupling is follow-on work
(see DESIGN.md). This library is MIT licensed (see LICENSE). Its canonical repo
lives on this machine; the public GitHub repo joelmartinez/photonic is its mirror.
It is the future npm library (publishing only on Joel's word) and the rendering
foundation for the Vomitorium and for the KataPose platform's pose visualization.

## Consuming Photonic before npm publishing

Until Photonic is published to npm, consumers work with an assumed peer checkout: the photonic repo sits in a sibling folder next to the consuming project (same parent folder), and the consumer references it by relative path under its package name — in package.json, `"@codecube/photonic": "file:../photonic"`. Imports stay `from "@codecube/photonic"` everywhere, so switching to the published package later is a one-line dependency change with no code edits. On Muse's machine all repos already live side by side in ~/workspace/repos/, so the layout holds as-is.
