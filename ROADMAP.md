# Photonic — roadmap

Photonic is the shared browser 3D/WebXR rendering engine for the portfolio (Vomitorium, KataPose visualization). Canonical repo: this one. Public mirror: joelmartinez/photonic (MIT). The long-term graduation is npm publication as @codecube/photonic; until then, consumers use the assumed peer checkout (file:../photonic).

## Graduation path to npm

- **D1 — Decoupling audit and plan.** Map every SSG coupling left from the extraction (relative imports into the host site, the Modulation workstream import in src/index.js, webpack-based module discovery, example modules that depend on pieces not extracted). Output: a written plan with an ordered fix list. No code changes.
- **D2 — Decoupling implementation.** Execute the D1 plan: the library imports nothing from any host site, carries its own module loading story, and the examples run standalone against the library alone. Verified by a clean-room check: a fresh folder with only Photonic and its declared dependencies runs an example scene.
- **F1 — Clean overlay rendering.** The video-overlay rendering path from DESIGN.md: crisp resolution-independent overlay graphics composited over a video element, stable frame to frame, styleable, clean by default. Verified with a pose-skeleton-over-video demo scene.
- **F2 — Virtual camera mode.** Emit any scene (including the overlay composite) as a captured MediaStream with a documented consumer pattern; honest labeling of what a browser stream can and cannot do versus an OS-level virtual camera device.
- **P1 — Package readiness.** Exports map, type declarations, README with a working quickstart, standalone examples, version and changelog discipline, and an npm pack dry run whose tarball is inspected file by file. The library must install and run from the packed tarball in a clean folder.
- **⛔ GATE — npm publish.** Publishing happens only on Joel's explicit word, with his npm account credentials through the secure flow. The chain prepares everything up to this gate and stops.
- **C1 — Consumer flip (after the gate).** Every consumer changes its dependency line from the peer checkout to the published version; imports do not change. Each flip is verified through that project's real build. The consumers, per Joel (2026-11-10): the Vomitorium; the KataPose platform builds; **codecube.net** — the Static-Site-Generator replaces the integrated copy Photonic was extracted from, closing the loop (the origin site becomes an ordinary consumer); and **HootCAD** (owlprecision/hootcad), which takes the published package up as its rendering layer when that workstream reaches it.

## Standing rules

The local repo is canonical; the GitHub mirror refreshes by snapshot push from interactive sessions after roadmap-level stages — chain sessions commit locally and never push. npm publishing only on Joel's word. Code comments stay lean.
