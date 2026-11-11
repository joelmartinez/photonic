import * as THREE from 'three';
import {
  composeViewerWorldPose,
  createPose,
  solveOriginPoseForViewerPose
} from './xrPoseMath.js';

const OPTIONAL_FEATURES = ['local-floor', 'bounded-floor', 'hand-tracking'];

export class PhotonicXRManager {
  constructor({ renderer, camera, getSpawnPose }) {
    this.renderer = renderer;
    this.camera = camera;
    this.getSpawnPose = getSpawnPose;

    this.supported = null;
    this.entering = false;
    this.session = null;
    this.error = null;
    this.pendingSpawnAlignment = false;
    this.lastViewerWorldPose = null;
    this.lastViewerLocalPosition = null;
    this.lastViewerLocalQuaternion = null;
    this._stateChangeCallback = null;

    this._handleSessionEnd = this._handleSessionEnd.bind(this);
  }

  onStateChange(callback) {
    this._stateChangeCallback = callback;
    this._emitState();
  }

  getState() {
    return {
      supported: this.supported,
      available: typeof navigator !== 'undefined' && !!navigator.xr,
      entering: this.entering,
      active: !!this.session,
      presenting: this.isPresenting(),
      error: this.error
    };
  }

  async checkSupport() {
    if (this.supported !== null) {
      return this.supported;
    }

    if (typeof navigator === 'undefined' || !navigator.xr?.isSessionSupported) {
      this.supported = false;
      this._emitState();
      return this.supported;
    }

    try {
      this.supported = await navigator.xr.isSessionSupported('immersive-vr');
      this.error = null;
    } catch (error) {
      this.supported = false;
      this.error = error;
    }

    this._emitState();
    return this.supported;
  }

  isPresenting() {
    return !!this.session && this.renderer.isXRPresenting();
  }

  async enter() {
    if (this.session || this.entering) {
      return this.session;
    }

    const supported = await this.checkSupport();
    if (!supported) {
      throw new Error('WebXR immersive-vr is not available in this browser.');
    }

    this.entering = true;
    this.error = null;
    this._emitState();

    let session = null;

    try {
      session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: OPTIONAL_FEATURES
      });

      session.addEventListener('end', this._handleSessionEnd);
      this.renderer.setXRReferenceSpaceType('local-floor');
      await this.renderer.setXRSession(session);

      this.session = session;
      this.pendingSpawnAlignment = true;
      this.lastViewerWorldPose = null;
      this.lastViewerLocalPosition = null;
      this.lastViewerLocalQuaternion = null;
      return session;
    } catch (error) {
      this.error = error;

      if (session) {
        session.removeEventListener('end', this._handleSessionEnd);
        try {
          await session.end();
        } catch {
          // Ignore cleanup failures.
        }
      }

      throw error;
    } finally {
      this.entering = false;
      this._emitState();
    }
  }

  async exit() {
    if (!this.session) {
      return;
    }

    await this.session.end();
  }

  beginFrame(xrFrame) {
    if (!this.isPresenting() || !xrFrame) {
      return;
    }

    const referenceSpace = this.renderer.getXRReferenceSpace();
    if (!referenceSpace) {
      return;
    }

    const viewerPose = xrFrame.getViewerPose(referenceSpace);
    if (!viewerPose?.transform) {
      return;
    }

    const viewerLocalPosition = new THREE.Vector3(
      viewerPose.transform.position.x,
      viewerPose.transform.position.y,
      viewerPose.transform.position.z
    );

    const viewerLocalQuaternion = new THREE.Quaternion(
      viewerPose.transform.orientation.x,
      viewerPose.transform.orientation.y,
      viewerPose.transform.orientation.z,
      viewerPose.transform.orientation.w
    );

    if (this.pendingSpawnAlignment) {
      this.realignViewerPose(this._resolveSpawnPose(), {
        viewerLocalPosition,
        viewerLocalQuaternion
      });
      this.pendingSpawnAlignment = false;
    }

    this.lastViewerLocalPosition = viewerLocalPosition.clone();
    this.lastViewerLocalQuaternion = viewerLocalQuaternion.clone();

    const rig = this.camera.getRig();
    this.lastViewerWorldPose = composeViewerWorldPose({
      originPosition: rig.position,
      originQuaternion: rig.quaternion,
      viewerLocalPosition,
      viewerLocalQuaternion
    });
  }

  getViewerWorldPose() {
    return this.lastViewerWorldPose
      ? createPose(this.lastViewerWorldPose.position, this.lastViewerWorldPose.quaternion)
      : null;
  }

  realignViewerPose(pose, viewerPose = null) {
    const viewerLocalPosition = viewerPose?.viewerLocalPosition ?? this.lastViewerLocalPosition;
    const viewerLocalQuaternion = viewerPose?.viewerLocalQuaternion ?? this.lastViewerLocalQuaternion;

    if (!viewerLocalPosition || !viewerLocalQuaternion) {
      this.pendingSpawnAlignment = true;
      return;
    }

    const resolvedPose = createPose(pose.position, pose.quaternion);
    const originPose = solveOriginPoseForViewerPose({
      viewerLocalPosition,
      viewerLocalQuaternion,
      desiredWorldPosition: resolvedPose.position,
      desiredWorldQuaternion: resolvedPose.quaternion
    });

    this.camera.applyRigPose(originPose.position, originPose.quaternion);
    this.lastViewerWorldPose = resolvedPose;
    this.pendingSpawnAlignment = false;
  }

  async dispose() {
    if (this.session) {
      try {
        await this.session.end();
      } catch {
        // Ignore cleanup failures during disposal.
      }
    }
  }

  _resolveSpawnPose() {
    const spawnPose = this.getSpawnPose?.();
    return spawnPose
      ? createPose(spawnPose.position, spawnPose.quaternion)
      : this.camera.captureWorldPose();
  }

  _handleSessionEnd() {
    const finalPose = this.lastViewerWorldPose ?? this._resolveSpawnPose();
    this.camera.bakeWorldPoseToLocal(finalPose);

    if (this.session) {
      this.session.removeEventListener('end', this._handleSessionEnd);
    }

    this.session = null;
    this.pendingSpawnAlignment = false;
    this.lastViewerWorldPose = null;
    this.lastViewerLocalPosition = null;
    this.lastViewerLocalQuaternion = null;
    this.entering = false;
    this.error = null;
    this._emitState();
  }

  _emitState() {
    this._stateChangeCallback?.(this.getState());
  }
}
