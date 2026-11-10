/**
 * PhotonicScene - Main API for the Photonic 3D visualization framework
 * 
 * This is the primary entry point for creating and managing 3D scenes.
 * It provides a retained-mode API that abstracts Three.js complexity.
 */

import * as THREE from 'three';
import { PhotonicCamera } from './PhotonicCamera';
import { PhotonicRenderer } from './PhotonicRenderer';
import { PhotonicGrid } from './PhotonicGrid';
import { PhotonicInput } from './PhotonicInput';
import { PhotonicXRManager } from './PhotonicXRManager';
import { PhotonicControlSystem } from './PhotonicControlSystem';

export class PhotonicScene {
  constructor(containerElement) {
    this.container = containerElement;
    this.THREE = THREE;
    
    // Create Three.js scene
    this.scene = new THREE.Scene();
    
    // Set cornflower blue background to suggest "sky"
    this.scene.background = new THREE.Color(0x6495ed); // Cornflower blue
    
    // Initialize renderer
    this.renderer = new PhotonicRenderer(this.container);
    
    // Initialize camera (positioned about 1 meter up and back from origin)
    this.camera = new PhotonicCamera(this.container, this.renderer.renderer);
    this.scene.add(this.camera.getRig());
    
    // Initialize grid
    this.grid = new PhotonicGrid();
    this.scene.add(this.grid.floorPlane);
    this.scene.add(this.grid.gridHelper);
    
    // Add lighting
    this._setupLighting();
    
    // Track created objects
    this.objects = new Map();
    this.nextObjectId = 1;
    this.clickHandlers = new Map();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._isWatchingClicks = false;
    this._onSceneClick = this._handleSceneClick.bind(this);
    
    // Track lights for dynamic lighting
    this.lights = new Map();
    this.nextLightId = 1;
    
    // Initialize input system (disabled by default)
    this.input = new PhotonicInput(this.camera.camera, this.renderer.renderer.domElement);
    this.xrManager = new PhotonicXRManager({
      renderer: this.renderer,
      camera: this.camera,
      getSpawnPose: () => this.getDefaultViewerPose()
    });
    this.controls = new PhotonicControlSystem({
      camera: this.camera,
      input: this.input,
      xrManager: this.xrManager
    });
    this._defaultViewerPose = this.camera.captureWorldPose();
    
    // Description callback for UX updates
    this._descriptionCallback = null;
    this._currentDescription = '';
    
    // Last frame time for delta calculation
    this._lastTime = null;
    this._frameCallback = null;
    this._frameElapsedTime = 0;
    this._frameNumber = 0;

    // Start the shared render loop used by standard rendering and WebXR.
    this._animationLoop = (time, xrFrame) => this.animate(time, xrFrame);
    this._isRenderingEnabled = true;
    this.renderer.setAnimationLoop(this._animationLoop);
    
    // Handle window resize
    this._resizeHandler = this.handleResize.bind(this);
    window.addEventListener('resize', this._resizeHandler);
  }
  
  _setupLighting() {
    // Add ambient light for overall illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    this.defaultAmbientLight = ambientLight;
    
    // Add directional light for shadows and definition
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    this.scene.add(directionalLight);
    this.defaultDirectionalLight = directionalLight;
  }
  
  // ==================== Input API ====================
  
  /**
   * Enable FPS-style WASD controls
   * @param {Object} options - Configuration options
   * @param {number} options.moveSpeed - Movement speed in meters per second (default: 5)
   * @param {Function} options.onLockChange - Callback when pointer lock state changes
   * @param {Object} options.movementTuning - Optional advanced movement tuning
   */
  enableFPSControls(options = {}) {
    this.controls.enableFPSControls(options);
  }
  
  /**
   * Disable FPS-style controls and restore orbit controls
   */
  disableFPSControls() {
    this.controls.disableFPSControls();
  }
  
