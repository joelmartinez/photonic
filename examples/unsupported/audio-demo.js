/**
 * Photonic Module: Audio Demo
 * Demonstrates the Sonance audio engine integrated with a Photonic scene.
 *
 * Features showcased:
 *   - Entity sounds: click the cubes to trigger different synth sounds
 *   - Soundtrack: a looping multi-channel ambient track with reverb and echo
 *   - Visual feedback: objects pulse/glow in sync with the music
 */

import {
  createPhotonicFrameContext,
  distance3D,
  normalizeToUnit
} from '../modulation/index.js';

/* global window, document */

let engine = null;
let ambientTrack = null;
let clickSpheres = [];
let pulseObjects = [];
let uiPanel = null;
let modulationBeacon = null;
let orbitBox = null;
let pulseLight = null;
let cameraLight = null;

// Direct references to Tone.js effect/param nodes for modulation.
// We capture these once during Load and use them in setter callbacks
// so we never go through writeNumericValue's path resolution, which
// can silently replace a Tone.Signal with a plain number on the first
// frame if the typeof checks don't match Tone's getter/setter wrappers.
let _toneRefs = null;
let _entityBusNodes = null;

const Metadata = {
  title: 'Sonance + Photonic Modulation Demo',
  description: 'Shared modulators sweep Sonance filters, animate Photonic lights, and react to the camera position in real time.'
};

const DEMO_ANCHOR = { x: 0, y: 1.35, z: -3.2 };
const CAMERA_DISTANCE_RANGE = [3, 10];
const MODULATION_DEFAULTS = {
  bassFilter: 16000,
  hatFilter: 14000,
  padFilter: 12000,
  padReverbWet: 0.05,
  padVolume: -20,
  leadFilter: 12000,
  leadVolume: -18,
  snareVolume: -10,
  entityFilter: 16000,
  entityReverbWet: 0.08,
  pulseLight: 1.5,
  cameraLight: 0.7,
  orbitX: DEMO_ANCHOR.x + 1.6
};

const KICK_PATCH = {
  variation: {
    detune: 4,
    velocity: 0.04
  },
  layers: [
    {
      id: 'body',
      type: 'membrane',
      note: 'C1',
      pitchDecay: 0.05,
      octaves: 4.2,
      envelope: { attack: 0.001, decay: 0.45, sustain: 0, release: 0.05 },
      volume: -1
    },
    {
      id: 'click',
      type: 'noise',
      envelope: { attack: 0.001, decay: 0.018, sustain: 0, release: 0.01 },
      volume: -20,
      effects: [
        { id: 'clickFilter', type: 'filter', filterType: 'highpass', frequency: 2400, rolloff: -24 }
      ]
    }
  ]
};

const SNARE_PATCH = {
  variation: {
    velocity: 0.08
  },
  effects: [
    { type: 'compressor', threshold: -20, ratio: 3, attack: 0.003, release: 0.12 }
  ],
  layers: [
    {
      id: 'body',
      type: 'synth',
      polyphonic: false,
      note: '185Hz',
      oscillator: 'triangle',
      envelope: { attack: 0.001, decay: 0.085, sustain: 0, release: 0.02 },
      pitchEnvelope: {
        attack: 0.001,
        decay: 0.045,
        sustain: 0,
        release: 0.01,
        baseFrequency: 175,
        octaves: 1.4
      },
      volume: -7,
      variation: {
        detune: 10,
        params: {
          'pitchEnvelope.baseFrequency': 0.05,
          'source.envelope.decay': 0.12
        }
      }
    },
    {
      id: 'sizzle',
      type: 'noise',
      envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.02 },
      volume: -8,
      effects: [
        { id: 'noiseFilter', type: 'filter', filterType: 'highpass', frequency: 1800, rolloff: -24 },
        { type: 'distortion', distortion: 0.08, wet: 1 }
      ],
      variation: {
        params: {
          'noiseFilter.frequency': 0.08,
          'source.envelope.decay': 0.12
        }
      }
    },
    {
      id: 'click',
      type: 'noise',
      envelope: { attack: 0.001, decay: 0.022, sustain: 0, release: 0.01 },
      volume: -19,
      effects: [
        { id: 'clickBand', type: 'filter', filterType: 'bandpass', frequency: 4200, Q: 4, rolloff: -24 }
      ],
      variation: {
        params: {
          'clickBand.frequency': 0.05
        }
      }
    }
  ]
};

