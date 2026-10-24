// Señalización por Supabase Realtime (broadcast). Solo viaja el "saludo" de WebRTC; la imagen va directa entre navegadores.
import {createClient} from '@supabase/supabase-js';
import {SUPABASE_URL, SUPABASE_ANON_KEY} from '../config.js';

export const ICE = {iceServers: [{urls: 'stun:stun.l.google.com:19302'}]};

export function abrirSala(codigo, onMsg, onEstado) {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {realtime: {params: {eventsPerSecond: 20}}});
  const ch = sb.channel('gh3-bridge-v1-' + codigo, {config: {broadcast: {self: false}}});
  ch.on('broadcast', {event: 'sig'}, ({payload}) => onMsg(payload));
  ch.subscribe(s => onEstado && onEstado(s));
  return {
    enviar: p => ch.send({type: 'broadcast', event: 'sig', payload: p}),
    cerrar: () => sb.removeChannel(ch),
  };
}

export function codigoNuevo() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(r, x => a[x % a.length]).join('');
}
