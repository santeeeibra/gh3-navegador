// Claude 2026-10-14: init script de prueba (NO se publica) para grabar el video de la portada desde la página real:
// imagen de #r5Canvas + sonido del juego (copia de lo que va a los parlantes). Arranca cuando el reloj de la canción
// pasa CLIP_FROM ms y graba CLIP_MS; entrega el archivo con window.__saveClip(base64, tipo) (expuesto por re-run.mjs).
(() => {
  const FROM = Number(localStorage.getItem('clipFrom') || 30000), LEN = Number(localStorage.getItem('clipMs') || 15000);
  const oc = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dst, ...a) {
    if (dst instanceof AudioDestinationNode) { const c = this.context; c.__rec ||= c.createMediaStreamDestination(); oc.call(this, c.__rec); }
    return oc.call(this, dst, ...a);
  };
  let started = false;
  const iv = setInterval(() => {
    const clk = window.gh3Song?.clock?.() || 0, cv = document.getElementById('r5Canvas');
    if (started || clk < FROM || !cv || !window.r6ctx?.__rec) return;
    started = true; clearInterval(iv);
    const st = cv.captureStream(60); for (const t of window.r6ctx.__rec.stream.getAudioTracks()) st.addTrack(t);
    const types = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus'];
    const type = types.find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(st, { mimeType: type, videoBitsPerSecond: 6e6, audioBitsPerSecond: 160000 }), parts = [];
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    rec.onstop = async () => {
      const b = new Blob(parts, { type }), u8 = new Uint8Array(await b.arrayBuffer());
      let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768));
      window.__saveClip?.(btoa(s), type);
    };
    rec.start(1000); setTimeout(() => rec.stop(), LEN);
    console.log('clip: grabando', type, 'desde', clk);
  }, 50);
})();
