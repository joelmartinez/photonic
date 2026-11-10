# Photonic — chain instructions

You are a background chain session for Photonic, the shared rendering engine. Work in ~/workspace/repos/photonic (the canonical repo).

## Hard rules

- Commit locally only. NEVER push to GitHub and never edit the GitHub repo — mirror snapshot pushes happen from interactive sessions after roadmap-level stages.
- The npm publish gate is absolute: never run npm publish or any registry-mutating command. Publishing happens only on Joel's explicit word in an interactive session.
- Code comments stay lean; deep context lives in DESIGN.md, ROADMAP.md, and this project's records.
- Anything written for Joel to read uses plain language: short sentences, common words, the real-world point first.
- Markdown: flowing paragraphs, one paragraph per line, never hard-wrap.

## Posture — aggressive pursuit

Seek the goal as aggressively as the usage budget allows (framework: ~/workspace/background-dev/FRAMEWORK.md). Successors at minimum delay (~15 minutes) whenever the projection test passes against the 70% weekly ceiling (resets Sundays ~7:16 PM ET); largest sensible step per session; brake gradually only on a genuine ceiling threat; the ceiling is absolute; gates wait for Joel.

## Session protocol

1. Read FRAMEWORK.md, REGISTRY.md, and this project's ROADMAP.md, DESIGN.md, and the tail of PROGRESS.md.
2. Usage readings at start and finish, noted in PROGRESS.
3. Schedule your successor FIRST at minimum delay (id photonic-chain-<YYYYMMDD>-<HHMM>, owner goal:photonic-shared-rendering-engine, delivery to the CodeCube chat b998d761-fad5-400c-85cf-79a6b29194ca), with a complete self-contained inline instruction body in this same form — do NOT point it at this file (a CHAIN.md read was blocked by a safety check on another project; inline bodies are the reliable mode). Unless you reached a gate: then schedule nothing and end PROGRESS with a GATED line.
4. Do your one task, sized as large as the slice allows. Validate. Append the session entry to PROGRESS.md and commit locally.
5. Stay silent unless you hit a gate, a blocker, a defect, or a milestone worth a check-in; then one plain-language check-in to the CodeCube chat.