const HIHAT_PATCH = {
  variation: {
    velocity: 0.08
  },
  layers: [
    {
      id: 'metal',
      type: 'metal',
      frequency: 260,
      harmonicity: 5.1,
      modulationIndex: 30,
      resonance: 4600,
      octaves: 1.5,
      envelope: { attack: 0.001, decay: 0.08, release: 0.02 },
      volume: -11,
      effects: [
        { id: 'hatFilter', type: 'filter', filterType: 'highpass', frequency: 7200, rolloff: -24 },
        { type: 'distortion', distortion: 0.03, wet: 0.4 }
      ],
      variation: {
        params: {
          'source.frequency': 0.04,
          'source.envelope.decay': 0.18,
          'hatFilter.frequency': 0.05
        }
      }
    },
    {
      id: 'air',
      type: 'noise',
      envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 },
      volume: -17,
      effects: [
        { id: 'airFilter', type: 'filter', filterType: 'highpass', frequency: 9200, rolloff: -24 }
      ],
      variation: {
        params: {
          'source.envelope.decay': 0.2,
          'airFilter.frequency': 0.04
        }
      }
    }
  ]
};

const PIANOISH_PATCH = {
  variation: {
    detune: 3,
    velocity: 0.05
  },
  effects: [
    { type: 'filter', filterType: 'lowpass', frequency: 3600, rolloff: -24 },
    { type: 'reverb', decay: 2.2, wet: 0.18 }
  ],
  layers: [
    {
      id: 'core',
      type: 'synth',
      polyphonic: false,
      oscillator: 'triangle',
      envelope: { attack: 0.002, decay: 1.1, sustain: 0, release: 0.35 },
      volume: -8
    },
    {
      id: 'shimmer',
      type: 'synth',
      polyphonic: false,
      oscillator: 'sine',
      transpose: 12,
      envelope: { attack: 0.001, decay: 0.55, sustain: 0, release: 0.22 },
      volume: -18
    },
    {
      id: 'hammer',
      type: 'noise',
      envelope: { attack: 0.001, decay: 0.025, sustain: 0, release: 0.01 },
      volume: -24,
      effects: [
        { id: 'hammerFilter', type: 'filter', filterType: 'bandpass', frequency: 2600, Q: 2, rolloff: -24 }
      ],
      variation: {
        params: {
          'hammerFilter.frequency': 0.08
        }
      }
    }
  ]
};

const SPHERE_SOUNDS = [
  { id: 'kick', note: 'C1', duration: '8n', color: 0xff4444, label: 'kick', preview: 'C1', sound: KICK_PATCH },
  { id: 'snare', note: 'C4', duration: '16n', color: 0x44ff44, label: 'snare', preview: 'layered', sound: SNARE_PATCH },
  { id: 'hihat', note: 'C5', duration: '32n', color: 0x4444ff, label: 'hat', preview: 'metal+air', sound: HIHAT_PATCH },
  { id: 'piano', note: 'G4', duration: '4n', color: 0xffaa00, label: 'piano-ish', preview: 'G4', sound: PIANOISH_PATCH }
];

// Ambient track MIDI sequences (note:duration tokens)
const BASS_NOTES = [
  { note: 'C2', duration: '4n' }, { note: 'C2', duration: '4n' },
  { note: 'G2', duration: '4n' }, { note: 'F2', duration: '4n' },
  { note: 'C2', duration: '4n' }, { note: 'C2', duration: '4n' },
  { note: 'Ab2', duration: '4n' }, { note: 'G2', duration: '4n' }
];

const LEAD_NOTES = [
  { note: 'E4', duration: '8n', velocity: 0.82 }, { note: 'G4', duration: '8n', velocity: 0.72 },
  { note: 'A4', duration: '4n', velocity: 0.9 }, { note: 'G4', duration: '8n', velocity: 0.75 },
  { note: 'E4', duration: '8n', velocity: 0.78 }, { note: 'C4', duration: '4n', velocity: 0.88 },
  { note: 'D4', duration: '8n', velocity: 0.74 }, { note: 'E4', duration: '4n', velocity: 0.9 }
];

const PAD_CHORDS = [
  { note: ['C3', 'E3', 'G3'], duration: '2n' },
  { note: ['F3', 'A3', 'C4'], duration: '2n' },
  { note: ['G3', 'B3', 'D4'], duration: '2n' },
  { note: ['C3', 'E3', 'G3'], duration: '2n' }
];

const SNARE_PATTERN = [
  { note: null, duration: '8n', rest: true },
  { note: 'C4', duration: '8n', velocity: 0.95 },
  { note: null, duration: '8n', rest: true },
  { note: null, duration: '8n', rest: true },
  { note: null, duration: '8n', rest: true },
  { note: 'C4', duration: '8n', velocity: 0.85 },
  { note: null, duration: '8n', rest: true },
  { note: null, duration: '8n', rest: true }
];

