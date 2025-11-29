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

// --- State ---
let synth;
let recorder;
let recording = false;
let recordedChunks = [];
let startTime = 0;
let timerInterval;
let midiData = new Midi();
let midiTrack;
let activeNotes = new Map(); // key: note, value: startTime

// --- DOM Elements ---
const pianoContainer = document.getElementById('piano');
const btnRecord = document.getElementById('btn-record');
const btnStop = document.getElementById('btn-stop');
const btnExportMidi = document.getElementById('btn-export-midi');
const btnExportWav = document.getElementById('btn-export-wav');
const statusText = document.getElementById('status-text');
const timerDisplay = document.getElementById('timer');

// --- Initialization ---
async function initAudio() {
  await Tone.start();
  synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 1 }
  }).toDestination();
  
  // Setup Recorder
  const dest = Tone.context.createMediaStreamDestination();
  synth.connect(dest);
  recorder = new MediaRecorder(dest.stream);
  
  recorder.ondataavailable = (e) => recordedChunks.push(e.data);
  recorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: 'audio/webm' });
    // We will convert this blob or use AudioBuffer for WAV export later
  };
  
  console.log('Audio initialized');
}

// --- UI Generation ---
function createPiano() {
  // Create White Keys
  WHITE_KEYS.forEach((note, index) => {
    const key = document.createElement('div');
    key.className = 'key white';
    key.dataset.note = note;
    key.addEventListener('mousedown', () => playNote(note));
    key.addEventListener('mouseup', () => stopNote(note));
    key.addEventListener('mouseleave', () => stopNote(note));
    pianoContainer.appendChild(key);
  });

  // Create Black Keys (Overlay)
  let whiteKeyIndex = 0;
  BLACK_KEYS.forEach((note) => {
    if (note) {
      const key = document.createElement('div');
      key.className = 'key black';
      key.dataset.note = note;
      // Calculate position: (index * width) - (width / 2)
      // Assuming white key width is approx 60px + margins
      // A better way is to append to the container and use absolute positioning relative to white keys
      // For simplicity in this vanilla setup, we'll calculate percent left
      const leftPercent = ((whiteKeyIndex + 1) * (100 / WHITE_KEYS.length)) - (100 / WHITE_KEYS.length / 2);
      key.style.left = `${leftPercent}%`;
      key.style.transform = 'translateX(-50%)';
      
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
  
  // Visual Feedback
  const keyEl = document.querySelector(`.key[data-note="${note}"]`);
  if (keyEl) keyEl.classList.add('active');

  // MIDI Recording
  if (recording) {
    // We'll add the note on release to get duration, or track start time here
  }
}

function stopNote(note) {
  if (!activeNotes.has(note)) return;
  
  synth.triggerRelease(note);
  const startTime = activeNotes.get(note);
  activeNotes.delete(note);

  // Visual Feedback
  const keyEl = document.querySelector(`.key[data-note="${note}"]`);
  if (keyEl) keyEl.classList.remove('active');

  // MIDI Recording
  if (recording && midiTrack) {
    midiTrack.addNote({
      midi: Tone.Frequency(note).toMidi(),
      time: startTime - Tone.now() + (Tone.context.currentTime - startTime), // Approximate relative time
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

// --- Recording Logic ---
btnRecord.addEventListener('click', async () => {
  if (!synth) await initAudio();
  
  recording = true;
  recordedChunks = [];
  midiData = new Midi();
  midiTrack = midiData.addTrack();
  
  recorder.start();
  startTime = Date.now();
  
  // UI Updates
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
  // To export WAV, we need to render the MIDI or use the recorded audio chunks.
  // Since we recorded the audio stream directly, let's use that for high fidelity of what was heard.
  // However, MediaRecorder gives WebM/Ogg usually. We need to decode it to AudioBuffer then to WAV.
  
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
createPiano();
