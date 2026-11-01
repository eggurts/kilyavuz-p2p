/**
 * KILYAVUZ P2P - Ana Uygulama Koordinatörü (2 Kişilik Modüler Sürüm)
 */

import { initMicrophone, toggleMic, isMicActive, setSpeakingCallback, setRemoteMicVolume, setRemoteScreenVolume, cleanupAudio, getMicStream } from "./audio.js";
import { startScreenShare, stopScreenShare, toggleCamera, stopCamera, setResolution, getCurrentResolution, applyScreenEncodingParameters, captureDisplayScreenshot, captureVideoFrame } from "./media.js";
import { createPeerConnection, getPeerConnection, closePeerConnection, handleRemoteDescription, addRemoteIceCandidate, sendDataPacket, sendScreenshotDataUrl, setIsPolite } from "./webrtc.js";
import { connectQuickRoom, sendQuickSignal, disconnectQuickRoom, generateRandomRoomCode, getActiveRoomCode, encodeManualHash, decodeManualHash } from "./signaling.js";
import { showToast, setConnectionStatus, updateSpeakingIndicator, setRemoteNickname, registerStream, unregisterStream, selectStream, showImageOnStage, resetStageToEmpty, appendChatMessage, appendImageMessage, toggleFullscreen } from "./ui.js";

let manualCandidates = [];

window.addEventListener("DOMContentLoaded", async () => {
  initApp();
});

async function initApp() {
  // 1. Mikrofonu hazırla (C++ AEC3 yankı engelleme garantili)
  try {
    await initMicrophone();
    setSpeakingCallback((isSpeaking) => updateSpeakingIndicator(true, isSpeaking));
  } catch (err) {
    showToast("⚠️ Mikrofon izni alınamadı (baslat.bat ile açtığından emin ol).");
  }

  // 2. Takma adı ve ayarları yükle
  const savedNick = localStorage.getItem("kilyavuzNickname") || "Oyuncu";
  const nickInput = document.getElementById("nicknameInput");
  if (nickInput) {
    nickInput.value = savedNick;
    nickInput.addEventListener("change", (e) => {
      localStorage.setItem("kilyavuzNickname", e.target.value.trim());
      sendDataPacket({ type: "nickname", name: e.target.value.trim() });
    });
  }

  const qRes = document.getElementById("qRes");
  if (qRes) {
    qRes.value = getCurrentResolution();
    qRes.addEventListener("change", async (e) => {
      setResolution(e.target.value);
      await applyScreenEncodingParameters();
      showToast(`⚙️ Çözünürlük: ${e.target.value === "source" ? "Orijinal" : e.target.value + "p"} (Sabit 30 FPS • H.264)`);
    });
  }

  // 3. Buton ve Olay Dinleyicilerini Bağla
  bindEvents();
}

