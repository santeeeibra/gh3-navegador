import {abrirSala, codigoNuevo, ICE} from './signal.js';
const $ = id => document.getElementById(id);
const log = m => { $('log').textContent += m + '\n'; };
const codigo = codigoNuevo();
$('codigo').textContent = codigo;
$('link').textContent = location.origin + '/puente/viewer.html?sala=' + codigo;
let stream, pc, viewerId, dc;
const AYUDANTE = 'http://127.0.0.1:5182';
let ayudanteOk = null;
let ultimoPad = null;
setInterval(() => { if (ultimoPad && (ultimoPad.btn || ultimoPad.lt || ultimoPad.rt || ultimoPad.lx || ultimoPad.ly || ultimoPad.rx || ultimoPad.ry)) enviarAlAyudante(ultimoPad); }, 1000);
function enviarAlAyudante(s) {
  ultimoPad = s;
  const q = new URLSearchParams({b: s.btn, lt: s.lt, rt: s.rt, lx: s.lx, ly: s.ly, rx: s.rx, ry: s.ry});
  fetch(AYUDANTE + '/s?' + q, {mode: 'no-cors'})
    .then(() => { if (ayudanteOk !== true) { ayudanteOk = true; log('ayudante de mando: conectado'); } })
    .catch(() => { if (ayudanteOk !== false) { ayudanteOk = false; log('ayudante de mando: NO responde (ejecutá tools/bridge/pad-helper.cmd)'); } });
}

const sala = abrirSala(codigo, async m => {
  if (!stream) return;
  if (m.t === 'hello') {
    if (pc) pc.close();
    viewerId = m.id;
    pc = new RTCPeerConnection(ICE);
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    for (const s of pc.getSenders()) if (s.track && s.track.kind === 'video') {
      const p = s.getParameters(); p.degradationPreference = 'maintain-framerate'; s.setParameters(p).catch(() => {});
    }
    dc = pc.createDataChannel('input', {ordered: true});
    dc.onmessage = e => { const d = JSON.parse(e.data); if (d.t === 'ping') dc.send(JSON.stringify({t: 'pong', n: d.n})); else if (d.t === 'pad') enviarAlAyudante(d); };
    pc.onicecandidate = ev => ev.candidate && sala.enviar({t: 'ice-h', to: viewerId, c: ev.candidate.toJSON()});
    pc.onconnectionstatechange = () => { log('conexión: ' + pc.connectionState); if (['disconnected','failed','closed'].includes(pc.connectionState)) fetch(AYUDANTE + '/reset', {mode: 'no-cors'}).catch(() => {}); };
    const o = await pc.createOffer(); await pc.setLocalDescription(o);
    sala.enviar({t: 'offer', to: viewerId, d: pc.localDescription.toJSON()});
  } else if (m.from === viewerId && pc) {
    if (m.t === 'answer') await pc.setRemoteDescription(m.d);
    else if (m.t === 'ice-v') pc.addIceCandidate(m.c).catch(() => {});
  }
}, s => log('sala: ' + s));

$('b').onclick = async () => {
  stream = await navigator.mediaDevices.getDisplayMedia({video: {frameRate: 60}, audio: true});
  $('v').srcObject = stream;
  log('captura: video=' + stream.getVideoTracks().length + ' audio=' + stream.getAudioTracks().length);
  stream.getVideoTracks()[0].onended = () => log('se dejó de compartir');
};
