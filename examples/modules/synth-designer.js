/**
 * Photonic Module: Synth Designer
 *
 * An interactive modular synth designer visualized in 3D.
 * Each node in the audio graph (oscillators, LFOs, effects) appears as a
 * colored box. Clicking a node selects it and shows an editable parameter
 * panel. Relative-clock modulators, scene save/load, and a preset library
 * are all built in.
 *
 * Controls
 * ─────────
 *   Click a node  → select & edit its parameters
 *   ▶ Play        → start the current preset's audio
 *   ■ Stop        → stop audio
 *   Add Node      → open the add-node menu
 *   Presets       → switch between built-in presets
 *   Save / Load   → persist scenes to localStorage
 *   Export / Import → download / upload JSON
 */

/* global window, document, localStorage */

import { SonanceSceneManager } from '../sonance/SonanceSceneManager.js';
import { createPhotonicFrameContext } from '../modulation/index.js';

// ─── Node type registry ───────────────────────────────────────────────────────

const NODE_TYPES = {
  clock:     { color: 0xffffaa, emissive: 0x888844, label: 'Clock',    category: 'modulation', size: 0.85 },
  lfo:       { color: 0x4488ff, emissive: 0x224488, label: 'LFO',      category: 'modulation', size: 0.7  },
  sound:     { color: 0x44ff88, emissive: 0x228844, label: 'Sound',    category: 'audio',      size: 0.75 },
  channel:   { color: 0xffaa44, emissive: 0x885522, label: 'Channel',  category: 'audio',      size: 0.75 },
  filter:    { color: 0xaa66ff, emissive: 0x553388, label: 'Filter',   category: 'effect',     size: 0.65 },
  reverb:    { color: 0x44ffcc, emissive: 0x228866, label: 'Reverb',   category: 'effect',     size: 0.65 },
  delay:     { color: 0xff8844, emissive: 0x884422, label: 'Delay',    category: 'effect',     size: 0.65 },
};

const GRID_UNIT = 2.2; // metres between grid cells
const MIN_CLOCK_FREQUENCY = 0.05;
const CLOCK_PULSE_SCALE_FACTOR = 0.45;

// ─── Default node definitions for "add node" ──────────────────────────────────

const ADD_NODE_DEFAULTS = {
  clock:   { type: 'clock',   label: 'Clock',      params: { frequency: 1 } },
  lfo:     { type: 'lfo',     label: 'LFO',        params: { waveType: 'sine', frequency: 0.5 } },
  sound:   { type: 'sound',   label: 'Sound',      params: { oscillator: 'sine', note: 'C4', duration: '8n', volume: -10 } },
  channel: { type: 'channel', label: 'Channel',    params: { oscillator: 'sawtooth', volume: -12, bpm: 120 } },
  filter:  { type: 'filter',  label: 'LP Filter',  params: { filterType: 'lowpass', frequency: 2000, Q: 2 } },
  reverb:  { type: 'reverb',  label: 'Reverb',     params: { decay: 3, wet: 0.3 } },
  delay:   { type: 'delay',   label: 'Delay',      params: { delayTime: 0.25, feedback: 0.3, wet: 0.4 } },
};

// ─── Built-in preset scene definitions ───────────────────────────────────────
// Each preset has: name, nodes[], bindings[]
// nodes: { id, type, label, params, gridX, gridZ }
// bindings: { id, source, target, param, min, max }

