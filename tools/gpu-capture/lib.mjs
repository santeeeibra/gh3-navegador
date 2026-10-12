// Shared helpers for the capture -> replay -> compare -> report pipeline.
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

export const ROOT=process.cwd();
export const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
export const hashJson=o=>sha256(Buffer.from(JSON.stringify(o)));
export const short=h=>h?String(h).slice(0,16):'none';
export const readJson=p=>JSON.parse(fs.readFileSync(p,'utf8'));
export const writeJson=(p,o)=>fs.writeFileSync(p,JSON.stringify(o,null,1));

// Test-turn protocol of artifacts/PRUEBAS-EN-CURSO.md (one runner at a time).
// Each reservation carries a unique token; only the holder of that token may run
// GPU/game steps or release it. A turn held by anyone else (Codex or another
// Claude session) is never reused or released.
export const TURN='artifacts/PRUEBAS-EN-CURSO.md';
const tokenOf=t=>(t.match(/^Reserva: (\S+)/m)||[])[1];
export function reserveTurn(what){
 const t=fs.readFileSync(TURN,'utf8');
 if(!t.includes('Estado: LIBRE'))throw Error('Test turn not free:\n'+t);
 const token=`claude-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
 fs.writeFileSync(TURN,`# Turno de pruebas del juego (uno por vez)\nEstado: OCUPADO\nQuién: Claude\nReserva: ${token}\nQué: ${what}\nDesde: ${new Date().toISOString()}\nFin: estimado 30 min\n`);
 if(tokenOf(fs.readFileSync(TURN,'utf8'))!==token)throw Error('lost race on test turn');
 return token;
}
export function requireTurn(token=process.env.GPUCAP_TURN){
 const t=fs.readFileSync(TURN,'utf8');
 if(!token||!t.includes('Estado: OCUPADO')||tokenOf(t)!==token)throw Error('This run does not hold the test turn (set GPUCAP_TURN=<token> from turn.mjs reserve)');
 return token;
}
export function releaseTurn(token,what){
 const t=fs.readFileSync(TURN,'utf8');
 if(tokenOf(t)!==token)throw Error('Turn not held by this run; leaving it untouched');
 fs.writeFileSync(TURN,`# Turno de pruebas del juego (uno por vez)\nEstado: LIBRE\nQuién: Claude\nQué: ${what}\nFin: ${new Date().toISOString()}\n`);
}

// Windows: terminate a PID only if it is still the exact image we started.
export function killOwnPid(pid,image){
 if(!pid)return 'no-pid';
 const r=spawnSync('tasklist',['/FI',`PID eq ${pid}`,'/FI',`IMAGENAME eq ${image}`,'/NH','/FO','CSV'],{encoding:'utf8'});
 if(!r.stdout.includes(`"${image}"`))return 'not-running';
 spawnSync('taskkill',['/F','/T','/PID',String(pid)],{stdio:'ignore'});
 return 'killed';
}

// Minimal RGBA8 PNG encoder (no dependencies).
export function png(rgba,w,h){
 const raw=Buffer.alloc((w*4+1)*h);
 for(let y=0;y<h;y++){raw[y*(w*4+1)]=0;Buffer.from(rgba.buffer,rgba.byteOffset+y*w*4,w*4).copy(raw,y*(w*4+1)+1);}
 const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(zlib.crc32(td)>>>0);return Buffer.concat([len,td,crc]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw,{level:6})),chunk('IEND',Buffer.alloc(0))]);
}

// Per-channel comparison of two RGBA8 images of the same frame. Returns exact
// counts; never thresholds by itself (classification lives in classify.mjs).
export function compareRgba(a,b,w,h){
 if(a.length!==b.length)return {sameSize:false,aBytes:a.length,bBytes:b.length};
 let diffPixels=0,maxAbs=0,sumAbs=0,bbox=null;const hist=new Array(256).fill(0);
 const chMax=[0,0,0,0];
 for(let p=0;p<w*h;p++){
  let pm=0;
  for(let c=0;c<4;c++){const d=Math.abs(a[p*4+c]-b[p*4+c]);if(d>chMax[c])chMax[c]=d;if(d>pm)pm=d;sumAbs+=d;}
  if(pm){diffPixels++;hist[pm]++;if(pm>maxAbs)maxAbs=pm;const x=p%w,y=(p/w)|0;
   if(!bbox)bbox=[x,y,x,y];else{if(x<bbox[0])bbox[0]=x;if(y<bbox[1])bbox[1]=y;if(x>bbox[2])bbox[2]=x;if(y>bbox[3])bbox[3]=y;}}
 }
 const histogram={};hist.forEach((n,i)=>{if(n)histogram[i]=n;});
 return {sameSize:true,identical:diffPixels===0,diffPixels,maxAbs,channelMax:{r:chMax[0],g:chMax[1],b:chMax[2],a:chMax[3]},meanAbs:sumAbs/(w*h*4),bbox,histogram};
}

// Visual diff: differing pixels in red over a darkened copy of `a`.
export function diffImage(a,b,w,h){
 const o=new Uint8Array(w*h*4);
 for(let p=0;p<w*h;p++){let d=0;for(let c=0;c<4;c++)d=Math.max(d,Math.abs(a[p*4+c]-b[p*4+c]));
  if(d){o[p*4]=255;o[p*4+1]=Math.max(0,255-d*8);o[p*4+2]=0;o[p*4+3]=255;}else{o[p*4]=a[p*4]>>2;o[p*4+1]=a[p*4+1]>>2;o[p*4+2]=a[p*4+2]>>2;o[p*4+3]=255;}}
 return o;
}
