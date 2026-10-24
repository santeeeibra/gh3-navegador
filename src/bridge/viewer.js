import {abrirSala, ICE} from './signal.js';
import {montarMando} from './pad.js';
const $ = id => document.getElementById(id);
const log = m => { $('log').textContent += m + '\n'; };
const id = crypto.randomUUID();
let pc, dc, sala;
const url = new URLSearchParams(location.search).get('sala');
if (url) $('sala').value = url;

function conectar() {
  const codigo = $('sala').value.trim().toUpperCase();
  if (!codigo) return log('Falta el código de sala');
  if (sala) sala.cerrar();
  sala = abrirSala(codigo, async m => {
    if (m.to !== id) return;
    if (m.t === 'offer') {
      pc = new RTCPeerConnection(ICE);
      pc.ontrack = ev => { $('v').srcObject = ev.streams[0]; log('llegó ' + ev.track.kind); };
      pc.ondatachannel = ev => {
        dc = ev.channel;
        dc.onmessage = e => { const d = JSON.parse(e.data); if (d.t === 'pong') $('rtt').textContent = (performance.now() - d.n).toFixed(0) + ' ms'; };
        setInterval(() => dc.readyState === 'open' && dc.send(JSON.stringify({t: 'ping', n: performance.now()})), 1000);
      };
      pc.onicecandidate = ev => ev.candidate && sala.enviar({t: 'ice-v', c: ev.candidate.toJSON(), from: id});
      pc.onconnectionstatechange = () => log('conexión: ' + pc.connectionState);
      await pc.setRemoteDescription(m.d);
      const a = await pc.createAnswer(); await pc.setLocalDescription(a);
      sala.enviar({t: 'answer', from: id, d: pc.localDescription.toJSON()});
    } else if (m.t === 'ice-h') pc && pc.addIceCandidate(m.c).catch(() => {});
  }, s => { log('sala: ' + s); if (s === 'SUBSCRIBED') sala.enviar({t: 'hello', id}); });
}
$('c').onclick = conectar;
if (url) conectar();
const enviarEstado = s => dc && dc.readyState === 'open' && dc.send(JSON.stringify({t: 'pad', ...s}));
montarMando($('pad'), enviarEstado);
