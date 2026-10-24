// Transporte JSON-RPC del puente de Claude instalado. Usa la extension, sin CDP.
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
export class ClaudeBridge {
 constructor(){
  this.next=0;this.pending=new Map();this.buffer='';
  this.child=spawn(process.env.CLAUDE_EXE||'C:/Users/santi/.local/bin/claude.exe',['--claude-in-chrome-mcp'],{stdio:['pipe','pipe','pipe']});
  this.child.stdout.setEncoding('utf8');
  this.child.stdout.on('data',chunk=>{this.buffer+=chunk;let idx;while((idx=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,idx);this.buffer=this.buffer.slice(idx+1);let m;try{m=JSON.parse(line);}catch{continue;}const p=this.pending.get(m.id);if(p){clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}});
  this.child.stderr.on('data',s=>process.stderr.write(s));
  const fail=e=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(e);}this.pending.clear();};
  this.child.on('error',fail);this.child.on('exit',()=>fail(Error('El puente Claude termino')));
 }
 request(method,params={}){return new Promise((resolve,reject)=>{const id=++this.next;const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('MCP timeout '+method));},20000);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
 async init(){await this.request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'fase2-verification',version:'1.0'}});this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');}
 call(name,args={}){return this.request('tools/call',{name,arguments:args});}
 close(){this.child.kill();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const bridge=new ClaudeBridge();try{
  await bridge.init();
  const result=process.argv[2]?await bridge.call(process.argv[2],JSON.parse(process.argv[3]||'{}')):await bridge.request('tools/list');
  console.log(JSON.stringify(result,null,2));
  if(process.env.MCP_OUT)await writeFile(process.env.MCP_OUT,JSON.stringify(result,null,2));
 }finally{bridge.close();}
}
