/**
 * KILYAVUZ P2P - Ses & Yankı Önleme Modülü (1-e-1)
 * Tarayıcının C++ AEC3 (Acoustic Echo Cancellation) motorunu bozmamak adına:
 * Mikrofon doğrudan WebRTC'ye iletilir, WebAudio destination döngüsüne sokulmaz.
 */

import { AUDIO_CONSTRAINTS } from "./config.js";

let micStream = null;
let micTrack = null;
let isMicMuted = false;
let isNoiseCancelEnabled = true;

// Uzak ses oynatıcı elementleri
let remoteMicAudio = null;
let remoteScreenAudio = null;

// Ses seviyeleri (0.0 - 1.0)
let remoteMicVolume = 1.0;
let remoteScreenVolume = 0.8;
let isDucking = false;

// Konuşma algılayıcı (Sadece VAD görsel göstergesi için - hoparlöre ASLA bağlanmaz)
let vadAudioCtx = null;
let vadAnalyser = null;
let vadAnimId = null;
let onSpeakingChangeCallback = null;

export async function initMicrophone() {
  if (micStream) return micStream;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: AUDIO_CONSTRAINTS,
      video: false
    });
    micTrack = micStream.getAudioTracks()[0];
    if (micTrack) {
      micTrack.enabled = !isMicMuted;
    }
    setupVad(micStream);
    return micStream;
  } catch (err) {
    console.error("Mikrofon erişim hatası:", err);
    throw err;
  }
}

export function getMicStream() {
  return micStream;
}

export function getMicTrack() {
  return micTrack;
}

export function toggleMic() {
  if (!micTrack) return false;
  isMicMuted = !isMicMuted;
  micTrack.enabled = !isMicMuted;
  return !isMicMuted;
}

export function isMicActive() {
  return !isMicMuted;
}

export function setSpeakingCallback(fn) {
  onSpeakingChangeCallback = fn;
}

/**
 * Hoparlöre çıkış VERMEYEN, yalnızca yeşil konuşma halkası (VAD) için frekans analizi
 */
function setupVad(stream) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    vadAudioCtx = new AudioCtx();
    const source = vadAudioCtx.createMediaStreamSource(stream);
    vadAnalyser = vadAudioCtx.createAnalyser();
    vadAnalyser.fftSize = 256;
    vadAnalyser.smoothingTimeConstant = 0.4;
    source.connect(vadAnalyser);
    // DİKKAT: vadAnalyser.connect(vadAudioCtx.destination) YAPILMAZ! (Yankı önleme)

    const data = new Uint8Array(vadAnalyser.frequencyBinCount);
    let wasSpeaking = false;

    const checkVolume = () => {
      if (vadAudioCtx.state === "suspended") {
        vadAudioCtx.resume().catch(() => {});
      }
      if (!isMicMuted) {
        vadAnalyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length;
        const isSpeaking = avg > 14;
        if (isSpeaking !== wasSpeaking) {
          wasSpeaking = isSpeaking;
          if (onSpeakingChangeCallback) onSpeakingChangeCallback(isSpeaking);
        }
      } else if (wasSpeaking) {
        wasSpeaking = false;
        if (onSpeakingChangeCallback) onSpeakingChangeCallback(false);
      }
      vadAnimId = requestAnimationFrame(checkVolume);
    };
    vadAnimId = requestAnimationFrame(checkVolume);
  } catch (e) {
    console.warn("VAD kurulamadı:", e);
  }
}

/**
 * Uzak eşten gelen ses akışlarını bağlar
 */
export function attachRemoteAudio(stream, kind = "mic") {
  if (kind === "mic") {
    if (!remoteMicAudio) {
      remoteMicAudio = document.getElementById("remoteAudio") || new Audio();
      remoteMicAudio.autoplay = true;
    }
    remoteMicAudio.srcObject = stream;
    remoteMicAudio.volume = remoteMicVolume;
    remoteMicAudio.play().catch(() => {});
  } else if (kind === "screen") {
    if (!remoteScreenAudio) {
      remoteScreenAudio = new Audio();
      remoteScreenAudio.autoplay = true;
    }
    remoteScreenAudio.srcObject = stream;
    applyScreenAudioVolume();
    remoteScreenAudio.play().catch(() => {});
  }
}

export function setRemoteMicVolume(valPercent) {
  remoteMicVolume = Math.max(0, Math.min(100, Number(valPercent))) / 100;
  if (remoteMicAudio) remoteMicAudio.volume = remoteMicVolume;
}

export function setRemoteScreenVolume(valPercent) {
  remoteScreenVolume = Math.max(0, Math.min(100, Number(valPercent))) / 100;
  applyScreenAudioVolume();
}

export function setDucking(enabled) {
  isDucking = enabled;
  applyScreenAudioVolume();
}

function applyScreenAudioVolume() {
  if (!remoteScreenAudio) return;
  // Biri konuştuğunda ekran sesini %50 kıs (Ducking)
  const factor = isDucking ? 0.5 : 1.0;
  remoteScreenAudio.volume = remoteScreenVolume * factor;
}

export function cleanupAudio() {
  if (vadAnimId) cancelAnimationFrame(vadAnimId);
  if (vadAudioCtx) {
    vadAudioCtx.close().catch(() => {});
    vadAudioCtx = null;
  }
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
    micTrack = null;
  }
  if (remoteMicAudio) {
    remoteMicAudio.srcObject = null;
  }
  if (remoteScreenAudio) {
    remoteScreenAudio.srcObject = null;
  }
}
