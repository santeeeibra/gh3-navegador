import json,re,collections
from pathlib import Path
out=Path('artifacts/d1-wasm/g1d');text=Path('artifacts/d1-wasm/d3/g1d-node-profile.log').read_text();binds=[]
for m in re.finditer(r'\[g1d-bind\] id=(\d+) entry=(\w+) nodeWorker=(\d+)',text):binds.append({'guestId':int(m[1]),'entry':m[2],'worker':int(m[3])})
results=[]
for p in sorted((out/'cpu-profiles').glob('*.cpuprofile')):
 worker=int(p.name.split('.')[4]);data=json.loads(p.read_text());nodes={n['id']:n for n in data['nodes']};parents={c:n['id'] for n in data['nodes'] for c in n.get('children',[])};counts=collections.Counter(data.get('samples',[]));top=[]
 for id,count in counts.most_common(15):
  name=nodes[id]['callFrame']['functionName'];chain=[];cur=id
  for depth in range(12):
   chain.append(nodes[cur]['callFrame']['functionName']);cur=parents.get(cur)
   if cur is None:break
  top.append({'function':name,'samples':count,'sampleSharePercent':100*count/len(data['samples']),'stack':chain})
 results.append({'file':p.name,'worker':worker,'bindings':[b for b in binds if b['worker']==worker],'samples':len(data.get('samples',[])),'topLeaves':top,'profileSeconds':(data['endTime']-data['startTime'])/1e6})
(out/'cpu-profile-summary.json').write_text(json.dumps({'method':'Separate 60 s diagnostic, V8 sampled stacks at requested 10 ms interval. Sample shares are not exact OS CPU time; profiler can show native waits on guest stack. Not a normal performance run.','workers':results},indent=2))
for r in results:
 if any(b['entry'] in ['82136950','82381C70','823EC780','828C1108'] for b in r['bindings']):
  print(r['worker'],r['bindings']);print([(v['function'],round(v['sampleSharePercent'],2)) for v in r['topLeaves'][:7]])
