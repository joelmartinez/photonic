/**
 * PhotonicCamera - Camera management for Photonic framework
 * 
 * Provides orbit, pan, zoom, and look controls similar to modeling programs.
 * Camera positioning is calculated to frame the target from an elevated angle.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/orbitcontrols.js';

export class PhotonicCamera {
  constructor(containerElement, renderer) {
    this.container = containerElement;
    
    // Create perspective camera
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
    this.rig = new THREE.Group();
    this.rig.name = 'PhotonicCameraRig';
    this.rig.add(this.camera);
    
    // Default target is origin
    this.target = new THREE.Vector3(0, 0, 0);
    
    // Position camera using calculated framing
    const cameraPos = this._calculateCameraPosition(this.target);
    this.camera.position.copy(cameraPos);
    this.camera.lookAt(this.target);
    
    // Setup orbit controls (modeling program style)
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    
    // Configure controls for modeling-style interaction
    this.controls.enableDamping = true; // Smooth motion
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = false; // Pan relative to ground plane
    this.controls.minDistance = 0.5; // Minimum zoom
    this.controls.maxDistance = 50; // Maximum zoom
    this.controls.maxPolarAngle = Math.PI / 2; // Don't allow camera below ground
    this.controls.target.copy(this.target); // Look at target
    
    // Enable all interaction modes
    this.controls.enableRotate = true; // Orbit with left mouse/drag
    this.controls.enablePan = true; // Pan with right mouse or middle mouse
    this.controls.enableZoom = true; // Zoom with wheel or pinch
    
    // Configure mouse buttons for modeling program feel
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,   // Left mouse: orbit
      MIDDLE: THREE.MOUSE.PAN,    // Middle mouse: pan
      RIGHT: THREE.MOUSE.PAN      // Right mouse: pan
    };
    
    // Configure touch controls for Mac trackpad and mobile
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,    // One finger: orbit
      TWO: THREE.TOUCH.DOLLY_PAN  // Two fingers: pinch zoom + pan
    };
    
    // Enable zoom controls explicitly for better Mac trackpad support
    this.controls.enableZoom = true;
    this.controls.zoomSpeed = 1.0;
    
    // Add wheel event listener for better trackpad scroll handling on Mac
    this._addTrackpadSupport(renderer.domElement);
  }

  getRig() {
    return this.rig;
  }
  
  /**
   * Add enhanced trackpad support for Mac pinch/zoom gestures
   */
  _addTrackpadSupport(domElement) {
    // Track if we're in a pinch gesture
    let isPinching = false;
    
    // Listen for wheel events with ctrlKey (indicates pinch on Mac)
    domElement.addEventListener('wheel', (event) => {
      // On Mac, pinch gestures come through as wheel events with ctrlKey
      if (event.ctrlKey) {
        event.preventDefault();
        isPinching = true;
        
        // Scale factor for zoom sensitivity
        const zoomSpeed = 0.01;
        const delta = -event.deltaY * zoomSpeed;
        
        // Update camera distance
        const distance = this.camera.position.distanceTo(this.controls.target);
        const newDistance = distance * (1 - delta);
        
        // Clamp to min/max distance
        const clampedDistance = Math.max(
          this.controls.minDistance,
          Math.min(this.controls.maxDistance, newDistance)
        );
        
        // Move camera along the look direction
        const direction = new THREE.Vector3();
        direction.subVectors(this.camera.position, this.controls.target).normalize();
        this.camera.position.copy(this.controls.target).add(
          direction.multiplyScalar(clampedDistance)
        );
        
        this.controls.update();
      }
    }, { passive: false });
    
    // Reset pinch flag
    domElement.addEventListener('wheel', () => {
      if (isPinching) {
        setTimeout(() => { isPinching = false; }, 100);
      }
    });
  }
  
  /**
   * Update controls (call this in animation loop)
   */
  update() {
    this.controls.update();
  }

  setOrbitEnabled(enabled) {
    this.controls.enabled = enabled;
  }
  
  /**
   * Handle container resize
   */
  handleResize() {
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
  
  /**
   * Set camera position
   */
  setPosition(x, y, z) {
    this.camera.position.set(x, y, z);
  }
  
  /**
   * Set camera look-at target
   */
  lookAt(x, y, z) {
    this.camera.lookAt(x, y, z);
    this.controls.target.set(x, y, z);
    this.controls.update();
  }

  getWorldPosition(target = new THREE.Vector3()) {
    return this.camera.getWorldPosition(target);
  }

  getWorldQuaternion(target = new THREE.Quaternion()) {
    return this.camera.getWorldQuaternion(target);
  }

  captureWorldPose() {
    return {
      position: this.getWorldPosition(new THREE.Vector3()),
      quaternion: this.getWorldQuaternion(new THREE.Quaternion())
    };
  }

  applyRigPose(position, quaternion) {
    this.rig.position.copy(position);
    this.rig.quaternion.copy(quaternion);
    this.rig.updateMatrixWorld(true);
  }

  bakeWorldPoseToLocal({ position, quaternion }) {
    this.rig.position.set(0, 0, 0);
    this.rig.quaternion.identity();
    this.rig.scale.set(1, 1, 1);

    this.camera.position.copy(position);
    this.camera.quaternion.copy(quaternion);
    this.camera.updateMatrixWorld(true);
  }
  
  /**
   * Calculate camera position to frame a target point
   * Uses a 2:1.5 ratio (distance:height) for viewing angle
   * Formula: 2 meters back on X/Z, 1.5 meters up on Y from target point
   * This creates a slight downward viewing angle while looking more "forward"
   * 
   * In the future, this can be extended to calculate based on object bounds
   * to automatically frame objects of different sizes.
   * 
   * @param {THREE.Vector3} targetPoint - The point to look at
   * @param {number} scale - Multiplier for default distance (default: 1)
   * @returns {THREE.Vector3} Calculated camera position
   */
  _calculateCameraPosition(targetPoint, scale = 1) {
    const baseDistance = 2; // Base distance back (meters)
    const heightRatio = 0.75; // Height is 3/4 of distance (1.5 meters up per 2 back)
    
    // Calculate position: distance back on both X and Z, height up on Y
    // This creates a 45-degree angle in the XZ plane, looking down from above
    const distance = baseDistance * scale;
    const height = distance * heightRatio;
    
    return new THREE.Vector3(
      targetPoint.x + distance,
      targetPoint.y + height,
      targetPoint.z + distance
    );
  }
  
  /**
   * Frame a target point with the camera
   * @param {Object} target - Target position {x, y, z} or THREE.Vector3
   * @param {number} scale - Distance scale multiplier
   */
  frameTarget(target, scale = 1) {
    const targetVec = target instanceof THREE.Vector3 
      ? target 
      : new THREE.Vector3(target.x, target.y, target.z);
    
    this.target.copy(targetVec);
    const cameraPos = this._calculateCameraPosition(targetVec, scale);
    
    this.camera.position.copy(cameraPos);
    this.camera.lookAt(this.target);
    this.controls.target.copy(this.target);
    this.controls.update();
  }
  
  /**
   * Reset camera to default position
   */
  reset() {
    this.target.set(0, 0, 0);
    const cameraPos = this._calculateCameraPosition(this.target);
    this.camera.position.copy(cameraPos);
    this.controls.target.copy(this.target);
    this.controls.update();
  }
  
  /**
   * Clean up resources
   */
  dispose() {
    this.controls.dispose();
  }
}
