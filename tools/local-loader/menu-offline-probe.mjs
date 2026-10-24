import fs from 'node:fs';import vm from 'node:vm';import {inflateRawSync} from 'node:zlib';
import {songIds} from './songs.mjs';
const ctx={window:{}};vm.runInNewContext(fs.readFileSync('tools/d1-wasm/gh3-song.js','utf8'),ctx);
const base='D:/Descargas/GH3LOR-XEX/GH3LOR-XEX/Guitar Hero 3 Legends of Rock/DATA/COMPRESSED/PAK/';
const pak=inflateRawSync(fs.readFileSync(base+'qb.pak.xen')),pab=inflateRawSync(fs.readFileSync(base+'qb.pab.xen'));
const report={pakBytes:pak.length,pabBytes:pab.length,entries:[],matches:{}};
for(let e=0;e+32<=pak.length;e+=32){const type=pak.readUInt32BE(e);if(type===0x2cb3ef3b)break;report.entries.push({e,type:type.toString(16),offset:pak.readUInt32BE(e+4),size:pak.readUInt32BE(e+8),name:pak.readUInt32BE(e+16).toString(16)});}
const ids=songIds(JSON.parse(fs.readFileSync('artifacts/all-songs/catalog.json'))),names=new Map(ids.map(id=>[ctx.window.gh3Song.qbKey(id),id]));
report.songArrays=[];
for(const entry of report.entries){
 const start=entry.e+entry.offset-pak.length;if(start<0||start+entry.size>pab.length)continue;
 const qb=pab.subarray(start,start+entry.size);
 for(let off=28;off+12<=qb.length;off+=4){
  if(qb.readUInt32BE(off)!==0x00010D00)continue;
  const count=qb.readUInt32BE(off+4),pointer=qb.readUInt32BE(off+8);
  if(count<3||count>200||pointer+count*4>qb.length)continue;
  const keys=Array.from({length:count},(_,i)=>qb.readUInt32BE(pointer+i*4)),songs=keys.map(k=>names.get(k)||'#'+k.toString(16));
  if(songs.filter(s=>!s.startsWith('#')).length<3)continue;
  report.songArrays.push({pakEntry:entry.name,arrayOffset:off,count,songs});
 }
}
for(const name of ['slowride','talkdirtytome','hitmewithyourbestshot','storyofmylife','quickplay','quickplay_songlist','gh3_songs','career_songlist','singleplayer_songlist']){
 const key=ctx.window.gh3Song.qbKey(name),found=[];
 for(let off=0;off+4<=pab.length;off+=4)if(pab.readUInt32BE(off)===key)found.push({off,words:Array.from({length:Math.min(12,(pab.length-off)/4)},(_,i)=>pab.readUInt32BE(off+i*4).toString(16))});
 report.matches[name]={key:key.toString(16),occurrences:found};
}
fs.writeFileSync('artifacts/all-songs/menu-offline-probe.json',JSON.stringify(report,null,2));console.log(JSON.stringify({pakBytes:pak.length,pabBytes:pab.length,songArrays:report.songArrays}));