  /**
   * Check if FPS controls are currently active
   */
  isFPSControlsEnabled() {
    return this.controls.isFPSControlsEnabled();
  }
  
  /**
   * Get the input state for the current frame
   */
  getInputState() {
    return this.controls.getInputState();
  }

  async refreshXRSupport() {
    return this.controls.refreshXRSupport();
  }

  getXRState() {
    return this.controls.getXRState();
  }

  onXRStateChange(callback) {
    this.controls.onXRStateChange(callback);
  }

  async enterXR() {
    return this.controls.enterXR();
  }

  async exitXR() {
    return this.controls.exitXR();
  }

  isXRPresenting() {
    return this.xrManager.isPresenting();
  }

  setFrameCallback(callback) {
    this._frameCallback = callback;
    this._frameElapsedTime = 0;
    this._frameNumber = 0;
  }

  clearFrameCallback() {
    this._frameCallback = null;
    this._frameElapsedTime = 0;
    this._frameNumber = 0;
  }

  setRenderingEnabled(enabled) {
    if (this._isRenderingEnabled === enabled || (!enabled && this.isXRPresenting())) {
      return;
    }

    this._isRenderingEnabled = enabled;
    this.renderer.setAnimationLoop(enabled ? this._animationLoop : null);
  }

  setDefaultView({ position, target = null }) {
    const positionVector = position instanceof THREE.Vector3
      ? position.clone()
      : new THREE.Vector3(position.x, position.y, position.z);

    let targetVector = null;
    if (target) {
      targetVector = target instanceof THREE.Vector3
        ? target.clone()
        : new THREE.Vector3(target.x, target.y, target.z);
    }

    const orientationProbe = new THREE.Object3D();
    orientationProbe.position.copy(positionVector);

    if (targetVector) {
      orientationProbe.lookAt(targetVector);
    } else {
      orientationProbe.quaternion.copy(this.camera.getWorldQuaternion(new THREE.Quaternion()));
    }

    this._defaultViewerPose = {
      position: positionVector.clone(),
      quaternion: orientationProbe.quaternion.clone()
    };

    if (this.isXRPresenting()) {
      this.xrManager.realignViewerPose(this._defaultViewerPose);
      return;
    }

    this.camera.setPosition(positionVector.x, positionVector.y, positionVector.z);
    if (targetVector) {
      this.camera.lookAt(targetVector.x, targetVector.y, targetVector.z);
    }
  }

  getDefaultViewerPose() {
    return {
      position: this._defaultViewerPose.position.clone(),
      quaternion: this._defaultViewerPose.quaternion.clone()
    };
  }
  
  // ==================== Description API ====================
  
  /**
   * Set a callback for description updates
   * The callback receives the description string when it changes
   * @param {Function} callback - Function to call with description updates
   */
  onDescriptionChange(callback) {
    this._descriptionCallback = callback;
  }
  
  /**
   * Update the scene description (displayed in UX)
   * @param {string} description - The description text to display
   */
  setDescription(description) {
    this._currentDescription = description;
    if (this._descriptionCallback) {
      this._descriptionCallback(description);
    }
  }
  
  /**
   * Get the current description
   */
  getDescription() {
    return this._currentDescription;
  }
  
  // ==================== Lighting API ====================
  
  /**
   * Set the scene background color
   * @param {number|string} color - Hex color value
   */
  setBackgroundColor(color) {
    this.scene.background = new THREE.Color(color);
  }
  
  /**
   * Set the ambient light intensity and color
   * @param {Object} options - Light options {intensity, color}
   */
  setAmbientLight(options = {}) {
    const { intensity = 0.6, color = 0xffffff } = options;
    this.defaultAmbientLight.intensity = intensity;
    this.defaultAmbientLight.color.setHex(color);
  }
  
