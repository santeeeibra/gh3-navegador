import test from'node:test';import assert from'node:assert/strict';import{Online}from'../src/online.js';
function setup(){
 const calls={aborts:[],ready:[]};
 const o=new Online({name:()=> 'Host',start:()=>{},status:()=>{},peer:()=>{},ready:v=>calls.ready.push(v),abort:s=>calls.aborts.push(s)});
 clearInterval(o.timer);o.host=true;o.connected=false;o.ready=true;o.peer='guest';
 let state={host:[{id:o.id,host:true,joined:1,ready:true}],guest:[{id:'guest',host:false,joined:2,ready:false}]};
 o.channel={presenceState:()=>state,track:async()=> 'ok'};o.admitResolve=()=>{};
 return{o,calls,setState:s=>state=s,self:state.host};
}
test('ready survives a transient presence removal while opponent updates',async()=>{
 const{o,calls,setState,self}=setup();
 setState({host:self});o.syncPresence();assert.equal(o.ready,true);
 setState({host:self,guest:[{id:'guest',host:false,joined:2,ready:true}]});o.syncPresence();
 await new Promise(r=>setTimeout(r,1600));assert.equal(o.ready,true);assert.equal(o.peer,'guest');assert.equal(o.peerReady,true);assert.deepEqual(calls.aborts,[]);clearTimeout(o.departureTimer);
});
test('confirmed departure resets ready and cancels current round',async()=>{
 const{o,calls,setState,self}=setup();o.round={id:'round',at:Date.now()+5000};setState({host:self});o.syncPresence();
 await new Promise(r=>setTimeout(r,1600));assert.equal(o.ready,false);assert.equal(o.peer,null);assert.equal(o.round,null);assert.equal(calls.aborts.length,1);assert.deepEqual(calls.ready,[false]);
});
