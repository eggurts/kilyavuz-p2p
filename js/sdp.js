/**
 * KILYAVUZ P2P - SDP & Kodek Tercihi Yönetimi
 * Kullanıcı isteği: KESİNLİKLE sadece H.264 öncelikli ve sabit yüksek bit hızı sınırları
 */

/**
 * Transceiver seviyesinde H.264 video kodeğini en başa kilitler
 */
export function preferHardwareH264(senderOrTransceiver, pc) {
  try {
    let tr = null;
    if (senderOrTransceiver && senderOrTransceiver.setCodecPreferences) {
      tr = senderOrTransceiver;
    } else if (pc && pc.getTransceivers) {
      tr = pc.getTransceivers().find(t => t.sender === senderOrTransceiver);
    }
    if (!tr || !tr.setCodecPreferences || !window.RTCRtpReceiver?.getCapabilities) return;

    const caps = RTCRtpReceiver.getCapabilities("video");
    if (!caps || !caps.codecs) return;

    // H.264 profillerini en öne al (Donanım hızlandırmalı 42e01f ve 42001f başta)
    const sorted = [...caps.codecs].sort((a, b) => {
      const rank = c => {
        const mime = (c.mimeType || "").toLowerCase();
        if (mime === "video/h264") {
          const fmtp = (c.sdpFmtpLine || "").toLowerCase();
          if (fmtp.includes("profile-level-id=42e0")) return 0; // Constrained Baseline (NVENC/Intel/AMD %100)
          if (fmtp.includes("profile-level-id=4200")) return 1; // Baseline
          if (fmtp.includes("profile-level-id=4d00")) return 2; // Main Profile
          if (fmtp.includes("profile-level-id=6400")) return 3; // High Profile
          return 4;
        }
        if (mime === "video/rtx") return 5;
        if (mime === "video/vp8") return 100; // VP8 kesinlikle geride
        if (mime === "video/vp9") return 110;
        if (mime === "video/av1") return 120;
        return 200;
      };
      return rank(a) - rank(b);
    });

    tr.setCodecPreferences(sorted);
  } catch (err) {
    console.warn("H.264 kodek tercihi uygulanamadı:", err);
  }
}

/**
 * SDP açıklaması üzerinde H.264 yük tiplerini (PT) ilk sıraya dizer
 * ve yüksek kaliteli P2P video bit hızı aralığını belirler
 */
export function boostSdp(desc) {
  try {
    const lines = desc.sdp.split("\r\n");
    let inVideo = false;
    const videoPts = [];
    const h264Pts = [];
    const otherPts = [];
    const rtxFor = {};

    lines.forEach(l => {
      if (l.startsWith("m=")) inVideo = l.startsWith("m=video");
      const m = inVideo && l.match(/^a=rtpmap:(\d+) (VP8|VP9|H264|AV1)\//i);
      if (m) {
        const pt = m[1];
        videoPts.push(pt);
        const name = m[2].toUpperCase();
        if (name === "H264") h264Pts.push(pt);
        else otherPts.push(pt);
      }
      const rtxM = inVideo && l.match(/^a=fmtp:(\d+) apt=(\d+)/i);
      if (rtxM) rtxFor[rtxM[2]] = rtxM[1];
    });

    const appendWithRtx = list => {
      const res = [];
      list.forEach(pt => {
        res.push(pt);
        if (rtxFor[pt]) res.push(rtxFor[pt]);
      });
      return res;
    };

    const params = "x-google-min-bitrate=1500;x-google-start-bitrate=3500;x-google-max-bitrate=25000";
    const preferred = appendWithRtx([...h264Pts, ...otherPts]);

    const out = [];
    for (const l of lines) {
      if (l.startsWith("m=video ")) {
        const parts = l.split(" ");
        const header = parts.slice(0, 3);
        const pts = parts.slice(3);
        const remaining = pts.filter(pt => !preferred.includes(pt));
        const reordered = [...preferred.filter(pt => pts.includes(pt)), ...remaining];
        if (reordered.length) {
          out.push([...header, ...reordered].join(" "));
          continue;
        }
      }

      const f = l.match(/^a=fmtp:(\d+) (.*)$/);
      if (f && videoPts.includes(f[1])) {
        const cleaned = f[2]
          .replace(/;?\s*x-google-(?:min|start|max)-bitrate=\d+/gi, "")
          .replace(/^;+|;+$/g, "")
          .trim();
        out.push(cleaned ? `a=fmtp:${f[1]} ${cleaned};${params}` : `a=fmtp:${f[1]} ${params}`);
        continue;
      }
      out.push(l);
      const r = l.match(/^a=rtpmap:(\d+) /);
      if (r && videoPts.includes(r[1]) && !lines.some(x => x.startsWith(`a=fmtp:${r[1]} `))) {
        out.push(`a=fmtp:${r[1]} ${params}`);
      }
    }
    return new RTCSessionDescription({ type: desc.type, sdp: out.join("\r\n") });
  } catch (e) {
    return new RTCSessionDescription(desc);
  }
}
