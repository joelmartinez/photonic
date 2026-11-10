/**
 * PhotonicGrid - Infinite grid for Photonic framework
 * 
 * Creates an infinite grid effect like "the matrix" using a shader-based approach.
 * Grid is gray to contrast with the light blue sky background.
 */

import * as THREE from 'three';

export class PhotonicGrid {
  constructor() {
    // Create a gray floor plane
    this.createFloorPlane();
    // Create an infinite grid using a shader
    this.createInfiniteGrid();
  }
  
  createFloorPlane() {
    // Create a large solid gray plane as the floor
    const geometry = new THREE.PlaneGeometry(10000, 10000);
    const material = new THREE.MeshStandardMaterial({
      color: 0xd3d3d3, // Light gray
      roughness: 0.8,
      metalness: 0.2
    });
    
    this.floorPlane = new THREE.Mesh(geometry, material);
    this.floorPlane.rotation.x = -Math.PI / 2; // Rotate to be horizontal
    this.floorPlane.position.y = -0.01; // Slightly below the grid to avoid z-fighting
    this.floorPlane.receiveShadow = true;
  }
  
  createInfiniteGrid() {
    // Create a large plane for the grid shader
    const geometry = new THREE.PlaneGeometry(2, 2, 1, 1);
    
    // Infinite grid shader
    const material = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: {
        uScale: { value: 1.0 },
        uDivisions: { value: 5.0 },  // 5 divisions = lines every 0.2 meters
        uColor: { value: new THREE.Color(0x333333) },  // Darker for contrast
        uOpacity: { value: 1.0 },
        uCameraPosition: { value: new THREE.Vector3(0, 5, 10) },
        // LOD thresholds: lines fade when screen-space spacing gets below these values
        // Smaller values = lines visible closer/more aggressive LOD
        // Larger values = lines fade earlier/more conservative LOD
        uFineLODThreshold: { value: 0.0015 },  // Fine grid LOD threshold
        uCenterLODThreshold: { value: 0.0015 }  // Center grid LOD threshold
      },
      vertexShader: `
        varying vec3 worldPosition;
        varying vec3 viewPosition;
        varying vec4 clipPosition;
        uniform float uScale;
        
        void main() {
          // Scale the position to cover a large area for the infinite grid
          vec3 scaledPos = position * 10000.0;
          vec4 worldPos = modelMatrix * vec4(scaledPos, 1.0);
          worldPosition = worldPos.xyz;
          
          vec4 viewPos = modelViewMatrix * vec4(scaledPos, 1.0);
          viewPosition = viewPos.xyz;
          
          gl_Position = projectionMatrix * viewPos;
          clipPosition = gl_Position;
        }
      `,
      fragmentShader: `
        varying vec3 worldPosition;
        varying vec3 viewPosition;
        varying vec4 clipPosition;
        uniform float uScale;
        uniform float uDivisions;
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform vec3 uCameraPosition;
        uniform float uFineLODThreshold;
        uniform float uCenterLODThreshold;
        
        // Returns line intensity (1.0 = on line, 0.0 = off line)
        float getGrid(float coord, float division) {
          // Use max to prevent division by zero and ensure stability
          float deriv = max(fwidth(coord * division), 0.0001);
          float grid = abs(fract(coord * division - 0.5) - 0.5) / deriv;
          return 1.0 - min(grid, 1.0); // Invert so 1.0 = on line, 0.0 = off line
        }
        
        // Calculate LOD fade based on screen-space line density
        // Returns 1.0 when lines are well-spaced, 0.0 when too dense
        // minThreshold: screen-space spacing below which lines are fully invisible
        float getLODFade(float worldSpacing, vec3 worldPos, vec3 camPos, float minThreshold) {
          // Calculate distance from camera to this fragment
          float dist = length(worldPos - camPos);
          
          // Calculate the viewing angle (how much we're looking along the surface vs down at it)
          vec3 viewDir = normalize(worldPos - camPos);
          float viewAngle = abs(viewDir.y); // 1.0 = looking straight down, 0.0 = looking along horizon
          
          // Adjust effective distance based on viewing angle
          // When looking along the surface (low angle), lines compress more
          float angleCompression = mix(10.0, 1.0, viewAngle); // More compression at low angles
          float effectiveDistance = dist * angleCompression;
          
          // Calculate approximate screen-space line spacing
          // This is a rough approximation: at distance D, a line spacing of S
          // appears as S/D on screen (perspective projection)
          float screenSpacing = worldSpacing / max(effectiveDistance, 0.1);
          
          // Fade out when screen spacing gets too small (lines too close together)
          // Use provided threshold as minimum, and 16x threshold as maximum for longer, smoother transition
          float maxThreshold = minThreshold * 16.0;
          
          // Use longer fade range to reduce flickering during zoom
          float fade = smoothstep(minThreshold, maxThreshold, screenSpacing);
          
          return fade;
        }
        
        void main() {
          // Calculate distance from camera for overall fade effect
          float dist = length(worldPosition - uCameraPosition);
          float fadeFactor = 1.0 - smoothstep(0.0, 200.0, dist);
          
          // Calculate LOD fades for different grid levels
          // Fine grid: spacing = 1/uDivisions (e.g., 0.2 meters)
          float fineSpacing = 1.0 / uDivisions;
          float fineLODFade = getLODFade(fineSpacing, worldPosition, uCameraPosition, uFineLODThreshold);
          
          // Center grid: spacing = 1.0 meter
          float centerSpacing = 1.0;
          float centerLODFade = getLODFade(centerSpacing, worldPosition, uCameraPosition, uCenterLODThreshold);
          
          // Fine grid lines (every 1/uDivisions meters) - check both X and Z
          float fineX = getGrid(worldPosition.x, uDivisions);
          float fineZ = getGrid(worldPosition.z, uDivisions);
          
          // Center lines (every 1 meter) - check both X and Z
          float centerX = getGrid(worldPosition.x, 1.0);
          float centerZ = getGrid(worldPosition.z, 1.0);
          
          // Axis lines (at X=0 and Z=0) - check both X and Z
          float axisX = getGrid(worldPosition.x, 0.1);
          float axisZ = getGrid(worldPosition.z, 0.1);
          
          // Combine lines from both directions using max()
          // If there's a line in X OR Z direction, we want to show it
          float fine = max(fineX, fineZ);
          float center = max(centerX, centerZ);
          float axis = max(axisX, axisZ);
          
          // Apply LOD fading to fine and center grids
          // Add small epsilon to prevent complete dropout
          fine *= max(fineLODFade, 0.01);
          center *= max(centerLODFade, 0.01);
          
          // Layer the grids with different intensities
          // Start with the base grid
          float alpha = fine * 0.3;
          
          // Add center lines (they override fine lines)
          alpha = max(alpha, center * 0.6);
          
          // Add axis lines (they override everything) - no LOD fade for axis
          alpha = max(alpha, axis * 0.9);
          
          alpha *= fadeFactor * uOpacity;
          
          // Use slightly lower threshold to prevent premature discard
          if (alpha < 0.005) discard;
          
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false
    });
    
    this.gridHelper = new THREE.Mesh(geometry, material);
    this.gridHelper.rotation.x = -Math.PI / 2; // Rotate to be horizontal
    this.gridHelper.position.y = 0; // At ground level
    this.gridHelper.frustumCulled = false; // Don't cull the infinite grid
  }
  
  /**
   * Update grid scale
   */
  setScale(scale) {
    this.gridHelper.material.uniforms.uScale.value = scale;
  }
  
  /**
   * Update camera position for LOD calculations
   */
  updateCameraPosition(cameraPosition) {
    this.gridHelper.material.uniforms.uCameraPosition.value.copy(cameraPosition);
  }
  
  /**
   * Update grid divisions
   */
  setDivisions(divisions) {
    this.gridHelper.material.uniforms.uDivisions.value = divisions;
  }
  
  /**
   * Set grid color
   */
  setColor(color) {
    this.gridHelper.material.uniforms.uColor.value.setHex(color);
  }
  
  /**
   * Set grid opacity
   */
  setOpacity(opacity) {
    this.gridHelper.material.uniforms.uOpacity.value = opacity;
  }
  
  /**
   * Set fine grid LOD threshold
   * Lower values = lines visible further out (more aggressive LOD)
   * Higher values = lines fade earlier (more conservative LOD)
   * Recommended range: 0.001 to 0.01
   */
  setFineLODThreshold(threshold) {
    this.gridHelper.material.uniforms.uFineLODThreshold.value = threshold;
  }
  
  /**
   * Set center grid LOD threshold
   * Lower values = lines visible further out (more aggressive LOD)
   * Higher values = lines fade earlier (more conservative LOD)
   * Recommended range: 0.0005 to 0.005
   */
  setCenterLODThreshold(threshold) {
    this.gridHelper.material.uniforms.uCenterLODThreshold.value = threshold;
  }
  
  /**
   * Set grid visibility
   */
  setVisible(visible) {
    this.gridHelper.visible = visible;
  }
  
  /**
   * Clean up resources
   */
  dispose() {
    this.gridHelper.geometry.dispose();
    this.gridHelper.material.dispose();
  }
}
