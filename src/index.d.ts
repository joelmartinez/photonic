// Photonic public API types. Hand-written to match src/index.js at runtime.
// Three.js objects that cross the API are typed structurally (Vector3Like and
// friends) or as unknown, because the three package ships no bundled types.

export interface Vector2Like { x: number; y: number; }
export interface Vector3Like { x: number; y: number; z: number; }
export interface QuaternionLike { x: number; y: number; z: number; w: number; }
export interface PoseLike { position: unknown; quaternion: unknown; }
export type ColorValue = number | string;

export interface SceneObjectHandle {
  readonly id: number;
  setPosition(x: number, y: number, z: number): SceneObjectHandle;
  getPosition(): Vector3Like;
  setRotation(x: number, y: number, z: number): SceneObjectHandle;
  getRotation(): Vector3Like;
  setScale(x: number, y: number, z: number): SceneObjectHandle;
  getScale(): Vector3Like;
  setColor(color: ColorValue): SceneObjectHandle;
  setVisible(visible: boolean): SceneObjectHandle;
  isVisible(): boolean;
  attach(child: SceneObjectHandle): SceneObjectHandle;
  detach(): SceneObjectHandle;
  getParent(): SceneObjectHandle | null;
  getChildren(): SceneObjectHandle[];
  onClick(handler: ((handle: SceneObjectHandle, event?: unknown) => void) | null): SceneObjectHandle;
  clearClickHandler(): SceneObjectHandle;
  remove(): void;
}

export interface LightHandle {
  setPosition(x: number, y: number, z: number): LightHandle;
  getPosition(): Vector3Like;
  setColor(color: ColorValue): LightHandle;
  setIntensity(intensity: number): LightHandle;
  remove(): void;
}

export interface SplatHandle {
  setPosition(x: number, y: number, z: number): SplatHandle;
  setRotation(x: number, y: number, z: number): SplatHandle;
  setScale(x: number, y?: number, z?: number): SplatHandle;
  getPosition(): Vector3Like;
  getRotation(): Vector3Like;
  getScale(): Vector3Like;
  getSplatCount(): number;
  getSplat(index: number): unknown;
  getBoundingBox(centersOnly?: boolean): unknown;
  setVisible(visible: boolean): SplatHandle;
  dispose(): void;
}

export interface CreateShapeOptions {
  color?: ColorValue;
  position?: Partial<Vector3Like>;
  rotation?: Partial<Vector3Like>;
  material?: unknown;
  [key: string]: unknown;
}

export interface LoadSplatOptions {
  url: string;
  format?: 'spz' | 'ply' | 'splat' | 'ksplat' | 'auto';
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  onLoad?: () => void;
  onError?: (error: unknown) => void;
}

export interface FrameState {
  deltaTime: number;
  elapsedTime: number;
  frame: number;
  xrFrame: unknown;
  isXRPresenting: boolean;
}

export interface XRState {
  supported: boolean | null;
  available: boolean;
  entering: boolean;
  active: boolean;
  presenting: boolean;
  error: unknown;
}

