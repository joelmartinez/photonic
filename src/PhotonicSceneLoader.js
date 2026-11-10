/**
 * PhotonicSceneLoader - Dynamic scene module loading system
 * 
 * Loads external scene modules that define Load, Update, and Unload lifecycle methods.
 * Modules are loaded from the same domain for security.
 * 
 * Module interface:
 * - Load(scene): Called when module loads, returns state object
 * - Update(scene, state, deltaTime, frameState): Called every frame
 * - Unload(scene, state): Called when module unloads
 * - Metadata (optional): Object with { title, description } for UX display
 */

export class PhotonicSceneLoader {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.currentModule = null;
    this.moduleState = null;
    this.isRunning = false;
    this.elapsedTime = 0;
    this.frameNumber = 0;
    this.lastRequestedModuleUrl = null;
    this.siteVersion = typeof options.siteVersion === 'string'
      ? options.siteVersion.trim()
      : '';
    
    // Description change callback
    this._onDescriptionChange = null;
  }

  /**
   * Set callback for description changes
   * @param {Function} callback - Function to call with (description, title) when description changes
   */
  onDescriptionChange(callback) {
    this._onDescriptionChange = callback;
    
    // Also hook into the scene's description callback
    this.scene.onDescriptionChange((description) => {
      if (this._onDescriptionChange) {
        const title = this.currentModule?.module?.Metadata?.title || 
                      (this.currentModule ? this.getCurrentModuleName() : 'Photonic Scene');
        this._onDescriptionChange(description, title);
      }
    });
  }

  /**
   * Load a scene module from a script file
   * @param {string} moduleName - Name of the module file (e.g., 'box.js')
   * @returns {Promise<void>}
   */
  async loadModule(moduleName) {
    // Unload any existing module first
    if (this.currentModule) {
      await this.unloadModule();
    }

    try {
      // Validate module name to prevent path traversal
      if (!moduleName || !/^[a-zA-Z0-9_-]+\.js$/.test(moduleName)) {
        throw new Error(`Invalid module name: ${moduleName}`);
      }

      // Build the module URL (relative to current domain)
      const moduleUrl = this._buildModuleUrl(moduleName);
      this.lastRequestedModuleUrl = moduleUrl;
      
      console.log(`Loading Photonic module: ${moduleUrl}`);

      // Dynamically load the script
      const module = await this._loadScript(moduleUrl);

      if (!module || typeof module.Load !== 'function') {
        throw new Error(`Module ${moduleName} does not export a Load function`);
      }

      // Store module reference before calling Load (so metadata is available)
      this.currentModule = {
        name: moduleName,
        module: module,
        hasUpdate: typeof module.Update === 'function',
        hasUnload: typeof module.Unload === 'function'
      };

      // Set initial description from module metadata
      if (module.Metadata) {
        const { title, description } = module.Metadata;
        if (description) {
          this.scene.setDescription(description);
        }
        // Notify description change callback
        if (this._onDescriptionChange) {
          this._onDescriptionChange(description || '', title || moduleName);
        }
      }

      // Call the module's Load function with the Photonic API
      this.moduleState = await module.Load(this.scene);

      // Start the update loop if the module has an Update function
      if (this.currentModule.hasUpdate) {
        this.startUpdateLoop();
      }

      console.log(`Photonic module loaded: ${moduleName}`);

    } catch (error) {
      console.error(`Failed to load Photonic module: ${moduleName}`, error);
      this.currentModule = null;
      throw error;
    }
  }

  /**
   * Dynamically load a JavaScript module
   * @param {string} url - URL of the script to load
   * @returns {Promise<Object>} The loaded module
   */
  _loadScript(url) {
    return new Promise((resolve, reject) => {
      // Initialize the PhotonicModules namespace if needed
      if (!window.PhotonicModules) {
        window.PhotonicModules = {};
      }

      // Extract module name from URL (e.g., "box" from "/script/photonics/box.js")
      const moduleName = this._getModuleRegistrationName(url);

      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = url;
      script.async = true;

      script.onload = () => {
        // Give the script time to register itself
        setTimeout(() => {
          const module = window.PhotonicModules[moduleName];
          
          if (module) {
            resolve(module);
          } else {
            reject(new Error(`Module '${moduleName}' did not register itself in window.PhotonicModules`));
          }
        }, 10);
      };

      script.onerror = () => {
        document.head.removeChild(script);
        reject(new Error(`Failed to load script: ${url}`));
      };
      
      document.head.appendChild(script);
    });
  }

  _buildModuleUrl(moduleName) {
    const moduleUrl = new URL(`/script/photonics/${moduleName}`, window.location.origin);

    if (this.siteVersion) {
      moduleUrl.searchParams.set('v', this.siteVersion);
    }

    return `${moduleUrl.pathname}${moduleUrl.search}`;
  }

  _getModuleRegistrationName(url) {
    const resolvedUrl = new URL(url, window.location.origin);
    const fileName = resolvedUrl.pathname.split('/').pop() || '';

    return fileName.replace(/\.js$/i, '');
  }

  getModuleUrl(moduleName) {
    return this._buildModuleUrl(moduleName);
  }

  getLastRequestedModuleUrl() {
    return this.lastRequestedModuleUrl;
  }

  /**
   * Start the update loop for the current module
   */
  startUpdateLoop() {
    if (this.isRunning || !this.currentModule?.hasUpdate) {
      return;
    }

    this.isRunning = true;
    this.elapsedTime = 0;
    this.frameNumber = 0;
    this.scene.setFrameCallback((deltaTime, sceneFrameState) => {
      if (!this.isRunning) {
        return;
      }

      this.elapsedTime += deltaTime;
      this.frameNumber += 1;

      const frameState = {
        ...sceneFrameState,
        elapsedTime: this.elapsedTime,
        frame: this.frameNumber
      };

      try {
        this.currentModule.module.Update(this.scene, this.moduleState, deltaTime, frameState);
      } catch (error) {
        console.error('Error in module Update:', error);
        this.stopUpdateLoop();
      }
    });
  }

  /**
   * Stop the update loop
   */
  stopUpdateLoop() {
    this.isRunning = false;
    this.elapsedTime = 0;
    this.frameNumber = 0;
    this.scene.clearFrameCallback();
  }

  /**
   * Unload the current module
   * @returns {Promise<void>}
   */
  async unloadModule() {
    if (!this.currentModule) {
      return;
    }

    console.log(`Unloading Photonic module: ${this.currentModule.name}`);

    // Stop the update loop
    this.stopUpdateLoop();

    // Call the module's Unload function if it exists
    if (this.currentModule.hasUnload) {
      try {
        await this.currentModule.module.Unload(this.scene, this.moduleState);
      } catch (error) {
        console.error('Error in module Unload:', error);
      }
    }

    // Clear all objects from the scene
    this.scene.clearObjects();
    
    // Clear all lights
    this.scene.lights.forEach((lightObj) => {
      lightObj.handle.remove();
    });
    this.scene.lights.clear();
    
    // Reset scene settings to defaults
    this.scene.setBackgroundColor(0x6495ed); // Cornflower blue
    this.scene.setAmbientLight({ intensity: 0.6, color: 0xffffff });
    this.scene.setGridVisible(true);
    this.scene.setFloorVisible(true);
    this.scene.disableFPSControls();
    this.scene.setDescription('');

    // Clear module references
    this.currentModule = null;
    this.moduleState = null;
  }

  /**
   * Get the currently loaded module name
   * @returns {string|null}
   */
  getCurrentModuleName() {
    return this.currentModule?.name || null;
  }
  
  /**
   * Get the module metadata
   * @returns {Object|null}
   */
  getModuleMetadata() {
    return this.currentModule?.module?.Metadata || null;
  }

  /**
   * Check if a module is currently loaded
   * @returns {boolean}
   */
  hasModule() {
    return this.currentModule !== null;
  }
}
