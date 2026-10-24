// Step 2: replay a .wgpur natively and extract images/state.
//  - dawn-d3d12 / dawn-vulkan: WebGPUReconstruct native replayer (offscreen), stats only.
//  - rdoc: RenderDoc 1.46 injects the D3D12 replayer, captures frame 1 and its
//    Python (rdoc_extract.py) dumps per-DRAW target bytes + pipeline state.
//  - gfxr: GFXReconstruct 1.0.4 Vulkan layer records the Vulkan replayer
//    (process-local env, no registry), then gfxrecon-replay screenshots frame 1
//    and gfxrecon-convert writes a JSON call log.
// usage: node tools/gpu-capture/replay-native.mjs <label> [dawn|rdoc|gfxr ...]
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {requireTurn,writeJson,killOwnPid} from './lib.mjs';

const [label,...wanted]=process.argv.slice(2);
const steps=wanted.length?wanted:['dawn','rdoc','gfxr'];
requireTurn();
const run=path.resolve(`artifacts/gpu-capture/runs/${label}`),wgpur=path.join(run,'capture.wgpur');
if(!fs.existsSync(wgpur))throw Error('no capture '+wgpur);
const TC=path.resolve('toolchain/gpu-capture');
const REPLAY=path.join(TC,'webgpureconstruct-2.1/replay/windows/WebGPUNativeReplayDawn.exe');
const QRD=path.join(TC,'renderdoc-1.46/RenderDoc_1.46_64/qrenderdoc.exe');
const GFXR=path.join(TC,'gfxreconstruct-1.0.4/gfxreconstruct-v1.0.4');
const result={label,steps:{}};
// spawnSync terminates its own direct child on timeout; nothing is killed by image name.
const sh=(exe,args,opts={})=>{const t0=Date.now();const r=spawnSync(exe,args,{encoding:'utf8',timeout:opts.timeout??180000,env:{...process.env,...opts.env},cwd:opts.cwd});return {pid:r.pid,status:r.status,signal:r.signal,ms:Date.now()-t0,stdout:r.stdout,stderr:r.stderr,error:r.error?.message};};
const save=(name,r)=>{fs.writeFileSync(path.join(run,name+'.log'),`exit ${r.status} ${r.signal??''} ${r.error??''}\n--stdout--\n${r.stdout}\n--stderr--\n${r.stderr}`);return {status:r.status,ms:r.ms,error:r.error,log:name+'.log'};};

if(steps.includes('dawn'))for(const be of ['d3d12','vulkan']){
 const r=sh(REPLAY,[wgpur,'--offscreen','--'+be,'--width','1280','--height','720']);
 result.steps['dawn-'+be]={...save('replay-'+be,r),frames:(r.stdout.match(/Ran (\d+) frames/)||[])[1],backend:(r.stdout.match(/Backend type: (\S+)/)||[])[1]};
}
if(steps.includes('rdoc')){
 fs.rmSync(path.join(run,'rdoc'),{recursive:true,force:true});
 const r=sh(QRD,['--python',path.resolve('tools/gpu-capture/rdoc_extract.py')],{env:{GPUCAP_OUT:run,GPUCAP_EXE:REPLAY,GPUCAP_ARGS:`"${wgpur}" --d3d12 --width 1280 --height 720`,GPUCAP_FRAME:'1'}});
 // RenderDoc launches the replayer itself; close it only by the PID it reported.
 const pidFile=path.join(run,'rdoc/target-pid.txt');
 const targetPid=fs.existsSync(pidFile)?Number(fs.readFileSync(pidFile,'utf8')):0;
 const cleanup=killOwnPid(targetPid,'WebGPUNativeReplayDawn.exe');
 const log=fs.existsSync(path.join(run,'rdoc/rdoc.log'))?fs.readFileSync(path.join(run,'rdoc/rdoc.log'),'utf8'):'';
 result.steps.rdoc={status:r.status,ms:r.ms,qrenderdocPid:r.pid,targetPid,cleanup,ok:/\nOK\n?$/.test(log)||log.trim().endsWith('OK'),logTail:log.split('\n').slice(-6)};
}
if(steps.includes('gfxr')){
 const dir=path.join(run,'gfxr');fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir);
 const file=path.join(dir,'replay.gfxr');
 const cap=sh(REPLAY,[wgpur,'--vulkan','--width','1280','--height','720'],{env:{VK_LAYER_PATH:GFXR,VK_INSTANCE_LAYERS:'VK_LAYER_LUNARG_gfxreconstruct',GFXRECON_CAPTURE_FILE:file,GFXRECON_CAPTURE_FILE_TIMESTAMP:'false',GFXRECON_LOG_LEVEL:'info'}});
 const files=fs.readdirSync(dir);
 const rec={capture:save('gfxr-capture',cap),files};
 const g=files.find(f=>f.endsWith('.gfxr'));
 if(g){
  const gp=path.join(dir,g);
  rec.info=save('gfxr-info',sh(path.join(GFXR,'gfxrecon-info.exe'),[gp]));
  rec.replay=save('gfxr-replay',sh(path.join(GFXR,'gfxrecon-replay.exe'),['--screenshot-all','--screenshot-format','bmp','--screenshot-dir',dir,gp]));
  rec.convert=save('gfxr-convert',sh(path.join(GFXR,'gfxrecon-convert.exe'),['--output',path.join(dir,'replay.jsonl'),gp]));
  rec.outputs=fs.readdirSync(dir);
 }
 result.steps.gfxr=rec;
}
writeJson(path.join(run,'replay-native.json'),result);
console.log(JSON.stringify(result,null,1));
