/**
 * PhotonicVirtualCamera - Emit a scene as a browser MediaStream.
 * This is a browser captured stream (canvas.captureStream), usable as a
 * camera source by code that accepts a MediaStream. It is NOT an OS-level
 * virtual camera device: other apps cannot see it in their camera menus.
 * See design/VIRTUAL-CAMERA.md for the honest limits and consumer pattern.
 */

export const VIRTUAL_CAMERA_KIND = 'browser-captured-stream';

function canvasOf(source) {
  if (!source) return null;
  if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) return source;
  if (source.renderer?.domElement) return source.renderer.domElement;
  if (source.renderer?.renderer?.domElement) return source.renderer.renderer.domElement;
  return null;
}

function sizeOf(el, fallbackW, fallbackH) {
  if (!el) return { width: fallbackW, height: fallbackH };
  const w = el.videoWidth || el.width || el.clientWidth || fallbackW;
  const h = el.videoHeight || el.height || el.clientHeight || fallbackH;
  return { width: w, height: h };
}

export class PhotonicVirtualCamera {
  constructor(options = {}) {
    this.frameRate = options.frameRate ?? options.fps ?? 30;
    this.label = options.label || 'Photonic virtual camera (browser stream)';
    this._layers = [];
    this._explicitSize = options.width && options.height ? { width: options.width, height: options.height } : null;
    this._background = options.background ?? null;

    if (options.layers) this._layers = [...options.layers];
    else if (options.video || options.overlay) {
      if (options.video) this._layers.push(options.video);
      const oc = canvasOf(options.overlay);
      if (oc) this._layers.push(oc);
      if (!options.video && options.overlay && !oc) throw new Error('PhotonicVirtualCamera: overlay has no canvas');
    } else if (options.scene) {
      const c = canvasOf(options.scene);
      if (!c) throw new Error('PhotonicVirtualCamera: scene has no renderer canvas');
      this._layers = [c];
    } else if (options.canvas) this._layers = [options.canvas];
    else if (options.renderer) {
      const c = canvasOf(options);
      if (!c) throw new Error('PhotonicVirtualCamera: renderer has no canvas');
      this._layers = [c];
    }
    if (!this._layers.length) throw new Error('PhotonicVirtualCamera: give a scene, canvas, renderer, overlay, video, or layers');

    this._singleCanvas = this._layers.length === 1 && (typeof HTMLCanvasElement !== 'undefined' && this._layers[0] instanceof HTMLCanvasElement);
    this._output = null;
    this._ctx = null;
    this._stream = null;
    this._raf = 0;
    this._running = false;
    this._recorder = null;
    this._chunks = [];
    this._mimeType = null;
  }

  static fromScene(scene, options = {}) { return new PhotonicVirtualCamera({ ...options, scene }); }
  static fromCanvas(canvas, options = {}) { return new PhotonicVirtualCamera({ ...options, canvas }); }
  static fromOverlay(overlay, options = {}) { return new PhotonicVirtualCamera({ ...options, overlay, video: options.video }); }
  static fromLayers(layers, options = {}) { return new PhotonicVirtualCamera({ ...options, layers }); }

  getInfo() {
    const size = this._outputSize();
    return {
      kind: VIRTUAL_CAMERA_KIND,
      isBrowserStream: true,
      isOSVirtualCameraDevice: false,
      label: this.label,
      frameRate: this.frameRate,
      width: size.width,
      height: size.height,
      composited: !this._singleCanvas,
      limits: 'Browser stream only: code in a browser can use this MediaStream as a camera source (for example a <video> element, WebRTC, or MediaRecorder). It does not appear as a camera in other apps or in a browser camera picker. An OS-level virtual camera device needs a native companion app, which is a separate piece of work.'
    };
  }

  _outputSize() {
    if (this._explicitSize) return this._explicitSize;
    const base = this._layers[0];
    return sizeOf(base, 640, 360);
  }