  /**
   * Create a point light
   * @param {Object} options - Light configuration
   * @returns {Object} Handle to manipulate the light
   */
  createPointLight(options = {}) {
    const {
      color = 0xffffff,
      intensity = 1,
      distance = 0,
      decay = 2,
      position = { x: 0, y: 5, z: 0 }
    } = options;
    
    const light = new THREE.PointLight(color, intensity, distance, decay);
    light.position.set(position.x, position.y, position.z);
    this.scene.add(light);
    
    const lightId = this.nextLightId++;
    const handle = this._createLightHandle(light, lightId);
    this.lights.set(lightId, { light, handle });
    
    return handle;
  }
  
  /**
   * Create a spot light
   * @param {Object} options - Light configuration
   * @returns {Object} Handle to manipulate the light
   */
  createSpotLight(options = {}) {
    const {
      color = 0xffffff,
      intensity = 1,
      distance = 0,
      angle = Math.PI / 3,
      penumbra = 0,
      decay = 2,
      position = { x: 0, y: 10, z: 0 },
      target = { x: 0, y: 0, z: 0 }
    } = options;
    
    const light = new THREE.SpotLight(color, intensity, distance, angle, penumbra, decay);
    light.position.set(position.x, position.y, position.z);
    light.target.position.set(target.x, target.y, target.z);
    this.scene.add(light);
    this.scene.add(light.target);
    
    const lightId = this.nextLightId++;
    const handle = this._createLightHandle(light, lightId);
    this.lights.set(lightId, { light, handle });
    
    return handle;
  }
  
  /**
   * Create a handle for manipulating lights
   */
  _createLightHandle(light, lightId) {
    const sceneRef = this;
    
    return {
      id: lightId,
      
      setPosition(x, y, z) {
        light.position.set(x, y, z);
        return this;
      },
      
      getPosition() {
        return {
          x: light.position.x,
          y: light.position.y,
          z: light.position.z
        };
      },
      
      setColor(color) {
        light.color.setHex(color);
        return this;
      },
      
      setIntensity(intensity) {
        light.intensity = intensity;
        return this;
      },
      
      remove() {
        sceneRef.scene.remove(light);
        sceneRef.lights.delete(lightId);
      }
    };
  }
  
  // ==================== Material/Shader Helpers ====================
  
  /**
   * Create a material with custom options
   * @param {Object} options - Material configuration
   * @returns {THREE.Material} The created material
   */
  createMaterial(options = {}) {
    const {
      type = 'standard',
      color = 0xffffff,
      emissive = 0x000000,
      emissiveIntensity = 1,
      roughness = 0.5,
      metalness = 0.5,
      opacity = 1,
      transparent = false,
      side = 'front',
      wireframe = false,
      map = null,
      normalMap = null,
      emissiveMap = null
    } = options;
    
    const sideValue = side === 'double' ? THREE.DoubleSide : 
                      side === 'back' ? THREE.BackSide : THREE.FrontSide;
    
    let material;
    
    switch (type) {
      case 'basic':
        material = new THREE.MeshBasicMaterial({
          color,
          opacity,
          transparent,
          side: sideValue,
          wireframe,
          map
        });
        break;
        
      case 'phong':
        material = new THREE.MeshPhongMaterial({
          color,
          emissive,
          emissiveIntensity,
          opacity,
          transparent,
          side: sideValue,
          wireframe,
          map,
          normalMap,
          emissiveMap
        });
        break;
        
      case 'shader':
        // Return a basic shader material for custom shaders
        material = new THREE.ShaderMaterial({
          uniforms: options.uniforms || {},
          vertexShader: options.vertexShader || '',
          fragmentShader: options.fragmentShader || '',
          side: sideValue,
          transparent
        });
        break;
        
      case 'standard':
      default:
        material = new THREE.MeshStandardMaterial({
          color,
          emissive,
          emissiveIntensity,
          roughness,
          metalness,
          opacity,
          transparent,
          side: sideValue,
          wireframe,
          map,
          normalMap,
          emissiveMap
        });
        break;
    }
    
    return material;
  }
  
