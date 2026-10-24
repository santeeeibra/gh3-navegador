import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const bundle=fs.readFileSync('artifacts/monitor-diario/demo/r5snap-loader-ui.js','utf8');
const begin=bundle.indexOf('function createLoadingView('),end=bundle.indexOf('var rows=',begin);
assert.ok(begin>0&&end>begin);
const all=[];
for(const [kind,source] of [['source',fs.readFileSync('tools/local-loader/loading.mjs','utf8').replace('export function','function')],['bundle',bundle.slice(begin,end)]]){
function setup(){
 let now=1000,update; const nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',style:{},classList:{add(){},toggle(){}},setAttribute(){},querySelector:s=>node(s),querySelectorAll:()=>[]});return nodes.get(id)};
 const state={manualNavigation:true},win={gh3Stage:{},gh3Song:{clock:()=>win.clock},clock:0,songPak:null};
 const context=vm.createContext({document:{createElement:()=>node('overlay'),getElementById:node,body:node('body'),querySelectorAll:()=>[]},window:win,performance:{now:()=>now},setInterval:fn=>{update=fn},location:{reload(){}}});
 vm.runInContext(source+';globalThis.make=createLoadingView',context);
 const view=context.make({append(){},hidden:true},state);view.start();view.message({type:'g1eInput'});
 return {view,state,win,tick(clock){now+=500;win.clock=clock;update()},hidden:()=>view.element.hidden};
}
const checks=[];function test(name,fn){fn();checks.push(name)}
test('menú manual sin cartel',()=>{const x=setup();x.tick(0);assert.equal(x.hidden(),true)});
test('Práctica: reloj positivo quieto no termina carga; avance sí',()=>{const x=setup();x.win.songPak='slowride';x.view.stage({stage:'levelConfirmed'});x.tick(15600);assert.equal(x.hidden(),false);x.tick(15600);assert.equal(x.hidden(),false);x.tick(16100);assert.equal(x.hidden(),true);x.tick(16100);assert.equal(x.hidden(),true)});
test('Partida rápida y Carrera conservan cuenta regresiva/songPlaying',()=>{for(const mode of ['rapida','carrera']){const x=setup();x.win.songPak=mode;x.view.stage({stage:'levelConfirmed'});x.tick(-2000);assert.equal(x.hidden(),true);x.view.stage({stage:'songPlaying'});x.tick(0);assert.equal(x.hidden(),true)}});
test('preview positivo no simula una partida',()=>{const x=setup();x.state.manualNavigation=false;x.win.songPak='slowride';x.view.stage({stage:'preview'});x.tick(15000);x.tick(16000);assert.equal(x.hidden(),false)});
test('descarga incompleta y errores siguen visibles',()=>{const x=setup();x.win.songPak='slowride';x.view.stage({stage:'levelConfirmed'});x.view.message({type:'songLoad',done:10,total:100,complete:false});x.tick(15000);x.tick(16000);assert.equal(x.hidden(),false);x.view.message({type:'songLoad',done:100,total:100,complete:true});x.tick(17000);assert.equal(x.hidden(),true);x.view.fail('error de prueba');assert.equal(x.hidden(),false)});
test('nuevo tema no reutiliza reloj previo',()=>{const x=setup();x.win.songPak='slowride';x.view.stage({stage:'levelConfirmed'});x.tick(15000);x.tick(16000);x.win.songPak='talkdirtytome';x.view.stage({stage:'loadStart'});x.tick(17000);assert.equal(x.hidden(),false);x.view.stage({stage:'levelConfirmed'});x.tick(17000);assert.equal(x.hidden(),false)});
test('Práctica sin levelConfirmed: loadStart + reloj positivo en avance',()=>{const x=setup();x.win.songPak='slowride';x.view.stage({stage:'loadStart'});x.tick(15590);assert.equal(x.hidden(),false);x.tick(21234);assert.equal(x.hidden(),true);x.tick(23254);assert.equal(x.hidden(),true)});
test('reproducción de los relojes capturados en Práctica',()=>{for(const stage of ['loadStart','levelConfirmed']){const x=setup();x.win.songPak='slowride';x.view.stage({stage});for(const clock of [15590,21234,23254,25260,27312])x.tick(clock);assert.equal(x.hidden(),true)}});
all.push({kind,checks});
}
fs.writeFileSync('artifacts/gh3-liviano/codex-ui-grupos/ui-check.json',JSON.stringify({ok:true,results:all},null,2));console.log(`${all.reduce((n,x)=>n+x.checks.length,0)} comprobaciones UI correctas (fuente y bundle; sin motor)`);