const PRESETS = {
  'Clock & Dividers': {
    name: 'Clock & Dividers',
    nodes: [
      { id: 'clock',  type: 'clock',   label: 'Master Clock',    params: { frequency: 2 },                                      gridX: 0,  gridZ: -2 },
      { id: 'lfo1',   type: 'lfo',     label: 'Full-Rate LFO',   params: { waveType: 'sine',     clockRef: 'clock', divisor: 1  }, gridX: -2, gridZ: 0  },
      { id: 'lfo2',   type: 'lfo',     label: 'Half-Rate LFO',   params: { waveType: 'square',   clockRef: 'clock', divisor: 2  }, gridX: 0,  gridZ: 0  },
      { id: 'lfo3',   type: 'lfo',     label: 'Quarter-Rate LFO',params: { waveType: 'triangle', clockRef: 'clock', divisor: 4  }, gridX: 2,  gridZ: 0  },
      { id: 'snd1',   type: 'sound',   label: 'Lead',             params: { oscillator: 'sawtooth', note: 'A4', duration: '8n', volume: -10 }, gridX: -2, gridZ: 2 },
      { id: 'snd2',   type: 'sound',   label: 'Bass',             params: { oscillator: 'sine',     note: 'C2', duration: '4n', volume: -8  }, gridX: 0,  gridZ: 2 },
      { id: 'snd3',   type: 'sound',   label: 'Bell',             params: { oscillator: 'triangle', note: 'E5', duration: '16n',volume: -14 }, gridX: 2,  gridZ: 2 },
    ],
    bindings: [
      { id: 'b1', source: 'lfo1', target: 'snd1', param: 'volume', min: -30, max: -4  },
      { id: 'b2', source: 'lfo2', target: 'snd2', param: 'volume', min: -30, max: -4  },
      { id: 'b3', source: 'lfo3', target: 'snd3', param: 'volume', min: -30, max: -14 },
    ]
  },

  'Ambient Pad': {
    name: 'Ambient Pad',
    nodes: [
      { id: 'clock',     type: 'clock',   label: 'Pad Clock',     params: { frequency: 0.5 },                                         gridX: 0,  gridZ: -3 },
      { id: 'sweepLfo',  type: 'lfo',     label: 'Filter Sweep',  params: { waveType: 'sine',     clockRef: 'clock', divisor: 1 },     gridX: -2, gridZ: -1 },
      { id: 'spaceLfo',  type: 'lfo',     label: 'Space LFO',     params: { waveType: 'triangle', clockRef: 'clock', divisor: 2 },     gridX: 2,  gridZ: -1 },
      { id: 'pad',       type: 'channel', label: 'Pad',           params: { oscillator: 'sawtooth', volume: -12, bpm: 80, sequence: [
          { note: ['C3','E3','G3'], duration: '2n' }, { note: ['F3','A3','C4'], duration: '2n' },
          { note: ['G3','B3','D4'], duration: '2n' }, { note: ['C3','E3','G3'], duration: '2n' }
        ] }, gridX: -1, gridZ: 1 },
      { id: 'filter1',   type: 'filter',  label: 'LP Filter',     params: { filterType: 'lowpass', frequency: 2000, Q: 2 },           gridX: 1,  gridZ: 1  },
      { id: 'reverb1',   type: 'reverb',  label: 'Space Reverb',  params: { decay: 5, wet: 0.4 },                                     gridX: 0,  gridZ: 3  },
    ],
    bindings: [
      { id: 'b1', source: 'sweepLfo', target: 'filter1', param: 'frequency', min: 200, max: 8000 },
      { id: 'b2', source: 'spaceLfo', target: 'reverb1', param: 'wet',       min: 0.1, max: 0.9  },
    ]
  },

  'Lead Synth': {
    name: 'Lead Synth',
    nodes: [
      { id: 'clock',   type: 'clock',   label: 'Tempo Clock',  params: { frequency: 1.33 },                                        gridX: 0,  gridZ: -3 },
      { id: 'tremolo', type: 'lfo',     label: 'Tremolo',      params: { waveType: 'triangle', clockRef: 'clock', divisor: 2 },    gridX: -1, gridZ: -1 },
      { id: 'vibrato', type: 'lfo',     label: 'Vibrato',      params: { waveType: 'sine',     clockRef: 'clock', multiplier: 4 }, gridX: 1,  gridZ: -1 },
      { id: 'lead',    type: 'sound',   label: 'Lead Sound',   params: { oscillator: 'square', note: 'E4', duration: '8n', volume: -8 }, gridX: 0, gridZ: 1 },
      { id: 'filter1', type: 'filter',  label: 'Tone Filter',  params: { filterType: 'lowpass', frequency: 3200, Q: 3 },           gridX: 0,  gridZ: 3  },
    ],
    bindings: [
      { id: 'b1', source: 'tremolo', target: 'lead',    param: 'volume',    min: -28, max: -2   },
      { id: 'b2', source: 'vibrato', target: 'filter1', param: 'frequency', min: 800, max: 8000 },
    ]
  },

  'Drum Machine': {
    name: 'Drum Machine',
    nodes: [
      { id: 'clock',   type: 'clock', label: 'Beat Clock',   params: { frequency: 2 },                                        gridX: 0,  gridZ: -3 },
      { id: 'kickLfo', type: 'lfo',   label: 'Kick Gate',    params: { waveType: 'square', clockRef: 'clock', divisor: 1 },   gridX: -2, gridZ: -1 },
      { id: 'snareLfo',type: 'lfo',   label: 'Snare Gate',   params: { waveType: 'square', clockRef: 'clock', divisor: 2 },   gridX: 0,  gridZ: -1 },
      { id: 'hatLfo',  type: 'lfo',   label: 'Hat Gate',     params: { waveType: 'square', clockRef: 'clock', multiplier: 2 },gridX: 2,  gridZ: -1 },
      { id: 'kick',    type: 'sound', label: 'Kick',         params: { oscillator: 'sine',     note: 'C1', duration: '8n',  volume: -4  }, gridX: -2, gridZ: 1 },
      { id: 'snare',   type: 'sound', label: 'Snare',        params: { oscillator: 'triangle', note: 'D3', duration: '16n', volume: -8  }, gridX: 0,  gridZ: 1 },
      { id: 'hihat',   type: 'sound', label: 'Hi-Hat',       params: { oscillator: 'square',   note: 'A5', duration: '32n', volume: -12 }, gridX: 2,  gridZ: 1 },
    ],
    bindings: [
      { id: 'b1', source: 'kickLfo',  target: 'kick',  param: 'volume', min: -40, max: -4  },
      { id: 'b2', source: 'snareLfo', target: 'snare', param: 'volume', min: -40, max: -8  },
      { id: 'b3', source: 'hatLfo',   target: 'hihat', param: 'volume', min: -40, max: -12 },
    ]
  },
};

const PRESET_NAMES = Object.keys(PRESETS);

// ─── Module-level state ───────────────────────────────────────────────────────

let _engine       = null;
let _soundtrack   = null;
let _uiPanel      = null;
let _state        = null; // designer scene definition (nodes[], bindings[])
let _meshNodes    = new Map(); // nodeId → { handle, type }
let _wireHandles  = [];        // arrow handles for connections
let _selectedId   = null;
let _isPlaying    = false;
let _modSystem    = null;
let _audioNodeRefs = new Map(); // nodeId → { type, volParam, ... }
let _soundLoops    = [];        // Tone.Loop instances for sound-node auto-trigger
let _clockIndicatorPulse = false;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function _gridPos(gridX, gridZ) {
  return { x: gridX * GRID_UNIT, y: 1.0, z: gridZ * GRID_UNIT };
}

function _nodeCenter(node) {
  return _gridPos(node.gridX ?? 0, node.gridZ ?? 0);
}

