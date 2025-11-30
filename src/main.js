import * as Tone from 'tone';
import { Midi } from '@tonejs/midi';
import toWav from 'audiobuffer-to-wav';
import './style.css';

// --- Configuration ---
const WHITE_KEYS = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5'];
const BLACK_KEYS = ['C#4', 'D#4', null, 'F#4', 'G#4', 'A#4', null, 'C#5', 'D#5'];
const KEY_MAP = {
  'a': 'C4', 'w': 'C#4',
  's': 'D4', 'e': 'D#4',
  'd': 'E4',
  'f': 'F4', 't': 'F#4',
  'g': 'G4', 'y': 'G#4',
  'h': 'A4', 'u': 'A#4',
  'j': 'B4',
  'k': 'C5', 'o': 'C#5',
  'l': 'D5', 'p': 'D#5',
  ';': 'E5'
};

// Reverse mapping: note -> keyboard key
const NOTE_TO_KEY = {};
Object.entries(KEY_MAP).forEach(([key, note]) => {
  NOTE_TO_KEY[note] = key.toUpperCase();
});

// --- State ---
let synth;
let currentInstrument = 'synth';
let recorder;
let recording = false;
let recordedChunks = [];
let startTime = 0;
let timerInterval;
let midiData = new Midi();
let midiTrack;
let activeNotes = new Map();

// Rhythm Machine
let rhythmPlaying = false;
let rhythmLoop;
let drumSynth;
let currentTempo = 120;
let currentRhythm = 'basic';

// --- DOM Elements ---
const pianoContainer = document.getElementById('piano');
const btnRecord = document.getElementById('btn-record');
const btnStop = document.getElementById('btn-stop');
const btnExportMidi = document.getElementById('btn-export-midi');
const btnExportWav = document.getElementById('btn-export-wav');
const statusText = document.getElementById('status-text');
const timerDisplay = document.getElementById('timer');
const soundSelector = document.getElementById('sound-selector');
const rhythmToggle = document.getElementById('btn-rhythm-toggle');
const rhythmSelector = document.getElementById('rhythm-selector');
const tempoSlider = document.getElementById('tempo-slider');
const tempoDisplay = document.getElementById('tempo-display');

// --- Instrument Creation Functions ---
function createSynthInstrument() {
  return new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 1 }
  }).toDestination();
}

function createPianoInstrument() {
  return new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.005, decay: 0.3, sustain: 0.1, release: 2 }
  }).toDestination();
}

function create8BitInstrument() {
  return new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'square' },
    envelope: { attack: 0.001, decay: 0.1, sustain: 0.05, release: 0.1 }
  }).toDestination();
}

function createOrganInstrument() {
  return new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.5 }
  }).toDestination();
}

// --- Initialization ---
async function initAudio() {
  await Tone.start();
  synth = createSynthInstrument();
  
  // Setup Drum Synth for rhythm
  drumSynth = {
    kick: new Tone.MembraneSynth().toDestination(),
    snare: new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.2, sustain: 0 }
    }).toDestination(),
    hihat: new Tone.MetalSynth({
      frequency: 200,
      envelope: { attack: 0.001, decay: 0.1, release: 0.01 },
      resonance: 3000
    }).toDestination()
  };
  
  // Setup Recorder
  const dest = Tone.context.createMediaStreamDestination();
  synth.connect(dest);
  recorder = new MediaRecorder(dest.stream);
  
  recorder.ondataavailable = (e) => recordedChunks.push(e.data);
  
  console.log('Audio initialized');
}

// --- Change Instrument ---
function changeInstrument(type) {
  if (synth) {
    synth.dispose();
  }
  
  switch(type) {
    case 'piano':
      synth = createPianoInstrument();
      break;
    case '8bit':
      synth = create8BitInstrument();
      break;
    case 'organ':
      synth = createOrganInstrument();
      break;
    default:
      synth = createSynthInstrument();
  }
  
  currentInstrument = type;
  
  // Reconnect to recorder
  if (recorder) {
    const dest = Tone.context.createMediaStreamDestination();
    synth.connect(dest);
    const newRecorder = new MediaRecorder(dest.stream);
    newRecorder.ondataavailable = recorder.ondataavailable;
    recorder = newRecorder;
  }
}

