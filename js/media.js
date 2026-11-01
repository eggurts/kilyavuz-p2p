/**
 * KILYAVUZ P2P - Ekran & Kamera Medya Yönetimi (Sabit 30 FPS • H.264)
 */

import { VIDEO_FPS, RESOLUTION_PRESETS } from "./config.js";
import { preferHardwareH264 } from "./sdp.js";

let localScreenStream = null;
let localCamStream = null;
let currentResolution = localStorage.getItem("kilyavuzQualityRes") || "720";
let screenSender = null;
let screenAudioSender = null;
let camSender = null;

export function getLocalScreenStream() {
  return localScreenStream;
}

export function getLocalCamStream() {
  return localCamStream;
}

export function getCurrentResolution() {
  return currentResolution;
}

export function setResolution(resKey) {
  if (RESOLUTION_PRESETS[resKey]) {
    currentResolution = resKey;
    localStorage.setItem("kilyavuzQualityRes", resKey);
  }
}

/**
 * Ekran paylaşımını başlatır (30 FPS ve sistem sesi ile)
 */
export async function startScreenShare(pc, onEndedCallback) {
  if (localScreenStream) return localScreenStream;

  const targetPreset = RESOLUTION_PRESETS[currentResolution] || RESOLUTION_PRESETS["720"];
  const videoConstraints = {
    frameRate: { ideal: VIDEO_FPS, max: VIDEO_FPS }
  };
  if (targetPreset.height) {
    videoConstraints.height = { ideal: targetPreset.height, max: targetPreset.height };
    videoConstraints.width = { max: Math.round(targetPreset.height * 22 / 9) };
  }

  try {
    localScreenStream = await navigator.mediaDevices.getDisplayMedia({
      video: videoConstraints,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    const videoTrack = localScreenStream.getVideoTracks()[0];
    const audioTrack = localScreenStream.getAudioTracks()[0];

    if (pc && videoTrack) {
      screenSender = pc.addTrack(videoTrack, localScreenStream);
      preferHardwareH264(screenSender, pc);
      await applyScreenEncodingParameters(screenSender, videoTrack);
    }

    if (pc && audioTrack) {
      screenAudioSender = pc.addTrack(audioTrack, localScreenStream);
    }

    if (videoTrack) {
      videoTrack.onended = () => {
        stopScreenShare(pc);
        if (onEndedCallback) onEndedCallback();
      };
    }

    return localScreenStream;
  } catch (err) {
    console.warn("Ekran paylaşımı başlatılamadı:", err);
    throw err;
  }
}

export function stopScreenShare(pc) {
  if (localScreenStream) {
    localScreenStream.getTracks().forEach(t => t.stop());
    localScreenStream = null;
  }
  if (pc && screenSender) {
    try { pc.removeTrack(screenSender); } catch (e) {}
    screenSender = null;
  }
  if (pc && screenAudioSender) {
    try { pc.removeTrack(screenAudioSender); } catch (e) {}
    screenAudioSender = null;
  }
}

/**
 * Kamerayı açar/kapatır
 */
export async function toggleCamera(pc) {
  if (localCamStream) {
    stopCamera(pc);
    return null;
  }
  try {
    localCamStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: VIDEO_FPS, max: VIDEO_FPS } },
      audio: false
    });
    const videoTrack = localCamStream.getVideoTracks()[0];
    if (pc && videoTrack) {
      camSender = pc.addTrack(videoTrack, localCamStream);
      preferHardwareH264(camSender, pc);
    }
    return localCamStream;
  } catch (e) {
    console.warn("Kamera açılamadı:", e);
    throw e;
  }
}

export function stopCamera(pc) {
  if (localCamStream) {
    localCamStream.getTracks().forEach(t => t.stop());
    localCamStream = null;
  }
  if (pc && camSender) {
    try { pc.removeTrack(camSender); } catch (e) {}
    camSender = null;
  }
}

/**
 * Ekran sender parametrelerini günceller:
 * - maxFramerate: 30
 * - degradationPreference: "maintain-framerate"
 * - Çözünürlük ölçekleme
 */
export async function applyScreenEncodingParameters(sender, track) {
  if (!sender) sender = screenSender;
  if (!track && localScreenStream) track = localScreenStream.getVideoTracks()[0];
  if (!sender || !track) return;

  const targetPreset = RESOLUTION_PRESETS[currentResolution] || RESOLUTION_PRESETS["720"];
  const st = track.getSettings ? track.getSettings() : {};
  const rawH = st.height || 720;
  const targetH = targetPreset.height || rawH;
  const scaleDown = (currentResolution !== "source" && rawH > targetH + 4)
    ? Math.max(1, Number((rawH / targetH).toFixed(3)))
    : 1;

  try {
    const p = sender.getParameters();
    if (!p.encodings || !p.encodings.length) p.encodings = [{}];
    p.encodings[0].maxFramerate = VIDEO_FPS;
    p.encodings[0].scaleResolutionDownBy = scaleDown;
    p.encodings[0].priority = "high";
    p.encodings[0].networkPriority = "high";
    p.degradationPreference = "maintain-framerate";
    await sender.setParameters(p);
  } catch (e) {
    try {
      const p = sender.getParameters();
      if (!p.encodings || !p.encodings.length) p.encodings = [{}];
      p.encodings[0].maxFramerate = VIDEO_FPS;
      p.encodings[0].scaleResolutionDownBy = scaleDown;
      p.degradationPreference = "maintain-framerate";
      await sender.setParameters(p);
    } catch (e2) {}
  }
}

/**
 * Anlık tek kare ekran görüntüsü yakalar (getDisplayMedia ile tek kare)
 */
export async function captureDisplayScreenshot() {
  const tempStream = await navigator.mediaDevices.getDisplayMedia({
    video: { cursor: "always" },
    audio: false
  });
  const track = tempStream.getVideoTracks()[0];
  const video = document.createElement("video");
  video.srcObject = tempStream;
  video.muted = true;
  await video.play();

  await new Promise(r => setTimeout(r, 180));

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  track.stop();
  return canvas.toDataURL("image/jpeg", 0.88);
}

/**
 * Sahnede çalan videodan anlık ekran karesi alır
 */
export function captureVideoFrame(videoEl) {
  if (!videoEl || !videoEl.videoWidth) return null;
  const canvas = document.createElement("canvas");
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  canvas.getContext("2d").drawImage(videoEl, 0, 0);
  return canvas.toDataURL("image/png");
}
