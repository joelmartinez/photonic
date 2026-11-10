/**
 * PhotonicRenderer - Renderer management for Photonic framework
 * 
 * Handles WebGL renderer setup with responsive sizing that matches device aspect ratio.
 * Expands viewable area on resize rather than scaling pixels.
 */

import * as THREE from 'three';

export class PhotonicRenderer {
  constructor(containerElement) {
    this.container = containerElement;
    
    // Create WebGL renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false
    });
    
    // Enable shadows for better visual quality
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Enable WebXR rendering when a session is active.
    this.renderer.xr.enabled = true;
    
    // Set pixel ratio for sharp rendering
    this.renderer.setPixelRatio(window.devicePixelRatio);
    
    // Calculate initial size using container dimensions
    this._updateSize();
    
    // Append canvas to container
    this.container.appendChild(this.renderer.domElement);
  }
  
  /**
   * Calculate size based on actual container dimensions
   * This allows the canvas to adapt to any aspect ratio
   */
  _updateSize() {
    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;
    
    this.renderer.setSize(containerWidth, containerHeight);
  }
  
  /**
   * Render the scene
   */
  render(scene, camera) {
    this.renderer.render(scene, camera);
  }

  /**
   * Install the shared render loop used by both standard rendering and WebXR.
   */
  setAnimationLoop(callback) {
    this.renderer.setAnimationLoop(callback);
  }
  
  /**
   * Handle container resize
   * Expands viewable area rather than scaling pixels
   */
  handleResize() {
    this._updateSize();
  }

  setXRReferenceSpaceType(referenceSpaceType) {
    this.renderer.xr.setReferenceSpaceType(referenceSpaceType);
  }

  setXRSession(session) {
    return this.renderer.xr.setSession(session);
  }

  getXRReferenceSpace() {
    return this.renderer.xr.getReferenceSpace?.() ?? null;
  }

  isXRPresenting() {
    return this.renderer.xr.isPresenting === true;
  }
  
  /**
   * Clean up resources
   */
  dispose() {
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
