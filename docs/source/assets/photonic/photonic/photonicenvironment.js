/**
 * PhotonicEnvironment - A neutral studio environment for image-based lighting (roadmap F12).
 *
 * Builds Three's RoomEnvironment into a PMREM texture a scene can use as its
 * environment, so PBR materials (metals especially) are lit by more than the
 * direct lights. PhotonicScene.setStudioEnvironment is the usual entry point;
 * this helper is exported for callers who manage their own scene.environment.
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/roomenvironment.js';

// Build a PMREM texture from the neutral RoomEnvironment studio. The renderer is a THREE.WebGLRenderer. Returns the texture plus a dispose that frees the PMREM resources; the texture itself is disposed by clearEnvironment or by the caller.
export function createStudioEnvironment(renderer, options = {}) {
  if (!renderer || typeof renderer.getContext !== 'function') {
    throw new Error('createStudioEnvironment: pass a THREE.WebGLRenderer');
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const environment = new RoomEnvironment();
  const renderTarget = pmrem.fromScene(environment, options.sigma ?? 0.04);
  environment.dispose();
  pmrem.dispose();
  return {
    texture: renderTarget.texture,
    dispose() {
      renderTarget.dispose();
    }
  };
}
