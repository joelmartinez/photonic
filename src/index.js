/**
 * Photonic - 3D Visualization Framework
 * Library entry point. Exports the engine only: no DOM access,
 * no auto-run, and no host-page wiring (see examples/host-page/).
 */

export { PhotonicScene } from './PhotonicScene.js';
export { PhotonicSceneLoader } from './PhotonicSceneLoader.js';
export { PhotonicCamera } from './PhotonicCamera.js';
export { PhotonicRenderer } from './PhotonicRenderer.js';
export { PhotonicGrid } from './PhotonicGrid.js';
export { PhotonicInput } from './PhotonicInput.js';
export { PhotonicXRManager } from './PhotonicXRManager.js';
export { PhotonicControlSystem } from './PhotonicControlSystem.js';
export { PhotonicOverlay, createPoseOverlay, normalizePose, deviationColorHex, DEFAULT_OVERLAY_STYLE, POSE_CONNECTIONS, COCO17_JOINT_NAMES } from './PhotonicOverlay.js';
export { PhotonicVirtualCamera, createVirtualCamera, captureSceneStream, captureOverlayStream, VIRTUAL_CAMERA_KIND } from './PhotonicVirtualCamera.js';
export { estimateSplatCamera } from './splatCameraHeuristics.js';
export { solveOriginPoseForViewerPose, composeViewerWorldPose, createPose } from './xrPoseMath.js';
