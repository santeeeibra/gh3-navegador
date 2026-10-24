import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validateQueue,ready,checkResult,within,runController,retryTask,save,readJSON} from './controller.mjs';
const task=(id,owner='claude',depends=[],resources=[])=>({id,owner,depends,resources,context:[],mode:'read-only',objective:'check'});
test('explicit recovery retains attempts and refuses retry after cap',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gh3-controller-'));
  try{
    await save(path.join(dir,'state.json'),{tasks:{a:{status:'blocked',attempts:1,error:'oauth'}}});
    await retryTask(dir,'a');let s=await readJSON(path.join(dir,'state.json'));
    assert.equal(s.tasks.a.status,'pending');assert.equal(s.tasks.a.attempts,1);assert.deepEqual(s.tasks.a.previousErrors,['oauth']);
    s.tasks.a.status='blocked';s.tasks.a.attempts=2;await save(path.join(dir,'state.json'),s);
    await assert.rejects(retryTask(dir,'a'),/Tope/);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('reject cycles, unknown dependencies, path traversal and unverified work',()=>{
  assert.throws(()=>validateQueue({tasks:[task('a','claude',['b']),task('b','codex',['a'])]}));
  assert.throws(()=>validateQueue({tasks:[task('a','claude',['missing'])]}));
  assert.throws(()=>within(os.tmpdir(),'../outside'));
  assert.throws(()=>validateQueue({tasks:[{...task('a'),mode:'work'}]}));
});
test('owner and shared build locks prevent conflicting dispatch',()=>{
  const q={tasks:[task('a'),task('b','codex',[],['build']),task('c','codex')]};
  const state={tasks:Object.fromEntries(q.tasks.map(t=>[t.id,{status:'pending'}]))};
  const running=new Map([['other',{task:task('other','claude',[],['build'])}]]);
  assert.deepEqual(ready(q,state,running,{claude:0,codex:0},3).map(t=>t.id),['c']);
});
test('missing evidence or unmet criteria cannot pass',()=>{
  assert.throws(()=>checkResult(task('a'),{status:'completed',summary:'ok',evidence:[],next:''}));
  assert.throws(()=>checkResult({...task('a'),requiredTerms:['Edge']},{status:'completed',summary:'Node',evidence:['source'],next:''}));
});
test('scheduler runs separate owners concurrently and stops on failure',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gh3-controller-'));
  try{
    let active=0,peak=0,calls=0;
    const q={tasks:[task('a'),task('b','codex'),task('after','claude',['a'])]};
    const state=await runController({queue:q,stateDir:dir,adapter:async t=>{
      active++;peak=Math.max(peak,active);calls++;await new Promise(r=>setTimeout(r,15));active--;
      if(t.id==='a')throw Error('fixture failure');
      return {status:'completed',summary:'verified',evidence:['fixture'],next:''};
    }});
    assert.equal(peak,2);assert.equal(calls,2);assert.equal(state.tasks.after.status,'pending');assert.equal(state.tasks.a.status,'blocked');
    await assert.rejects(fs.access(path.join(dir,'controller.lock')));
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('completed result is delivered once to dependent task and persists on restart',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gh3-controller-'));
  try{
    let calls=0;
    const q={tasks:[task('first'),task('review','codex',['first'])]};
    const adapter=async(t,prompt)=>{calls++;if(t.id==='review')assert.match(prompt,/mensaje-unico/);return {status:'completed',summary:'mensaje-unico',evidence:['fixture'],next:''};};
    const state=await runController({queue:q,stateDir:dir,adapter});
    assert.equal(state.status,'completed');assert.equal(calls,2);
    await runController({queue:q,stateDir:dir,adapter});assert.equal(calls,2);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('pause starts no calls; lock prevents duplicate controllers',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gh3-controller-'));
  try{
    await fs.writeFile(path.join(dir,'PAUSE'),'');
    const state=await runController({queue:{tasks:[task('a')]},stateDir:dir,adapter:()=>{throw Error('should not call');}});
    assert.equal(state.tasks.a.status,'pending');
    await fs.writeFile(path.join(dir,'controller.lock'),'fixture');
    await assert.rejects(runController({queue:{tasks:[task('a')]},stateDir:dir}),/controlador/);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
