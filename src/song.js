export const SONG={id:'midnight-voltage-v1',title:'Midnight Voltage',artist:'Riff Duel · pista original',bpm:120,duration:68,leadIn:4};
export const CHART=[];
const riff=[0,0,2,1,0,3,2,4,0,2,1,3,0,4,2,1];
for(let beat=0;beat<120;beat++){
 const lane=riff[beat%16],chord=beat%16===8||beat%16===12||beat%16===14;
 CHART.push({id:beat,time:4+beat*.5,lanes:beat%16===8?[0,4]:chord?[lane,(lane+2)%5].sort():[lane],duration:beat%16===7?.8:0,hopo:!chord&&beat%8>=4&&beat%8<=6,phrase:Math.floor(beat/8)%4===1?Math.floor(beat/8):null});
}
export function renderSong(ctx){
 const sr=ctx.sampleRate,buffer=ctx.createBuffer(2,sr*SONG.duration,sr),l=buffer.getChannelData(0),r=buffer.getChannelData(1);
 let seed=7;const noise=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296*2-1;};
 function tone(time,duration,freq,volume,drive=1,pan=0){
  const start=Math.floor(time*sr),n=Math.floor(duration*sr);
  for(let j=0;j<n&&start+j<l.length;j++){
   const t=j/sr,env=Math.min(1,t/.008)*Math.exp(-t/(duration*.36))*Math.min(1,(duration-t)/.035);
   const signal=Math.tanh((Math.sin(t*freq*Math.PI*2)+.35*Math.sin(t*freq*Math.PI*4))*drive)*env*volume;
   l[start+j]+=signal*(1-pan*.3);r[start+j]+=signal*(1+pan*.3);
  }
 }
 const freqs=[164.81,196,220,246.94,293.66];
 for(const note of CHART){
  for(const lane of note.lanes)tone(note.time,note.duration||.32,freqs[lane],.1,3,lane/2-1);
  if(note.id%2===0)tone(note.time,.44,82.4,.15);
  const start=Math.floor(note.time*sr);
  for(let j=0;j<sr*.11;j++){
   const t=j/sr,drum=note.id%2===0?Math.sin(2*Math.PI*(65*t+4*(1-Math.exp(-t*35))))*Math.exp(-t*35)*.25:noise()*Math.exp(-t*32)*.18;
   const hat=noise()*Math.exp(-t*110)*.08;l[start+j]+=drum+hat;r[start+j]+=drum+hat;
  }
 }
 for(let beat=0;beat<8;beat++)tone(beat*.5,.08,beat%2?660:880,.055);
 return buffer;
}