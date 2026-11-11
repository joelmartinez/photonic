# Unsupported examples

These two modules are kept for reference only. They are not part of the supported Photonic examples, and they do not run standalone, because they depend on the Sonance and Modulation workstreams, which are not part of Photonic and are not in this repo.

`audio-demo.js` is a Sonance demo that uses Photonic visuals. It needs `window.Sonance` and the Modulation frame context, so there is nothing Photonic alone can do to run it. `synth-designer.js` is a synth scene editor whose save, load, and playback paths all go through Sonance. Its 3D editor half is more independent, and a later piece of work could rebuild its small scene-manager surface (save, list, load, download, and upload of JSON scene files) inside the example with local storage and file download and upload. That is feature work, not decoupling, so it is not done here.
