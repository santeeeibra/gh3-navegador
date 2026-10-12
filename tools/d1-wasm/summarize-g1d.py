import json,re,shutil,math,hashlib
from pathlib import Path
base=Path(__file__).resolve().parents[2]/'artifacts/d1-wasm';out=base/'g1d'
def q(v,p):
 v=sorted(v)
 if not v:return None
 pos=(len(v)-1)*p;lo=int(pos);hi=min(lo+1,len(v)-1);return v[lo]+(v[hi]-v[lo])*(pos-lo)
def measure(platform,label):
 folder=base/('d3' if platform=='node' else 'd4');text=(folder/(label+'.log')).read_text(errors='replace');run=json.loads((folder/(label+'.json')).read_text())
 gpu=[];frames=[];threads=[];opens=[];lastT=0
 for line in text.splitlines():
  m=re.match(r'\[(g1|g1d-thread|g1d-frame)\] (\{.*\})',line)
  if m:
   row=json.loads(m[2]);{'g1':gpu,'g1d-thread':threads,'g1d-frame':frames}[m[1]].append(row)
   if m[1]=='g1':lastT=row['t']
  m=re.search(r'\[g1-file\] path=(.*?) status=(\w+)',line)
  if m:opens.append(dict(path=m[1],status=m[2],afterReportSeconds=lastT,timeApproximate=True))
 for i,f in enumerate(frames):f['callerSampleValid']=(i>0 and f['caller']==11 and frames[i-1]['caller']==11)
 last=gpu[-1]['t'];movie=next(o['afterReportSeconds'] for o in opens if 'atvi.bik' in o['path'])
 ended=[t['cpuAt'] for t in threads if t['entry']==0x828C1108 and t['ended']]
 movieEnd=max(ended) if ended else last
 xma=[]
 for line in text.splitlines():
  m=re.match(r'\[g1\] (\{.*\})',line)
  if m:lastT=json.loads(m[1])['t']
  if line.startswith('[g1c-xma]'):xma.append(dict(t=lastT,**{k:int(v) for k,v in re.findall(r'(\w+)=(\d+)',line)}))
 phases=[('carga',frames[0]['t'],movie),('peliculas',movie,movieEnd),('posterior_intro',movieEnd+2,last)]
 rows=[]
 for phase,a,b in phases:
  ff=[f for f in frames if a<=f['t']<b];dt=b-a
  if not ff or dt<=0:continue
  cf=[f for f in ff if f['callerSampleValid']]
  cpu=[]
  for id in sorted({s['id'] for s in threads}):
   ss=[s for s in threads if s['id']==id and a<=s['t']<=b];unique={s['cpuAt']:s for s in ss if s['cpuMs']>=0 and a<=s['cpuAt']<=b}
   samples=sorted(unique.values(),key=lambda s:s['cpuAt'])
   lastState=ss[-1] if ss else None
   rate=None;delta=None;spinDelta=None;spinRate=None
   if len(samples)>1:
    first,end=samples[0],samples[-1];seconds=end['cpuAt']-first['cpuAt'];delta=end['cpuMs']-first['cpuMs'];rate=delta/seconds/10 if seconds>0 else None
    spinDelta=end.get('guestSpinCpuMs',0)-first.get('guestSpinCpuMs',0);spinRate=spinDelta/seconds/10 if seconds>0 else None
   if lastState:cpu.append(dict(id=id,entry=f'{lastState["entry"]:08X}',cpuCorePercent=rate,cpuMsDelta=delta,observedSpinCpuMsDelta=spinDelta,observedSpinCpuCorePercentApproximate=spinRate,cpuOutsideObservedSpinCorePercentApproximate=rate-spinRate if rate is not None and spinRate is not None else None,cpuSampleWindow=[samples[0]['cpuAt'],samples[-1]['cpuAt']] if samples else None,lastCpuMs=lastState['cpuMs'],lastWaitMs=lastState['waitMs'],lastGuestSpinMs=lastState.get('guestSpinMs',0),ended=bool(lastState['ended'])))
  ram=run.get('ramSamples',[]);ramStage=[s.get('rssBytes',s.get('sumWorkingSetBytes',0))/1048576 for s in ram if a<=s.get('t',-1)<=b]
  xs=[s for s in xma if a<=s['t']<=b]
  xd=({k:xs[-1][k]-xs[0][k] for k in ['frames','workNs','codecNs']} if len(xs)>1 else None)
  g=[s for s in gpu if a<=s['t']<=b]
  row=dict(platform=platform,phase=phase,start=a,end=b,frames=len(ff),swapsPerSecond=len(ff)/dt,mainOutsideWaitMs={'p50':q([f['mainOutsideWaitMs'] for f in ff],.5),'p95':q([f['mainOutsideWaitMs'] for f in ff],.95),'mean':sum(f['mainOutsideWaitMs'] for f in ff)/len(ff)},mainWaitCallMs={'p50':q([f['mainWaitMs'] for f in ff],.5),'p95':q([f['mainWaitMs'] for f in ff],.95)},renderOutsideWaitMs={'p50':q([f['callerOutsideWaitMs'] for f in cf],.5),'p95':q([f['callerOutsideWaitMs'] for f in cf],.95)},renderCpuMs={'p50':q([f['callerCpuMs'] for f in cf if f['callerCpuMs']>=0],.5),'p95':q([f['callerCpuMs'] for f in cf if f['callerCpuMs']>=0],.95),'mean':sum(f['callerCpuMs'] for f in cf if f['callerCpuMs']>=0)/len(cf) if platform=='node' else None},cpuThreads=cpu,ramPeakMiB=max(ramStage) if ramStage else None,xmaDelta=xd)
  for name,field,spin in [('main','mainOutsideWaitMs','mainGuestSpinMs'),('render','callerOutsideWaitMs','callerGuestSpinMs')]:
   selected=ff if name=='main' else cf
   work=[f[field]-f.get(spin,0) for f in selected];wait=[f.get(spin,0) for f in selected]
   row[name+'OutsideObservedWaitAndSpinMs']={'p50':q(work,.5),'p95':q(work,.95),'mean':sum(work)/len(work),'negativeSamples':sum(v<0 for v in work)}
   row[name+'GuestSpinMs']={'p50':q(wait,.5),'p95':q(wait,.95),'mean':sum(wait)/len(wait)}
  useful=[f.get('callerUsefulCpuMs',-1) for f in cf if f.get('callerCpuMs',-1)>=0]
  row['renderCpuOutsideObservedSpinMs']={'p50':q(useful,.5),'p95':q(useful,.95),'mean':sum(useful)/len(useful) if useful else None,'negativeSamples':sum(v<0 for v in useful)}
  if len(g)>1:row['pm4PerSecond']=(g[-1]['packets']-g[0]['packets'])/(g[-1]['t']-g[0]['t']);row['drawsPerSecond']=(g[-1]['draws']-g[0]['draws'])/(g[-1]['t']-g[0]['t'])
  for name,entry in [('main','82136950'),('render','82381C70')]:
   c=next((c for c in cpu if c['entry']==entry),None);row[name+'CpuCorePercent']=c['cpuCorePercent'] if c else None
  row['binkWorkersFinalCpuMs']=sum(c['lastCpuMs'] for c in cpu if c['entry']=='828C1108' and c['lastCpuMs']>=0) if platform=='node' else None
  rows.append(row)
 result={'platform':platform,'label':label,'run':run,'menuVerified':False,'titleVerified':False,'terminalState':'continued execution after intro; compatible with native title prompt but no unique runtime UI signature','firstMovieSecondsApproximate':movie,'lastBinkWorkerExitSeconds':movieEnd,'openedFiles':opens,'frames':frames,'threadSamples':threads,'gpuSamples':gpu,'xmaSamples':xma,'phases':rows,'limits':['Observed guest spins cover counter calls LR 822CA364, 822CA48C and 822BF188; other guest synchronization loops (e.g. 822BF1A8) remain inside residual work. Residual is an upper bound on useful work, not a proof of available CPU.', 'Spin CPU readings at entry/exit have Windows timer quantization; individual negative residual CPU samples are retained, not silently filtered. Phase thread CPU/spin deltas have different snapshot timestamps and are approximate.', 'Initial swaps are on main id6, then render id11; render per-frame distributions exclude the first main frame and transition frame because caller CPU/wait baselines change. Main wall distributions retain them.','outsideWaitMs is wall time outside measured wait calls, not OS CPU and not guaranteed available CPU. Wait calls may consume CPU; other mutex/futex waits not separately covered.','Node per-thread CPU from process.threadCpuUsage; Windows timer values quantized roughly 15.6 ms. Edge per-thread CPU unavailable; CDP process CPU kept in run.ramSamples.','Phase and RAM boundaries approximate to report/sample cadence ~1s. RAM methods differ Node child vs Edge process tree.','Bink worker entry is not a complete attribution of Bink code cost on other guest threads.','Profiling diagnostic is separate from normal runs; no vblank acceleration.']}
 for ext in ['.log','.json']:shutil.copyfile(folder/(label+ext),out/(label+'-raw'+ext))
 (out/(label+'.json')).write_text(json.dumps(result,indent=2));return result
if __name__=='__main__':
 results=[]
 for platform in ['node','edge']:
  label='g1d-'+platform+'-final'
  if (base/('d3' if platform=='node' else 'd4')/(label+'.json')).exists():results.append(measure(platform,label))
 (out/'summary.json').write_text(json.dumps([r['phases'] for r in results],indent=2));print(json.dumps([r['phases'] for r in results],indent=2))
