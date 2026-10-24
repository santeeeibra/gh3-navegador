import { GH3_X360_TARGET, identifyGh3Xex } from './gh3-target.js';
export async function inspectGameFile(file) {
 const header = new Uint8Array(await file.slice(0,512).arrayBuffer());
 const matches = bytes => bytes.every((b,i)=>header[i]===b);
 let format='Desconocido',platform='Por confirmar',next='Necesitamos identificar la edición antes de elegir el motor.';
 if(matches([0x50,0x4b])){format='Archivo ZIP';next='Es un paquete comprimido. Hay que revisar su contenido para identificar la plataforma.';}
 else if(matches([0x52,0x61,0x72,0x21])){format='Archivo RAR';next='Es un paquete comprimido. Hay que revisar su contenido para identificar la plataforma.';}
 else if(matches([0x37,0x7a,0xbc,0xaf,0x27,0x1c])){format='Archivo 7z';next='Es un paquete comprimido. Hay que revisar su contenido para identificar la plataforma.';}
 else if(matches([0x4d,0x5a])){format='Ejecutable de Windows';platform='Windows / PC';next='Puede ser el juego o un instalador. No se ejecuta directamente en el navegador; requiere una adaptación específica.';}
 else if(matches([0x58,0x45,0x58,0x32])){format='Ejecutable XEX2';platform='Xbox 360';next='Se debe verificar la edición y el hash contra una recompilación compatible.';}
 else if(matches([0x7f,0x45,0x4c,0x46])){format='Ejecutable ELF';next='Necesitamos comprobar su arquitectura y edición.';}
 if(format==='Desconocido'&&file.size>32774){
  const isoHeader=new Uint8Array(await file.slice(32768,32775).arrayBuffer());
  if(new TextDecoder().decode(isoHeader.slice(1,6))==='CD001'){format='Imagen ISO 9660';next='El disco está identificado. La plataforma y el título todavía necesitan inspección.';}
 }
 if(format==='Ejecutable XEX2'){
  let sha256=null;
  if(file.size===GH3_X360_TARGET.size){
   const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
   sha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  }
  const verdict=identifyGh3Xex({header,size:file.size,sha256});
  return {name:file.name,size:file.size,format,platform,next:verdict.message,sha256,...verdict};
 }
 return {name:file.name,size:file.size,format,platform,next};
}
export function browserCapabilities(){
 const canvas=document.createElement('canvas');
 return {wasm:typeof WebAssembly==='object',webgl2:!!canvas.getContext('webgl2'),audio:!!(window.AudioContext||window.webkitAudioContext),gamepad:typeof navigator.getGamepads==='function',threads:typeof SharedArrayBuffer==='function'&&crossOriginIsolated,secure:window.isSecureContext};
}