function _lerpColor(fromColor, toColor, t) {
  const clamped = Math.max(0, Math.min(1, t));
  const channel = (color, shift) => (color >> shift) & 255;
  const blend = (shift) => (channel(fromColor, shift) * (1 - clamped)) + (channel(toColor, shift) * clamped);
  const r = blend(16);
  const g = blend(8);
  const b = blend(0);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

// ─── Audio ────────────────────────────────────────────────────────────────────

function _stopAudio() {
  // Stop and clear sound loops
  _soundLoops.forEach(loop => {
    try { loop.stop(); loop.dispose(); } catch { /**/ }
  });
  _soundLoops = [];

  if (_soundtrack) {
    _soundtrack.stop();
    _soundtrack.dispose();
    _soundtrack = null;
  }
  if (_engine) {
    _engine.dispose();
    _engine = null;
  }
  _modSystem = null;
  _audioNodeRefs = new Map();
  _isPlaying = false;
}

function _startAudio() {
  _stopAudio();

  if (!window.Sonance) {
    console.warn('[SynthDesigner] Sonance not loaded.');
    return;
  }

  _engine = window.Sonance.createEngine();
  _modSystem = _engine.modulation;
  _audioNodeRefs = new Map();

  const { nodes = [], bindings = [] } = _state;
  const Tone = window.Sonance.Tone;

  // Create modulators for clock/lfo nodes
  nodes.forEach(node => {
    if (node.type === 'clock') {
      _modSystem.createModulator(node.id, {
        type: 'square',
        frequency: node.params.frequency ?? 1
      });
    } else if (node.type === 'lfo') {
      const p = node.params;
      _modSystem.createModulator(node.id, {
        type: p.waveType ?? 'sine',
        frequency: p.frequency ?? 0.5,
        clockRef: p.clockRef ?? null,
        divisor: p.divisor ?? null,
        multiplier: p.multiplier ?? null
      });
    }
  });

  // Find channel nodes → build a soundtrack
  const channelNodes = nodes.filter(n => n.type === 'channel');
  if (channelNodes.length > 0) {
    const bpm = channelNodes[0]?.params?.bpm ?? 120;
    _soundtrack = _engine.createSoundtrack('designer', { bpm });

    channelNodes.forEach(node => {
      const p = node.params;
      const channel = _soundtrack.addChannel(node.id, {
        instrument: { oscillator: p.oscillator ?? 'sine', envelope: p.envelope },
        volume: p.volume ?? 0
      });
      if (Array.isArray(p.sequence) && p.sequence.length > 0) {
        channel.playSequence(p.sequence, { loop: true });
      }
      // Store vol param for binding
      _audioNodeRefs.set(node.id, {
        type: 'channel',
        channel,
        volParam: channel._channel?.volume ?? null
      });
    });

    _soundtrack.play().catch(err => console.warn('[SynthDesigner] Soundtrack error:', err));
  }

  // Create sound nodes and schedule them to fire every bar while transport runs
  nodes.filter(n => n.type === 'sound').forEach(node => {
    const p = node.params;
    const sound = _engine.createSound(node.id, {
      oscillator: p.oscillator ?? 'sine',
      note: p.note ?? 'C4',
      duration: p.duration ?? '8n',
      volume: p.volume ?? 0
    });
    // Store vol param for binding (internal _vol.volume on Tone.Volume)
    _audioNodeRefs.set(node.id, {
      type: 'sound',
      sound,
      volParam: sound._vol?.volume ?? null
    });

    // Auto-trigger the sound every bar so presets without channel sequences still make noise
    const loop = new Tone.Loop(() => {
      try { sound.play(); } catch { /**/ }
    }, '1m');
    loop.start(0);
    _soundLoops.push(loop);
  });

  // Start Tone transport if there are sounds or channels
  if (_soundLoops.length > 0 || channelNodes.length > 0) {
    Tone.getTransport().start();
  }

  // Wire modulation bindings now that audio nodes and their params exist
  bindings.forEach(binding => {
    const targetRef = _audioNodeRefs.get(binding.target);
    if (!targetRef) return; // target node not found in audio graph

    if (binding.param === 'volume' && targetRef.volParam) {
      const param = targetRef.volParam;
      _modSystem.bind({
        id: binding.id,
        source: binding.source,
        setter: value => {
          if (typeof param.rampTo === 'function') {
            param.rampTo(value, 0.02);
          } else {
            param.value = value;
          }
        },
        min: binding.min ?? -30,
        max: binding.max ?? 0
      });
    }
  });

  _isPlaying = true;
}

// ─── 3D scene building ───────────────────────────────────────────────────────

function _clearScene3D(scene) {
  _meshNodes.forEach(({ handle }) => { try { handle.remove(); } catch { /**/ } });
  _meshNodes.clear();
  _wireHandles.forEach(h => { try { h.remove(); } catch { /**/ } });
  _wireHandles = [];
}

function _buildScene3D(scene) {
  _clearScene3D(scene);

  const { nodes = [], bindings = [] } = _state;

  // Create node boxes
  nodes.forEach(node => {
    const typeDef = NODE_TYPES[node.type] ?? NODE_TYPES.sound;
    const pos = _nodeCenter(node);
    const s = typeDef.size;
    const mat = scene.createMaterial({
      color: typeDef.color,
      emissive: typeDef.emissive,
      emissiveIntensity: 0.4,
      roughness: 0.35,
      metalness: 0.55
    });
    const handle = scene.createBox({
      width: s, height: s, depth: s,
      position: pos,
      material: mat
    });
    handle.onClick(() => _selectNode(node.id));
    _meshNodes.set(node.id, { handle, type: node.type, baseEmissive: typeDef.emissive });
  });

  // Create connection arrows
  bindings.forEach(binding => {
    const fromNode = nodes.find(n => n.id === binding.source);
    const toNode   = nodes.find(n => n.id === binding.target);
    if (!fromNode || !toNode) return;

    const from = _nodeCenter(fromNode);
    const to   = _nodeCenter(toNode);
    const dir  = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
    const len  = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);

    if (len < 0.01) return;

    const arrow = scene.createArrow({
      origin: from,
      direction: dir,
      length: len - 0.5,
      color: 0x8899bb,
      headLength: 0.3,
      headWidth: 0.18
    });
    _wireHandles.push(arrow);
  });
}

function _selectNode(nodeId) {
  // Deselect previous
  if (_selectedId && _meshNodes.has(_selectedId)) {
    const prev = _meshNodes.get(_selectedId);
    const prevNode = _state.nodes.find(n => n.id === _selectedId);
    if (prevNode) {
      const typeDef = NODE_TYPES[prevNode.type] ?? NODE_TYPES.sound;
      prev.handle.setColor(typeDef.color);
    }
  }
  _selectedId = nodeId;
  // Highlight selected
  if (nodeId && _meshNodes.has(nodeId)) {
    _meshNodes.get(nodeId).handle.setColor(0xffffff);
  }
  _refreshParamPanel();
}

