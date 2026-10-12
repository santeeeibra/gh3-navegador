import {FIRST_FOUR} from './songs.mjs';
// Test route through the original, unmodified career menus in a fresh profile.
// Only the first tier has a known menu order. Never pretend a later tier is open.
export async function navigateFirstTier({song,tap,status,sleep,now=()=>Date.now(),clearSchedule=()=>{},onStep=()=>{},gap=4500,timeoutMs=360000}){
 if(!FIRST_FOUR.includes(song))throw Error('La navegación automática todavía admite solo las primeras cuatro canciones.');
 const start=now();
 const check=()=>{const s=status();if(s.error)throw Error(s.error);if(s.song&&s.song!==song)throw Error(`El juego abrió ${s.song}, se esperaba ${song}.`);if(now()-start>timeoutMs)throw Error('No se llegó a la canción dentro del plazo.');return s;};
 const wait=async(ms)=>{check();await sleep(ms);check();};
 const step=async(button,label)=>{onStep(label);check();await tap(button);await wait(gap);};
 while(!check().live)await wait(200);
 await clearSchedule();
 while(!check().menu){await tap('start');await wait(1500);}
 await wait(3000);
 await step('a','Carrera');await step('a','Nombre de banda');await step('start','Aceptar banda');
 await step('a','Dificultad Medium');await step('a','Axel Steel');await step('a','Play Show');
 while(!check().careerIntro)await wait(250);
 await step('a','Saltear presentación de Carrera');await step('a','Cartel del escenario');
 for(let i=0;i<FIRST_FOUR.indexOf(song);i++)await step('down','Elegir '+song);
 await step('a','Confirmar '+song);await step('a','Iniciar escenario');
 while(!check().song||!(check().clock>1000))await wait(250);
 onStep('Canción confirmada: '+song);return status();
}
