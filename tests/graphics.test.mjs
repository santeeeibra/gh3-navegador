import test from 'node:test';import assert from 'node:assert/strict';
import {renderPlan,loadGraphicsProfile,saveGraphicsProfile,GRAPHICS_PROFILES} from '../src/graphics/profiles.js';
import {textureMipmaps,cubeVertices} from '../src/graphics/scene.js';
test('los perfiles reducen carga por pixeles sin exceder el limite del dispositivo',()=>{
 const viewport={width:1280,height:720,pixelRatio:3,maxDimension:2048};const plans=Object.keys(GRAPHICS_PROFILES).map(id=>renderPlan(id,viewport));
 assert.ok(plans[0].pixels<plans[1].pixels&&plans[1].pixels<plans[2].pixels);
 for(const p of plans){assert.ok(p.width<=2048&&p.height<=2048);assert.ok(Math.abs(p.width/p.height-16/9)<.005);}
});
test('MSAA y filtrado se negocian, sin solicitar capacidades inexistentes',()=>{
 const p=renderPlan('quality',{width:100,height:100,samples:[1],maxAnisotropy:1});assert.equal(p.samples,1);assert.equal(p.anisotropy,1);
});
test('una preferencia invalida o almacenamiento bloqueado no impide iniciar',()=>{
 assert.equal(loadGraphicsProfile({getItem(){throw Error('bloqueado');}}),'optimal');
 assert.equal(saveGraphicsProfile({setItem(){throw Error('lleno');}},'quality').id,'quality');
 assert.equal(loadGraphicsProfile({getItem(){return '__proto__';}}),'optimal');
});
test('viewport oculto o invalido no crea texturas de cero pixeles',()=>{
 const p=renderPlan('optimal',{width:0,height:NaN,pixelRatio:Infinity});assert.equal(p.width,1);assert.equal(p.height,1);
});
test('mipmaps conservan el color y transparencia de una textura uniforme',()=>{
 const data=new Uint8Array(4*4*4);for(let i=0;i<data.length;i+=4)data.set([80,120,160,200],i);
 const mip=textureMipmaps({width:4,height:4,data});assert.equal(mip.length,3);assert.deepEqual(Array.from(mip.at(-1).data),[80,120,160,200]);
});
test('vertices de la escena respetan profundidad clip y son finitos al rotar',()=>{
 for(const t of [0,1,15]){const v=cubeVertices(t,.4);assert.equal(v.length,36*9);for(let i=0;i<v.length;i+=9){assert.ok(v[i+2]>=0&&v[i+2]<=v[i+3]);assert.ok(v.slice(i,i+9).every(Number.isFinite));}}
});
test('el presupuesto evita buffers gigantes incluso con un viewport enorme',()=>{
 for(const id of Object.keys(GRAPHICS_PROFILES)){const p=renderPlan(id,{width:100000,height:100000,pixelRatio:8,maxDimension:16384});assert.ok(p.pixels<=GRAPHICS_PROFILES[id].maxPixels);}
});
test('el ultimo mipmap incluye el borde de texturas de tamano impar',()=>{
 const mip=textureMipmaps({width:3,height:1,data:Uint8Array.from([0,0,0,255,0,0,0,255,255,255,255,255])});assert.deepEqual(Array.from(mip.at(-1).data),[85,85,85,255]);
});