// ─── HTML escaping (prevents XSS when interpolating user-supplied values) ──────

function _esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── Parameter descriptions ───────────────────────────────────────────────────

function _getParamSchema(nodeType) {
  switch (nodeType) {
    case 'clock':
      return [
        { key: 'frequency', label: 'Frequency (Hz)', type: 'range', min: MIN_CLOCK_FREQUENCY, max: 10, step: 0.05 }
      ];
    case 'lfo':
      return [
        { key: 'waveType', label: 'Wave', type: 'select', options: ['sine','square','triangle','sawtooth','ramp'] },
        { key: 'frequency', label: 'Frequency (Hz)', type: 'range', min: 0.01, max: 10, step: 0.01 },
        { key: 'clockRef', label: 'Clock Source (id)', type: 'text' },
        { key: 'divisor',  label: 'Clock Divisor',    type: 'range', min: 1, max: 32, step: 1 },
        { key: 'multiplier',label:'Clock Multiplier', type: 'range', min: 0.25, max: 8, step: 0.25 },
      ];
    case 'sound':
      return [
        { key: 'oscillator', label: 'Oscillator', type: 'select', options: ['sine','square','triangle','sawtooth'] },
        { key: 'note',       label: 'Note',       type: 'text'  },
        { key: 'duration',   label: 'Duration',   type: 'select', options: ['1n','2n','4n','8n','16n','32n'] },
        { key: 'volume',     label: 'Volume (dB)',type: 'range', min: -40, max: 0, step: 1 },
      ];
    case 'channel':
      return [
        { key: 'oscillator', label: 'Oscillator', type: 'select', options: ['sine','square','triangle','sawtooth'] },
        { key: 'volume',     label: 'Volume (dB)',type: 'range', min: -40, max: 0,   step: 1 },
        { key: 'bpm',        label: 'BPM',        type: 'range', min: 40,  max: 240, step: 1 },
      ];
    case 'filter':
      return [
        { key: 'filterType', label: 'Type',          type: 'select', options: ['lowpass','highpass','bandpass','notch'] },
        { key: 'frequency',  label: 'Cutoff (Hz)',   type: 'range', min: 20, max: 20000, step: 10 },
        { key: 'Q',          label: 'Resonance (Q)', type: 'range', min: 0.1, max: 20,   step: 0.1 },
      ];
    case 'reverb':
      return [
        { key: 'decay', label: 'Decay (s)', type: 'range', min: 0.1, max: 10, step: 0.1 },
        { key: 'wet',   label: 'Wet',       type: 'range', min: 0,   max: 1,  step: 0.01 },
      ];
    case 'delay':
      return [
        { key: 'delayTime', label: 'Time (s)',   type: 'range', min: 0.01, max: 2,  step: 0.01 },
        { key: 'feedback',  label: 'Feedback',   type: 'range', min: 0,    max: 0.9,step: 0.01 },
        { key: 'wet',       label: 'Wet',        type: 'range', min: 0,    max: 1,  step: 0.01 },
      ];
    default:
      return [];
  }
}

// ─── HTML Panel ───────────────────────────────────────────────────────────────

function _createUiPanel(scene) {
  const container = document.getElementById('photonic-ui-overlay') || document.body;

  const panel = document.createElement('div');
  panel.id = 'synth-designer-panel';
  panel.style.cssText = [
    'position:absolute; top:0; right:0; width:300px; height:100%;',
    'background:rgba(10,10,22,0.92); color:#cdd; font-family:monospace;',
    'font-size:12px; display:flex; flex-direction:column; z-index:200;',
    'border-left:1px solid rgba(255,255,255,0.1); overflow:hidden;',
    'user-select:none;'
  ].join('');

  // ── Header
  const header = document.createElement('div');
  header.style.cssText = 'padding:12px 14px 8px; border-bottom:1px solid rgba(255,255,255,0.1);';
  header.innerHTML = `
    <div style="font-size:14px; font-weight:bold; color:#aef; letter-spacing:0.04em; margin-bottom:6px;">
      🎛 Synth Designer
    </div>
    <div style="color:#778; font-size:11px;">Click a 3D node to edit its parameters.</div>
  `;
  panel.appendChild(header);

  // ── Preset selector
  const presetRow = document.createElement('div');
  presetRow.style.cssText = 'padding:8px 14px; display:flex; gap:6px; align-items:center; border-bottom:1px solid rgba(255,255,255,0.08);';
  presetRow.innerHTML = `
    <span style="color:#aac; font-size:11px; flex-shrink:0;">Preset:</span>
    <select id="sdPreset" style="flex:1; background:#111; color:#cdd; border:1px solid #445; border-radius:4px; padding:3px 6px; font-family:monospace; font-size:12px;">
      ${PRESET_NAMES.map(n => `<option value="${n}">${n}</option>`).join('')}
    </select>
    <button id="sdLoadPreset" style="${_btnStyle('#334466','#aacf')}">Load</button>
  `;
  panel.appendChild(presetRow);

  // ── Transport controls
  const transport = document.createElement('div');
  transport.style.cssText = 'padding:8px 14px; display:flex; gap:6px; flex-wrap:wrap; border-bottom:1px solid rgba(255,255,255,0.08);';
  transport.innerHTML = `
    <button id="sdPlay"  style="${_btnStyle('#1a5c2a','#7f7')}">▶ Play</button>
    <button id="sdStop"  style="${_btnStyle('#5c1a1a','#f77')}">■ Stop</button>
    <button id="sdAddNode" style="${_btnStyle('#2a3a5c','#adf')}">＋ Add Node</button>
    <button id="sdNavMode" style="${_btnStyle('#2a3a5c','#adf')}">🕹 WASD Mode</button>
    <button id="sdTrigger" style="${_btnStyle('#3a2f5c','#c9f')}">♪ Trigger</button>
  `;
  panel.appendChild(transport);

  // ── Audition mini keyboard
  const keyboard = document.createElement('div');
  keyboard.id = 'sdKeyboard';
  keyboard.style.cssText = 'padding:8px 14px; display:flex; gap:4px; flex-wrap:wrap; border-bottom:1px solid rgba(255,255,255,0.08);';
  keyboard.innerHTML = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'].map(note =>
    `<button class="sdNoteKey" data-note="${note}" style="${_btnStyle('#1d1f2e','#cdf')}">${note}</button>`
  ).join('');
  panel.appendChild(keyboard);

  // ── Add-node menu (hidden by default)
  const addMenu = document.createElement('div');
  addMenu.id = 'sdAddMenu';
  addMenu.style.cssText = [
    'display:none; padding:8px 14px; gap:4px; flex-wrap:wrap;',
    'background:rgba(20,20,40,0.95); border-bottom:1px solid rgba(255,255,255,0.08);'
  ].join('');
  addMenu.innerHTML = Object.keys(NODE_TYPES).map(t =>
    `<button class="sdAddBtn" data-type="${t}" style="${_btnStyle('#222','#bcf')}">${t}</button>`
  ).join('');
  panel.appendChild(addMenu);

  // ── Node info / param editor
  const nodeInfo = document.createElement('div');
  nodeInfo.id = 'sdNodeInfo';
  nodeInfo.style.cssText = 'flex:1; overflow-y:auto; padding:8px 14px;';
  nodeInfo.innerHTML = '<div style="color:#556; font-size:11px; margin-top:8px;">No node selected</div>';
  panel.appendChild(nodeInfo);

  // ── Status / save-load bar
  const footer = document.createElement('div');
  footer.style.cssText = 'padding:8px 14px; border-top:1px solid rgba(255,255,255,0.08); display:flex; flex-direction:column; gap:6px;';
  footer.innerHTML = `
    <div style="display:flex; gap:4px; flex-wrap:wrap;">
      <button id="sdSave"   style="${_btnStyle('#3a2a5c','#ccf')}">💾 Save</button>
      <button id="sdLoad"   style="${_btnStyle('#2a3c5c','#adf')}">📂 Load</button>
      <button id="sdExport" style="${_btnStyle('#1a3c3c','#afa')}">↓ Export</button>
      <button id="sdImport" style="${_btnStyle('#3c3c1a','#ffa')}">↑ Import</button>
    </div>
    <div id="sdClockInfo" style="color:#89a; font-size:10px; min-height:14px;">⏱ Clock: (none)</div>
    <div id="sdStatus" style="color:#668; font-size:10px; min-height:14px;"></div>
  `;
  panel.appendChild(footer);

  container.appendChild(panel);
  return panel;
}