export declare class PhotonicScene {
  constructor(containerElement: HTMLElement);
  readonly container: HTMLElement;
  readonly THREE: unknown;
  scene: unknown;
  renderer: PhotonicRenderer;
  camera: PhotonicCamera;
  grid: PhotonicGrid;
  input: PhotonicInput;
  xrManager: PhotonicXRManager;
  controls: PhotonicControlSystem;
  objects: Map<number, unknown>;
  lights: Map<number, unknown>;
  enableFPSControls(options?: { moveSpeed?: number; onLockChange?: ((locked: boolean) => void) | null; movementTuning?: unknown }): void;
  disableFPSControls(): void;
  isFPSControlsEnabled(): boolean;
  getInputState(): Record<string, unknown>;
  refreshXRSupport(): Promise<boolean>;
  getXRState(): XRState;
  onXRStateChange(callback: (state: XRState) => void): void;
  enterXR(): Promise<unknown>;
  exitXR(): Promise<void>;
  isXRPresenting(): boolean;
  setFrameCallback(callback: ((deltaTime: number, frameState: FrameState) => void) | null): void;
  clearFrameCallback(): void;
  setRenderingEnabled(enabled: boolean): void;
  setDefaultView(view: { position: Vector3Like | [number, number, number]; target?: Vector3Like | [number, number, number] | null }): void;
  getDefaultViewerPose(): PoseLike;
  onDescriptionChange(callback: (description: string) => void): void;
  setDescription(description: string): void;
  getDescription(): string;
  setBackgroundColor(color: ColorValue): void;
  setAmbientLight(options?: { intensity?: number; color?: ColorValue }): void;
  createPointLight(options?: Record<string, unknown>): LightHandle;
  createSpotLight(options?: Record<string, unknown>): LightHandle;
  createMaterial(options?: Record<string, unknown>): unknown;
  loadTexture(url: string, options?: Record<string, unknown>): Promise<unknown>;
  createPlane(options?: CreateShapeOptions): SceneObjectHandle;
  createWall(options?: CreateShapeOptions & { rotationY?: number }): SceneObjectHandle;
  createCylinder(options?: CreateShapeOptions & { radiusTop?: number; radiusBottom?: number; height?: number; radialSegments?: number }): SceneObjectHandle;
  createSphere(options?: CreateShapeOptions & { radius?: number; widthSegments?: number; heightSegments?: number }): SceneObjectHandle;
  createBox(options?: CreateShapeOptions & { width?: number; height?: number; depth?: number }): SceneObjectHandle;
  createArrow(options?: { origin?: Partial<Vector3Like>; direction?: Partial<Vector3Like>; length?: number; color?: ColorValue; headLength?: number; headWidth?: number }): SceneObjectHandle;
  setGridVisible(visible: boolean): void;
  setFloorVisible(visible: boolean): void;
  removeObject(handle: SceneObjectHandle): void;
  clearObjects(): void;
  animate(currentTime?: number, xrFrame?: unknown): void;
  getCameraPosition(): Vector3Like;
  getCameraTarget(): Vector3Like | null;
  getPlayerPosition(): Vector3Like | null;
  setCameraPosition(x: number, y: number, z: number): void;
  setCameraTarget(x: number, y: number, z: number): void;
  handleResize(): void;
  loadSplat(options: LoadSplatOptions): Promise<SplatHandle>;
  dispose(): void;
}

export interface SceneModule {
  Load(scene: PhotonicScene): unknown;
  Update?: (scene: PhotonicScene, state: unknown, deltaTime: number, frameState: FrameState & { elapsedTime: number; frame: number }) => void;
  Unload?: (scene: PhotonicScene, state: unknown) => unknown;
  Metadata?: { title?: string; description?: string };
}

export interface PhotonicSceneLoaderOptions {
  moduleBaseUrl?: string;
  moduleUrls?: Record<string, string>;
}

export declare class PhotonicSceneLoader {
  constructor(scene: PhotonicScene, options?: PhotonicSceneLoaderOptions);
  scene: PhotonicScene;
  moduleBaseUrl: string;
  moduleUrls: Record<string, string> | null;
  onDescriptionChange(callback: (description: string, title: string) => void): void;
  loadModule(moduleName: string): Promise<void>;
  unloadModule(): Promise<void>;
  startUpdateLoop(): void;
  stopUpdateLoop(): void;
  getModuleUrl(moduleName: string): string;
  getLastRequestedModuleUrl(): string | null;
  getCurrentModuleName(): string | null;
  getModuleMetadata(): { title?: string; description?: string } | null;
  hasModule(): boolean;
}

export declare class PhotonicCamera {
  constructor(containerElement: HTMLElement, renderer: unknown);
  camera: unknown;
  controls: unknown;
  target: Vector3Like;
  getRig(): unknown;
  update(): void;
  setOrbitEnabled(enabled: boolean): void;
  handleResize(): void;
  setPosition(x: number, y: number, z: number): void;
  lookAt(x: number, y: number, z: number): void;
  getWorldPosition(target?: unknown): unknown;
  getWorldQuaternion(target?: unknown): unknown;
  captureWorldPose(): PoseLike;
  applyRigPose(position: unknown, quaternion: unknown): void;
  bakeWorldPoseToLocal(pose: PoseLike): PoseLike;
  frameTarget(target: unknown, scale?: number): void;
  reset(): void;
  dispose(): void;
}

export declare class PhotonicRenderer {
  constructor(containerElement: HTMLElement);
  renderer: unknown;
  render(scene: unknown, camera: unknown): void;
  setAnimationLoop(callback: ((time: number, xrFrame?: unknown) => void) | null): void;
  handleResize(): void;
  setXRReferenceSpaceType(referenceSpaceType: string): void;
  setXRSession(session: unknown): Promise<void>;
  getXRReferenceSpace(): unknown;
  isXRPresenting(): boolean;
  dispose(): void;
}

