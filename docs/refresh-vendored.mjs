// Refresh the docs site's vendored library copies from src/ and node_modules.
// Chloroplast lowercases every output filename, so the vendored tree is stored
// lowercased and relative / three-addons import specifiers are lowercased to
// match; otherwise the demos' module graph 404s on case-sensitive hosting.
// Run from the repo root: node docs/refresh-vendored.mjs
import { cpSync, rmSync, readdirSync, readFileSync, writeFileSync, renameSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dest = join(root, 'docs/source/assets/photonic');

rmSync(dest, { recursive: true, force: true });

const copies = [
  ['src', 'photonic', (n) => n.endsWith('.js')],
  ['examples/modules/box.js', 'modules/box.js'],
  ['examples/modules/solar-system.js', 'modules/solar-system.js'],
  ['node_modules/three/build/three.module.js', 'three/build/three.module.js'],
  ['node_modules/@sparkjsdev/spark/dist/spark.module.js', 'spark/dist/spark.module.js'],
];
for (const dir of ['controls', 'postprocessing', 'shaders', 'math']) {
  copies.push([`node_modules/three/examples/jsm/${dir}`, `three/examples/jsm/${dir}`, (n) => n.endsWith('.js')]);
}
const wanted = new Set(['OrbitControls.js', 'PointerLockControls.js', 'EffectComposer.js', 'RenderPass.js', 'GTAOPass.js', 'OutputPass.js', 'Pass.js', 'ShaderPass.js', 'MaskPass.js', 'CopyShader.js', 'GTAOShader.js', 'OutputShader.js', 'PoissonDenoiseShader.js', 'SimplexNoise.js']);

for (const [from, to, filter] of copies) {
  const srcPath = join(root, from);
  if (statSync(srcPath).isDirectory()) {
    for (const name of readdirSync(srcPath)) {
      if (filter && !filter(name)) continue;
      if (from.startsWith('node_modules/three/examples') && !wanted.has(name)) continue;
      cpSync(join(srcPath, name), join(dest, to, name.toLowerCase()));
    }
  } else {
    cpSync(srcPath, join(dest, to.toLowerCase()));
  }
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p); else if (name.endsWith('.js')) yield p;
  }
}

let touched = 0;
for (const file of walk(dest)) {
  const before = readFileSync(file, 'utf8');
  const after = before.replace(/((?:from\s+|import\s*\(\s*|import\s+)['"])(\.[^'"]*|three\/addons\/[^'"]*|three\/examples\/jsm\/[^'"]*)(['"])/g,
    (m, pre, spec, post) => pre + spec.toLowerCase() + post);
  if (after !== before) { writeFileSync(file, after); touched += 1; }
}
console.log(`vendored tree refreshed at ${dest} (${touched} files had specifiers lowercased)`);
