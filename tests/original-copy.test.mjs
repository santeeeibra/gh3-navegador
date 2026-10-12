import test from 'node:test';
import assert from 'node:assert/strict';
import {GH3_X360_TARGET as target,identifyGh3Xex} from '../src/original/gh3-target.js';
import {inspectGameFile} from '../src/original/probe.js';
const header=Uint8Array.from([0x58,0x45,0x58,0x32]);
test('un ejecutable Windows no se acepta aunque tenga nombre y hash de Xbox',()=>{
 const r=identifyGh3Xex({header:[77,90,0,0],size:target.size,sha256:target.sha256});
 assert.equal(r.copyCompatible,false);assert.equal(r.reason,'not-xex2');
});
test('un XEX de otra revision no se acepta por firma o tamano solamente',()=>{
 assert.equal(identifyGh3Xex({header,size:1,sha256:target.sha256}).reason,'wrong-size');
 assert.equal(identifyGh3Xex({header,size:target.size}).copyCompatible,null);
 assert.equal(identifyGh3Xex({header,size:target.size,sha256:'0'.repeat(64)}).reason,'wrong-hash');
});
test('metadatos de la copia objetivo no prometen ejecucion web',()=>{
 const r=identifyGh3Xex({header,size:target.size,sha256:target.sha256.toUpperCase()});
 assert.equal(r.copyCompatible,true);assert.match(r.message,/aun no ejecuta/);
});
test('el cargador rechaza un XEX falso del tamano correcto mediante hash real',async()=>{
 const bytes=new Uint8Array(target.size);bytes.set(header);
 const r=await inspectGameFile(new File([bytes],'default.xex'));
 assert.equal(r.copyCompatible,false);assert.equal(r.reason,'wrong-hash');
 assert.equal(r.sha256.length,64);
});
