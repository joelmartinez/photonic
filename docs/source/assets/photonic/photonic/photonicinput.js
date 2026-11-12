/**
 * PhotonicInput - Input management for Photonic framework
 * 
 * Provides a unified input API for handling keyboard, mouse, and touch input.
 * Supports WASD FPS-style controls, mouse look, and mobile touch controls.
 * 
 * Mobile Controls:
 * - Single finger drag: Look around (rotate view)
 * - Double-tap and hold: Move forward
 * - Two finger touch: Move backward
 */

import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/pointerlockcontrols.js';

export class PhotonicInput {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    
    // Control state
    this.enabled = false;
    this.moveSpeed = 5.0; // meters per second
    this.lookSpeed = 0.002;
    
    // Movement state
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.moveUp = false;
    this.moveDown = false;
    
    // Velocity for smooth movement
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.movementInputTime = 0;
    this.movementTuning = {
      mode: 'legacy',
      maxSpeed: null,
      acceleration: 18,
      deceleration: 14,
      damping: 10,
      initialSpeedFactor: 1,
      rampTime: 0,
      forwardSpeedMultiplier: 1,
      backwardSpeedMultiplier: 1,
      strafeSpeedMultiplier: 1,
      verticalSpeedMultiplier: 1
    };
    
    // Pointer lock controls for FPS-style mouse look
    this.pointerLockControls = null;
    this.isPointerLocked = false;
    
    // Mobile touch state
    this.isMobile = this._detectMobile();
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.lastTouchTime = 0;
    this.isDoubleTapHold = false;
    this.touchCount = 0;
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.touchLookSensitivity = 0.003;
    
    // Touch timing constants (milliseconds)
    this.DOUBLE_TAP_MAX_INTERVAL = 300;
    this.DOUBLE_TAP_MIN_INTERVAL = 50;
    
    // Camera angle limits
    this.MAX_PITCH_ANGLE = Math.PI / 2;
    
    // Event listeners (stored for cleanup)
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onClick = this._handleClick.bind(this);
    this._onPointerLockChange = this._handlePointerLockChange.bind(this);
    this._onPointerLockError = this._handlePointerLockError.bind(this);
    
    // Mobile touch event listeners
    this._onTouchStart = this._handleTouchStart.bind(this);
    this._onTouchMove = this._handleTouchMove.bind(this);
    this._onTouchEnd = this._handleTouchEnd.bind(this);
    
    // State change callbacks
    this.onLockChange = null;

