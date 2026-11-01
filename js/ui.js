/**
 * KILYAVUZ P2P - Kullanıcı Arayüzü (UI) Yönetim Modülü (1-e-1)
 */

const registeredStreams = new Map();
let activeStreamKey = null;
let toastTimeout = null;

export function showToast(message, duration = 3200) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, duration);
}

export function setConnectionStatus(connected, text) {
  const statusPill = document.getElementById("connectionStatus");
  const statusText = document.getElementById("statusText");
  const workspace = document.getElementById("workspace");
  const remoteAvatar = document.getElementById("remoteAvatar");
  const remotePeerSub = document.getElementById("remotePeerSub");

  if (connected) {
    statusPill?.classList.add("connected");
    if (statusText) statusText.textContent = text || "Arkadaşınla Bağlısın (1-e-1)";
    workspace?.classList.add("connected-layout");
    if (remoteAvatar) remoteAvatar.style.borderColor = "var(--success)";
    if (remotePeerSub) remotePeerSub.textContent = "Bağlandı • H.264 / 30 FPS";
  } else {
    statusPill?.classList.remove("connected");
    if (statusText) statusText.textContent = text || "Bağlantı Bekleniyor";
    workspace?.classList.remove("connected-layout");
    if (remoteAvatar) remoteAvatar.style.borderColor = "transparent";
    if (remotePeerSub) remotePeerSub.textContent = "Henüz bağlanmadı";
  }
}

export function updateSpeakingIndicator(isSelf, isSpeaking) {
  const avatar = document.getElementById(isSelf ? "localAvatar" : "remoteAvatar");
  if (avatar) {
    avatar.classList.toggle("speaking", !!isSpeaking);
  }
}

export function setRemoteNickname(name) {
  const label = document.getElementById("remoteNameLabel");
  const avatar = document.getElementById("remoteAvatar");
  if (label) label.textContent = name;
  if (avatar) avatar.textContent = (name[0] || "?").toUpperCase();
}

/**
 * Sahne ve Yayın Seçici Yönetimi
 */
export function registerStream(key, stream, label) {
  registeredStreams.set(key, { stream, label });
  renderStreamStrip();

  // İlk gelen veya uzak ekran yayını otomatik olarak sahnede açılsın
  if (!activeStreamKey || key === "remote-screen") {
    selectStream(key);
  }
}

export function unregisterStream(key) {
  registeredStreams.delete(key);
  if (activeStreamKey === key) {
    activeStreamKey = null;
    const remainingKeys = [...registeredStreams.keys()];
    if (remainingKeys.length > 0) {
      selectStream(remainingKeys[0]);
    } else {
      resetStageToEmpty();
    }
  }
  renderStreamStrip();
}

export function selectStream(key) {
  const record = registeredStreams.get(key);
  if (!record) return;

  activeStreamKey = key;
  renderStreamStrip();

  const video = document.getElementById("mainVideo");
  const img = document.getElementById("mainImage");
  const empty = document.getElementById("stageEmpty");
  const paused = document.getElementById("localPreviewPaused");
  const tag = document.getElementById("streamTag");
  const snapBtn = document.getElementById("btnSnapshot");
  const prevBtn = document.getElementById("btnTogglePreview");
  const title = document.getElementById("streamTitle");

  if (img) img.style.display = "none";
  if (empty) empty.style.display = "none";
  if (paused) paused.style.display = "none";

  if (video) {
    video.srcObject = record.stream;
    video.style.display = "block";
    video.play().catch(() => {});
  }

  if (tag) tag.style.display = "inline-flex";
  if (title) title.textContent = record.label;
  if (snapBtn) snapBtn.style.display = "inline-flex";

  const isLocalScreen = key === "local-screen";
  if (prevBtn) prevBtn.style.display = isLocalScreen ? "inline-flex" : "none";
}

export function showImageOnStage(dataUrl, titleText) {
  activeStreamKey = null;
  renderStreamStrip();

  const video = document.getElementById("mainVideo");
  const img = document.getElementById("mainImage");
  const empty = document.getElementById("stageEmpty");
  const paused = document.getElementById("localPreviewPaused");
  const tag = document.getElementById("streamTag");
  const snapBtn = document.getElementById("btnSnapshot");
  const prevBtn = document.getElementById("btnTogglePreview");
  const title = document.getElementById("streamTitle");

  if (video) {
    try { video.pause(); } catch (e) {}
    video.srcObject = null;
    video.style.display = "none";
  }
  if (paused) paused.style.display = "none";
  if (empty) empty.style.display = "none";
  if (snapBtn) snapBtn.style.display = "none";
  if (prevBtn) prevBtn.style.display = "none";

  if (img) {
    img.src = dataUrl;
    img.style.display = "block";
  }

  if (tag) tag.style.display = "inline-flex";
  if (title) title.textContent = titleText;
}

export function resetStageToEmpty() {
  activeStreamKey = null;
  const video = document.getElementById("mainVideo");
  const img = document.getElementById("mainImage");
  const empty = document.getElementById("stageEmpty");
  const paused = document.getElementById("localPreviewPaused");
  const tag = document.getElementById("streamTag");
  const snapBtn = document.getElementById("btnSnapshot");
  const prevBtn = document.getElementById("btnTogglePreview");

  if (video) {
    video.pause();
    video.srcObject = null;
    video.style.display = "none";
  }
  if (img) img.style.display = "none";
  if (paused) paused.style.display = "none";
  if (empty) empty.style.display = "flex";
  if (tag) tag.style.display = "none";
  if (snapBtn) snapBtn.style.display = "none";
  if (prevBtn) prevBtn.style.display = "none";

  renderStreamStrip();
}

function renderStreamStrip() {
  const strip = document.getElementById("streamStrip");
  if (!strip) return;

  const entries = [...registeredStreams.entries()];
  if (entries.length <= 1) {
    strip.style.display = "none";
    strip.innerHTML = "";
    return;
  }

  strip.style.display = "flex";
  strip.innerHTML = "";

  entries.forEach(([key, val]) => {
    const btn = document.createElement("button");
    btn.className = "stream-tile" + (activeStreamKey === key ? " active" : "");
    btn.innerHTML = `<span class="stream-tile-dot"></span><span class="stream-tile-label">${val.label}</span>`;
    btn.onclick = () => selectStream(key);
    strip.appendChild(btn);
  });
}

/**
 * Sohbet Mesajları
 */
export function appendChatMessage(sender, text, isSelf) {
  const box = document.getElementById("chatMessages");
  if (!box) return;

  const div = document.createElement("div");
  div.className = "msg " + (isSelf ? "self" : "peer");

  const meta = document.createElement("div");
  meta.className = "msg-meta";
  meta.textContent = sender;

  const body = document.createElement("div");
  body.textContent = text;

  div.appendChild(meta);
  div.appendChild(body);
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

export function appendImageMessage(sender, dataUrl, isSelf) {
  const box = document.getElementById("chatMessages");
  if (!box) return;

  const div = document.createElement("div");
  div.className = "msg " + (isSelf ? "self" : "peer");

  const meta = document.createElement("div");
  meta.className = "msg-meta";
  meta.textContent = `${sender} (Büyütmek için tıkla)`;

  const img = document.createElement("img");
  img.src = dataUrl;
  img.onclick = () => showImageOnStage(dataUrl, `${sender} — Ekran Görüntüsü`);

  div.appendChild(meta);
  div.appendChild(img);
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

export function toggleFullscreen() {
  const stage = document.getElementById("stageContainer");
  if (!stage) return;
  if (!document.fullscreenElement) {
    stage.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}