function _btnStyle(bg, fg) {
  return [
    `background:${bg}; color:${fg}; border:1px solid ${fg}44;`,
    'border-radius:4px; padding:4px 8px; cursor:pointer;',
    'font-family:monospace; font-size:11px; white-space:nowrap;'
  ].join('');
}

function _setStatus(msg) {
  const el = _uiPanel?.querySelector('#sdStatus');
  if (el) el.textContent = msg;
}

function _getAuditionNodeId() {
  const selected = _state?.nodes?.find(n => n.id === _selectedId);
  if (selected && (selected.type === 'sound' || selected.type === 'channel')) {
    return selected.id;
  }
  return (_state?.nodes ?? []).find(n => n.type === 'sound' || n.type === 'channel')?.id ?? null;
}

function _normalizeSequenceNoteInput(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const notes = trimmed.split(',').map(n => n.trim()).filter(Boolean);
  if (notes.length === 0) return null;
  return notes.length === 1 ? notes[0] : notes;
}

function _formatSequenceNote(note) {
  if (Array.isArray(note)) return note.join(', ');
  return note ?? '';
}

async function _triggerAudition(note = null, duration = '8n') {
  if (!window.Sonance) {
    _setStatus('Sonance not loaded');
    return;
  }

  await window.Sonance.Tone.start().catch(() => {});

  if (!_isPlaying) {
    _startAudio();
    const playBtn = _uiPanel?.querySelector('#sdPlay');
    if (playBtn) playBtn.textContent = '▶ Playing';
  }

  const nodeId = _getAuditionNodeId();
  if (!nodeId) {
    _setStatus('Add or select a sound/channel node to audition notes');
    return;
  }

  const nodeRef = _audioNodeRefs.get(nodeId);
  if (!nodeRef) {
    _setStatus('Audio graph is not ready yet');
    return;
  }

  try {
    if (nodeRef.type === 'sound') {
      nodeRef.sound?.trigger(note ?? undefined, duration);
    } else if (nodeRef.type === 'channel') {
      const seqNote = note ?? 'C4';
      nodeRef.channel?.instrument?.triggerAttackRelease(seqNote, duration, window.Sonance.Tone.now(), 0.95);
    }
    _setStatus(`♪ Triggered ${note ?? 'default note'} on ${nodeId}`);
  } catch (err) {
    _setStatus(`Trigger error: ${err.message}`);
  }
}

