from pathlib import Path
import shutil
root=Path('D:/guitar hero');out=root/'artifacts/d1-wasm/g1d'
for platform,folder in [('node','d3'),('edge','d4')]:
 for ext in ['.log','.json']:
  src=root/f'artifacts/d1-wasm/{folder}/g1d-{platform}-final{ext}'
  shutil.copy2(src,out/f'g1d-{platform}-before-spin{ext}')
p=root/'artifacts/d1-wasm/rtsrc/include/g1d_metrics.h';s=p.read_text();shutil.copy2(p,out/'pre-instrumentation/g1d_metrics-before-spin.h')
pos=s.index('struct Frame ')
s=s[:pos]+'''// Guest frame pacing spins, observed from two original leaf counter reads.
struct SpinState {std::atomic<unsigned> seq{0};std::atomic<double> wall{0},start{0},cpu{0},cpuStart{-1};};
inline std::array<SpinState,128> spins;
inline void SpinBegin(){if(!id||spins[id].start.load()>0)return;auto& s=spins[id];double c=Cpu(),t=Now();s.seq.fetch_add(1);s.cpuStart=c;s.start=t;s.seq.fetch_add(1);}
inline void SpinEnd(){if(!id||spins[id].start.load()<=0)return;auto& s=spins[id];double now=Now(),c=Cpu(),start=s.start.load();s.seq.fetch_add(1);s.wall.fetch_add(now-start);if(c>=0&&s.cpuStart.load()>=0)s.cpu.fetch_add(c-s.cpuStart.load());s.start=0;s.seq.fetch_add(1);}
inline double Spun(unsigned n,double now){if(!n)return 0;auto& s=spins[n];for(;;){unsigned a=s.seq.load();if(a&1)continue;double v=s.wall.load(),start=s.start.load();if(a==s.seq.load())return v+(start>0?std::max(0.0,now-start):0);}}
''' + s[pos:]
s=s.replace('callerBusy,callerWait;','callerBusy,callerWait,mainSpin,callerSpin,usefulCpu;')
s=s.replace('lastCallerWait=0;', 'lastCallerWait=0,lastMainSpin=0,lastCallerSpin=0,lastSpinCpu=0;')
s=s.replace('double c=Cpu(),cw=id?Waited(states[id],now):0;', 'double c=Cpu(),cw=id?Waited(states[id],now):0,ms=Spun(mainId,now),cs=Spun(id,now),sc=id?spins[id].cpu.load():0;')
s=s.replace('cw-lastCallerWait,id}', 'cw-lastCallerWait,ms-lastMainSpin,cs-lastCallerSpin,(c>=0&&lastCpu>=0)?c-lastCpu-(sc-lastSpinCpu):-1,id}')
s=s.replace('lastCallerWait=cw;}', 'lastCallerWait=cw;lastMainSpin=ms;lastCallerSpin=cs;lastSpinCpu=sc;}')
s=s.replace('\\\"ended\\\":%d}', '\\\"guestSpinMs\\\":%.6f,\\\"guestSpinCpuMs\\\":%.6f,\\\"ended\\\":%d}')
s=s.replace('(s.cpuAt.load()-epoch)/1000,int(end>0)', '(s.cpuAt.load()-epoch)/1000,Spun(n,end?end:now),spins[n].cpu.load(),int(end>0)')
s=s.replace('\\\"caller\\\":%u}', '\\\"mainGuestSpinMs\\\":%.6f,\\\"callerGuestSpinMs\\\":%.6f,\\\"callerUsefulCpuMs\\\":%.6f,\\\"caller\\\":%u}')
s=s.replace('f.callerBusy,f.callerWait,f.caller)', 'f.callerBusy,f.callerWait,f.mainSpin,f.callerSpin,f.usefulCpu,f.caller)')
p.write_text(s)
