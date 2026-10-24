// End to end: reserve test turn -> Edge capture (WebGPUReconstruct) -> native replays
// (Dawn D3D12+Vulkan, RenderDoc D3D12, GFXReconstruct Vulkan) -> analyze/report ->
// release ONLY our turn. Exit code: 0 ok, 2 regressions/capture errors, 1 tool failure.
// usage: node tools/gpu-capture/pipeline.mjs <label> [--mode main|worker] [--accept-baseline] [--fixture <menu-layers.json>]
import {spawnSync} from 'node:child_process';
import {reserveTurn,releaseTurn} from './lib.mjs';
const args=process.argv.slice(2),label=args[0];
if(!label)throw Error('usage: pipeline.mjs <label> [--mode main|worker] [--accept-baseline]');
const mode=args.includes('--mode')?args[args.indexOf('--mode')+1]:'main';
const token=reserveTurn(`gpu-capture ${label}: captura->replay->informe del renderer de menú. Sin GH3`);
// Children inherit the token; each one closes only the processes it started (by PID).
const node=(script,a)=>{const r=spawnSync(process.execPath,[`tools/gpu-capture/${script}`,...a],{stdio:'inherit',timeout:900000,env:{...process.env,GPUCAP_TURN:token}});return r.status;};
let code=0;
try{
 const fx=args.includes('--fixture')?['--fixture',args[args.indexOf('--fixture')+1]]:[];
 if(node('edge-capture.mjs',[label,'--mode',mode,'--present',...fx]))throw Error('edge capture failed');
 if(node('replay-native.mjs',[label,'dawn','rdoc','gfxr']))throw Error('native replay failed');
 code=node('analyze.mjs',[label,...(args.includes('--accept-baseline')?['--accept-baseline']:[])]);
}catch(e){console.error(e.message);code=1;}
finally{
 releaseTurn(token,`gpu-capture ${label}: terminado (exit ${code}); procesos propios cerrados por PID. Sin GH3.`);
}
process.exitCode=code;