function _refreshParamPanel() {
  const container = _uiPanel?.querySelector('#sdNodeInfo');
  if (!container) return;

  const node = _state?.nodes?.find(n => n.id === _selectedId);
  if (!node) {
    container.innerHTML = '<div style="color:#556; font-size:11px; margin-top:8px;">No node selected</div>';
    return;
  }

  const typeDef = NODE_TYPES[node.type] ?? {};
  const schema  = _getParamSchema(node.type);
  const color   = '#' + (typeDef.color ?? 0xaaaaaa).toString(16).padStart(6, '0');

  let html = `
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.1);">
      <div style="width:12px; height:12px; background:${color}; border-radius:3px; flex-shrink:0;"></div>
      <div>
        <div style="color:#dde; font-weight:bold;">${_esc(node.label)}</div>
        <div style="color:#667; font-size:10px; text-transform:uppercase;">${_esc(node.type)}</div>
      </div>
      <button id="sdDeleteNode" style="${_btnStyle('#5c1a1a','#f88')}; margin-left:auto;">✕ Delete</button>
    </div>
  `;

  schema.forEach(field => {
    const val = node.params[field.key];
    if (field.type === 'range') {
      const cur = val ?? ((field.min + field.max) / 2);
      html += `
        <div style="margin-bottom:8px;">
          <div style="display:flex; justify-content:space-between; color:#abc; font-size:11px; margin-bottom:2px;">
            <span>${_esc(field.label)}</span><span id="pv-${_esc(field.key)}">${Number(cur).toFixed(field.step < 1 ? 2 : 0)}</span>
          </div>
          <input type="range" class="sdParam" data-key="${_esc(field.key)}" data-type="range"
            min="${field.min}" max="${field.max}" step="${field.step}" value="${cur}"
            style="width:100%; accent-color:${color};">
        </div>
      `;
    } else if (field.type === 'select') {
      const cur = val ?? field.options[0];
      html += `
        <div style="margin-bottom:8px;">
          <div style="color:#abc; font-size:11px; margin-bottom:2px;">${_esc(field.label)}</div>
          <select class="sdParam" data-key="${_esc(field.key)}" data-type="select"
            style="width:100%; background:#111; color:#cdd; border:1px solid #445; border-radius:4px; padding:3px 6px; font-family:monospace; font-size:11px;">
            ${field.options.map(o => `<option value="${_esc(o)}"${o === cur ? ' selected' : ''}>${_esc(o)}</option>`).join('')}
          </select>
        </div>
      `;
    } else {
      const cur = val ?? '';
      html += `
        <div style="margin-bottom:8px;">
          <div style="color:#abc; font-size:11px; margin-bottom:2px;">${_esc(field.label)}</div>
          <input type="text" class="sdParam" data-key="${_esc(field.key)}" data-type="text" value="${_esc(cur)}"
            placeholder="(none)"
            style="width:100%; box-sizing:border-box; background:#111; color:#cdd; border:1px solid #445; border-radius:4px; padding:3px 6px; font-family:monospace; font-size:11px;">
        </div>
      `;
    }
  });

  if (node.type === 'channel') {
    const sequence = Array.isArray(node.params?.sequence) ? node.params.sequence : [];
    html += `
      <div style="margin-top:10px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.12);">
        <div style="display:flex; justify-content:space-between; align-items:center; color:#9bc; font-size:11px; margin-bottom:6px;">
          <span>Sequence Steps</span>
          <button id="sdAddStep" style="${_btnStyle('#1f3f5f','#9de')}">＋ Add Step</button>
        </div>
        <div style="color:#678; font-size:10px; margin-bottom:6px;">Use comma-separated notes for chords (e.g. C3,E3,G3).</div>
        ${sequence.length === 0
          ? '<div style="color:#556; font-size:11px;">No steps yet. Add one to hear this channel.</div>'
          : sequence.map((step, index) => `
            <div style="display:grid; grid-template-columns:1fr 78px auto; gap:4px; margin-bottom:6px; align-items:center;">
              <input type="text" class="sdSeqParam" data-index="${index}" data-key="note" value="${_esc(_formatSequenceNote(step.note))}"
                aria-label="Note"
                placeholder="C4 or C3,E3,G3"
                style="width:100%; box-sizing:border-box; background:#111; color:#cdd; border:1px solid #445; border-radius:4px; padding:3px 6px; font-family:monospace; font-size:11px;">
              <input type="text" class="sdSeqParam" data-index="${index}" data-key="duration" value="${_esc(step.duration ?? '8n')}"
                aria-label="Duration"
                placeholder="8n"
                style="width:100%; box-sizing:border-box; background:#111; color:#cdd; border:1px solid #445; border-radius:4px; padding:3px 6px; font-family:monospace; font-size:11px;">
              <button class="sdSeqRemove" data-index="${index}" style="${_btnStyle('#5c1a1a','#f88')}">✕</button>
            </div>
          `).join('')
        }
      </div>
    `;
  }

  // Connections from/to this node
  const fromThis = (_state.bindings ?? []).filter(b => b.source === _selectedId);
  const toThis   = (_state.bindings ?? []).filter(b => b.target === _selectedId);
  if (fromThis.length + toThis.length > 0) {
    html += `<div style="color:#567; font-size:10px; text-transform:uppercase; letter-spacing:.07em; margin-top:8px; margin-bottom:4px;">Connections</div>`;
    fromThis.forEach(b => {
      html += `<div style="color:#7ac; font-size:11px; margin-bottom:2px;">→ <b>${_esc(b.target)}</b> · ${_esc(b.param)} (${_esc(b.min)}..${_esc(b.max)})</div>`;
    });
    toThis.forEach(b => {
      html += `<div style="color:#a7c; font-size:11px; margin-bottom:2px;">← <b>${_esc(b.source)}</b> → ${_esc(b.param)} (${_esc(b.min)}..${_esc(b.max)})</div>`;
    });
  }

  container.innerHTML = html;
}

// ─── Wire up panel events ─────────────────────────────────────────────────────

