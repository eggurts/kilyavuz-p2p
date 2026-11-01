/**
 * KILYAVUZ P2P - Sinyalleşme Modülü
 * Kullanıcı kuralı: KESİNLİKLE sadece 2 kişi (1-e-1) girebilir, 3-4-5 kişi ALINMAZ!
 */

let quickWs = null;
let currentRoomCode = null;
let myClientId = null;
let activePartnerId = null;

export function getActiveRoomCode() {
  return currentRoomCode;
}

export function generateRandomRoomCode() {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `KILYAVUZ-${num}`;
}

/**
 * 2 Kişilik Hızlı Oda Sinyalleşmesi (ntfy.sh WebSocket)
 */
export function connectQuickRoom(roomCode, callbacks = {}) {
  disconnectQuickRoom();

  currentRoomCode = roomCode.trim().toUpperCase();
  myClientId = "u_" + Math.random().toString(36).substring(2, 9);
  activePartnerId = null;

  const topic = "kilyavuz_p2p_" + currentRoomCode.toLowerCase().replace(/[^a-z0-9]/g, "");
  const wsUrl = `wss://ntfy.sh/${topic}/ws`;

  quickWs = new WebSocket(wsUrl);

  quickWs.onopen = () => {
    if (callbacks.onConnected) callbacks.onConnected(currentRoomCode);
    // Odaya giriş bildirimi
    sendSignalMessage(topic, { kind: "join", from: myClientId });
  };

  quickWs.onmessage = async (evt) => {
    try {
      const data = JSON.parse(evt.data);
      if (data.event !== "message" || !data.message) return;

      const payload = JSON.parse(data.message);
      if (!payload || payload.from === myClientId) return;

      // 1. ODA DOLU KONTROLÜ (Maksimum 2 kişi!)
      if (payload.kind === "room-full" && payload.to === myClientId) {
        if (callbacks.onRoomFull) callbacks.onRoomFull();
        disconnectQuickRoom();
        return;
      }

      if (payload.kind === "join") {
        // Eğer zaten bir arkadaşımızla görüşmedeysek, 3. kişiyi reddet
        if (activePartnerId && activePartnerId !== payload.from) {
          sendSignalMessage(topic, { kind: "room-full", from: myClientId, to: payload.from });
          return;
        }

        activePartnerId = payload.from;
        // Sözleşmeli rol belirleme (Alfabetik sıra ile Glare önleme)
        const isPolite = myClientId > payload.from;
        if (callbacks.onPartnerFound) {
          callbacks.onPartnerFound(activePartnerId, isPolite);
        }
        return;
      }

      // Sadece bizimle eşleşen partnerin mesajlarını dinle
      if (payload.to && payload.to !== myClientId) return;
      if (activePartnerId && payload.from !== activePartnerId) return;

      if (!activePartnerId && payload.from) {
        activePartnerId = payload.from;
        const isPolite = myClientId > payload.from;
        if (callbacks.onPartnerFound) {
          callbacks.onPartnerFound(activePartnerId, isPolite);
        }
      }

      if (payload.kind === "offer") {
        if (callbacks.onOffer) callbacks.onOffer(payload.sdp, payload.from);
      } else if (payload.kind === "answer") {
        if (callbacks.onAnswer) callbacks.onAnswer(payload.sdp, payload.from);
      } else if (payload.kind === "candidate") {
        if (callbacks.onCandidate) callbacks.onCandidate(payload.candidate);
      } else if (payload.kind === "leave") {
        if (payload.from === activePartnerId) {
          activePartnerId = null;
          if (callbacks.onPartnerLeft) callbacks.onPartnerLeft();
        }
      }
    } catch (err) {
      // JSON dışı bildirimler göz ardı edilir
    }
  };

  quickWs.onerror = (err) => {
    console.warn("Sinyal bağlantı hatası:", err);
  };

  quickWs.onclose = () => {
    if (callbacks.onDisconnected) callbacks.onDisconnected();
  };

  return quickWs;
}

export function sendQuickSignal(msg) {
  if (!quickWs || quickWs.readyState !== WebSocket.OPEN || !currentRoomCode) return false;
  const topic = "kilyavuz_p2p_" + currentRoomCode.toLowerCase().replace(/[^a-z0-9]/g, "");
  msg.from = myClientId;
  if (!msg.to && activePartnerId) msg.to = activePartnerId;
  return sendSignalMessage(topic, msg);
}

function sendSignalMessage(topic, obj) {
  try {
    fetch(`https://ntfy.sh/${topic}`, {
      method: "POST",
      body: JSON.stringify(obj),
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    }).catch(() => {});
    return true;
  } catch (e) {
    return false;
  }
}

export function disconnectQuickRoom() {
  if (quickWs) {
    if (quickWs.readyState === WebSocket.OPEN && currentRoomCode) {
      const topic = "kilyavuz_p2p_" + currentRoomCode.toLowerCase().replace(/[^a-z0-9]/g, "");
      sendSignalMessage(topic, { kind: "leave", from: myClientId });
    }
    try { quickWs.close(); } catch (e) {}
    quickWs = null;
  }
  currentRoomCode = null;
  activePartnerId = null;
}

/**
 * 2 Kişilik Manuel Hash (P2P1 / P2P2) Kodlama ve Çözme
 */
export function encodeManualHash(prefix, sdp, candidates = []) {
  const json = JSON.stringify({ sdp, c: candidates });
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return `${prefix}:${b64}`;
}

export function decodeManualHash(hashStr) {
  const trimmed = hashStr.trim();
  const parts = trimmed.split(":");
  if (parts.length < 2) throw new Error("Geçersiz hash formatı!");
  const prefix = parts[0];
  const b64 = parts.slice(1).join(":");
  const json = decodeURIComponent(escape(atob(b64)));
  const data = JSON.parse(json);
  return { prefix, sdp: data.sdp, candidates: data.c || [] };
}