function bindEvents() {
  // Sekmeler (Manuel Hash / Tek Oda Kodu)
  document.getElementById("tabManualBtn")?.addEventListener("click", () => switchTab("manual"));
  document.getElementById("tabQuickBtn")?.addEventListener("click", () => switchTab("quick"));

  // Tek Oda Kodu (Quick Room)
  const roomInput = document.getElementById("quickRoomHash");
  if (roomInput && !roomInput.value) {
    roomInput.value = generateRandomRoomCode();
  }
  document.getElementById("btnQuickConnect")?.addEventListener("click", startQuickRoom);
  document.getElementById("btnGenRoom")?.addEventListener("click", () => {
    if (roomInput) roomInput.value = generateRandomRoomCode();
  });
  document.getElementById("btnCopyRoom")?.addEventListener("click", () => {
    if (roomInput && roomInput.value) {
      navigator.clipboard.writeText(roomInput.value);
      showToast("📋 Oda kodu kopyalandı!");
    }
  });

  // Manuel Hash
  document.getElementById("btnCreateOffer")?.addEventListener("click", createOfferHash);
  document.getElementById("btnProcessHash")?.addEventListener("click", processRemoteHash);

  // Mikrofon
  document.getElementById("btnToggleMic")?.addEventListener("click", () => {
    const active = toggleMic();
    const btn = document.getElementById("btnToggleMic");
    const sub = document.getElementById("localMicStatus");
    if (btn) btn.textContent = active ? "🎤 Mikrofon Açık" : "🔇 Mikrofon Kapalı";
    if (sub) sub.textContent = active ? "Ses açık • Yankı Engelleme Aktif" : "Sessize alındı";
  });

  // Uzak Ses Seviyeleri (1-e-1)
  document.getElementById("remoteVolume")?.addEventListener("input", (e) => setRemoteMicVolume(e.target.value));
  document.getElementById("remoteScreenVolume")?.addEventListener("input", (e) => setRemoteScreenVolume(e.target.value));

  // Canlı Ekran Paylaşımı
  document.getElementById("btnShareScreen")?.addEventListener("click", toggleScreen);

  // Kamera
  document.getElementById("btnToggleCam")?.addEventListener("click", toggleCam);

  // Kalite Paneli
  document.getElementById("btnQuality")?.addEventListener("click", () => {
    document.getElementById("qualityPanel")?.classList.toggle("open");
  });
  document.addEventListener("click", (e) => {
    const panel = document.getElementById("qualityPanel");
    if (panel?.classList.contains("open") && !panel.contains(e.target) && !e.target.closest("#btnQuality")) {
      panel.classList.remove("open");
    }
  });

  // Ekran Görüntüsü (SS) & Resim
  document.getElementById("btnCaptureSS")?.addEventListener("click", captureAndShareScreenshot);
  document.getElementById("fileImageInput")?.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) handleImageFile(e.target.files[0]);
  });
  window.addEventListener("paste", (e) => {
    const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        handleImageFile(items[i].getAsFile());
        break;
      }
    }
  });

  // Tam Ekran
  document.getElementById("btnFullscreen")?.addEventListener("click", toggleFullscreen);
  document.getElementById("mainImage")?.addEventListener("click", toggleFullscreen);

  // Sohbet
  document.getElementById("btnSendChat")?.addEventListener("click", sendChat);
  document.getElementById("chatInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChat();
  });

  // Bağlantıyı Sıfırla
  document.getElementById("btnResetConn")?.addEventListener("click", resetAll);
}

function switchTab(tab) {
  const manualSec = document.getElementById("manualConnSection");
  const quickSec = document.getElementById("quickConnSection");
  const tabManual = document.getElementById("tabManualBtn");
  const tabQuick = document.getElementById("tabQuickBtn");

  if (tab === "manual") {
    if (manualSec) manualSec.style.display = "flex";
    if (quickSec) quickSec.style.display = "none";
    tabManual?.classList.add("active");
    tabQuick?.classList.remove("active");
  } else {
    if (manualSec) manualSec.style.display = "none";
    if (quickSec) quickSec.style.display = "flex";
    tabQuick?.classList.add("active");
    tabManual?.classList.remove("active");
  }
}

/**
 * 2 Kişilik Hızlı Oda Akışı (Strictly 2 People)
 */
function startQuickRoom() {
  const roomInput = document.getElementById("quickRoomHash");
  const roomCode = roomInput?.value.trim() || generateRandomRoomCode();
  const hint = document.getElementById("quickStatusHint");
  if (hint) hint.textContent = "Odaya bağlanılıyor...";

  connectQuickRoom(roomCode, {
    onConnected: (code) => {
      showToast(`🚀 ${code} odasına girildi. Arkadaşın bekleniyor...`);
      if (hint) hint.textContent = `Oda: ${code} · İkinci kişi bekleniyor (Maksimum 2 kişi)...`;
    },
    onPartnerFound: async (partnerId, isPolite) => {
      setIsPolite(isPolite);
      setupPeer();
      const myNick = document.getElementById("nicknameInput")?.value || "Sen";

      if (!isPolite) {
        // Teklif gönderen taraf
        const pc = getPeerConnection();
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendQuickSignal({ kind: "offer", sdp: pc.localDescription });
      }
      setTimeout(() => sendDataPacket({ type: "nickname", name: myNick }), 500);
    },
    onOffer: async (sdp) => {
      const answer = await handleRemoteDescription(sdp);
      if (answer) {
        sendQuickSignal({ kind: "answer", sdp: answer });
      }
    },
    onAnswer: async (sdp) => {
      await handleRemoteDescription(sdp);
    },
    onCandidate: async (candidate) => {
      await addRemoteIceCandidate(candidate);
    },
    onRoomFull: () => {
      showToast("⛔ Bu oda dolu! Odada zaten 2 kişi var. Farklı bir oda kodu deneyin.", 5000);
      resetAll();
    },
    onPartnerLeft: () => {
      showToast("Arkadaşın odadan ayrıldı.");
      setConnectionStatus(false, "Arkadaşın Ayrıldı");
    }
  });
}

