/**
 * Photonic - 3D Visualization Framework
 * Library entry point. Exports the engine only: no DOM access,
 * no auto-run, and no host-page wiring (see examples/host-page/).
 */

export { PhotonicScene } from './photonicscene.js';
export { PhotonicSceneLoader } from './photonicsceneloader.js';
export { PhotonicCamera } from './photoniccamera.js';
export { PhotonicRenderer } from './photonicrenderer.js';
export { PhotonicGrid } from './photonicgrid.js';
export { PhotonicInput } from './photonicinput.js';
export { PhotonicXRManager } from './photonicxrmanager.js';
export { PhotonicControlSystem } from './photoniccontrolsystem.js';
export { PhotonicOverlay, createPoseOverlay, normalizePose, deviationColorHex, DEFAULT_OVERLAY_STYLE, POSE_CONNECTIONS, COCO17_JOINT_NAMES } from './photonicoverlay.js';
export { PhotonicSkeleton, createSkeleton, normalizeSkeletonPose, DEFAULT_SKELETON_STYLE } from './photonicskeleton.js';
export { PhotonicVirtualCamera, createVirtualCamera, captureSceneStream, captureOverlayStream, VIRTUAL_CAMERA_KIND } from './photonicvirtualcamera.js';
export { estimateSplatCamera } from './splatcameraheuristics.js';
export { solveOriginPoseForViewerPose, composeViewerWorldPose, createPose } from './xrposemath.js';
