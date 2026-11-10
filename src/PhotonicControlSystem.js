export class PhotonicControlSystem {
  constructor({ camera, input, xrManager }) {
    this.camera = camera;
    this.input = input;
    this.xrManager = xrManager;

    this.mode = 'orbit';
    this._modeBeforeXR = 'orbit';
    this._xrStateChangeCallback = null;

    this.xrManager.onStateChange((state) => {
      if (!state.active && !state.entering && this.mode === 'xr') {
        this._restoreModeAfterXR();
      }

      this._xrStateChangeCallback?.({
        ...state,
        mode: this.mode
      });
    });
  }

  enableFPSControls(options = {}) {
    const {
      moveSpeed = 5,
      onLockChange = null,
      movementTuning = null
    } = options;

    this.camera.setOrbitEnabled(false);
    this.input.setMoveSpeed(moveSpeed);
    this.input.setMovementTuning(movementTuning);
    this.input.onLockChange = onLockChange;

    if (!this.xrManager.isPresenting()) {
      this.input.enable();
      this.mode = 'fps';
    } else {
      this._modeBeforeXR = 'fps';
    }
  }

  disableFPSControls() {
    this.input.disable();

    if (!this.xrManager.isPresenting()) {
      this.camera.setOrbitEnabled(true);
      this.mode = 'orbit';
    } else {
      this._modeBeforeXR = 'orbit';
    }
  }

  isFPSControlsEnabled() {
    return this.input.enabled;
  }

  getInputState() {
    return {
      ...this.input.getInputState(),
      mode: this.mode,
      isXRPresenting: this.xrManager.isPresenting(),
      xrSupported: this.xrManager.supported
    };
  }

  onXRStateChange(callback) {
    this._xrStateChangeCallback = callback;
  }

  async refreshXRSupport() {
    return this.xrManager.checkSupport();
  }

  getXRState() {
    return {
      ...this.xrManager.getState(),
      mode: this.mode
    };
  }

  async enterXR() {
    this._modeBeforeXR = this.input.enabled ? 'fps' : 'orbit';

    if (this.input.enabled) {
      this.input.disable();
    }

    this.camera.setOrbitEnabled(false);
    this.mode = 'xr';

    try {
      return await this.xrManager.enter();
    } catch (error) {
      this._restoreModeAfterXR();
      throw error;
    }
  }

  async exitXR() {
    await this.xrManager.exit();
  }

  beginFrame(xrFrame) {
    if (this.xrManager.isPresenting()) {
      this.xrManager.beginFrame(xrFrame);
    }
  }

  update(deltaTime) {
    if (this.xrManager.isPresenting()) {
      return;
    }

    if (this.input.enabled) {
      this.input.update(deltaTime);
      return;
    }

    this.camera.update();
  }

  async dispose() {
    this.input.disable();
    await this.xrManager.dispose();
  }

  _restoreModeAfterXR() {
    if (this._modeBeforeXR === 'fps') {
      this.input.enable();
      this.mode = 'fps';
      return;
    }

    this.input.disable();
    this.camera.setOrbitEnabled(true);
    this.mode = 'orbit';
  }
}
