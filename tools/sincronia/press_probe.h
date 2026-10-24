#pragma once
#include <atomic>
#include <cmath>
#include <cstddef>
#include "judgement_probe.h"

struct alignas(8) SyncPressEvent {
  double event_at, written_at, base_sec, base_after;
  uint32_t buttons,triggers,source,flags,id,seq,reserved[2];
};
struct alignas(8) SyncPressQueue {
  std::atomic<uint32_t> magic{0x53594e31},write{0},read{0},dropped{0},mode{0},rejected{0},unused[2]{};
  SyncPressEvent events[64]{};
};
static_assert(sizeof(SyncPressEvent)==64 && offsetof(SyncPressQueue,events)==32);
inline SyncPressQueue sync_press_queue;
inline thread_local SyncPressEvent sync_press_active{};
inline thread_local bool sync_press_selected=false;
inline thread_local SyncPressEvent *sync_press_pending=nullptr;
inline thread_local double sync_press_native_sec=0, sync_press_used_sec=0;

inline void sync_press_reject(const SyncPressEvent &e,double native_sec,double now,int reason) {
  EM_ASM({(function(){globalThis.__syncJudgeCh.postMessage({type:'syncPressReject',id:$0,eventAt:$1,eventBaseMs:$2*1000,nativeMs:$3*1000,checkedAt:$4,reason:$5});})();},e.id,e.event_at,e.base_sec,native_sec,now,reason);
}

inline double sync_press_begin(uint32_t player,uint32_t controller,double native_sec) {
  sync_press_selected=false;sync_press_pending=nullptr;sync_press_native_sec=native_sec;sync_press_used_sec=native_sec;
  if(player!=0||controller>=4)return native_sec;
  // Announce from the game thread. Page may not have its shared-memory handle
  // yet, so retry at most once a second; no C1 layout/export changes.
  const double now=EM_ASM_DOUBLE({ return performance.timeOrigin + performance.now(); });static thread_local double announced=0;
  if(now-announced>1000){announced=now;EM_ASM({(function(){
    if(!globalThis.__syncJudgeCh)globalThis.__syncJudgeCh=new BroadcastChannel('hw60');
    globalThis.__syncJudgeCh.postMessage({type:'syncPressMemory',ptr:$0});
  })();},(uint32_t)(uintptr_t)&sync_press_queue);}
  auto &q=sync_press_queue;
  auto r=q.read.load(std::memory_order_relaxed),w=q.write.load(std::memory_order_acquire);
  while(r!=w){const auto &e=q.events[r%64];
    if(!std::isfinite(e.event_at)||!std::isfinite(e.base_sec)||e.base_sec!=e.base_after||now-e.event_at>250||e.base_sec<native_sec-.250){
      sync_press_reject(e,native_sec,now,1);q.rejected.fetch_add(1);q.read.store(++r,std::memory_order_release);continue;
    }
    // Writer can publish AFTER the clock above was sampled. Wait for the
    // next original iteration; a fresh future event is not invalid/stale.
    if(now<e.event_at || e.base_sec>native_sec+.002)return native_sec;
    break;
  }
  if(r==w)return native_sec;
  if(uint32_t(w-r)>1){while(r!=w){sync_press_reject(q.events[r%64],native_sec,now,2);++r;q.rejected.fetch_add(1);}q.read.store(r,std::memory_order_release);return native_sec;}
  if(q.mode.load(std::memory_order_relaxed)==1)sync_press_pending=&q.events[r%64];
  // Pure lookup verified against sub_820E7C38 and sub_82100F10. Its +52
  // edge flags 0x1000/0x4000 signal the strum already seen by the ORIGINAL.
  const uint32_t table=sync_u32(0x82A4672C),object=table?sync_u32(table+(controller+8)*4):0;
  const uint32_t state=object?sync_u32(object+24):0,edges=state?sync_u32(state+52):0;
  if(!(edges&0x5000))return native_sec;
  // C1 currently merges very short pulses into a latch. With more than one
  // queued pulse we cannot identify which edge the original observed. Keep
  // native behaviour rather than attaching an arbitrary timestamp to it.
  const uint32_t device=sync_u32(object+28);
  if(!device||sync_u32(device+8)!=8){sync_press_pending=nullptr;sync_press_reject(q.events[r%64],native_sec,now,4);q.rejected.fetch_add(1);q.read.store(r+1,std::memory_order_release);return native_sec;}
  const auto byte=[](uint32_t a){return *(volatile uint8_t*)::rexwasm::Host(a);};
  const uint32_t native_frets=(byte(state+10)?0x1000:0)|(byte(state+9)?0x2000:0)|(byte(state+8)?0x8000:0)|(byte(state+11)?0x4000:0)|(byte(state+12)?0x100:0);
  if(native_frets!=(q.events[r%64].buttons&0xF100)){
    sync_press_pending=nullptr;sync_press_reject(q.events[r%64],native_sec,now,3);q.rejected.fetch_add(1);q.read.store(r+1,std::memory_order_release);return native_sec;
  }
  sync_press_active=q.events[r%64];sync_press_selected=true;
  q.read.store(r+1,std::memory_order_release);
  if(q.mode.load(std::memory_order_relaxed)==1)sync_press_used_sec=float(sync_press_active.base_sec);
  EM_ASM({(function(){const p=$0,d=new DataView(HEAPU8.buffer);
    globalThis.__syncJudgeCh.postMessage({type:'syncPressEval',id:d.getUint32(p+48,true),
      eventAt:d.getFloat64(p,true),writtenAt:d.getFloat64(p+8,true),baseAtWrite:d.getFloat64(p+16,true)*1000,
      buttons:d.getUint32(p+32,true),nativeMs:$1*1000,usedMs:$2*1000,edges:$3,mode:$4,
      deferredExpirations:d.getUint32(p+56,true),at:performance.timeOrigin+performance.now()});})();},(uint32_t)(uintptr_t)&sync_press_active,native_sec,sync_press_used_sec,edges,q.mode.load());
  return sync_press_used_sec;
}

inline double sync_press_expiry(double threshold,double note_ms) {
  if(!sync_press_pending||sync_press_selected)return threshold;
  // Only the impending MISS comparison waits for an already timestamped
  // event. Audio/global timer/HOPO clock keep advancing. If the event itself
  // was late this threshold still expires the note, using native margins.
  const double as_of_event=float(threshold-(sync_press_native_sec-sync_press_pending->base_sec)*1000);
  if(threshold>note_ms && as_of_event<=note_ms)++sync_press_pending->reserved[0];
  return as_of_event<threshold?as_of_event:threshold;
}

inline void sync_press_inputs(uint32_t frets,uint32_t strummed,uint32_t held) {
  if(!sync_press_selected)return;
  EM_ASM({(function(){globalThis.__syncJudgeCh.postMessage({type:'syncPressInput',id:$0,frets:$1,strummed:$2,held:$3,at:performance.timeOrigin+performance.now()});})();},sync_press_active.id,frets,strummed,held);
}

inline void sync_press_result(int kind,uint32_t player,uint32_t index) {
  if(player!=0)return;
  EM_ASM({(function(){globalThis.__syncJudgeCh?.postMessage({type:'syncPressResult',kind:$0,index:$1,
    id:$2,selected:!!$3,nativeMs:$4*1000,usedMs:$5*1000,at:performance.timeOrigin+performance.now()});})();},kind,index,
    sync_press_selected?sync_press_active.id:0,sync_press_selected,sync_press_native_sec,sync_press_used_sec);
}