const HAT_PATTERN = [
  { note: 'C5', duration: '16n', velocity: 0.62 },
  { note: 'C5', duration: '16n', velocity: 0.42 },
  { note: 'C5', duration: '16n', velocity: 0.58 },
  { note: 'C5', duration: '16n', velocity: 0.44 },
  { note: 'C5', duration: '16n', velocity: 0.66 },
  { note: 'C5', duration: '16n', velocity: 0.4 },
  { note: 'C5', duration: '16n', velocity: 0.56 },
  { note: 'C5', duration: '16n', velocity: 0.45 },
  { note: 'C5', duration: '16n', velocity: 0.6 },
  { note: 'C5', duration: '16n', velocity: 0.43 },
  { note: 'C5', duration: '16n', velocity: 0.55 },
  { note: 'C5', duration: '16n', velocity: 0.41 },
  { note: 'C5', duration: '16n', velocity: 0.64 },
  { note: 'C5', duration: '16n', velocity: 0.42 },
  { note: 'C5', duration: '16n', velocity: 0.57 },
  { note: 'C5', duration: '16n', velocity: 0.45 }
];

function _formatSigned(value) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

function _lerpHexColor(startColor, endColor, amount) {
  const normalizedAmount = Math.max(0, Math.min(1, amount));
  const startR = (startColor >> 16) & 0xff;
  const startG = (startColor >> 8) & 0xff;
  const startB = startColor & 0xff;
  const endR = (endColor >> 16) & 0xff;
  const endG = (endColor >> 8) & 0xff;
  const endB = endColor & 0xff;

  const nextR = Math.round(startR + ((endR - startR) * normalizedAmount));
  const nextG = Math.round(startG + ((endG - startG) * normalizedAmount));
  const nextB = Math.round(startB + ((endB - startB) * normalizedAmount));

  return (nextR << 16) | (nextG << 8) | nextB;
}

function _updateUiReadouts(values = {}) {
  if (!uiPanel) {
    return;
  }

  const bassReadout = uiPanel.querySelector('#mod-readout-bass');
  const sharedReadout = uiPanel.querySelector('#mod-readout-shared');
  const cameraReadout = uiPanel.querySelector('#mod-readout-camera');
  const enabled = values.enabled !== false;

  if (bassReadout) {
    bassReadout.textContent = enabled ? _formatSigned(values.bassSweep ?? 0) : 'off';
  }

  if (sharedReadout) {
    sharedReadout.textContent = enabled ? _formatSigned(values.sharedPulse ?? 0) : 'off';
  }

  if (cameraReadout) {
    cameraReadout.textContent = enabled ? `${((values.cameraDistance ?? 0) * 100).toFixed(0)}%` : 'off';
  }
}

function _setToneParam(param, value) {
  if (!param) return;
  if (typeof param.rampTo === 'function') {
    // Use Tone.js native ramp for clean updates (ramp over ~1 frame)
    param.rampTo(value, 0.02);
  } else if ('value' in param) {
    param.value = value;
  }
}

function _applyModulatorBypassState() {
  if (!_toneRefs) return;

  _setToneParam(_toneRefs.bassFilterFreq, MODULATION_DEFAULTS.bassFilter);
  _setToneParam(_toneRefs.hatFilterFreq, MODULATION_DEFAULTS.hatFilter);
  _setToneParam(_toneRefs.padFilterFreq, MODULATION_DEFAULTS.padFilter);
  _setToneParam(_toneRefs.padSpaceWet, MODULATION_DEFAULTS.padReverbWet);
  _setToneParam(_toneRefs.padVolume, MODULATION_DEFAULTS.padVolume);
  _setToneParam(_toneRefs.leadFilterFreq, MODULATION_DEFAULTS.leadFilter);
  _setToneParam(_toneRefs.leadVolume, MODULATION_DEFAULTS.leadVolume);
  _setToneParam(_toneRefs.snareVolume, MODULATION_DEFAULTS.snareVolume);
  _setToneParam(_toneRefs.entityFilterFreq, MODULATION_DEFAULTS.entityFilter);
  _setToneParam(_toneRefs.entityReverbWet, MODULATION_DEFAULTS.entityReverbWet);

  if (pulseLight) {
    pulseLight.setIntensity(MODULATION_DEFAULTS.pulseLight);
  }

  if (cameraLight) {
    cameraLight.setIntensity(MODULATION_DEFAULTS.cameraLight);
  }

  if (modulationBeacon) {
    modulationBeacon.setScale(1, 1, 1);
    modulationBeacon.setColor(0x77bbff);
  }

  if (orbitBox) {
    orbitBox.setPosition(MODULATION_DEFAULTS.orbitX, 2.35, DEMO_ANCHOR.z);
    orbitBox.setColor(0xff88dd);
  }
}

function _setModulatorsEnabled(state, enabled) {
  if (!state) {
    return;
  }

  state.modulatorsEnabled = enabled;

  const toggle = uiPanel?.querySelector('#sonance-modulators-enabled');
  if (toggle) {
    toggle.checked = enabled;
  }

  if (!enabled) {
    _applyModulatorBypassState();
  }

  _updateUiReadouts({
    enabled,
    bassSweep: enabled ? state.modulation.sample('bassSweep') : 0,
    sharedPulse: enabled ? state.modulation.sample('sharedPulse') : 0,
    cameraDistance: enabled ? state.modulation.sample('cameraDistance') : 0
  });
}

