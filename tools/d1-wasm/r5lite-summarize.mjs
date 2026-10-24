import fs from 'node:fs';
const label=process.argv[2]||'edge-road-arena-full',root='artifacts/d1-wasm/r5lite/runs/'+label;
const r=JSON.parse(fs.readFileSync(root+'/verification.json'));
function interval(a,b){const wallS=b.wallS-a.wallS,n=b.renderer.timing.count-a.renderer.timing.count,timing={};for(const k in b.renderer.timing)if(k!=='count')timing[k]=(b.renderer.timing[k]-a.renderer.timing[k])/n;
 const cpN=b.renderer.cpTiming?.count-a.renderer.cpTiming?.count;
 return {fromWallS:a.wallS,toWallS:b.wallS,fromClockMs:a.clockMs,toClockMs:b.clockMs,wallS,gameSwapsPerSecond:(b.renderer.swap-a.renderer.swap)/wallS,presentedPerSecond:(b.presented-a.presented)/wallS,completedFrames:n,timing,cpMs:cpN?(b.renderer.cpTiming.totalMs-a.renderer.cpTiming.totalMs)/cpN:null,postMs:cpN?(b.renderer.cpTiming.postMs-a.renderer.cpTiming.postMs)/cpN:null};}
const firstAttempt=[];let started=false,previous=0;
for(const s of r.samples){if(s.clockMs>0)started=true;if(started&&s.clockMs<previous-1000)break;if(started){firstAttempt.push(s);previous=s.clockMs;}}
const song=firstAttempt.filter(s=>s.clockMs>5000&&s.clockMs<245000&&s.renderer?.timing.count),windows=[];
for(let i=0;i<song.length;){let j=i+1;while(j<song.length&&song[j].wallS-song[i].wallS<10)j++;if(j>=song.length)break;windows.push(interval(song[i],song[j]));i=j;}
const manifest=JSON.parse(fs.readFileSync('artifacts/manifest/manifest-slowride-completo.json')),conversion=JSON.parse(fs.readFileSync('artifacts/r5-songlive/shaders/manifest.json')),edge=JSON.parse(fs.readFileSync('artifacts/r5-songlive/shaders/edge.json'));
const additions=['E3039B9C4E23089E','27643FEB20B8CBBD','1739B52DBDE9E4A0','C6F0B6F9BA5A2B12','88A80B796B8BB1E4','035C1CB9583C0C7E','D98ABB22E748B52F','B1A05E35D3DD7544','D519EA3EC7BE59B5'];
const priorMissing=[...new Set([...manifest.shaders.list.filter(s=>s.status==='volcado-sin-traducir').map(s=>s.hash),...additions])];
const valid=new Set(edge.results.filter(s=>s.moduleValid).map(s=>s.name.split('_')[1].split('.')[0]));
const summary={label,ok:r.ok,songAt:r.songAt,browser:r.browser,totalTranslated:Object.keys(conversion).length,totalEdgeValid:valid.size,priorMissing:priorMissing.length,priorMissingNowConverted:priorMissing.filter(s=>conversion[s]).length,priorMissingNowEdgeValid:priorMissing.filter(s=>valid.has(s)).length,songMean:interval(song[0],song.at(-1)),windows,gameRange:windows.map(w=>w.gameSwapsPerSecond),presentedRange:windows.map(w=>w.presentedPerSecond),audioFinal:r.final.audio,bot:{strums:r.final.bot.strums,clockMax:r.final.bot.clockMax,attempts:r.final.bot.attempts},pageErrors:r.pageErrors,fatal:r.final.renderer.fatal,last:r.final.renderer.last,readbacks:r.final.renderer.gpu?.readbacks,audioSignal:r.audioSignal};
fs.writeFileSync(root+'/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify({...summary,windows:undefined,gameRange:[Math.min(...summary.gameRange),Math.max(...summary.gameRange)],presentedRange:[Math.min(...summary.presentedRange),Math.max(...summary.presentedRange)],last:undefined}));