  _ensureOutput() {
    if (this._singleCanvas) return this._layers[0];
    if (!this._output) {
      const { width, height } = this._outputSize();
      this._output = document.createElement('canvas');
      this._output.width = width; this._output.height = height;
      this._ctx = this._output.getContext('2d');
    }
    return this._output;
  }

  getCanvas() { return this._ensureOutput(); }

  _drawFrame() {
    if (this._singleCanvas || !this._ctx) return;
    const out = this._output;
    const { width, height } = this._outputSize();
    if (out.width !== width || out.height !== height) { out.width = width; out.height = height; }
    if (this._background) { this._ctx.fillStyle = this._background; this._ctx.fillRect(0, 0, width, height); }
    else this._ctx.clearRect(0, 0, width, height);
    for (const layer of this._layers) {
      const s = sizeOf(layer, width, height);
      if (!s.width || !s.height) continue;
      try { this._ctx.drawImage(layer, 0, 0, width, height); } catch { /* layer not ready yet */ }
    }
  }

  getStream() {
    if (this._stream && this._stream.getTracks().some((t) => t.readyState === 'live')) return this._stream;
    const canvas = this._ensureOutput();
    if (!this._singleCanvas) {
      this._drawFrame();
      if (!this._running) {
        this._running = true;
        const tick = () => { if (!this._running) return; this._drawFrame(); this._raf = requestAnimationFrame(tick); };
        this._raf = requestAnimationFrame(tick);
      }
    }
    if (typeof canvas.captureStream !== 'function') throw new Error('PhotonicVirtualCamera: canvas.captureStream is not available in this browser');
    this._stream = canvas.captureStream(this.frameRate);
    for (const track of this._stream.getVideoTracks()) { try { track.contentHint = 'detail'; } catch { /* optional */ } }
    return this._stream;
  }

  // Alias in the language consumers use when wiring a video element or WebRTC.
  captureStream() { return this.getStream(); }

  startRecording(options = {}) {
    if (this._recorder && this._recorder.state !== 'inactive') throw new Error('PhotonicVirtualCamera: recording already in progress');
    if (typeof MediaRecorder === 'undefined') throw new Error('PhotonicVirtualCamera: MediaRecorder is not available in this browser');
    const stream = this.getStream();
    const wanted = options.mimeType || 'video/webm';
    this._mimeType = typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(wanted) ? wanted : '';
    this._chunks = [];
    this._recorder = this._mimeType ? new MediaRecorder(stream, { mimeType: this._mimeType }) : new MediaRecorder(stream);
    this._recorder.addEventListener('dataavailable', (e) => { if (e.data && e.data.size) this._chunks.push(e.data); });
    this._recorder.start(options.timeslice ?? 250);
    return this;
  }

  stopRecording() {
    return new Promise((resolve, reject) => {
      if (!this._recorder || this._recorder.state === 'inactive') { reject(new Error('PhotonicVirtualCamera: no recording in progress')); return; }
      const recorder = this._recorder;
      recorder.addEventListener('stop', () => {
        const type = this._mimeType || recorder.mimeType || 'video/webm';
        resolve(new Blob(this._chunks, { type }));
        if (this._recorder === recorder) this._recorder = null;
        this._chunks = [];
      }, { once: true });
      recorder.stop();
    });
  }

  isRecording() { return !!this._recorder && this._recorder.state !== 'inactive'; }

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this._stream) { for (const t of this._stream.getTracks()) t.stop(); this._stream = null; }
    return this;
  }

  dispose() { this.stop(); this._output = null; this._ctx = null; }
}

export function createVirtualCamera(options = {}) { return new PhotonicVirtualCamera(options); }
export function captureSceneStream(scene, options = {}) { return new PhotonicVirtualCamera({ ...options, scene }).getStream(); }
export function captureOverlayStream(overlay, options = {}) { return new PhotonicVirtualCamera({ ...options, overlay, video: options.video }).getStream(); }
