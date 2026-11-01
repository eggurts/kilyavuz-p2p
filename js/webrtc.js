/**
 * KILYAVUZ P2P - 1-e-1 WebRTC Bağlantı ve Veri Kanalı Motoru
 */

import { RTC_CONFIG } from "./config.js";
import { boostSdp, preferHardwareH264 } from "./sdp.js";
import { attachRemoteAudio } from "./audio.js";

let pc = null;
let dataChannel = null;
let isPolite = true;
let makingOffer = false;
let ignoreOffer = false;

// Parçalı ekran görüntüsü alım arabelleği
const chunkBuffers = {};

export function getPeerConnection() {
  return pc;
}

export function getDataChannel() {
  return dataChannel;
}

export function setIsPolite(polite) {
  isPolite = polite;
}

/**
 * 1-e-1 WebRTC bağlantısını sıfırdan kurar
 */
export function createPeerConnection(callbacks = {}) {
  closePeerConnection();

  pc = new RTCPeerConnection(RTC_CONFIG);

  // Veri kanalı (Sohbet ve Ekran Görüntüleri için)
  if (!isPolite) {
    setupDataChannel(pc.createDataChannel("kilyavuz-data", { ordered: true }), callbacks);
  } else {
    pc.ondatachannel = (e) => setupDataChannel(e.channel, callbacks);
  }

  // Medya izi (Track) yakalama
  pc.ontrack = (evt) => {
    const track = evt.track;
    const stream = evt.streams[0] || new MediaStream([track]);

    if (track.kind === "audio") {
      // Mikrofon mu ekran sesi mi? (İlk gelen ses mikrofondur)
      const isScreenAudio = evt.transceiver?.mid === "screen-audio" || stream.id.includes("screen");
      attachRemoteAudio(stream, isScreenAudio ? "screen" : "mic");
      if (callbacks.onAudioTrack) callbacks.onAudioTrack(track, isScreenAudio);
    } else if (track.kind === "video") {
      // Transceiver seviyesinde donanım H.264
      if (evt.transceiver) preferHardwareH264(evt.transceiver, pc);

      const isCam = track.label.toLowerCase().includes("cam") || stream.id.includes("cam");
      const key = isCam ? "remote-cam" : "remote-screen";
      const label = isCam ? "Arkadaşın (Kamera)" : "Arkadaşın (Canlı Ekran)";

      track.onended = () => {
        if (callbacks.onStreamRemoved) callbacks.onStreamRemoved(key);
      };

      if (callbacks.onStreamAdded) callbacks.onStreamAdded(key, stream, label);
    }
  };

  // ICE adayları
  pc.onicecandidate = (evt) => {
    if (evt.candidate && callbacks.onIceCandidate) {
      callbacks.onIceCandidate(evt.candidate);
    }
  };

  // Bağlantı durumu
  pc.onconnectionstatechange = () => {
    if (callbacks.onStateChange) {
      callbacks.onStateChange(pc.connectionState);
    }
  };

  // Mükemmel El Sıkışma (Perfect Negotiation)
  pc.onnegotiationneeded = async () => {
    try {
      makingOffer = true;
      const offer = await pc.createOffer();
      if (pc.signalingState !== "stable") return;
      await pc.setLocalDescription(offer);

      if (callbacks.onNegotiationOffer) {
        callbacks.onNegotiationOffer(pc.localDescription);
      }
    } catch (err) {
      console.warn("Negotiation hatası:", err);
    } finally {
      makingOffer = false;
    }
  };

  return pc;
}

function setupDataChannel(dc, callbacks) {
  dataChannel = dc;
  dataChannel.binaryType = "arraybuffer";

  dataChannel.onopen = () => {
    if (callbacks.onDataChannelOpen) callbacks.onDataChannelOpen();
  };

  dataChannel.onclose = () => {
    if (callbacks.onDataChannelClose) callbacks.onDataChannelClose();
  };

  dataChannel.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      handleDataMessage(msg, callbacks);
    } catch (err) {
      console.warn("Veri okuma hatası:", err);
    }
  };
}

function handleDataMessage(msg, callbacks) {
  if (msg.type === "chat") {
    if (callbacks.onChatMessage) callbacks.onChatMessage(msg.sender || "Arkadaşın", msg.text);
  } else if (msg.type === "nickname") {
    if (callbacks.onRemoteNickname) callbacks.onRemoteNickname(msg.name);
  } else if (msg.type === "ss-start") {
    chunkBuffers[msg.id] = { chunks: new Array(msg.total), sender: msg.sender, received: 0 };
  } else if (msg.type === "ss-chunk") {
    const buf = chunkBuffers[msg.id];
    if (buf) {
      buf.chunks[msg.index] = msg.data;
      buf.received++;
    }
  } else if (msg.type === "ss-end") {
    const buf = chunkBuffers[msg.id];
    if (buf && buf.chunks.every(Boolean)) {
      const dataUrl = buf.chunks.join("");
      delete chunkBuffers[msg.id];
      if (callbacks.onScreenshotReceived) callbacks.onScreenshotReceived(buf.sender || "Arkadaşın", dataUrl);
    }
  }
}

/**
 * Veri paketi gönder (Sohbet / SS / Bilgi)
 */
export function sendDataPacket(obj) {
  if (dataChannel && dataChannel.readyState === "open") {
    dataChannel.send(JSON.stringify(obj));
    return true;
  }
  return false;
}

/**
 * Ekran görüntüsünü 16 KB parçalar halinde gönderir
 */
export function sendScreenshotDataUrl(dataUrl, senderName) {
  if (!dataChannel || dataChannel.readyState !== "open") return false;

  const chunkSize = 16000;
  const total = Math.ceil(dataUrl.length / chunkSize);
  const id = "ss_" + Date.now();

  sendDataPacket({ type: "ss-start", id, total, sender: senderName });
  for (let i = 0; i < total; i++) {
    const chunk = dataUrl.slice(i * chunkSize, (i + 1) * chunkSize);
    sendDataPacket({ type: "ss-chunk", id, index: i, data: chunk });
  }
  sendDataPacket({ type: "ss-end", id });
  return true;
}

/**
 * Gelen uzaktan SDP teklif/yanıtını H.264 prioritizasyonuyla işler
 */
export async function handleRemoteDescription(desc) {
  if (!pc) return;
  const isOffer = desc.type === "offer";
  const readyForOffer = !makingOffer && (pc.signalingState === "stable" || isPolite);
  const offerCollision = isOffer && !readyForOffer;

  ignoreOffer = !isPolite && offerCollision;
  if (ignoreOffer) return;

  const boosted = boostSdp(desc);
  await pc.setRemoteDescription(boosted);

  if (isOffer) {
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return pc.localDescription;
  }
  return null;
}

export async function addRemoteIceCandidate(candidate) {
  if (!pc) return;
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    if (!ignoreOffer) console.warn("ICE adayı eklenemedi:", err);
  }
}

export function closePeerConnection() {
  if (dataChannel) {
    try { dataChannel.close(); } catch (e) {}
    dataChannel = null;
  }
  if (pc) {
    try { pc.close(); } catch (e) {}
    pc = null;
  }
  makingOffer = false;
  ignoreOffer = false;
}
