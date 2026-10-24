#pragma once
#include <cstdint>
#include <cstring>
#include <emscripten.h>
#include "rex_wasm_seg.h"
extern "C" void* g1e_live_ptr();
inline uint32_t sync_u32(uint32_t a) { return __builtin_bswap32(*(volatile uint32_t*)::rexwasm::Host(a)); }
inline float sync_f32(uint32_t a) { const auto u=sync_u32(a);float v;std::memcpy(&v,&u,4);return v; }
inline double sync_f64(uint32_t a) { const auto u=__builtin_bswap64(*(volatile uint64_t*)::rexwasm::Host(a));double v;std::memcpy(&v,&u,8);return v; }
inline void sync_judgement(int kind,uint32_t player,uint32_t arg,double delta) {
  if(player>1) return;
  const uint32_t i=player*4,index=kind==2?arg:sync_u32(0x829B5748+i);
  const double base=sync_f64(0x82BD7C38)*1000;
  const float edge=sync_f32(0x829B57B0+i),offset=sync_f32(0x829B56C0+i);
  EM_ASM({ (function() {
    const g=globalThis;
    if(!g.__syncJudgeCh) g.__syncJudgeCh=new BroadcastChannel('hw60');
    const ptr=$8;let input=null;
    if(ptr){const dv=new DataView(HEAPU8.buffer),a=new Int32Array(HEAPU8.buffer,ptr,11);
      input={seq:Atomics.load(a,0),buttons:Atomics.load(a,1),latch:Atomics.load(a,10),writtenAt:dv.getFloat64(ptr+32,true)};}
    g.__syncJudgeCh.postMessage({type:'syncJudgement',kind:$0,player:$1,arg:$2,index:$3,
      baseMs:$4,edgeMs:$5,inputOffsetMs:$6,deltaArg:$7,input,at:performance.timeOrigin+performance.now()});
  })(); },kind,player,arg,index,base,edge,offset,delta,(uint32_t)(uintptr_t)g1e_live_ptr());
}