function setupPeer() {
  const pc = createPeerConnection({
    onIceCandidate: (cand) => {
      sendQuickSignal({ kind: "candidate", candidate: cand });
    },
    onStateChange: (state) => {
      if (state === "connected") {
        setConnectionStatus(true);
        showToast("✅ Arkadaşınla doğrudan P2P bağlantı kuruldu!");
        const code = getActiveRoomCode();
        const note = document.getElementById("connectedRoomInfo");
        if (note && code) note.textContent = `Oda Kodu: ${code} (2 Kişilik)`;
      } else if (state === "disconnected" || state === "failed" || state === "closed") {
        setConnectionStatus(false);
      }
    },
    onStreamAdded: (key, stream, label) => {
      registerStream(key, stream, label);
      showToast(`📺 ${label} başladı.`);
    },
    onStreamRemoved: (key) => {
      unregisterStream(key);
    },
    onChatMessage: (sender, text) => {
      appendChatMessage(sender, text, false);
    },
    onScreenshotReceived: (sender, dataUrl) => {
      appendImageMessage(sender, dataUrl, false);
      showImageOnStage(dataUrl, `${sender} — Ekran Görüntüsü`);
      showToast(`📸 ${sender} bir ekran görüntüsü gönderdi!`);
    },
    onRemoteNickname: (name) => {
      setRemoteNickname(name);
    }
  });

  // Mevcut mikrofon izini bağlantıya ekle
  const mic = getMicStream();
  if (mic && pc) {
    const track = mic.getAudioTracks()[0];
    if (track) pc.addTrack(track, mic);
  }
}

/**
 * 2 Kişilik Manuel Hash İle Bağlanma (P2P1 / P2P2)
 */