export declare class PhotonicGrid {
  constructor();
  floorPlane: unknown;
  gridHelper: unknown;
  createFloorPlane(): unknown;
  createInfiniteGrid(): unknown;
  setScale(scale: number): void;
  updateCameraPosition(cameraPosition: Vector3Like | unknown): void;
  setDivisions(divisions: number): void;
  setColor(color: ColorValue): void;
  setOpacity(opacity: number): void;
  setFineLODThreshold(threshold: number): void;
  setCenterLODThreshold(threshold: number): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

export declare class PhotonicInput {
  constructor(camera: unknown, domElement: HTMLElement);
  enabled: boolean;
  onLockChange: ((locked: boolean) => void) | null;
  enable(): void;
  disable(): void;
  lock(): void;
  unlock(): void;
  setMoveSpeed(speed: number): void;
  setMovementTuning(tuning?: unknown): void;
  setLookSpeed(speed: number): void;
  update(deltaTime: number): void;
  getVelocity(): Vector3Like;
  getInputState(): Record<string, unknown>;
  dispose(): void;
}

export declare class PhotonicXRManager {
  constructor(options: { renderer: PhotonicRenderer; camera: PhotonicCamera; getSpawnPose: () => PoseLike });
  supported: boolean | null;
  session: unknown;
  error: unknown;
  onStateChange(callback: (state: XRState) => void): void;
  getState(): XRState;
  checkSupport(): Promise<boolean>;
  isPresenting(): boolean;
  enter(): Promise<unknown>;
  exit(): Promise<void>;
  beginFrame(xrFrame: unknown): void;
  getViewerWorldPose(): PoseLike | null;
  realignViewerPose(pose: PoseLike, viewerPose?: PoseLike | null): void;
  dispose(): Promise<void>;
}

export declare class PhotonicControlSystem {
  constructor(options: { camera: PhotonicCamera; input: PhotonicInput; xrManager: PhotonicXRManager });
  mode: string;
  enableFPSControls(options?: { moveSpeed?: number; onLockChange?: ((locked: boolean) => void) | null; movementTuning?: unknown }): void;
  disableFPSControls(): void;
  isFPSControlsEnabled(): boolean;
  getInputState(): Record<string, unknown>;
  onXRStateChange(callback: (state: XRState & { mode: string }) => void): void;
  getXRState(): XRState & { mode: string };
  refreshXRSupport(): Promise<boolean>;
  enterXR(): Promise<unknown>;
  exitXR(): Promise<void>;
  beginFrame(xrFrame: unknown): void;
  update(deltaTime: number): void;
  dispose(): Promise<void>;
}

// Overlay (F1)

export declare const COCO17_JOINT_NAMES: string[];
export declare const POSE_CONNECTIONS: Array<[string, string]>;

export interface OverlayStyle {
  boneColor: number;
  boneOpacity: number;
  boneRadius: number;
  outlineColor: number;
  outlineOpacity: number;
  outlineScale: number;
  jointColor: number;
  jointRadius: number;
  glowColor: number;
  glowOpacity: number;
  glowScale: number;
  confidenceThreshold: number;
  deviationWarnAt: number;
  deviationAlertAt: number;
  deviationWarnColor: number;
  deviationAlertColor: number;
  arrowColor: number;
  showArrows: boolean;
  minArrowLength: number;
  showHollowJoints: boolean;
  hollowJointColor: number;
  hollowJointOpacity: number;
  hollowJointScale: number;
  showDepthRings: boolean;
  depthRingOpacity: number;
  depthRingBaseScale: number;
  depthRingGain: number;
  depthRingMinFraction: number;
}

export declare const DEFAULT_OVERLAY_STYLE: OverlayStyle;

export type JointInput =
  | [number, number, number?, number?]
  | { x: number; y: number; z?: number; confidence?: number; score?: number; visibility?: number; seen?: boolean; visible?: boolean; deviation?: number; offset?: Vector3Like | [number, number, number]; position?: Vector3Like; point?: Vector3Like; name?: string };

export type PoseInput =
  | Record<string, JointInput>
  | JointInput[]
  | { joints: Record<string, JointInput> | JointInput[]; keypoints?: never }
  | { keypoints: JointInput[]; joints?: never }
  | null
  | undefined;

export interface NormalizedJoint {
  name: string;
  x: number;
  y: number;
  z: number;
  confidence?: number;
  deviation?: number;
  offset: Vector3Like | null;
}

export declare function normalizePose(pose: PoseInput): Map<string, NormalizedJoint>;
export declare function deviationColorHex(magnitude: number | null | undefined, style?: Partial<OverlayStyle>): number;

export interface PhotonicOverlayOptions {
  style?: Partial<OverlayStyle>;
  connections?: Array<[string, string]>;
  smoothing?: number;
  aspect?: number;
  video?: HTMLVideoElement;
  showArrows?: boolean;
  showHollowJoints?: boolean;
  showDepthRings?: boolean;
  colorByDeviation?: boolean;
}

export interface SetPoseOptions {
  targetPose?: PoseInput;
  showArrows?: boolean;
  showHollowJoints?: boolean;
  showDepthRings?: boolean;
  colorByDeviation?: boolean;
}

export interface DepthRingInfo {
  radius: number;
  depth: number;
  direction: 'toward' | 'away';
  fraction: number;
}

export declare class PhotonicOverlay {
  constructor(container: HTMLElement, options?: PhotonicOverlayOptions);
  container: HTMLElement;
  style: OverlayStyle;
  connections: Array<[string, string]>;
  smoothing: number;
  video: HTMLVideoElement | null;
  scene: unknown;
  camera: unknown;
  renderer: unknown;
  attachToVideo(video: HTMLVideoElement | null): this;
  setStyle(partial?: Partial<OverlayStyle>): this;
  getStyle(): OverlayStyle;
  setShowArrows(show: boolean): this;
  setShowHollowJoints(show: boolean): this;
  setShowDepthRings(show: boolean): this;
  setColorByDeviation(on: boolean): this;
  setTargetPose(pose: PoseInput): this;
  setPose(pose: PoseInput, options?: SetPoseOptions): this;
  clear(): this;
  getJointWorldPosition(name: string): Vector3Like | null;
  getJointState(name: string): 'seen' | 'hollow' | null;
  getDepthRing(name: string): DepthRingInfo | null;
  getDeviation(name: string): number | null;
  getArrow(name: string): { direction: Vector3Like; length: number } | null;
  getCounts(): { joints: number; bones: number; arrows: number; hollowJoints: number; depthRings: number };
  resize(): this;
  render(): this;
  start(): this;
  stop(): this;
  dispose(): void;
}

export declare function createPoseOverlay(container: HTMLElement, options?: PhotonicOverlayOptions): PhotonicOverlay;

// 3D skeleton (F3, with the F4 hollow marker in 3D)

export interface SkeletonStyle {
  boneColor: number;
  boneOpacity: number;
  boneRadius: number;
  outlineColor: number;
  outlineOpacity: number;
  outlineScale: number;
  jointColor: number;
  jointRadius: number;
  glowColor: number;
  glowOpacity: number;
  glowScale: number;
  confidenceThreshold: number;
  notSeenBoneColor: number;
  notSeenBoneOpacity: number;
  notSeenDashSize: number;
  notSeenGapSize: number;
  hollowJointColor: number;
  hollowJointOpacity: number;
  hollowJointScale: number;
  showHollowJoints: boolean;
  showNotSeenBones: boolean;
}

export declare const DEFAULT_SKELETON_STYLE: SkeletonStyle;

export type SkeletonJointInput =
  | [number, number, number?, number?]
  | { x: number; y: number; z?: number; confidence?: number; score?: number; visibility?: number; seen?: boolean; visible?: boolean; position?: Vector3Like; point?: Vector3Like; name?: string };

export type SkeletonPoseInput =
  | Record<string, SkeletonJointInput>
  | SkeletonJointInput[]
  | Map<string, SkeletonJointInput>
  | { joints: Record<string, SkeletonJointInput> | SkeletonJointInput[]; keypoints?: never }
  | { keypoints: SkeletonJointInput[]; joints?: never }
  | null
  | undefined;

export interface SkeletonNormalizedJoint {
  name: string;
  x: number;
  y: number;
  z: number;
  confidence?: number;
}

export declare function normalizeSkeletonPose(pose: SkeletonPoseInput, jointNames?: string[]): Map<string, SkeletonNormalizedJoint>;

export interface PhotonicSkeletonOptions {
  style?: Partial<SkeletonStyle>;
  connections?: Array<[string, string]>;
  jointNames?: string[];
  showHollowJoints?: boolean;
  showNotSeenBones?: boolean;
}

export interface SetSkeletonPoseOptions {
  showHollowJoints?: boolean;
  showNotSeenBones?: boolean;
}

export declare class PhotonicSkeleton {
  constructor(parent: PhotonicScene | unknown, options?: PhotonicSkeletonOptions);
  style: SkeletonStyle;
  connections: Array<[string, string]>;
  jointNames: string[];
  group: unknown;
  setStyle(partial?: Partial<SkeletonStyle>): this;
  getStyle(): SkeletonStyle;
  setShowHollowJoints(show: boolean): this;
  setShowNotSeenBones(show: boolean): this;
  setPose(pose: SkeletonPoseInput, options?: SetSkeletonPoseOptions): this;
  clear(): this;
  getJointState(name: string): 'seen' | 'hollow' | null;
  getBoneState(a: string, b: string): 'seen' | 'dashed' | null;
  getCounts(): { joints: number; hollowJoints: number; bones: number; dashedBones: number };
  dispose(): void;
}

export declare function createSkeleton(parent: PhotonicScene | unknown, options?: PhotonicSkeletonOptions): PhotonicSkeleton;

// Virtual camera (F2)

export declare const VIRTUAL_CAMERA_KIND: 'browser-captured-stream';

export interface VirtualCameraOptions {
  scene?: PhotonicScene;
  canvas?: HTMLCanvasElement;
  renderer?: PhotonicRenderer | PhotonicScene | { renderer?: unknown };
  overlay?: PhotonicOverlay;
  video?: HTMLVideoElement;
  layers?: Array<HTMLCanvasElement | HTMLVideoElement>;
  frameRate?: number;
  fps?: number;
  label?: string;
  width?: number;
  height?: number;
  background?: string | null;
}

export interface VirtualCameraInfo {
  kind: typeof VIRTUAL_CAMERA_KIND;
  isBrowserStream: true;
  isOSVirtualCameraDevice: false;
  label: string;
  frameRate: number;
  width: number;
  height: number;
  composited: boolean;
  limits: string;
}

export declare class PhotonicVirtualCamera {
  constructor(options?: VirtualCameraOptions);
  frameRate: number;
  label: string;
  static fromScene(scene: PhotonicScene, options?: VirtualCameraOptions): PhotonicVirtualCamera;
  static fromCanvas(canvas: HTMLCanvasElement, options?: VirtualCameraOptions): PhotonicVirtualCamera;
  static fromOverlay(overlay: PhotonicOverlay, options?: VirtualCameraOptions): PhotonicVirtualCamera;
  static fromLayers(layers: Array<HTMLCanvasElement | HTMLVideoElement>, options?: VirtualCameraOptions): PhotonicVirtualCamera;
  getInfo(): VirtualCameraInfo;
  getCanvas(): HTMLCanvasElement;
  getStream(): MediaStream;
  captureStream(): MediaStream;
  startRecording(options?: { mimeType?: string; timeslice?: number }): this;
  stopRecording(): Promise<Blob>;
  isRecording(): boolean;
  stop(): this;
  dispose(): void;
}

export declare function createVirtualCamera(options?: VirtualCameraOptions): PhotonicVirtualCamera;
export declare function captureSceneStream(scene: PhotonicScene, options?: VirtualCameraOptions): MediaStream;
export declare function captureOverlayStream(overlay: PhotonicOverlay, options?: VirtualCameraOptions): MediaStream;

// Splat heuristics and XR pose math

export interface SplatSource {
  getSplatCount: () => number;
  getSplat: (index: number) => { center?: number[]; scales?: number[]; quaternion?: number[] } | null | undefined;
  transform?: Record<string, unknown>;
}

export interface SplatCameraEstimate {
  target: Vector3Like;
  camera: unknown;
  diagnostics: Record<string, unknown>;
}

export declare function estimateSplatCamera(source: SplatSource, overrideOptions?: Record<string, unknown>): SplatCameraEstimate | null;

export declare function solveOriginPoseForViewerPose(args: { viewerLocalPosition: unknown; viewerLocalQuaternion: unknown; desiredWorldPosition: unknown; desiredWorldQuaternion: unknown }): PoseLike;
export declare function composeViewerWorldPose(args: { originPosition: unknown; originQuaternion: unknown; viewerLocalPosition: unknown; viewerLocalQuaternion: unknown }): PoseLike;
export declare function createPose(position?: unknown, quaternion?: unknown): PoseLike;
