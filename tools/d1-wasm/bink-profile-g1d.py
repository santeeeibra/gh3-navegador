import json,collections,re
from pathlib import Path
out=Path('artifacts/d1-wasm/g1d');rows=[]
for p in (out/'cpu-profiles').glob('*.cpuprofile'):
 worker=int(p.name.split('.')[4])
 if worker not in [15,16,17]:continue
 d=json.loads(p.read_text());nodes={n['id']:n for n in d['nodes']};parents={c:n['id'] for n in d['nodes'] for c in n.get('children',[])};count=collections.Counter(d['samples']);bink=0;active=0
 for leaf,n in count.items():
  chain=[];cur=leaf
  while cur is not None:chain.append(nodes[cur]['callFrame']['functionName']);cur=parents.get(cur)
  waiting=any('futex_wait' in x or 'cond_timedwait' in x or 'PosixConditionBase::Wait(' in x or 'condition_variable::wait(' in x for x in chain)
  if not waiting:
   active+=n
   if any(re.search(r'sub_828[BC][0-9A-F]{4}',x) for x in chain):bink+=n
 rows.append(dict(worker=worker,totalSamples=len(d['samples']),nonWaitSamples=active,binkRegionNonWaitSamples=bink,binkRegionShareAllSamplesPercent=100*bink/len(d['samples']),binkRegionShareNonWaitSamplesPercent=100*bink/active))
(out/'bink-pool-profile.json').write_text(json.dumps({'method':'Separate diagnostic 60s; inclusive guest address-region stack classification 828Bxxxx/828Cxxxx, excluding known native waits. Sample counts are not OS CPU ms; range attribution is an inference, does not measure complete codec time.','workers':rows},indent=2));print(rows)