function _wirePanel(scene) {
  const p = _uiPanel;
  if (!p) return;

  // Preset load
  p.querySelector('#sdLoadPreset')?.addEventListener('click', () => {
    const sel = p.querySelector('#sdPreset')?.value;
    if (sel && PRESETS[sel]) {
      _state = _deepClone(PRESETS[sel]);
      _selectedId = null;
      _buildScene3D(scene);
      _refreshParamPanel();
      _setStatus(`Loaded preset: ${sel}`);
    }
  });

  // Play / Stop
  p.querySelector('#sdPlay')?.addEventListener('click', async () => {
    if (!window.Sonance) { _setStatus('Sonance not loaded'); return; }
    // Start the AudioContext from the user gesture without leaking a throwaway engine.
    await window.Sonance.Tone.start().catch(() => {});
    _stopAudio();
    _startAudio();
    _setStatus('▶ Playing…');
    p.querySelector('#sdPlay').textContent = '▶ Playing';
  });

  p.querySelector('#sdStop')?.addEventListener('click', () => {
    _stopAudio();
    _setStatus('■ Stopped');
    p.querySelector('#sdPlay').textContent = '▶ Play';
  });

  p.querySelector('#sdTrigger')?.addEventListener('click', async () => {
    await _triggerAudition();
  });

  p.querySelector('#sdNavMode')?.addEventListener('click', () => {
    if (scene.isFPSControlsEnabled()) {
      scene.disableFPSControls();
      p.querySelector('#sdNavMode').textContent = '🕹 WASD Mode';
      scene.setDescription('🎛 Synth Designer — orbit with mouse, or enable WASD Mode to walk the graph');
      _setStatus('WASD mode disabled');
      return;
    }

    const isMobile = !!(scene.input && scene.input.isMobile);
    scene.enableFPSControls({
      moveSpeed: 3,
      onLockChange: (locked) => {
        if (isMobile) return;
        scene.setDescription(locked
          ? 'WASD to move · mouse to look · ESC to pause movement'
          : 'Click the scene to lock pointer, or disable WASD Mode.');
      }
    });
    p.querySelector('#sdNavMode').textContent = '🧭 Orbit Mode';
    scene.setDescription(isMobile
      ? 'Drag to look · double-tap+hold to move'
      : 'Click the scene to lock pointer, then use WASD to move');
    _setStatus('WASD mode enabled');
  });

  p.querySelectorAll('.sdNoteKey').forEach(btn => {
    btn.addEventListener('click', async () => {
      await _triggerAudition(btn.dataset.note, '8n');
    });
  });

  // Add node toggle
  p.querySelector('#sdAddNode')?.addEventListener('click', () => {
    const menu = p.querySelector('#sdAddMenu');
    if (!menu) return;
    menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
  });

  // Add node buttons
  p.querySelectorAll('.sdAddBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      _addNode(type, scene);
      p.querySelector('#sdAddMenu').style.display = 'none';
    });
  });

  // Param changes (delegated)
  p.querySelector('#sdNodeInfo')?.addEventListener('input', e => {
    const el = e.target;
    if (el.classList.contains('sdSeqParam')) {
      if (!_selectedId) return;
      const node = _state?.nodes?.find(n => n.id === _selectedId);
      if (!node || node.type !== 'channel') return;
      const index = Number(el.dataset.index);
      const key = el.dataset.key;
      const sequence = Array.isArray(node.params?.sequence) ? [...node.params.sequence] : [];
      if (!Number.isInteger(index) || index < 0 || index >= sequence.length) return;
      const step = { ...sequence[index] };
      if (key === 'note') {
        step.note = _normalizeSequenceNoteInput(el.value);
      } else if (key === 'duration') {
        step.duration = (el.value || '8n').trim() || '8n';
      }
      sequence[index] = step;
      node.params = { ...node.params, sequence };
      if (_isPlaying) _startAudio();
      _setStatus(`Updated step ${index + 1}`);
      return;
    }

    if (!el.classList.contains('sdParam')) return;
    const key = el.dataset.key;
    const raw = el.value;
    const val = el.dataset.type === 'range' ? parseFloat(raw) : raw;
    _updateNodeParam(key, val);

    const preview = p.querySelector(`#pv-${key}`);
    if (preview) preview.textContent = el.dataset.type === 'range'
      ? Number(val).toFixed(parseFloat(el.step) < 1 ? 2 : 0)
      : val;
  });

  // Delete node
  p.querySelector('#sdNodeInfo')?.addEventListener('click', e => {
    if (e.target.id === 'sdAddStep') {
      if (!_selectedId) return;
      const node = _state?.nodes?.find(n => n.id === _selectedId);
      if (!node || node.type !== 'channel') return;
      const sequence = Array.isArray(node.params?.sequence) ? [...node.params.sequence] : [];
      sequence.push({ note: 'C4', duration: '8n' });
      node.params = { ...node.params, sequence };
      if (_isPlaying) _startAudio();
      _refreshParamPanel();
      _setStatus(`Added step ${sequence.length}`);
      return;
    }

    if (e.target.classList.contains('sdSeqRemove')) {
      if (!_selectedId) return;
      const node = _state?.nodes?.find(n => n.id === _selectedId);
      if (!node || node.type !== 'channel') return;
      const index = Number(e.target.dataset.index);
      const sequence = Array.isArray(node.params?.sequence) ? [...node.params.sequence] : [];
      if (!Number.isInteger(index) || index < 0 || index >= sequence.length) return;
      sequence.splice(index, 1);
      node.params = { ...node.params, sequence };
      if (_isPlaying) _startAudio();
      _refreshParamPanel();
      _setStatus('Removed sequence step');
      return;
    }

    if (e.target.id === 'sdDeleteNode') {
      if (!_selectedId) return;
      _state.nodes = _state.nodes.filter(n => n.id !== _selectedId);
      _state.bindings = (_state.bindings ?? []).filter(
        b => b.source !== _selectedId && b.target !== _selectedId
      );
      _selectedId = null;
      _buildScene3D(scene);
      _refreshParamPanel();
      _setStatus('Node removed');
    }
  });

  // Save
  p.querySelector('#sdSave')?.addEventListener('click', () => {
    const name = (_state.name ?? 'untitled').replace(/[^a-z0-9 _-]/gi, '_');
    SonanceSceneManager.save(name, _buildExportDef());
    _setStatus(`💾 Saved as "${name}"`);
  });

  // Load
  p.querySelector('#sdLoad')?.addEventListener('click', () => {
    const saved = SonanceSceneManager.listSaved();
    if (saved.length === 0) { _setStatus('No saved scenes found'); return; }
    const name = window.prompt('Saved scenes:\n' + saved.join(', ') + '\n\nEnter name to load:');
    if (!name) return;
    const def = SonanceSceneManager.load(name);
    if (def) {
      _state = def;
      _selectedId = null;
      _buildScene3D(scene);
      _refreshParamPanel();
      _setStatus(`📂 Loaded "${name}"`);
    } else {
      _setStatus(`Scene "${name}" not found`);
    }
  });

  // Export
  p.querySelector('#sdExport')?.addEventListener('click', () => {
    SonanceSceneManager.download(_buildExportDef(), `${(_state.name ?? 'scene').replace(/\s+/g,'-')}.json`);
    _setStatus('↓ Exported JSON');
  });

  // Import
  p.querySelector('#sdImport')?.addEventListener('click', async () => {
    try {
      const def = await SonanceSceneManager.upload();
      _state = def;
      _selectedId = null;
      _buildScene3D(scene);
      _refreshParamPanel();
      _setStatus('↑ Imported scene');
    } catch (err) {
      _setStatus(`Import error: ${err.message}`);
    }
  });
}

