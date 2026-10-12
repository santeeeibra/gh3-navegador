import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const out=resolve(import.meta.dirname,'../../artifacts/r4-shaders/own-fixture');
await mkdir(out,{recursive:true});
// Original minimal SPIR-V compute module; no game data, no external compiler.
const words=[0x07230203,0x00010000,0,5,0,
  0x00020011,1,                  // OpCapability Shader
  0x0003000e,0,1,                // OpMemoryModel Logical GLSL450
  0x0005000f,5,3,0x6e69616d,0,   // OpEntryPoint GLCompute %3 "main"
  0x00060010,3,17,1,1,1,         // OpExecutionMode %3 LocalSize 1 1 1
  0x00020013,1,                  // OpTypeVoid %1
  0x00030021,2,1,                // OpTypeFunction %2 %1
  0x00050036,1,3,0,2,            // OpFunction %1 %3 None %2
  0x000200f8,4,                  // OpLabel %4
  0x000100fd,                    // OpReturn
  0x00010038];                   // OpFunctionEnd
const bytes=Buffer.alloc(words.length*4);words.forEach((v,i)=>bytes.writeUInt32LE(v,i*4));
await writeFile(resolve(out,'compute.spv'),bytes);
console.log(JSON.stringify({path:resolve(out,'compute.spv'),bytes:bytes.length,status:'generated, not yet validated by Naga'}));
