/**
 * Solar System Module
 * Demonstrates parent-child object attachments with a sun, planet, and moon hierarchy
 * 
 * This module showcases:
 * - Attaching a moon to orbit a planet (child object)
 * - Attaching a planet to orbit a sun (child of child)
 * - Hierarchical transformations where child movements are relative to parent
 */

const Metadata = {
  title: 'Solar System',
  description: 'A sun, planet, and moon hierarchy that shows parent-child object attachment.'
};

// Module constants
const SUN_RADIUS = 0.8;
const PLANET_RADIUS = 0.3;
const MOON_RADIUS = 0.15;

const PLANET_ORBIT_RADIUS = 3.0;
const MOON_ORBIT_RADIUS = 0.8;

const PLANET_ORBIT_SPEED = 0.3; // radians per second
const MOON_ORBIT_SPEED = 1.5;   // radians per second (faster relative motion)

const SUN_COLOR = 0xffff00;      // Yellow
const PLANET_COLOR = 0x0066ff;   // Blue
const MOON_COLOR = 0xcccccc;     // Gray

/**
 * Load - Create the solar system hierarchy
 */
function Load(scene) {
  console.log('Solar System: Loading...');
  
  // Create the sun at the center
  const sun = scene.createSphere({
    radius: SUN_RADIUS,
    color: SUN_COLOR,
    position: { x: 0, y: SUN_RADIUS, z: 0 }
  });
  
  // Create the planet
  const planet = scene.createSphere({
    radius: PLANET_RADIUS,
    color: PLANET_COLOR,
    position: { x: PLANET_ORBIT_RADIUS, y: 0, z: 0 } // Position relative to sun
  });
  
  // Create the moon
  const moon = scene.createSphere({
    radius: MOON_RADIUS,
    color: MOON_COLOR,
    position: { x: MOON_ORBIT_RADIUS, y: 0, z: 0 } // Position relative to planet
  });
  
  // Establish parent-child relationships
  // The moon orbits the planet
  planet.attach(moon);
  
  // The planet orbits the sun
  sun.attach(planet);
  
  console.log('Solar System: Hierarchy established');
  console.log('  Sun -> Planet -> Moon');
  
  return {
    sun: sun,
    planet: planet,
    moon: moon,
    planetAngle: 0,
    moonAngle: 0,
    elapsedTime: 0
  };
}

/**
 * Update - Animate the orbital mechanics
 */
function Update(scene, state, deltaTime) {
  state.elapsedTime += deltaTime;
  
  // Rotate the sun on its axis
  const sunRotation = state.sun.getRotation();
  state.sun.setRotation(
    sunRotation.x,
    sunRotation.y + (0.5 * deltaTime),
    sunRotation.z
  );
  
  // Update planet's orbit around the sun
  state.planetAngle += PLANET_ORBIT_SPEED * deltaTime;
  const planetX = Math.cos(state.planetAngle) * PLANET_ORBIT_RADIUS;
  const planetZ = Math.sin(state.planetAngle) * PLANET_ORBIT_RADIUS;
  
  // Since planet is a child of sun, this position is relative to sun
  state.planet.setPosition(planetX, 0, planetZ);
  
  // Rotate the planet on its axis
  const planetRotation = state.planet.getRotation();
  state.planet.setRotation(
    planetRotation.x,
    planetRotation.y + (1.0 * deltaTime),
    planetRotation.z
  );
  
  // Update moon's orbit around the planet
  state.moonAngle += MOON_ORBIT_SPEED * deltaTime;
  const moonX = Math.cos(state.moonAngle) * MOON_ORBIT_RADIUS;
  const moonZ = Math.sin(state.moonAngle) * MOON_ORBIT_RADIUS;
  
  // Since moon is a child of planet, this position is relative to planet
  // The moon will follow the planet as it orbits the sun!
  state.moon.setPosition(moonX, 0, moonZ);
  
  // Rotate the moon on its axis
  const moonRotation = state.moon.getRotation();
  state.moon.setRotation(
    moonRotation.x,
    moonRotation.y + (2.0 * deltaTime),
    moonRotation.z
  );
  
  // Add a subtle color pulse to the sun
  const sunPulse = Math.sin(state.elapsedTime * 2) * 0.1 + 0.9;
  const sunHue = 60; // Yellow hue
  const sunColor = hslToHex(sunHue, 100, 50 * sunPulse);
  state.sun.setColor(sunColor);
}

/**
 * Unload - Clean up all objects
 */
function Unload(scene, state) {
  console.log('Solar System: Unloading...');
  
  if (state) {
    // Note: We only need to remove the sun, and its children (planet and moon)
    // will be automatically cleaned up due to the parent-child relationship
    // However, for clarity and completeness, we'll detach and remove each
    
    if (state.moon) {
      state.moon.detach();
      state.moon.remove();
    }
    
    if (state.planet) {
      state.planet.detach();
      state.planet.remove();
    }
    
    if (state.sun) {
      state.sun.remove();
    }
  }
  
  console.log('Solar System: Unloaded');
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
  
  window.PhotonicModules['solar-system'] = {
    Load: Load,
    Update: Update,
    Unload: Unload,
    Metadata: Metadata
  };
})();