function Load(scene) {
  // Require Sonance to be loaded
  if (!window.Sonance) {
    console.error('[AudioDemo] Sonance audio engine not found. Is sonance.gen.js loaded?');
    return {};
  }

  engine = window.Sonance.createEngine();
  const Tone = window.Sonance.Tone;
  const modulation = engine.modulation;
  modulation.reset();
  scene.setDescription(Metadata.description);

  // ─── Shared entity sound bus (filter + reverb → destination) ───────
  // Entity sounds route through this bus so the modulators affect them too.
  const entityFilter = new Tone.Filter({
    type: 'lowpass',
    frequency: MODULATION_DEFAULTS.entityFilter,
    Q: 3,
    rolloff: -24
  });
  const entityReverb = new Tone.Reverb({ decay: 2.5, wet: MODULATION_DEFAULTS.entityReverbWet });
  entityFilter.connect(entityReverb);
  entityReverb.toDestination();
  _entityBusNodes = [entityFilter, entityReverb];

  // ─── Entity sounds ─────────────────────────────────────────────────
  SPHERE_SOUNDS.forEach(def => {
    const sound = engine.createSound(def.id, {
      note: def.note,
      duration: def.duration,
      volume: -6,
      ...def.sound
    });
    // Reroute: Sound → entityFilter → entityReverb → Destination
    sound.connect(entityFilter);
  });

  // ─── Soundtrack ────────────────────────────────────────────────────
  ambientTrack = engine.createSoundtrack('ambient', { bpm: 100 });

  // Bass channel with echo
  const bassChannel = ambientTrack.addChannel('bass', {
    instrument: {
      oscillator: 'sawtooth',
      envelope: { attack: 0.01, decay: 0.16, sustain: 0.72, release: 0.38 }
    },
    effects: [
      { id: 'bassFilter', type: 'filter', filterType: 'lowpass', frequency: MODULATION_DEFAULTS.bassFilter, Q: 4.5, rolloff: -24 },
      { type: 'echo', delayTime: '8n', feedback: 0.2, wet: 0.25 }
    ],
    volume: -5
  });
  bassChannel.playSequence(BASS_NOTES, { loop: true });

  // Layered keys channel using the same composite patch as the entity demo
  const leadChannel = ambientTrack.addChannel('keys', {
    instrument: PIANOISH_PATCH,
    effects: [
      { id: 'leadFilter', type: 'filter', filterType: 'lowpass', frequency: MODULATION_DEFAULTS.leadFilter, Q: 2.8, rolloff: -24 }
    ],
    volume: MODULATION_DEFAULTS.leadVolume
  });
  leadChannel.playSequence(LEAD_NOTES, { loop: true });

  // Pad channel with reverb + chorus
  const padChannel = ambientTrack.addChannel('pad', {
    instrument: {
      oscillator: 'sawtooth',
      envelope: { attack: 0.3, decay: 0.5, sustain: 0.7, release: 1.5 },
      maxPolyphony: 4
    },
    effects: [
      { id: 'padFilter', type: 'filter', filterType: 'lowpass', frequency: MODULATION_DEFAULTS.padFilter, Q: 3.2, rolloff: -24 },
      { type: 'chorus', depth: 0.5, wet: 0.4 },
      { id: 'padSpace', type: 'reverb', decay: 6.5, wet: MODULATION_DEFAULTS.padReverbWet }
    ],
    volume: MODULATION_DEFAULTS.padVolume
  });
  padChannel.playSequence(PAD_CHORDS, { loop: true });

  const snareChannel = ambientTrack.addChannel('snare', {
    instrument: SNARE_PATCH,
    volume: MODULATION_DEFAULTS.snareVolume
  });
  snareChannel.playSequence(SNARE_PATTERN, { loop: true });

  const hatChannel = ambientTrack.addChannel('hat', {
    instrument: HIHAT_PATCH,
    volume: -16
  });
  hatChannel.playSequence(HAT_PATTERN, { loop: true });

  // ─── Visual cubes (click to trigger sounds) ────────────────────────
  const positions = [
    { x: -3, y: 1, z: 0 }, { x: -1, y: 1, z: 0 },
    { x:  1, y: 1, z: 0 }, { x:  3, y: 1, z: 0 }
  ];

  clickSpheres = SPHERE_SOUNDS.map((def, i) => {
    const obj = scene.createBox({
      width: 0.8, height: 0.8, depth: 0.8,
      color: def.color,
      position: positions[i]
    }).onClick(() => {
      _triggerSphere(i);
    });
    obj._soundId = def.id;
    obj._baseColor = def.color;
    return obj;
  });

  // Initialise module-level pulse state (also stored in return state for Update)
  pulseObjects = clickSpheres.map(() => ({ timer: 0, active: false }));

  scene.createBox({
    width: 5.2,
    height: 0.2,
    depth: 1.4,
    color: 0x152238,
    position: { x: DEMO_ANCHOR.x, y: 0.1, z: DEMO_ANCHOR.z }
  });

  modulationBeacon = scene.createBox({
    width: 0.75,
    height: 1.9,
    depth: 0.75,
    color: 0x77bbff,
    position: DEMO_ANCHOR
  });

  orbitBox = scene.createBox({
    width: 0.38,
    height: 0.38,
    depth: 0.38,
    color: 0xff88dd,
    position: { x: DEMO_ANCHOR.x + 1.6, y: 2.35, z: DEMO_ANCHOR.z }
  });

  pulseLight = scene.createPointLight({
    color: 0x88ddff,
    intensity: 1.5,
    distance: 24,
    position: { x: DEMO_ANCHOR.x, y: 3.1, z: DEMO_ANCHOR.z }
  });

  cameraLight = scene.createPointLight({
    color: 0xffaa55,
    intensity: 0.7,
    distance: 18,
    position: { x: 0, y: 2.2, z: 2.6 }
  });

  // ─── Capture direct Tone.js node references ─────────────────────────
  // We grab the actual Tone.Filter/Tone.Volume/etc param objects once
  // and use them via setter callbacks. This avoids writeNumericValue's
  // path resolution which can silently clobber Tone.Signal objects.
  const bassFilterNode = bassChannel._effects[0];   // Tone.Filter
  const padFilterNode  = padChannel._effects[0];     // Tone.Filter
  const padSpaceNode   = padChannel._effects[2];     // Tone.Reverb
  const leadFilterNode = leadChannel._effects[0];    // Tone.Filter
  const snareInstrOut  = snareChannel._instrument._output; // Tone.Volume
  const padInstrOut    = padChannel._instrument._output;
  const leadChannelOut = leadChannel._channel;       // Tone.Channel

  // The hat filter is inside the instrument's per-layer effects
  const hatLayer0      = hatChannel._instrument._layers[0];
  const hatFilterNode  = hatLayer0?.effects?.[0];    // Tone.Filter

  _toneRefs = {
    bassFilterFreq: bassFilterNode?.frequency,
    hatFilterFreq:  hatFilterNode?.frequency,
    padFilterFreq:  padFilterNode?.frequency,
    padSpaceWet:    padSpaceNode?.wet,
    padVolume:      padInstrOut?.volume,
    leadFilterFreq: leadFilterNode?.frequency,
    leadVolume:     leadChannelOut?.volume,
    snareVolume:    snareInstrOut?.volume,
    entityFilterFreq: entityFilter?.frequency,
    entityReverbWet:  entityReverb?.wet
  };

  // Log captured refs so we can diagnose in the browser console
  console.log('[AudioDemo] Tone.js refs captured:', Object.fromEntries(
    Object.entries(_toneRefs).map(([k, v]) => [k, v ? `${v.constructor?.name ?? typeof v} (value=${v.value})` : 'MISSING'])
  ));

  modulation.createModulator('bassSweep', {
    type: 'sine',
    frequency: 0.24,
    phase: 0.15
  });

  modulation.createModulator('sharedPulse', {
    type: 'triangle',
    frequency: 0.65
  });

  modulation.createModulator('cameraDistance', {
    type: 'value',
    getValue: ({ context }) => {
      const cameraPosition = context.camera?.position;
      const distance = distance3D(cameraPosition, DEMO_ANCHOR);
      return normalizeToUnit(distance, CAMERA_DISTANCE_RANGE);
    }
  });

  // All audio bindings use setter callbacks with direct Tone.js param refs
  modulation.bind({
    id: 'bass-filter-sweep',
    source: 'bassSweep',
    setter: value => _setToneParam(_toneRefs.bassFilterFreq, value),
    baseValue: MODULATION_DEFAULTS.bassFilter,
    min: 8,
    max: 16000,
    amount: 1
  });

  modulation.bind({
    id: 'shared-hat-sweep',
    source: 'sharedPulse',
    setter: value => _setToneParam(_toneRefs.hatFilterFreq, value),
    baseValue: MODULATION_DEFAULTS.hatFilter,
    min: 200,
    max: 16000,
    amount: 1
  });

  modulation.bind({
    id: 'shared-snare-volume',
    source: 'sharedPulse',
    setter: value => _setToneParam(_toneRefs.snareVolume, value),
    baseValue: MODULATION_DEFAULTS.snareVolume,
    min: -28,
    max: 2,
    amount: 1
  });

  modulation.bind({
    id: 'shared-pad-filter',
    source: 'sharedPulse',
    setter: value => _setToneParam(_toneRefs.padFilterFreq, value),
    baseValue: MODULATION_DEFAULTS.padFilter,
    min: 40,
    max: 16000,
    amount: 1
  });

  modulation.bind({
    id: 'shared-pad-space',
    source: 'sharedPulse',
    setter: value => _setToneParam(_toneRefs.padSpaceWet, value),
    baseValue: MODULATION_DEFAULTS.padReverbWet,
    min: 0,
    max: 0.98,
    amount: 1
  });

  modulation.bind({
    id: 'shared-pad-volume',
    source: 'sharedPulse',
    setter: value => _setToneParam(_toneRefs.padVolume, value),
    baseValue: MODULATION_DEFAULTS.padVolume,
    min: -32,
    max: -4,
    amount: 1
  });

  // Entity sound bus: bass sweep also drives the entity filter so clicks
  // sound filtered/open in sync with the bass line
  modulation.bind({
    id: 'entity-filter-sweep',
    source: 'bassSweep',
    setter: value => _setToneParam(_toneRefs.entityFilterFreq, value),
    baseValue: MODULATION_DEFAULTS.entityFilter,
    min: 80,
    max: 16000,
    amount: 1
  });

  // Entity reverb reacts to camera distance
  modulation.bind({
    id: 'entity-reverb-camera',
    source: 'cameraDistance',
    setter: value => _setToneParam(_toneRefs.entityReverbWet, value),
    baseValue: MODULATION_DEFAULTS.entityReverbWet,
    inputRange: [0, 1],
    min: 0.02,
    max: 0.85
  });

  modulation.bind({
    id: 'shared-light-intensity',
    source: 'sharedPulse',
    setter: value => pulseLight?.setIntensity(value),
    baseValue: 1.5,
    min: 1.1,
    max: 3.7
  });

  modulation.bind({
    id: 'shared-beacon-scale',
    source: 'sharedPulse',
    setter: value => modulationBeacon?.setScale(value, value * 1.2, value),
    min: 0.82,
    max: 1.3
  });

  modulation.bind({
    id: 'shared-orbit-box',
    source: 'sharedPulse',
    setter: value => orbitBox?.setPosition(value, 2.35, DEMO_ANCHOR.z),
    min: DEMO_ANCHOR.x - 1.9,
    max: DEMO_ANCHOR.x + 1.9
  });

  modulation.bind({
    id: 'camera-lead-filter',
    source: 'cameraDistance',
    setter: value => _setToneParam(_toneRefs.leadFilterFreq, value),
    baseValue: MODULATION_DEFAULTS.leadFilter,
    inputRange: [0, 1],
    min: 80,
    max: 16000
  });

  modulation.bind({
    id: 'camera-lead-volume',
    source: 'cameraDistance',
    setter: value => _setToneParam(_toneRefs.leadVolume, value),
    baseValue: MODULATION_DEFAULTS.leadVolume,
    inputRange: [0, 1],
    min: -30,
    max: -2
  });

  modulation.bind({
    id: 'camera-light-intensity',
    source: 'cameraDistance',
    setter: value => cameraLight?.setIntensity(value),
    baseValue: MODULATION_DEFAULTS.cameraLight,
    inputRange: [0, 1],
    min: 0.2,
    max: 3.2
  });

  // ─── UI panel ──────────────────────────────────────────────────────
  const moduleState = {
    engine,
    ambientTrack,
    modulation,
    clickSpheres,
    beatTimer: 0,
    elapsedTime: 0,
    isPlaying: false,
    pulseObjects,
    modulatorsEnabled: true,
    channels: {
      bass: bassChannel,
      lead: leadChannel,
      pad: padChannel,
      snare: snareChannel,
      hat: hatChannel
    }
  };

  uiPanel = _createUiPanel(scene, moduleState);

  return moduleState;
}