  /**
   * Load a texture from URL
   * @param {string} url - URL to the texture image
   * @param {Object} options - Texture options
   * @returns {Promise<THREE.Texture>} The loaded texture
   */
  async loadTexture(url, options = {}) {
    const { repeat = { x: 1, y: 1 }, wrapS = 'repeat', wrapT = 'repeat' } = options;
    
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        url,
        (texture) => {
          texture.wrapS = wrapS === 'repeat' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
          texture.wrapT = wrapT === 'repeat' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
          texture.repeat.set(repeat.x, repeat.y);
          resolve(texture);
        },
        undefined,
        (error) => {
          reject(error);
        }
      );
    });
  }
  
  // ==================== Geometry Creation ====================
  
  /**
   * Create a plane in the scene (useful for floors, walls, etc.)
   * @param {Object} options - Plane configuration
   * @returns {Object} Handle to manipulate the plane
   */
  createPlane(options = {}) {
    const {
      width = 10,
      height = 10,
      color = 0x888888,
      position = { x: 0, y: 0, z: 0 },
      rotation = { x: -Math.PI / 2, y: 0, z: 0 }, // Default horizontal
      material = null,
      doubleSided = false
    } = options;
    
    const geometry = new THREE.PlaneGeometry(width, height);
    const mat = material || new THREE.MeshStandardMaterial({ 
      color,
      side: doubleSided ? THREE.DoubleSide : THREE.FrontSide
    });
    const mesh = new THREE.Mesh(geometry, mat);
    
    mesh.position.set(position.x, position.y, position.z);
    mesh.rotation.set(rotation.x, rotation.y, rotation.z);
    
    this.scene.add(mesh);

    return this._registerSceneObject(mesh, options);
  }
  
  /**
   * Create a wall (vertical plane) in the scene
   * @param {Object} options - Wall configuration
   * @returns {Object} Handle to manipulate the wall
   */
  createWall(options = {}) {
    const {
      width = 10,
      height = 3,
      color = 0xcccccc,
      position = { x: 0, y: 1.5, z: 0 },
      rotationY = 0, // Rotation around Y axis in radians
      material = null,
      doubleSided = true
    } = options;
    
    // Create a vertical plane
    return this.createPlane({
      width,
      height,
      color,
      position,
      rotation: { x: 0, y: rotationY, z: 0 },
      material,
      doubleSided
    });
  }
  
  /**
   * Create a cylinder in the scene
   * @param {Object} options - Cylinder configuration
   * @returns {Object} Handle to manipulate the cylinder
   */
  createCylinder(options = {}) {
    const {
      radiusTop = 0.5,
      radiusBottom = 0.5,
      height = 1,
      radialSegments = 32,
      color = 0x00ff00,
      position = { x: 0, y: 0, z: 0 },
      rotation = { x: 0, y: 0, z: 0 },
      material = null
    } = options;
    
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments);
    const mat = material || new THREE.MeshStandardMaterial({ color });
    const mesh = new THREE.Mesh(geometry, mat);
    
    mesh.position.set(position.x, position.y, position.z);
    mesh.rotation.set(rotation.x, rotation.y, rotation.z);
    
    this.scene.add(mesh);

    return this._registerSceneObject(mesh, options);
  }
  
  /**
   * Create a sphere in the scene
   * @param {Object} options - Sphere configuration
   * @returns {Object} Handle to manipulate the sphere
   */
  createSphere(options = {}) {
    const {
      radius = 0.5,
      widthSegments = 32,
      heightSegments = 16,
      color = 0x00ff00,
      position = { x: 0, y: 0, z: 0 },
      material = null
    } = options;
    
    const geometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
    const mat = material || new THREE.MeshStandardMaterial({ color });
    const mesh = new THREE.Mesh(geometry, mat);
    
    mesh.position.set(position.x, position.y, position.z);
    
    this.scene.add(mesh);

    return this._registerSceneObject(mesh, options);
  }
  
  // ==================== Grid/Floor Control ====================
  
  /**
   * Show or hide the default grid
   */
  setGridVisible(visible) {
    this.grid.gridHelper.visible = visible;
  }
  
  /**
   * Show or hide the floor plane
   */
  setFloorVisible(visible) {
    this.grid.floorPlane.visible = visible;
  }

  /**
   * Create a box in the scene
   * @param {Object} options - Box configuration {width, height, depth, color, position, rotation, material}
   * @returns {Object} Handle to manipulate the box
   */
  createBox(options = {}) {
    const {
      width = 1,
      height = 1,
      depth = 1,
      color = 0x00ff00,
      position = { x: 0, y: 0, z: 0 },
      rotation = { x: 0, y: 0, z: 0 },
      material = null
    } = options;
    
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const mat = material || new THREE.MeshStandardMaterial({ color });
    const mesh = new THREE.Mesh(geometry, mat);
    
    mesh.position.set(position.x, position.y, position.z);
    mesh.rotation.set(rotation.x, rotation.y, rotation.z);
    
    this.scene.add(mesh);

    return this._registerSceneObject(mesh, options);
  }
  
  /**
   * Create an arrow in the scene
   * @param {Object} options - Arrow configuration {origin, direction, length, color}
   * @returns {Object} Handle to manipulate the arrow
   */
  createArrow(options = {}) {
    const {
      origin = {x: 0, y: 0, z: 0},
      direction = {x: 0, y: 1, z: 0},
      length = 1,
      color = 0xff0000,
      headLength = 0.2,
      headWidth = 0.1
    } = options;
    
    const dir = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
    const orig = new THREE.Vector3(origin.x, origin.y, origin.z);
    
    const arrow = new THREE.ArrowHelper(dir, orig, length, color, headLength, headWidth);
    this.scene.add(arrow);

    return this._registerSceneObject(arrow, options);
  }

  _registerSceneObject(mesh, options = {}) {
    const objectId = this.nextObjectId++;
    const handle = this._createObjectHandle(mesh, objectId);
    this.objects.set(objectId, { mesh, handle });

    if (typeof options.onClick === 'function') {
      handle.onClick(options.onClick);
    }

    return handle;
  }

  _setObjectClickHandler(objectId, mesh, handle, handler) {
    this.clickHandlers.set(objectId, { mesh, handle, handler });
    mesh.userData.photonicClickableObjectId = objectId;
    this._syncClickWatching();
  }

  _clearObjectClickHandler(objectId) {
    const clickableObject = this.clickHandlers.get(objectId);
    if (!clickableObject) {
      return;
    }

    delete clickableObject.mesh.userData.photonicClickableObjectId;
    this.clickHandlers.delete(objectId);
    this._syncClickWatching();
  }

  _syncClickWatching() {
    const domElement = this.renderer.renderer.domElement;

    if (this.clickHandlers.size > 0 && !this._isWatchingClicks) {
      domElement.addEventListener('click', this._onSceneClick);
      this._isWatchingClicks = true;
      return;
    }

    if (this.clickHandlers.size === 0 && this._isWatchingClicks) {
      domElement.removeEventListener('click', this._onSceneClick);
      this._isWatchingClicks = false;
    }
  }

  _findClickableIntersection(intersectionObject) {
    let current = intersectionObject;

    while (current) {
      const objectId = current.userData?.photonicClickableObjectId;
      if (objectId !== undefined) {
        return this.clickHandlers.get(objectId) || null;
      }
      current = current.parent;
    }

    return null;
  }

  _handleSceneClick(event) {
    if (this.clickHandlers.size === 0) {
      return;
    }

    const domElement = this.renderer.renderer.domElement;
    const rect = domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }

    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera.camera);

    const clickableMeshes = Array.from(this.clickHandlers.values(), ({ mesh }) => mesh);
    const intersections = this.raycaster.intersectObjects(clickableMeshes, true);

    for (const intersection of intersections) {
      const clickableObject = this._findClickableIntersection(intersection.object);
      if (!clickableObject) {
        continue;
      }

      clickableObject.handler({
        event,
        scene: this,
        handle: clickableObject.handle,
        objectId: clickableObject.handle.id,
        point: intersection.point.clone(),
        distance: intersection.distance,
        face: intersection.face,
        normal: intersection.face?.normal?.clone?.() || null,
        uv: intersection.uv?.clone?.() || null
      });
      return;
    }
  }
  
  /**
   * Create a handle for manipulating scene objects
   */
  _createObjectHandle(mesh, objectId) {
    const sceneRef = this; // Capture reference to PhotonicScene instance
    
    return {
      id: objectId,
      
      // Position methods
      setPosition(x, y, z) {
        mesh.position.set(x, y, z);
        return this;
      },
      
      getPosition() {
        return {
          x: mesh.position.x,
          y: mesh.position.y,
          z: mesh.position.z
        };
      },
      
      // Rotation methods (in radians)
      setRotation(x, y, z) {
        mesh.rotation.set(x, y, z);
        return this;
      },
      
      getRotation() {
        return {
          x: mesh.rotation.x,
          y: mesh.rotation.y,
          z: mesh.rotation.z
        };
      },
      
      // Scale methods
      setScale(x, y, z) {
        mesh.scale.set(x, y, z);
        return this;
      },
      
      getScale() {
        return {
          x: mesh.scale.x,
          y: mesh.scale.y,
          z: mesh.scale.z
        };
      },
      
      // Color method (for materials that support it)
      setColor(color) {
        if (mesh.material && mesh.material.color) {
          mesh.material.color.setHex(color);
        }
        return this;
      },
      
      // Visibility
      setVisible(visible) {
        mesh.visible = visible;
        return this;
      },
      
      isVisible() {
        return mesh.visible;
      },
      
      // Parent-child attachment methods
      attach(childHandle) {
        if (!childHandle || !childHandle.id) {
          console.error('Invalid child handle provided to attach()');
          return this;
        }
        
        const childObj = sceneRef.objects.get(childHandle.id);
        if (!childObj) {
          console.error('Child object not found in scene');
          return this;
        }
        
        // Remove child from its current parent (scene or another object)
        if (childObj.mesh.parent) {
          childObj.mesh.parent.remove(childObj.mesh);
        }
        
        // Add child to this object
        mesh.add(childObj.mesh);
        
        return this;
      },
      
      detach() {
        if (mesh.parent && mesh.parent !== sceneRef.scene) {
          // Remove from current parent
          mesh.parent.remove(mesh);
          
          // Add back to the main scene
          sceneRef.scene.add(mesh);
        }
        
        return this;
      },
      
      getParent() {
        // Return the parent handle if it exists and is tracked in our objects map
        if (mesh.parent && mesh.parent !== sceneRef.scene) {
          // Find the parent's handle by searching through our objects
          for (const [id, obj] of sceneRef.objects.entries()) {
            if (obj.mesh === mesh.parent) {
              return obj.handle;
            }
          }
        }
        return null;
      },
      
      getChildren() {
        // Return handles for all children that are tracked in our objects map
        const children = [];
        
        for (const child of mesh.children) {
          // Find the child's handle by searching through our objects
          for (const [id, obj] of sceneRef.objects.entries()) {
            if (obj.mesh === child) {
              children.push(obj.handle);
              break;
            }
          }
        }
        
        return children;
      },

      onClick(handler) {
        if (handler == null) {
          sceneRef._clearObjectClickHandler(objectId);
          return this;
        }

        if (typeof handler !== 'function') {
          console.error('Invalid click handler provided to onClick()');
          return this;
        }

        sceneRef._setObjectClickHandler(objectId, mesh, this, handler);
        return this;
      },

      clearClickHandler() {
        return this.onClick(null);
      },
      
      // Remove from scene
      remove() {
        sceneRef._clearObjectClickHandler(objectId);
        mesh.parent?.remove(mesh);
        mesh.geometry?.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      }
    };
  }
  
  /**
   * Remove an object from the scene
   */
  removeObject(handle) {
    if (this.objects.has(handle.id)) {
      const obj = this.objects.get(handle.id);
      obj.handle.remove();
      this.objects.delete(handle.id);
    }
  }
  
  /**
   * Clear all objects from the scene
   */
  clearObjects() {
    this.objects.forEach((obj) => {
      obj.handle.remove();
    });
    this.objects.clear();
  }

  _getViewerWorldPosition() {
    const viewerPose = this.xrManager.getViewerWorldPose();
    return viewerPose?.position ?? this.camera.getWorldPosition(new THREE.Vector3());
  }
  
  /**
   * Animation loop
   */
  animate(currentTime = performance.now(), xrFrame = null) {
    if (this._lastTime === null) {
      this._lastTime = currentTime;
    }

    const deltaTime = Math.max(0, (currentTime - this._lastTime) / 1000);
    this._lastTime = currentTime;

    this.controls.beginFrame(xrFrame);
    this.controls.update(deltaTime);

    if (this._frameCallback) {
      this._frameElapsedTime += deltaTime;
      this._frameNumber += 1;
      this._frameCallback(deltaTime, {
        deltaTime,
        elapsedTime: this._frameElapsedTime,
        frame: this._frameNumber,
        xrFrame,
        isXRPresenting: this.isXRPresenting()
      });
    }

    // Update grid LOD based on the current viewer position.
    this.grid.updateCameraPosition(this._getViewerWorldPosition());

    // Render the scene
    this.renderer.render(this.scene, this.camera.camera);
  }
  
  /**
   * Get camera position
   */
  getCameraPosition() {
    const position = this._getViewerWorldPosition();
    return {
      x: position.x,
      y: position.y,
      z: position.z
    };
  }

  /**
   * Get the camera look target.
   */
  getCameraTarget() {
    if (this.isXRPresenting()) {
      const viewerPose = this.xrManager.getViewerWorldPose();
      if (!viewerPose) {
        return null;
      }

      const target = new THREE.Vector3(0, 0, -1)
        .applyQuaternion(viewerPose.quaternion)
        .add(viewerPose.position);

      return {
        x: target.x,
        y: target.y,
        z: target.z
      };
    }

    const target = this.camera.controls?.target ?? this.camera.target;
    if (!target) {
      return null;
    }

    return {
      x: target.x,
      y: target.y,
      z: target.z
    };
  }

  /**
   * Get the current player position when FPS controls are active.
   */
  getPlayerPosition() {
    if (!this.isFPSControlsEnabled() && !this.isXRPresenting()) {
      return null;
    }

    return this.getCameraPosition();
  }
  
  /**
   * Set camera position directly
   */
  setCameraPosition(x, y, z) {
    if (this.isXRPresenting()) {
      return;
    }

    this.camera.setPosition(x, y, z);
  }

  /**
   * Set camera look target directly.
   */
  setCameraTarget(x, y, z) {
    if (this.isXRPresenting()) {
      return;
    }

    this.camera.lookAt(x, y, z);
  }
  
  /**
   * Handle window resize
   */
  handleResize() {
    this.camera.handleResize();
    this.renderer.handleResize();
  }
  
  // ==================== Gaussian Splat API ====================

  /**
   * Load a Gaussian Splat asset into the scene.
   *
   * Supported formats: .spz (Scaniverse), .ply, .splat, .ksplat
   * Backed by @sparkjsdev/spark (lazy-loaded on first call).
   *
   * @param {Object} options
   * @param {string}  options.url      - URL to the splat file
   * @param {string}  [options.format] - Force format: 'spz'|'ply'|'splat'|'ksplat'|'auto'
   * @param {[number,number,number]} [options.position] - World position [x,y,z]
   * @param {[number,number,number]} [options.rotation] - Euler rotation in radians [x,y,z]
   * @param {number|[number,number,number]} [options.scale] - Uniform or per-axis scale
   * @param {Function} [options.onLoad]  - Called when the splat finishes loading
   * @param {Function} [options.onError] - Called if loading fails
   * @returns {Promise<Object>} Handle with setPosition/setRotation/setScale/dispose
   */
  async loadSplat(options = {}) {
    const {
      url,
      position = [0, 0, 0],
      rotation = [0, 0, 0],
      scale = 1,
      onLoad = null,
      onError = null
    } = options;

    if (!url) {
      throw new Error('PhotonicScene.loadSplat: options.url is required');
    }

    // Lazy-load Spark so it is not included in the core viz bundle.
    let SplatMesh;
    try {
      ({ SplatMesh } = await import(/* webpackChunkName: "spark" */ '@sparkjsdev/spark'));
    } catch (err) {
      const msg = `PhotonicScene.loadSplat: failed to load @sparkjsdev/spark – ${err.message}. ` +
        'Ensure @sparkjsdev/spark is listed in frontend/package.json and the frontend has been built.';
      console.error(msg, err);
      if (onError) onError(new Error(msg));
      throw new Error(msg);
    }

    // Create the Spark SplatMesh (a THREE.Object3D subclass).
    const splatMesh = new SplatMesh({ url, onLoad });
    splatMesh.initialized.catch((err) => {
      console.error(`PhotonicScene.loadSplat: failed to load splat from "${url}"`, err);
      if (onError) onError(err);
    });

    // Apply initial transform.
    splatMesh.position.set(position[0], position[1], position[2]);
    splatMesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    if (Array.isArray(scale)) {
      splatMesh.scale.set(scale[0], scale[1], scale[2]);
    } else {
      splatMesh.scale.setScalar(scale);
    }

    this.scene.add(splatMesh);

    // Return a Photonic-style handle for the caller.
    return {
      setPosition(x, y, z) {
        splatMesh.position.set(x, y, z);
        return this;
      },
      setRotation(x, y, z) {
        splatMesh.rotation.set(x, y, z);
        return this;
      },
      setScale(x, y, z) {
        if (y === undefined) {
          splatMesh.scale.setScalar(x);
        } else {
          splatMesh.scale.set(x, y, z);
        }
        return this;
      },
      getPosition() {
        return { x: splatMesh.position.x, y: splatMesh.position.y, z: splatMesh.position.z };
      },
      getRotation() {
        return { x: splatMesh.rotation.x, y: splatMesh.rotation.y, z: splatMesh.rotation.z };
      },
      getScale() {
        return { x: splatMesh.scale.x, y: splatMesh.scale.y, z: splatMesh.scale.z };
      },
      getSplatCount() {
        return splatMesh.packedSplats?.numSplats ?? 0;
      },
      getSplat(index) {
        return splatMesh.packedSplats?.getSplat(index) ?? null;
      },
      getBoundingBox(centersOnly = false) {
        return splatMesh.getBoundingBox(centersOnly);
      },
      setVisible(visible) {
        splatMesh.visible = visible;
        return this;
      },
      dispose() {
        if (splatMesh.parent) {
          splatMesh.parent.remove(splatMesh);
        }
        if (typeof splatMesh.dispose === 'function') {
          splatMesh.dispose();
        }
      }
    };
  }

  /**
   * Clean up resources
   */
  dispose() {
    window.removeEventListener('resize', this._resizeHandler);
    this.clearFrameCallback();
    this.controls.dispose();
    this.clearObjects();
    if (this._isWatchingClicks) {
      this.renderer.renderer.domElement.removeEventListener('click', this._onSceneClick);
      this._isWatchingClicks = false;
    }
    this.renderer.dispose();
    this.camera.dispose();
  }
}
