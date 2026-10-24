import assert from 'node:assert/strict';
import {nextDeadline} from './cadence.mjs';
const p=1000/60;
assert.equal(nextDeadline(0,10),p);
assert.equal(nextDeadline(0,17),p); // can start the following image immediately
assert.equal(nextDeadline(0,60),60); // never accumulate a long catch-up burst
assert.equal(nextDeadline(p,25),2*p);
let deadline=0,now=0,frames=0;
while(now<5000){now=Math.max(now,deadline)+(frames%3===0?18:10);deadline=nextDeadline(deadline,now);frames++;}
assert.ok(frames/5>59&&frames/5<61);
console.log(JSON.stringify({ok:true,simulatedFPS:frames/5,oneFrameInFlight:true}));