// --- Rhythm Patterns ---
const rhythmPatterns = {
  basic: (time) => {
    drumSynth.kick.triggerAttackRelease('C1', '8n', time);
    drumSynth.hihat.triggerAttackRelease('8n', time);
    drumSynth.hihat.triggerAttackRelease('8n', time + Tone.Time('8n').toSeconds());
    drumSynth.snare.triggerAttackRelease('8n', time + Tone.Time('4n').toSeconds());
    drumSynth.hihat.triggerAttackRelease('8n', time + Tone.Time('4n').toSeconds() + Tone.Time('8n').toSeconds());
  },
  jazz: (time) => {
    drumSynth.hihat.triggerAttackRelease('16n', time);
    drumSynth.kick.triggerAttackRelease('C1', '16n', time + Tone.Time('8n').toSeconds());
    drumSynth.hihat.triggerAttackRelease('16n', time + Tone.Time('4n').toSeconds());
    drumSynth.snare.triggerAttackRelease('16n', time + Tone.Time('4n').toSeconds() + Tone.Time('16n').toSeconds());
  },
  electronic: (time) => {
    drumSynth.kick.triggerAttackRelease('C1', '16n', time);
    drumSynth.kick.triggerAttackRelease('C1', '16n', time + Tone.Time('8n').toSeconds());
    drumSynth.snare.triggerAttackRelease('16n', time + Tone.Time('4n').toSeconds());
    drumSynth.hihat.triggerAttackRelease('32n', time);
    drumSynth.hihat.triggerAttackRelease('32n', time + Tone.Time('16n').toSeconds());
    drumSynth.hihat.triggerAttackRelease('32n', time + Tone.Time('8n').toSeconds());
  }
};

// --- UI Generation ---
function renderPianoKeys() {
  WHITE_KEYS.forEach((note, index) => {
    const key = document.createElement('div');
    key.className = 'key white';
    key.dataset.note = note;
    
    // Add keyboard label
    const label = document.createElement('span');
    label.className = 'key-label';
    label.textContent = NOTE_TO_KEY[note] || '';
    key.appendChild(label);
    
    key.addEventListener('mousedown', () => playNote(note));
    key.addEventListener('mouseup', () => stopNote(note));
    key.addEventListener('mouseleave', () => stopNote(note));
    pianoContainer.appendChild(key);
  });

  let whiteKeyIndex = 0;
  BLACK_KEYS.forEach((note) => {
    if (note) {
      const key = document.createElement('div');
      key.className = 'key black';
      key.dataset.note = note;
      const leftPercent = ((whiteKeyIndex + 1) * (100 / WHITE_KEYS.length)) - (100 / WHITE_KEYS.length / 2);
      key.style.left = `${leftPercent}%`;
      key.style.transform = 'translateX(-50%)';
      
      // Add keyboard label for black keys
      const label = document.createElement('span');
      label.className = 'key-label';
      label.textContent = NOTE_TO_KEY[note] || '';
      key.appendChild(label);
      
      key.addEventListener('mousedown', () => playNote(note));
      key.addEventListener('mouseup', () => stopNote(note));
      key.addEventListener('mouseleave', () => stopNote(note));
      pianoContainer.appendChild(key);
    }
    whiteKeyIndex++;
  });
}

// --- Audio Logic ---
function playNote(note) {
  if (!synth) initAudio();
  if (activeNotes.has(note)) return;

  synth.triggerAttack(note);
  activeNotes.set(note, Tone.now());
  
  const keyEl = document.querySelector(`.key[data-note="${note}"]`);
  if (keyEl) keyEl.classList.add('active');
}

