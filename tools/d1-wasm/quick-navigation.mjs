// Claude 2026-10-12: recorrido EXPLORATORIO de Partida rápida en los menús originales (perfil nuevo).
// Orden del menú principal supuesto: Carrera, Carrera cooperativa, Partida rápida (2 abajo). Sin confirmar: cada paso guarda captura.
// Después de elegir el tema aprieta A hasta que gh3-stage avise levelConfirmed (máx. 8 veces) y deja todo registrado.
import {FIRST_FOUR} from '../local-loader/songs.mjs';
export async function navigateQuick({song,tap,status,sleep,shot,stage,now=()=>Date.now(),clearSchedule=()=>{},onStep=()=>{},gap=4500,timeoutMs=360000}){
 const start=now();
 const check=()=>{const s=status();if(s.error)throw Error(s.error);if(s.song&&s.song!==song)throw Error(`El juego abrió ${s.song}, se esperaba ${song}.`);if(now()-start>timeoutMs)throw Error('No se llegó a la canción dentro del plazo.');return s;};
 const wait=async(ms)=>{check();await sleep(ms);check();};
 let n=0;const step=async(button,label)=>{onStep(label);check();await tap(button);await wait(gap);await shot(String(++n).padStart(2,'0')+'-'+label.replace(/[^\w]+/g,'_'));};
 while(!check().live)await wait(200);
 await clearSchedule();
 while(!check().menu){await tap('start');await wait(1500);}
 await wait(3000);await shot('00-menu');
 await step('down','Bajar 1');await step('down','Bajar 2');await step('a','Partida rápida');
 for(let i=0;i<FIRST_FOUR.indexOf(song);i++)await step('down','Elegir '+song);
 await step('a','Confirmar '+song);
 for(let k=0;k<8&&!stage().some(e=>e.stage==='levelConfirmed');k++)await step('a','Aceptar pantalla '+(k+1));
 if(!stage().some(e=>e.stage==='levelConfirmed'))throw Error('Partida rápida: no se confirmó el nivel tras 8 aceptaciones (ver capturas).');
 while(!check().song||!(check().clock>1000))await wait(250);
 onStep('Canción confirmada (Partida rápida): '+song);return status();
}