async function createOfferHash() {
  setIsPolite(false);
  manualCandidates = [];
  setupPeer();
  const pc = getPeerConnection();

  pc.onicecandidate = (e) => {
    if (e.candidate) manualCandidates.push(e.candidate);
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // Adayların toplanması için kısa bekleme
  await new Promise(r => setTimeout(r, 600));

  const hash = encodeManualHash("P2P1", pc.localDescription, manualCandidates);
  const box = document.getElementById("localHashBox");
  if (box) {
    box.value = hash;
    box.select();
  }
  navigator.clipboard.writeText(hash);
  showToast("📋 Kod kopyalandı! Arkadaşına gönder.");
}

async function processRemoteHash() {
  const box = document.getElementById("remoteHashBox");
  const raw = box?.value.trim();
  if (!raw) return;

  try {
    const { prefix, sdp, candidates } = decodeManualHash(raw);
    const pc = getPeerConnection();

    if (prefix === "P2P1") {
      // 2. Kişi: Teklifi aldı, yanıt üretecek
      setIsPolite(true);
      manualCandidates = [];
      setupPeer();
      const peerPc = getPeerConnection();
      peerPc.onicecandidate = (e) => {
        if (e.candidate) manualCandidates.push(e.candidate);
      };

      await peerPc.setRemoteDescription(sdp);
      for (const c of candidates) await peerPc.addIceCandidate(new RTCIceCandidate(c));

      const ans = await peerPc.createAnswer();
      await peerPc.setLocalDescription(ans);
      await new Promise(r => setTimeout(r, 600));

      const ansHash = encodeManualHash("P2P2", peerPc.localDescription, manualCandidates);
      const locBox = document.getElementById("localHashBox");
      if (locBox) {
        locBox.value = ansHash;
        locBox.select();
      }
      navigator.clipboard.writeText(ansHash);
      showToast("📋 Yanıt kodu (P2P2) kopyalandı! Odayı kuran arkadaşına geri at.");
    } else if (prefix === "P2P2") {
      // 1. Kişi: Yanıtı işler ve bağlanır
      if (!pc) return;
      await pc.setRemoteDescription(sdp);
      for (const c of candidates) await pc.addIceCandidate(new RTCIceCandidate(c));
      showToast("🔗 Yanıt işlendi, bağlanılıyor...");
    }
  } catch (err) {
    showToast("❌ Kod okunamadı. Eksik kopyalamış olabilirsin.");
  }
}

/**
 * Ekran & Kamera Geçişleri
 */
async function toggleScreen() {
  const btn = document.getElementById("btnShareScreen");
  const pc = getPeerConnection();
  try {
    const stream = await startScreenShare(pc, () => {
      unregisterStream("local-screen");
      if (btn) btn.textContent = "🖥️ Canlı Ekran Aç";
    });
    registerStream("local-screen", stream, "Sen (Ekranın)");
    if (btn) btn.textContent = "🛑 Ekranı Durdur";
    showToast("🖥️ Canlı ekran yayını başladı (Sabit 30 FPS • H.264).");
  } catch (err) {
    stopScreenShare(pc);
    unregisterStream("local-screen");
    if (btn) btn.textContent = "🖥️ Canlı Ekran Aç";
  }
}

async function toggleCam() {
  const btn = document.getElementById("btnToggleCam");
  const pc = getPeerConnection();
  try {
    const stream = await toggleCamera(pc);
    if (stream) {
      registerStream("local-cam", stream, "Sen (Kameran)");
      if (btn) btn.textContent = "📷 Kamera Kapat";
    } else {
      unregisterStream("local-cam");
      if (btn) btn.textContent = "📷 Kamera Aç";
    }
  } catch (e) {
    if (btn) btn.textContent = "📷 Kamera Aç";
  }
}

/**
 * Sohbet & Ekran Görüntüsü Gönderme
 */
function sendChat() {
  const input = document.getElementById("chatInput");
  const text = input?.value.trim();
  if (!text) return;
  input.value = "";

  const myNick = document.getElementById("nicknameInput")?.value || "Sen";
  appendChatMessage("Sen", text, true);
  sendDataPacket({ type: "chat", text, sender: myNick });
}

async function captureAndShareScreenshot() {
  try {
    const dataUrl = await captureDisplayScreenshot();
    shareImage(dataUrl);
  } catch (e) {
    console.warn("SS iptal edildi:", e);
  }
}

function handleImageFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => shareImage(e.target.result);
  reader.readAsDataURL(file);
}

function shareImage(dataUrl) {
  const myNick = document.getElementById("nicknameInput")?.value || "Sen";
  showImageOnStage(dataUrl, `${myNick} — Ekran Görüntüsü`);
  appendImageMessage("Sen", dataUrl, true);

  const sent = sendScreenshotDataUrl(dataUrl, myNick);
  if (sent) {
    showToast("📸 Ekran görüntüsü arkadaşına iletildi!");
  } else {
    showToast("📸 Ekran görüntüsü sahnede açıldı (Henüz bağlı değilsin).");
  }
}

function resetAll() {
  stopScreenShare(getPeerConnection());
  stopCamera(getPeerConnection());
  disconnectQuickRoom();
  closePeerConnection();
  resetStageToEmpty();
  setConnectionStatus(false);

  const localBox = document.getElementById("localHashBox");
  const remBox = document.getElementById("remoteHashBox");
  if (localBox) localBox.value = "";
  if (remBox) remBox.value = "";

  showToast("🔄 Bağlantı sıfırlandı.");
}
