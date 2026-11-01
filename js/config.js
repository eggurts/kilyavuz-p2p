/**
 * KILYAVUZ P2P - Global Yapılandırma ve Sabitler
 * 2 Kişilik (1-e-1) Doğrudan WebRTC Bağlantısı
 */

export const RTC_CONFIG = {
  bundlePolicy: "max-bundle",
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" }
  ]
};

export const VIDEO_FPS = 30; // Kullanıcı isteği doğrultusunda sabit 30 FPS

export const RESOLUTION_PRESETS = {
  source: { label: "Orijinal (Ekran Doğal)", height: null },
  "1080": { label: "1080p (Full HD)", height: 1080 },
  "720":  { label: "720p (HD - Önerilen)", height: 720 },
  "540":  { label: "540p (Düşük İnternet)", height: 540 }
};

export const AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1
};
