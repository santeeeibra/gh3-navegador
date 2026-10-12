from pathlib import Path
p=Path('tools/d1-wasm/run-d3.mjs');s=p.read_text();s=s.replace('let peakRss = 0;', 'let peakRss = 0; const ramSamples=[];')
s=s.replace("if (m) peakRss = Math.max(peakRss, Number(m[1].replace(/[.,]/g, '')) * 1024);", "if (m) {const rssBytes=Number(m[1].replace(/[.,]/g, ''))*1024;peakRss=Math.max(peakRss,rssBytes);ramSamples.push({t:(Date.now()-t0)/1000,rssBytes});}")
s=s.replace('peakRssMB: Math.round(peakRss / 1048576)', 'peakRssMB: Math.round(peakRss / 1048576), ramSamples')
s=s.replace('console.log(JSON.stringify(result));', 'console.log(JSON.stringify({...result,ramSamples:ramSamples.length}));')
Path('tools/d1-wasm/run-g1d.mjs').write_text(s)
