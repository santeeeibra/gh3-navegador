import fs from 'node:fs';
const dst='artifacts/sincronia-rea/judgement/demo';
const put=(name,content)=>{const p=dst+'/'+name;if(fs.existsSync(p))fs.unlinkSync(p);fs.writeFileSync(p,content);};
put('autopista60-tap.js',fs.readFileSync('artifacts/sincronia-rea/demo/autopista60-tap.js'));
put('sync-probe.js',fs.readFileSync('tools/sincronia/page-probe.js'));
put('index.html',fs.readFileSync('artifacts/sincronia-rea/demo/index.html','utf8').replace('<script src="sync-probe.js"></script>',`<script src="sync-probe.js"></script>
<script>
window.syncJudgements=[];
const syncJudgeChannel=new BroadcastChannel('hw60');
syncJudgeChannel.onmessage=e=>{if(e.data?.type==='syncJudgement'&&syncJudgements.length<2000){
 const h=window.hw60;syncJudgements.push({...e.data,receivedAt:performance.timeOrigin+performance.now(),
 audioMs:h?.audioTimeMs,visualMs:h?.visualTimeMs,shown:h?.shown});}};
</script>`));
let runner=fs.readFileSync('tools/sincronia/robot-probe.mjs','utf8');
// The old visual robot did not update t_write: its input latency display was stale.
// This local fork adds timestamps without changing scheduling or button values.
let visual=fs.readFileSync('tools/accesos/robot-visual.mjs','utf8')
 .replace("from './robot.mjs'", "from '../accesos/robot.mjs'")
 .replace('log.push({c: clock(), m, tarde:', 'log.push({at: ahora(), c: clock(), m, tarde:')
 .replace('Atomics.add(L, 0, 1); last = b;', 'new Float64Array(L.buffer,L.byteOffset+32,1)[0]=ahora(); Atomics.add(L, 0, 1); last = b;');
if(!visual.includes('log.push({at: ahora()')||!visual.includes('L.byteOffset+32')) throw Error('No se encontró el punto de timestamp del robot.');
fs.writeFileSync('tools/sincronia/robot-visual-probe.mjs',visual);
runner=runner.replace("from '../accesos/robot-visual.mjs'", "from './robot-visual-probe.mjs'");
runner=runner.replace('res.errores.push(\'probe: \'+e.message);}', `res.errores.push('probe: '+e.message);}`);
runner=runner.replace("const probe=await g.page.evaluate(()=>window.syncProbe);", "const probe=await g.page.evaluate(()=>({...window.syncProbe,judgements:window.syncJudgements}));");
fs.writeFileSync('tools/sincronia/robot-judgement.mjs',runner);
console.log(dst);