    // Mobile interaction styles that suppress browser text selection/highlights
    this._mobileInteractionGuards = null;
  }
  
  /**
   * Detect if we're on a touch-primary device (mobile/tablet).
   *
   * CSS pointer media queries are the most reliable signal here:
   * - `(pointer: fine)` is true on mouse/trackpad-primary devices (Windows, Mac, Linux desktops)
   * - `(pointer: coarse)` is true on touch-primary devices (iOS, Android, touch-only tablets)
   *
   * This avoids false positives from `navigator.maxTouchPoints`, which is non-zero on many
   * Windows laptops and desktops that have OS-level touch support even when used with a mouse.
   */
  _detectMobile() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      if (window.matchMedia('(pointer: fine)').matches) {
        return false; // Mouse/trackpad primary – treat as desktop
      }
      if (window.matchMedia('(pointer: coarse)').matches) {
        return true; // Touch primary – treat as mobile
      }
    }

    // Fallback for environments without matchMedia support
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           ('ontouchstart' in window);
  }

  _enableMobileInteractionGuards() {
    const targets = [this.domElement].filter((target) => target?.style);

    this._mobileInteractionGuards = targets.map((target) => ({
      target,
      previous: {
        userSelect: target.style.userSelect,
        webkitUserSelect: target.style.webkitUserSelect,
        webkitTouchCallout: target.style.webkitTouchCallout,
        webkitTapHighlightColor: target.style.webkitTapHighlightColor,
        touchAction: target.style.touchAction
      }
    }));

    for (const { target } of this._mobileInteractionGuards) {
      target.style.userSelect = 'none';
      target.style.webkitUserSelect = 'none';
      target.style.webkitTouchCallout = 'none';
      target.style.webkitTapHighlightColor = 'transparent';
      target.style.touchAction = 'none';
    }
  }

  _disableMobileInteractionGuards() {
    if (!this._mobileInteractionGuards) {
      return;
    }

    for (const { target, previous } of this._mobileInteractionGuards) {
      target.style.userSelect = previous.userSelect;
      target.style.webkitUserSelect = previous.webkitUserSelect;
      target.style.webkitTouchCallout = previous.webkitTouchCallout;
      target.style.webkitTapHighlightColor = previous.webkitTapHighlightColor;
      target.style.touchAction = previous.touchAction;
    }

    this._mobileInteractionGuards = null;
  }
  
  /**
   * Enable FPS-style controls
   * Call this to activate WASD movement and mouse look
   */
  enable() {
    if (this.enabled) return;
    
    this.enabled = true;
    
    // Create pointer lock controls (for desktop)
    this.pointerLockControls = new PointerLockControls(this.camera, this.domElement);
    
    // Add keyboard event listeners
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    
    if (this.isMobile) {
      this._enableMobileInteractionGuards();

      // Mobile: use touch controls
      this.domElement.addEventListener('touchstart', this._onTouchStart, { passive: false });
      this.domElement.addEventListener('touchmove', this._onTouchMove, { passive: false });
      this.domElement.addEventListener('touchend', this._onTouchEnd, { passive: false });
      
      // Initialize camera euler from current rotation
      this.euler.setFromQuaternion(this.camera.quaternion);
      
      console.log('PhotonicInput: Mobile FPS controls enabled. Drag to look, double-tap+hold to move forward.');
    } else {
      // Desktop: use pointer lock
      this.domElement.addEventListener('click', this._onClick);
      document.addEventListener('pointerlockchange', this._onPointerLockChange);
      document.addEventListener('pointerlockerror', this._onPointerLockError);
      
      console.log('PhotonicInput: FPS controls enabled. Click to activate mouse look.');
    }
  }
  
  /**
   * Disable FPS-style controls
   */
  disable() {
    if (!this.enabled) return;
    
    this.enabled = false;
    
    // Remove keyboard event listeners
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    
    if (this.isMobile) {
      // Remove mobile touch listeners
      this.domElement.removeEventListener('touchstart', this._onTouchStart);
      this.domElement.removeEventListener('touchmove', this._onTouchMove);
      this.domElement.removeEventListener('touchend', this._onTouchEnd);
      this._disableMobileInteractionGuards();
    } else {
      // Remove desktop listeners
      this.domElement.removeEventListener('click', this._onClick);
      document.removeEventListener('pointerlockchange', this._onPointerLockChange);
      document.removeEventListener('pointerlockerror', this._onPointerLockError);
      
      // Unlock pointer if locked
      if (this.isPointerLocked) {
        document.exitPointerLock();
      }
    }
    
    // Dispose pointer lock controls
    if (this.pointerLockControls) {
      this.pointerLockControls.dispose();
      this.pointerLockControls = null;
    }
    
    // Reset movement state
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.moveUp = false;
    this.moveDown = false;
    this.velocity.set(0, 0, 0);
    this.movementInputTime = 0;
    
    console.log('PhotonicInput: FPS controls disabled.');
  }
  
  /**
   * Lock the pointer for mouse look
   */
  lock() {
    if (this.pointerLockControls) {
      this.pointerLockControls.lock();
    }
  }
  
  /**
   * Unlock the pointer
   */
  unlock() {
    if (this.pointerLockControls) {
      this.pointerLockControls.unlock();
    }
  }
  
  /**
   * Check if pointer is locked
   */
  get isLocked() {
    return this.isPointerLocked;
  }
  
  /**
   * Set movement speed in meters per second
   */
  setMoveSpeed(speed) {
    this.moveSpeed = speed;
  }

  /**
   * Configure advanced movement tuning.
   * When omitted, the legacy movement model is used.
   */
  setMovementTuning(tuning = null) {
    this.movementTuning = tuning
      ? { ...this.movementTuning, ...tuning }
      : {
          mode: 'legacy',
          maxSpeed: null,
          acceleration: 18,
          deceleration: 14,
          damping: 10,
          initialSpeedFactor: 1,
          rampTime: 0,
          forwardSpeedMultiplier: 1,
          backwardSpeedMultiplier: 1,
          strafeSpeedMultiplier: 1,
          verticalSpeedMultiplier: 1
        };
    this.movementInputTime = 0;
  }
  
  /**
   * Set mouse look sensitivity
   * Note: PointerLockControls uses fixed sensitivity. This stores the value
   * for potential future custom implementations.
   */
  setLookSpeed(speed) {
    this.lookSpeed = speed;
  }
  
  /**
   * Update camera position based on input state
   * Call this in the animation loop
   * @param {number} deltaTime - Time since last frame in seconds
   */
  update(deltaTime) {
    // On mobile, we don't need pointer lock
    if (!this.enabled) return;
    if (!this.isMobile && !this.isPointerLocked) return;

    if (this.movementTuning.mode === 'target-speed') {
      this._updateTargetSpeedMovement(deltaTime);
    } else {
      this._updateLegacyMovement(deltaTime);
    }

    // Apply movement using pointer lock controls (desktop) or direct camera manipulation (mobile)
    if (this.isMobile) {
      // Mobile: directly move camera based on its current orientation
      const forward = new THREE.Vector3();
      const right = new THREE.Vector3();
      
      // Get camera's forward direction (on XZ plane)
      this.camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      
      // Get camera's right direction
      right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
      
      // Apply movement
      this.camera.position.addScaledVector(forward, -this.velocity.z * deltaTime);
      this.camera.position.addScaledVector(right, -this.velocity.x * deltaTime);
      this.camera.position.y += this.velocity.y * deltaTime;
    } else if (this.pointerLockControls) {
      this.pointerLockControls.moveRight(-this.velocity.x * deltaTime);
      this.pointerLockControls.moveForward(-this.velocity.z * deltaTime);
      
      // Vertical movement (not built into PointerLockControls, apply directly)
      this.camera.position.y += this.velocity.y * deltaTime;
    }
  }

  _moveToward(current, target, maxDelta) {
    if (Math.abs(target - current) <= maxDelta) return target;
    return current + Math.sign(target - current) * maxDelta;
  }

  _updateLegacyMovement(deltaTime) {
    // Apply friction/damping
    this.velocity.x -= this.velocity.x * 10.0 * deltaTime;
    this.velocity.z -= this.velocity.z * 10.0 * deltaTime;
    this.velocity.y -= this.velocity.y * 10.0 * deltaTime;
    
    // Calculate movement direction
    this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
    this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
    this.direction.y = Number(this.moveUp) - Number(this.moveDown);
    this.direction.normalize();
    
    // Apply movement acceleration
    const acceleration = this.moveSpeed * 50.0;
    
    if (this.moveForward || this.moveBackward) {
      this.velocity.z -= this.direction.z * acceleration * deltaTime;
    }
    if (this.moveLeft || this.moveRight) {
      this.velocity.x -= this.direction.x * acceleration * deltaTime;
    }
    if (this.moveUp || this.moveDown) {
      this.velocity.y += this.direction.y * acceleration * deltaTime;
    }
  }

  _updateTargetSpeedMovement(deltaTime) {
    const {
      maxSpeed,
      acceleration,
      deceleration,
      initialSpeedFactor,
      rampTime,
      forwardSpeedMultiplier,
      backwardSpeedMultiplier,
      strafeSpeedMultiplier,
      verticalSpeedMultiplier
    } = this.movementTuning;

    const inputX = Number(this.moveRight) - Number(this.moveLeft);
    const inputY = Number(this.moveUp) - Number(this.moveDown);
    const inputZ = Number(this.moveForward) - Number(this.moveBackward);
    const hasInput = inputX !== 0 || inputY !== 0 || inputZ !== 0;

    if (hasInput) {
      this.movementInputTime += deltaTime;
    } else {
      this.movementInputTime = 0;
    }

    const horizontalInput = new THREE.Vector2(inputX, inputZ);
    if (horizontalInput.lengthSq() > 1) {
      horizontalInput.normalize();
    }

    const rampProgress = rampTime > 0
      ? Math.min(1, this.movementInputTime / rampTime)
      : 1;
    const rampFactor = initialSpeedFactor + (1 - initialSpeedFactor) *
      (rampProgress * rampProgress * (3 - 2 * rampProgress));
    const speedCap = maxSpeed ?? this.moveSpeed;

    const desiredX = -horizontalInput.x * speedCap * strafeSpeedMultiplier * rampFactor;
    const zMultiplier = horizontalInput.y >= 0 ? forwardSpeedMultiplier : backwardSpeedMultiplier;
    const desiredZ = -horizontalInput.y * speedCap * zMultiplier * rampFactor;
    const desiredY = inputY * speedCap * verticalSpeedMultiplier * rampFactor;

    const accelStep = acceleration * deltaTime;
    const decelStep = deceleration * deltaTime;

    this.velocity.x = this._moveToward(this.velocity.x, desiredX, desiredX === 0 ? decelStep : accelStep);
    this.velocity.z = this._moveToward(this.velocity.z, desiredZ, desiredZ === 0 ? decelStep : accelStep);
    this.velocity.y = this._moveToward(this.velocity.y, desiredY, desiredY === 0 ? decelStep : accelStep);
  }
  
  /**
   * Get the current movement velocity
   */
  getVelocity() {
    return {
      x: this.velocity.x,
      y: this.velocity.y,
      z: this.velocity.z
    };
  }
  
  /**
   * Get current input state
   */
  getInputState() {
    return {
      forward: this.moveForward,
      backward: this.moveBackward,
      left: this.moveLeft,
      right: this.moveRight,
      up: this.moveUp,
      down: this.moveDown,
      isLocked: this.isPointerLocked,
      isMobile: this.isMobile
    };
  }
  
  // Private event handlers
  
  _handleKeyDown(event) {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.moveForward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.moveBackward = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.moveLeft = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.moveRight = true;
        break;
      case 'Space':
        event.preventDefault(); // Prevent page scrolling
        this.moveUp = true;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.moveDown = true;
        break;
      case 'Escape':
        // Escape is handled by pointer lock automatically
        break;
    }
  }
  
  _handleKeyUp(event) {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.moveForward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.moveBackward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.moveLeft = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.moveRight = false;
        break;
      case 'Space':
        event.preventDefault(); // Prevent page scrolling
        this.moveUp = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.moveDown = false;
        break;
    }
  }
  
  _handleClick() {
    if (this.enabled && !this.isPointerLocked) {
      this.lock();
    }
  }
  
  _handlePointerLockChange() {
    this.isPointerLocked = document.pointerLockElement === this.domElement;
    
    if (this.onLockChange) {
      this.onLockChange(this.isPointerLocked);
    }
    
    if (this.isPointerLocked) {
      console.log('PhotonicInput: Pointer locked. Use WASD to move, mouse to look, ESC to exit.');
    } else {
      console.log('PhotonicInput: Pointer unlocked. Click to re-enable mouse look.');
      // Reset movement on unlock
      this.moveForward = false;
      this.moveBackward = false;
      this.moveLeft = false;
      this.moveRight = false;
      this.moveUp = false;
      this.moveDown = false;
    }
  }
  
  _handlePointerLockError() {
    console.error('PhotonicInput: Pointer lock error. Make sure the element is in focus.');
  }
  
  // Mobile touch event handlers
  
  /**
   * Handle touch start event
   * - Track initial touch position
   * - Detect double-tap for forward movement
   * - Track number of fingers for backward movement
   */
  _handleTouchStart(event) {
    event.preventDefault();
    
    this.touchCount = event.touches.length;
    
    if (this.touchCount === 1) {
      const touch = event.touches[0];
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
      
      // Detect double-tap
      const now = Date.now();
      const timeSinceLastTap = now - this.lastTouchTime;
      
      if (timeSinceLastTap < this.DOUBLE_TAP_MAX_INTERVAL && timeSinceLastTap > this.DOUBLE_TAP_MIN_INTERVAL) {
        // Double-tap detected - start moving forward
        this.isDoubleTapHold = true;
        this.moveForward = true;
      }
      
      this.lastTouchTime = now;
    } else if (this.touchCount >= 2) {
      // Two or more fingers - move backward
      this.moveBackward = true;
      this.moveForward = false;
      this.isDoubleTapHold = false;
    }
  }
  
  /**
   * Handle touch move event
   * - Single finger drag: rotate camera (look around)
   */
  _handleTouchMove(event) {
    event.preventDefault();
    
    if (this.touchCount === 1 && event.touches.length === 1) {
      const touch = event.touches[0];
      
      // Calculate delta from last position
      const deltaX = touch.clientX - this.touchStartX;
      const deltaY = touch.clientY - this.touchStartY;
      
      // Update touch position for next frame
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
      
      // Apply rotation to camera
      this.euler.setFromQuaternion(this.camera.quaternion);
      
      // Horizontal rotation (yaw)
      this.euler.y -= deltaX * this.touchLookSensitivity;
      
      // Vertical rotation (pitch) - clamped to prevent flipping
      this.euler.x -= deltaY * this.touchLookSensitivity;
      this.euler.x = Math.max(-this.MAX_PITCH_ANGLE, Math.min(this.MAX_PITCH_ANGLE, this.euler.x));
      
      // Apply rotation
      this.camera.quaternion.setFromEuler(this.euler);
    }
  }
  
  /**
   * Handle touch end event
   * - Stop movement when fingers are lifted
   */
  _handleTouchEnd(event) {
    event.preventDefault();
    
    this.touchCount = event.touches.length;
    
    if (this.touchCount === 0) {
      // All fingers lifted
      this.moveForward = false;
      this.moveBackward = false;
      this.isDoubleTapHold = false;
    } else if (this.touchCount === 1) {
      // Back to one finger - stop backward movement
      this.moveBackward = false;
      
      // Update touch start position for the remaining finger
      const touch = event.touches[0];
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
    }
  }
  
  /**
   * Clean up resources
   */
  dispose() {
    this.disable();
  }
}
