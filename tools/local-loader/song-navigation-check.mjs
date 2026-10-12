import assert from 'node:assert/strict';
import {navigateFirstTier} from './song-navigation.mjs';
for(const [song,downs] of [['slowride',0],['talkdirtytome',1],['hitmewithyourbestshot',2],['storyofmylife',3]]){
 let time=0,presses=[],st={live:true,menu:true,careerIntro:true};
 const r=await navigateFirstTier({song,now:()=>time,sleep:async ms=>{time+=ms;},tap:async b=>{presses.push(b);if(presses.length===10+downs)Object.assign(st,{song,clock:2000});},status:()=>st});
 assert.equal(r.song,song);assert.equal(presses.filter(b=>b==='down').length,downs);assert.equal(presses.length,10+downs);
}
await assert.rejects(navigateFirstTier({song:'one'}),/primeras cuatro/);
await assert.rejects(navigateFirstTier({song:'talkdirtytome',status:()=>({song:'slowride'})}),/se esperaba/);
let clock=0;await assert.rejects(navigateFirstTier({song:'slowride',now:()=>clock,status:()=>({live:false}),sleep:async ms=>{clock+=ms;},timeoutMs:1000}),/plazo/);
console.log('First-tier navigation fixtures: four positions, wrong song, unsupported tier and timeout OK (not game evidence).');
