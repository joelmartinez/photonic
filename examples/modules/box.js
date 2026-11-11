/**
 * Box Scene Module
 * Demonstrates the Photonic scene module API with a spinning colored box
 */

const Metadata = {
  title: 'Box',
  description: 'A spinning colored box. The simplest Photonic scene module.'
};

// Module state
let box = null;
let rotationSpeed = 0.5; // radians per second

/**
 * Load - Called when the module is first loaded
 * @param {PhotonicScene} scene - The Photonic scene API
 * @returns {Object} Optional state object that will be passed to Update and Unload
 */
function Load(scene) {
  console.log('Box module: Loading...');
  
  // Create a colorful box in the center
  box = scene.createBox({
    width: 1,
    height: 1,
    depth: 1,
    color: 0x00aaff,
    position: { x: 0, y: 0.5, z: 0 }, // Raise it slightly so it sits on the grid
    rotation: { x: 0, y: 0, z: 0 }
  });
  
  console.log('Box module: Loaded');
  
  // Return state object with our box reference
  return {
    box: box,
    rotationSpeed: rotationSpeed,
    elapsedTime: 0
  };
}

/**
 * Update - Called every frame
 * @param {PhotonicScene} scene - The Photonic scene API
 * @param {Object} state - The state object returned from Load
 * @param {number} deltaTime - Time since last frame in seconds
 */
function Update(scene, state, deltaTime) {
  // Update elapsed time
  state.elapsedTime += deltaTime;
  
  // Rotate the box around the Y axis
  const currentRotation = state.box.getRotation();
  state.box.setRotation(
    currentRotation.x,
    currentRotation.y + (state.rotationSpeed * deltaTime),
    currentRotation.z
  );
  
  // Optional: Change color based on time (cycles through hue)
  const hue = (state.elapsedTime * 50) % 360;
  const color = hslToHex(hue, 70, 50);
  state.box.setColor(color);
}

/**
 * Unload - Called when the module is being unloaded
 * @param {PhotonicScene} scene - The Photonic scene API
 * @param {Object} state - The state object returned from Load
 */
function Unload(scene, state) {
  console.log('Box module: Unloading...');
  
  // Clean up our box
  if (state && state.box) {
    state.box.remove();
  }
  
  box = null;
  
  console.log('Box module: Unloaded');
}

/**
 * Helper: Convert HSL to hex color
 */
function hslToHex(h, s, l) {
  h = h / 360;
  s = s / 100;
  l = l / 100;
  
  let r, g, b;
  
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  
  const toHex = x => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  
  return parseInt(`${toHex(r)}${toHex(g)}${toHex(b)}`, 16);
}

export { Load, Update, Unload, Metadata };

// Compatibility shim: also register in the global PhotonicModules namespace
(function() {
  if (typeof window === 'undefined') return;
  if (!window.PhotonicModules) {
    window.PhotonicModules = {};
  }
  
  window.PhotonicModules.box = {
    Load: Load,
    Update: Update,
    Unload: Unload,
    Metadata: Metadata
  };
})();
