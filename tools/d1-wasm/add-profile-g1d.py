from pathlib import Path
p=Path('artifacts/d1-wasm/rtsrc/include/g1d_metrics.h');s=p.read_text().replace('SampleCpu(true);}\ninline void End()', '''SampleCpu(true);int worker=EM_ASM_INT({return typeof require==='function'?require('node:worker_threads').threadId:-1;});std::fprintf(stderr,"[g1d-bind] id=%u entry=%08X nodeWorker=%d\\n",n,entry,worker);}\ninline void End()''');p.write_text(s)
p=Path('tools/d1-wasm/run-g1d.mjs');s=p.read_text();s=s.replace("[js, '/game'", "[...(process.env.G1D_CPU_PROFILE?['--cpu-prof','--cpu-prof-interval=10000','--cpu-prof-dir='+process.env.G1D_CPU_PROFILE]:[]),js, '/game'")
p.write_text(s)