function Update(scene, state, deltaTime, frameState) {
  if (!state || !state.clickSpheres || !state.modulation) return;

  const photonicFrame = createPhotonicFrameContext(scene, frameState ?? {
    deltaTime,
    elapsedTime: (state.elapsedTime || 0) + deltaTime,
    frame: (state.frame || 0) + 1
  });

  let bassSweep = 0;
  let sharedPulse = 0;
  let cameraDistance = 0;

  state.beatTimer = (state.beatTimer || 0) + deltaTime;
  state.elapsedTime = (state.elapsedTime || 0) + deltaTime;
  state.frame = (state.frame || 0) + 1;

  if (state.modulatorsEnabled !== false) {
    const modulationState = state.modulation.update(deltaTime, photonicFrame);
    state.beatTimer = modulationState.time;
    state.elapsedTime = modulationState.time;
    state.frame = modulationState.frame;
    bassSweep = state.modulation.sample('bassSweep');
    sharedPulse = state.modulation.sample('sharedPulse');
    cameraDistance = state.modulation.sample('cameraDistance');
  } else {
    _applyModulatorBypassState();
  }

  const sharedPulseNormalized = normalizeToUnit(sharedPulse, [-1, 1]);
  const cameraPosition = photonicFrame.camera?.position;

  if (modulationBeacon) {
    modulationBeacon.setColor(_lerpHexColor(0x77bbff, 0xff8844, cameraDistance));
  }

  if (orbitBox) {
    const orbitRotation = orbitBox.getRotation();
    orbitBox.setRotation(
      orbitRotation.x + (deltaTime * 0.4),
      orbitRotation.y + (deltaTime * 1.5),
      orbitRotation.z + (deltaTime * 0.2)
    );
    orbitBox.setColor(_lerpHexColor(0xff88dd, 0xffdd55, sharedPulseNormalized));
  }

  if (cameraLight && cameraPosition) {
    cameraLight.setPosition(
      cameraPosition.x * 0.18,
      1.8 + (cameraDistance * 1.4),
      2.4 - (cameraDistance * 1.2)
    );
  }

  // Animate pulsing spheres
  state.clickSpheres.forEach((obj, i) => {
    const pulse = pulseObjects[i];
    if (pulse.active) {
      pulse.timer += deltaTime;
      const t = pulse.timer;
      if (t < 0.15) {
        // Scale up then back on Y axis by adjusting color brightness
        const brightness = 1 + (0.5 * (1 - t / 0.15));
        const r = ((obj._baseColor >> 16) & 0xff) / 255;
        const g = ((obj._baseColor >> 8) & 0xff) / 255;
        const b = (obj._baseColor & 0xff) / 255;
        const newR = Math.min(1, r * brightness);
        const newG = Math.min(1, g * brightness);
        const newB = Math.min(1, b * brightness);
        obj.setColor(
          (Math.round(newR * 255) << 16) |
          (Math.round(newG * 255) << 8) |
          Math.round(newB * 255)
        );
        // Bob up and down
        const pos = obj.getPosition();
        obj.setPosition(pos.x, 1 + Math.sin(t * Math.PI / 0.15) * 0.3, pos.z);
      } else {
        // Reset
        obj.setColor(obj._baseColor);
        const pos = obj.getPosition();
        obj.setPosition(pos.x, 1, pos.z);
        pulse.active = false;
        pulse.timer = 0;
      }
    }

    // Slow float animation when idle
    if (!pulse.active) {
      const pos = obj.getPosition();
      obj.setPosition(
        pos.x,
        1 + Math.sin(state.beatTimer * 0.8 + i * 1.5) * 0.1 + (sharedPulse * 0.03),
        pos.z
      );
    }

    // Rotation
    const rot = obj.getRotation();
    obj.setRotation(rot.x, rot.y + deltaTime * (0.3 + i * 0.1), rot.z);
  });

  _updateUiReadouts({
    enabled: state.modulatorsEnabled !== false,
    bassSweep,
    sharedPulse,
    cameraDistance
  });

  // Periodic diagnostic: log actual Tone.js param values every ~2 seconds
  if (_toneRefs && state.modulatorsEnabled !== false && state.frame % 120 === 0) {
    console.log('[AudioDemo] Tone param values:',
      'bassFilter.freq=', _toneRefs.bassFilterFreq?.value?.toFixed?.(1) ?? 'N/A',
      'snareVol=', _toneRefs.snareVolume?.value?.toFixed?.(1) ?? 'N/A',
      'padFilter.freq=', _toneRefs.padFilterFreq?.value?.toFixed?.(1) ?? 'N/A',
      'padVol=', _toneRefs.padVolume?.value?.toFixed?.(1) ?? 'N/A'
    );
  }
}

