---
template: Default
title: Install
subtitle: How to get Photonic and what it needs to run.
---

# Install

Photonic is an ES module package with no build step. It runs in a browser, imports as `@codecube/photonic`, and resolves its one peer dependency, Three.js, through an import map on the consuming page — the same shape this documentation site itself uses to run the library live.

## Status: GitHub today, npm on the owner's word

The package is prepared at version 0.1.1 and its public home is GitHub: https://github.com/joelmartinez/photonic. It has not been published to npm yet; publishing happens only on the owner's explicit word, so the install routes below are the GitHub route and the peer-checkout route. When the npm publish lands, `npm install @codecube/photonic` becomes the third route and the code on this page does not change, because imports stay the package name either way.

## Route one: install from GitHub

```bash
npm install github:joelmartinez/photonic three@^0.170.0
```

Pin the install to a commit or a tag in your lockfile for exact builds. The GitHub install brings the package's one runtime dependency, `@sparkjsdev/spark`, along with it; Three.js is a peer dependency and is installed explicitly, as shown.

## Route two: the peer checkout

Until the npm publish, the portfolio projects that Photonic was built for consume it as a sibling checkout: the photonic repo sits in the folder next to the consuming project, and the consumer's package.json references it by relative path under its package name.

```json
{
  "dependencies": {
    "@codecube/photonic": "file:../photonic",
    "three": "^0.170.0"
  }
}
```

Imports still read `from '@codecube/photonic'`, so switching a consumer to the published package later is a one-line dependency change with no code edits.

## The import map

A browser page cannot resolve the bare names `three` and `@codecube/photonic` on its own, so the page carries an import map that points both names into the installed node_modules. This is the map from the package README, and it is the resolution story every standalone consumer page should use.

```html
<script type="importmap">
{
  "imports": {
    "three": "./node_modules/three/build/three.module.js",
    "three/addons/": "./node_modules/three/examples/jsm/",
    "three/examples/jsm/": "./node_modules/three/examples/jsm/",
    "@sparkjsdev/spark": "./node_modules/@sparkjsdev/spark/dist/spark.module.js",
    "@codecube/photonic": "./node_modules/@codecube/photonic/src/index.js"
  }
}
</script>
<div id="app" style="width: 100%; height: 100vh"></div>
<script type="module" src="./main.js"></script>
```

Then `main.js` is the quickstart from the home page: one container, one `PhotonicScene`, and the authoring calls. TypeScript consumers get hand-written declarations for the full public surface with the package, and two feature subpaths keep the headline features importable on their own: `@codecube/photonic/overlay` for `PhotonicOverlay` and `@codecube/photonic/virtual-camera` for `PhotonicVirtualCamera`.

## Requirements

- A browser with WebGL and ES modules; WebXR features additionally need a WebXR-capable browser and headset for the immersive path.
- Three.js at `^0.170.0` as the peer dependency.
- Node 18 or newer, only for the install tooling — the library itself is browser code.
- Any static file server for local pages; the examples in the repo run by serving the repo folder and opening the demo host page.

## Running the repo examples standalone

The repo ships runnable examples: a quickstart page, a demo host page that loads the scene modules (box, solar-system, liminal, splat) by name, an overlay demo, a 3D skeleton demo, and a virtual camera demo. Install the repo's dependencies, serve the repo folder with any static file server, and open `examples/host-page/index.html`, picking a module in the selector or with a `?module=box.js` style URL. The splat example needs a splat asset supplied through `window.PhotonicSplatConfig`, because no asset ships with the library.
