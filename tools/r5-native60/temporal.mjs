// All rasterisation, fading, texture reads, blending and sustain shaders remain
// the original translated WGSL. This module advances captured *inputs* only.
const BOARD='80708BD1B82638B0', GEMS=new Set(['582ABCF5FF619A55','19815E13AC0DCC92']), TAILS=new Set(['10CA3B730086027C','035C1CB9583C0C7E']);
const ANIM=new Set(['19815E13AC0DCC92','27643FEB20B8CBBD','C6F0B6F9BA5A2B12']);
const ROAD=new Set([BOARD,...GEMS,...TAILS,...ANIM,'87D4CAE67E72C501','94B97981B512BDA2','B43CF443883B8351']);
const view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const lookup=(xs,ys,x)=>{
 let lo=0,hi=xs.length-1;if(x<=xs[0])hi=1;else if(x>=xs[hi])lo=hi-1;
 else{while(hi-lo>1){const m=(lo+hi)>>1;if(xs[m]<=x)lo=m;else hi=m;}}
 return ys[lo]+(ys[hi]-ys[lo])*(x-xs[lo])/(xs[hi]-xs[lo]||1);
};
function boardTable(input){
 const m=input.manifest.motion;if(!m||m.stride!==5)return null;
 const d=view(input.assets['memory.bin']),rows=new Map();
 for(let i=0;i<m.count;i++){
  const o=i*20,x=d.getFloat32(o,false),y=d.getFloat32(o+4,false),v=d.getFloat32(o+16,false);
  if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(v))return null;
  let r=rows.get(y);if(!r)rows.set(y,r={v,left:x,right:x});r.left=Math.min(r.left,x);r.right=Math.max(r.right,x);
 }
 const y=[...rows.keys()].sort((a,b)=>a-b);if(y.length<4)return null;
 const v=y.map(y=>rows.get(y).v),w=y.map(y=>rows.get(y).right-rows.get(y).left);
 if(v.some((n,i)=>i&&n<=v[i-1])||w.some(n=>n<=0))return null;
 return {y,v,w};
}
export function createTemporalFrame(inputs,shaders,{previous=null,intervalMs=0,sceneMotion=false}={}){
 const dirty=new Map(),working=inputs.map(i=>({...i,assets:{...i.assets}}));
 const board=inputs.find(i=>i.manifest.vs===BOARD),table=board&&boardTable(board);
 const slots=id=>new Map(shaders[id].constants.map((c,i)=>[c,i*16]));
 const maps=new Map(),map=id=>{if(!maps.has(id))maps.set(id,slots(id));return maps.get(id);};
 const constant=(i,c,component=0)=>{const at=map(i.manifest.vs).get(c);return at===undefined?0:view(i.assets['float-vs.bin']).getFloat32(at+component*4,true);};
 const speed=board?-constant(board,4):0;
 const prior=new Map(),occurrences=new Map();
 for(const i of previous||[]){const key=i.manifest.identity||i.manifest.vs+'/'+i.manifest.ps,n=occurrences.get(key)||0;occurrences.set(key,n+1);prior.set(key+'/'+n,i);}
 occurrences.clear();
 const plans=[];
 for(let index=0;index<inputs.length;index++){
  const i=inputs[index],vs=i.manifest.vs,key=i.manifest.identity||vs+'/'+i.manifest.ps,n=occurrences.get(key)||0;
  occurrences.set(key,n+1);
  const p=prior.get(key+'/'+n),names=[];
  if((GEMS.has(vs)||TAILS.has(vs))&&i.manifest.motion&&table)names.push('memory.bin');
  if(vs===BOARD||ANIM.has(vs))names.push('float-vs.bin');
  if(TAILS.has(vs))names.push('float-ps.bin');
  const scene=sceneMotion&&!ROAD.has(vs)&&!i.manifest.video&&p&&intervalMs>=8&&intervalMs<=250&&p.assets['float-vs.bin'].length===i.assets['float-vs.bin'].length;
  if(scene)names.push('float-vs.bin');
  if(!names.length)continue;
  const uniq=[...new Set(names)];for(const name of uniq)working[index].assets[name]=i.assets[name].slice();
  plans.push({index,input:i,previous:p,scene,names:uniq});
 }
 let lastDt=0;
 const move=(y,dv)=>{const y2=lookup(table.v,table.y,lookup(table.y,table.v,y)+dv);return [y2,lookup(table.y,table.w,y2)/lookup(table.y,table.w,y)];};
 function animate(dt){
  if(!Number.isFinite(dt)||dt<0||dt>.2)throw Error('Temporal delta outside 0..200ms');
  dirty.clear();if(dt===0&&lastDt===0)return dirty;
  for(const plan of plans){
   const {index,input:i,names}=plan,w=working[index],vs=i.manifest.vs;
   for(const name of names)w.assets[name].set(i.assets[name]);
   dirty.set(index,names);
   if(!dt)continue;
   if(vs===BOARD||ANIM.has(vs)){
    const o=map(vs).get(155),d=view(w.assets['float-vs.bin']);
    if(o!==undefined){if(vs===BOARD)d.setFloat32(o+12,d.getFloat32(o+12,true)+dt,true);if(ANIM.has(vs))d.setFloat32(o,d.getFloat32(o,true)+dt,true);}
   }
   const motion=i.manifest.motion;
   if(GEMS.has(vs)&&motion&&table){
    const src=view(i.assets['memory.bin']),dst=view(w.assets['memory.bin']),step=motion.stride*4;
    let bottom=-Infinity;for(let k=0;k<motion.count;k++)bottom=Math.max(bottom,src.getFloat32(k*step+4,false));
    const [yb,scale]=move(bottom,speed*dt);
    for(let k=0;k<motion.count;k++){
     const o=k*step,x=src.getFloat32(o,false),y=src.getFloat32(o+4,false);
     dst.setFloat32(o,640+(x-640)*scale,false);dst.setFloat32(o+4,yb-(bottom-y)*scale,false);
    }
   }
   if(TAILS.has(vs)&&motion&&table){
    const src=view(i.assets['memory.bin']),dst=view(w.assets['memory.bin']),step=motion.stride*4;
    const cc=(r,k)=>constant(i,r,k);
    const k254=cc(254,0),k254z=cc(254,2),k255x=cc(255,0),k255y=cc(255,1),glow=vs==='035C1CB9583C0C7E';
    for(let k=0;k<motion.count;k++){
     const o=k*step,px=src.getFloat32(o,false),py=src.getFloat32(o+4,false),kk=src.getFloat32(o+20,false)*k254,idx=Math.trunc(kk),sub=Math.trunc(k254z*(kk-idx));
     const sel=j=>sub===0?cc(128+j,0):sub+k255y===0?cc(128+j,2):sub+k255x===0?cc(128+j,3):cc(128+j,1);
     const row=4+idx,wave=(sel(3)*cc(row,3)+sel(2)*cc(row,2)+sel(0)*cc(row,0)+sel(1)*cc(row,1))*(glow?cc(1,2):1);
     const oldY=py+cc(0,1),[newY,scale]=move(oldY,speed*dt),newPy=newY-cc(0,1);
     const oldX=cc(0,0)+wave*px+cc(0,2)*py*cc(0,3),newX=640+(oldX-640)*scale;
     if(Number.isFinite(wave)&&Math.abs(wave)>1e-8)dst.setFloat32(o,(newX-cc(0,0)-cc(0,2)*newPy*cc(0,3))/wave,false);
     dst.setFloat32(o+4,newPy,false);
    }
    const pc=shaders[i.manifest.ps].constants.indexOf(1)*16;
    if(pc>=0){const d=view(w.assets['float-ps.bin']),top=d.getFloat32(pc+8,true),bot=d.getFloat32(pc+12,true);if(top>305.5)d.setFloat32(pc+8,move(top,speed*dt)[0],true);if(bot<600)d.setFloat32(pc+12,move(bot,speed*dt)[0],true);}
   }
   if(plan.scene){
    const a=view(plan.previous.assets['float-vs.bin']),b=view(i.assets['float-vs.bin']),d=view(w.assets['float-vs.bin']),factor=Math.min(1,dt*1000/intervalMs);
    // A conservative derivative for continuous float constants. Preserve
    // viewport/fetch/discrete lookup constants and reject large discontinuities.
    for(const [row,o] of map(vs)){
     if(row>=154)continue;
     for(let k=0;k<4;k++){
      const p=o+k*4,x=a.getFloat32(p,true),y=b.getFloat32(p,true),delta=y-x;
      if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(y)>100000||Math.abs(delta)>Math.max(1,Math.abs(y)*.25))continue;
      if(Number.isInteger(x)&&Number.isInteger(y)&&delta)continue;
      d.setFloat32(p,y+delta*factor,true);
     }
    }
   }
  }
  lastDt=dt;return dirty;
 }
 return {inputs:working,animate,table,speed,timeMs:board?constant(board,155,3)*1000:null,planCount:plans.length,scenePlanCount:plans.filter(p=>p.scene).length};
}