function _buildExportDef() {
  return {
    name: _state.name ?? 'designer-scene',
    nodes: _deepClone(_state.nodes ?? []),
    bindings: _deepClone(_state.bindings ?? [])
  };
}

function _addNode(type, scene) {
  const defaults = ADD_NODE_DEFAULTS[type];
  if (!defaults) return;

  const id = `${type}_${Date.now().toString(36)}`;
  // Pick a position offset from existing nodes of the same type
  const count = (_state.nodes ?? []).filter(n => n.type === type).length;
  const gridX = (count % 4) - 1;
  const gridZ = Math.floor(count / 4) + 3;

  const newNode = { id, ...defaults, gridX, gridZ };
  _state.nodes = [...(_state.nodes ?? []), newNode];
  _buildScene3D(scene);
  _selectNode(id);
  _setStatus(`Added ${type} node`);
}

function _updateNodeParam(key, value) {
  const node = _state.nodes.find(n => n.id === _selectedId);
  if (!node) return;
  node.params = { ...node.params, [key]: value };
  // Rebuild wires (positions unchanged) — no need to rebuild meshes
}

// ─── Module API ───────────────────────────────────────────────────────────────

function Load(scene) {
  scene.setBackgroundColor(0x080818);
  scene.setAmbientLight({ intensity: 0.3 });
  scene.setGridVisible(false);
  scene.setFloorVisible(false);

  // Camera: look down and forward at the node grid
  scene.setDefaultView({
    position: { x: 0, y: 8, z: 10 },
    target:   { x: 0, y: 0, z: 0 }
  });

  // Add decorative ambient lights
  scene.createPointLight({ color: 0x4488ff, intensity: 1.2, distance: 30, position: { x: -4, y: 5, z: -4 } });
  scene.createPointLight({ color: 0x44ffcc, intensity: 0.8, distance: 25, position: { x:  4, y: 5, z:  4 } });

  // Load initial preset
  _state = _deepClone(PRESETS['Clock & Dividers']);
  _selectedId = null;

  _buildScene3D(scene);
  _uiPanel = _createUiPanel(scene);
  _wirePanel(scene);

  scene.setDescription('🎛 Synth Designer — click a node to edit parameters, play audio, and use WASD Mode to navigate');

  return { elapsedTime: 0, frame: 0 };
}

function Update(scene, state, deltaTime, frameState) {
  if (!state) return;
  state.elapsedTime = (state.elapsedTime ?? 0) + deltaTime;
  state.frame = (state.frame ?? 0) + 1;

  // Animate nodes: gentle bob on Y axis
  let i = 0;
  for (const [id, { handle }] of _meshNodes) {
    const node = _state?.nodes?.find(n => n.id === id);
    if (!node) continue;
    const pos = handle.getPosition();
    const isSelected = id === _selectedId;
    const bob = Math.sin(state.elapsedTime * 0.7 + i * 0.8) * 0.06;
    handle.setPosition(pos.x, 1.0 + bob + (isSelected ? 0.12 : 0), pos.z);

    // Clock pulse indicator (size + color pulse synced to node frequency)
    if (node.type === 'clock') {
      const freq = Math.max(MIN_CLOCK_FREQUENCY, Number(node.params?.frequency) || 1);
      const pulse = (Math.sin(state.elapsedTime * Math.PI * 2 * freq) + 1) * 0.5;
      const scale = 1 + pulse * CLOCK_PULSE_SCALE_FACTOR;
      handle.setScale(scale, scale, scale);
      if (!isSelected) {
        handle.setColor(_lerpColor(NODE_TYPES.clock.color, 0xffffff, pulse));
      }
    } else {
      handle.setScale(1, 1, 1);
    }

    // Gentle rotation for selected node
    if (isSelected) {
      const rot = handle.getRotation();
      handle.setRotation(rot.x, rot.y + deltaTime * 0.8, rot.z);
    }
    i++;
  }

  // Update modulation if playing — use the tracked frame counter, not the mesh count
  if (_isPlaying && _modSystem) {
    const ctx = createPhotonicFrameContext(scene, {
      deltaTime,
      elapsedTime: state.elapsedTime,
      frame: state.frame
    });
    _modSystem.update(deltaTime, ctx);
  }

  const clockNode = (_state?.nodes ?? []).find(n => n.type === 'clock');
  const clockEl = _uiPanel?.querySelector('#sdClockInfo');
  if (clockEl && clockNode) {
    const freq = Math.max(MIN_CLOCK_FREQUENCY, Number(clockNode.params?.frequency) || 1);
    const pulse = (Math.sin(state.elapsedTime * Math.PI * 2 * freq) + 1) * 0.5;
    _clockIndicatorPulse = pulse > 0.5;
    clockEl.textContent = `${_clockIndicatorPulse ? '🟢' : '⚫'} Clock ${clockNode.label}: ${freq.toFixed(2)} Hz`;
  } else if (clockEl) {
    clockEl.textContent = '⏱ Clock: (none)';
  }
}

function Unload(scene, state) {
  _stopAudio();
  _clearScene3D(scene);

  if (scene.isFPSControlsEnabled()) {
    scene.disableFPSControls();
  }

  if (_uiPanel?.parentNode) {
    _uiPanel.parentNode.removeChild(_uiPanel);
  }
  _uiPanel   = null;
  _state     = null;
  _selectedId = null;
}

// ─── Register ─────────────────────────────────────────────────────────────────

(function () {
  if (!window.PhotonicModules) window.PhotonicModules = {};
  window.PhotonicModules['synth-designer'] = { Load, Update, Unload };
})();