function stopNote(note) {
  if (!activeNotes.has(note)) return;
  
  synth.triggerRelease(note);
  const startTime = activeNotes.get(note);
  activeNotes.delete(note);

  const keyEl = document.querySelector(`.key[data-note="${note}"]`);
  if (keyEl) keyEl.classList.remove('active');

  if (recording && midiTrack) {
    midiTrack.addNote({
      midi: Tone.Frequency(note).toMidi(),
      time: startTime - Tone.now() + (Tone.context.currentTime - startTime),
      duration: Tone.now() - startTime
    });
  }
}

// --- Keyboard Interaction ---
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const note = KEY_MAP[e.key.toLowerCase()];
  if (note) playNote(note);
});

window.addEventListener('keyup', (e) => {
  const note = KEY_MAP[e.key.toLowerCase()];
  if (note) stopNote(note);
});

// --- Sound Selector ---
soundSelector.addEventListener('change', (e) => {
  changeInstrument(e.target.value);
});

// --- Rhythm Controls ---
rhythmToggle.addEventListener('click', async () => {
  if (!synth) await initAudio();
  
  if (!rhythmPlaying) {
    Tone.Transport.bpm.value = currentTempo;
    rhythmLoop = new Tone.Loop((time) => {
      rhythmPatterns[currentRhythm](time);
    }, '1m');
    rhythmLoop.start(0);
    Tone.Transport.start();
    rhythmPlaying = true;
    rhythmToggle.textContent = 'Stop Beat';
    rhythmToggle.style.borderColor = 'var(--danger-color)';
    rhythmToggle.style.color = 'var(--danger-color)';
  } else {
    Tone.Transport.stop();
    if (rhythmLoop) rhythmLoop.dispose();
    rhythmPlaying = false;
    rhythmToggle.textContent = 'Start Beat';
    rhythmToggle.style.borderColor = '';
    rhythmToggle.style.color = '';
  }
});

rhythmSelector.addEventListener('change', (e) => {
  currentRhythm = e.target.value;
});

tempoSlider.addEventListener('input', (e) => {
  currentTempo = parseInt(e.target.value);
  tempoDisplay.textContent = `${currentTempo} BPM`;
  if (rhythmPlaying) {
    Tone.Transport.bpm.value = currentTempo;
  }
});

// --- Recording Logic ---
btnRecord.addEventListener('click', async () => {
  if (!synth) await initAudio();
  
  recording = true;
  recordedChunks = [];
  midiData = new Midi();
  midiTrack = midiData.addTrack();
  
  recorder.start();
  startTime = Date.now();
  
  statusText.innerText = "Recording...";
  statusText.style.color = "var(--danger-color)";
  btnRecord.disabled = true;
  btnStop.disabled = false;
  btnExportMidi.disabled = true;
  btnExportWav.disabled = true;
  
  timerInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const secs = Math.floor(elapsed / 1000);
    const ms = Math.floor((elapsed % 1000) / 10);
    timerDisplay.innerText = `${String(secs).padStart(2, '0')}:${String(ms).padStart(2, '0')}`;
  }, 50);
});

btnStop.addEventListener('click', () => {
  recording = false;
  recorder.stop();
  clearInterval(timerInterval);
  
  statusText.innerText = "Recorded";
  statusText.style.color = "var(--accent-color)";
  btnRecord.disabled = false;
  btnStop.disabled = true;
  btnExportMidi.disabled = false;
  btnExportWav.disabled = false;
});

// --- Export Logic ---
btnExportMidi.addEventListener('click', () => {
  const midiArray = midiData.toArray();
  const blob = new Blob([midiArray], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'recording.mid';
  a.click();
});

btnExportWav.addEventListener('click', async () => {
  if (recordedChunks.length === 0) return;
  
  const blob = new Blob(recordedChunks, { type: 'audio/webm' });
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  
  const wav = toWav(audioBuffer);
  const wavBlob = new Blob([wav], { type: 'audio/wav' });
  const url = URL.createObjectURL(wavBlob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = 'recording.wav';
  a.click();
});

// --- Start ---
renderPianoKeys();