function Unload(scene, state) {
  // Stop and clean up soundtrack
  if (ambientTrack) {
    ambientTrack.stop();
    ambientTrack.dispose();
    ambientTrack = null;
  }

  // Clean up engine
  if (engine) {
    engine.dispose();
    engine = null;
  }

  // Remove UI panel
  if (uiPanel && uiPanel.parentNode) {
    uiPanel.parentNode.removeChild(uiPanel);
    uiPanel = null;
  }

  // Remove scene objects
  if (state) {
    (state.clickSpheres || []).forEach(obj => obj && obj.remove());
  }

  clickSpheres = [];
  pulseObjects = [];
  modulationBeacon = null;
  orbitBox = null;
  pulseLight = null;
  cameraLight = null;
  _toneRefs = null;
  if (_entityBusNodes) {
    _entityBusNodes.forEach(n => n.dispose());
    _entityBusNodes = null;
  }
}

// ─── UI Panel ──────────────────────────────────────────────────────────────

function _createUiPanel(scene, state) {
  const container = document.getElementById('photonic-ui-overlay') || document.body;

  const panel = document.createElement('div');
  panel.id = 'sonance-demo-panel';
  panel.style.cssText = `
    position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%);
    background: rgba(0,0,0,0.75); color: #fff; border-radius: 12px;
    padding: 16px 24px; font-family: monospace; font-size: 13px;
    display: flex; flex-direction: column; gap: 12px; z-index: 100;
    border: 1px solid rgba(255,255,255,0.15); min-width: 320px;
  `;

  panel.innerHTML = `
    <div style="font-size:15px; font-weight:bold; text-align:center; color:#aef">
      Sonance + Photonic Modulation Demo
    </div>
    <div style="color:#aaa; text-align:center; font-size:11px;">
      Click the cubes, start the soundtrack, then A/B the checkbox to hear the filters and space open up
    </div>
    <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
      ${SPHERE_SOUNDS.map((s, i) => `
        <button id="snd-btn-${i}" data-idx="${i}" style="
          background: #${s.color.toString(16).padStart(6,'0')}33;
          border: 1px solid #${s.color.toString(16).padStart(6,'0')}99;
          color: #fff; border-radius: 6px; padding: 6px 12px;
          cursor: pointer; font-family: monospace; font-size: 12px;
        ">${s.label} (${s.preview})</button>
      `).join('')}
    </div>
    <div style="display:flex; gap:8px; justify-content:center; align-items:center;">
      <button id="sonance-play" style="
        background: #2a6; border: none; color: #fff; border-radius: 6px;
        padding: 8px 20px; cursor: pointer; font-family: monospace; font-size: 13px;
      ">▶ Play Ambient Track</button>
      <button id="sonance-stop" style="
        background: #622; border: none; color: #fff; border-radius: 6px;
        padding: 8px 20px; cursor: pointer; font-family: monospace; font-size: 13px;
      ">■ Stop</button>
    </div>
    <label style="display:flex; gap:8px; justify-content:center; align-items:center; font-size:12px; color:#def;">
      <input id="sonance-modulators-enabled" type="checkbox" checked />
      Enable modulators
    </label>
    <div style="display:grid; grid-template-columns: 1fr; gap:6px; font-size:11px; color:#bcd;">
      <div>1. <span style="color:#8fd;">bass filter sweep</span> <span id="mod-readout-bass">+0.00</span> <span style="color:#889;">(saw bass + entity sound filter: near-silent to fully open)</span></div>
      <div>2. <span style="color:#f8c;">shared pulse</span> <span id="mod-readout-shared">+0.00</span> <span style="color:#889;">(snare top-level volume + pad filter + reverb + pad level + hat + visuals)</span></div>
      <div>3. <span style="color:#fc8;">camera distance mix</span> <span id="mod-readout-camera">0%</span> <span style="color:#889;">(lead filter + lead level + entity reverb + light)</span></div>
    </div>
    <div id="sonance-status" style="text-align:center; color:#888; font-size:11px;">
      Audio context: not started
    </div>
  `;

  container.appendChild(panel);

  // Wire up sound buttons
  SPHERE_SOUNDS.forEach((def, i) => {
    const btn = panel.querySelector(`#snd-btn-${i}`);
    if (btn) {
      btn.addEventListener('click', () => {
        _triggerSphere(i);
      });
    }
  });

  // Play / stop buttons
  panel.querySelector('#sonance-play').addEventListener('click', async () => {
    if (!engine) return;
    await engine.start();
    await ambientTrack.play();
    panel.querySelector('#sonance-status').textContent = '🎵 Ambient track playing…';
    panel.querySelector('#sonance-status').style.color = '#6f6';
  });

  panel.querySelector('#sonance-stop').addEventListener('click', () => {
    if (ambientTrack) ambientTrack.stop();
    const status = panel.querySelector('#sonance-status');
    if (status) {
      status.textContent = '⏹ Stopped';
      status.style.color = '#fa8';
    }
  });

  panel.querySelector('#sonance-modulators-enabled').addEventListener('change', (event) => {
    _setModulatorsEnabled(state, event.currentTarget.checked);
  });

  _setModulatorsEnabled(state, true);

  return panel;
}

function _triggerSphere(idx) {
  if (!engine || idx >= SPHERE_SOUNDS.length || idx >= clickSpheres.length) return;

  const def = SPHERE_SOUNDS[idx];

  // Ensure audio context started
  engine.start().then(() => {
    engine.triggerSound(def.id);
  });

  // Pulse animation via module-level state
  if (pulseObjects[idx]) {
    pulseObjects[idx] = { timer: 0, active: true };
  }
}

// Register this module
(function() {
  if (!window.PhotonicModules) {
    window.PhotonicModules = {};
  }

  window.PhotonicModules['audio-demo'] = {
    Metadata,
    Load,
    Update,
    Unload
  };
})();
