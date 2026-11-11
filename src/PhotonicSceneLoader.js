/**
 * PhotonicSceneLoader - Dynamic scene module loading system
 * 
 * Loads scene modules that define Load, Update, and Unload lifecycle methods.
 * Modules are ordinary ES modules loaded with dynamic import() from a
 * configurable base (options.moduleBaseUrl, or an explicit options.moduleUrls
 * name-to-URL map), defaulting to ./modules/ beside the consuming page.
 * A module may export Load/Update/Unload/Metadata, or register the same
 * shape on window.PhotonicModules as a compatibility shim.
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
    this.moduleBaseUrl = typeof options.moduleBaseUrl === 'string' && options.moduleBaseUrl
      ? options.moduleBaseUrl
      : './modules/';
    this.moduleUrls = (options.moduleUrls && typeof options.moduleUrls === 'object')
      ? options.moduleUrls
      : null;
    
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

      // Dynamically import the module
      const module = await this._loadModule(moduleUrl, moduleName);

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
   * Dynamically import a scene module
   * @param {string} url - URL of the module to import
   * @param {string} moduleName - Module file name (for the registry shim)
   * @returns {Promise<Object>} The loaded module
   */
  async _loadModule(url, moduleName) {
    let namespace = null;
    try {
      namespace = await import(/* @vite-ignore */ url);
    } catch (error) {
      // Fall through to the registry shim check before failing.
      namespace = null;
      var importError = error;
    }
    const candidate = namespace?.Load ? namespace
      : (namespace?.default?.Load ? namespace.default : null);
    if (candidate) {
      return {
        Load: candidate.Load,
        Update: candidate.Update,
        Unload: candidate.Unload,
        Metadata: candidate.Metadata
      };
    }
    // Compatibility shim: a module that registered instead of exporting.
    const registrationName = this._getModuleRegistrationName(url);
    const registered = (typeof window !== 'undefined' && window.PhotonicModules)
      ? window.PhotonicModules[registrationName]
      : null;
    if (registered && typeof registered.Load === 'function') {
      return registered;
    }
    if (importError) {
      throw importError;
    }
    throw new Error(`Module '${moduleName}' does not export a Load function`);
  }

  _buildModuleUrl(moduleName) {
    if (this.moduleUrls && typeof this.moduleUrls[moduleName] === 'string') {
      return new URL(this.moduleUrls[moduleName], window.location.href).href;
    }
    return new URL(moduleName, new URL(this.moduleBaseUrl, window.location.href)).href;
  }

  _getModuleRegistrationName(url) {
    const resolvedUrl = new URL(url, window.location.href);
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
