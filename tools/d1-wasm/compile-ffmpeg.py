# Build only selected OBJS from FFmpeg's own Makefiles. No download or SDK mutation.
import os,re,subprocess,json,concurrent.futures,sys
from pathlib import Path
root=Path(__file__).resolve().parents[2];src=root/'artifacts/d1-wasm/rtsrc/ffmpeg';out=root/'artifacts/d1-wasm/g1c/ffmpeg-build';out.mkdir(exist_ok=True)
config=dict(re.findall(r'^([A-Z0-9_]+)=(.*)$',(src/'ffbuild/config.mak').read_text(),re.M))
(src/'libavutil/ffversion.h').write_text('#define FFMPEG_VERSION "sdk-xmaframes-wasm"\n')
all_results=[]
for lib in ('libavutil','libavcodec'):
 text=(src/lib/'Makefile').read_text().replace('\\\n',' ');objs=[];compat=[]
 for line in text.splitlines():
  m=re.match(r'(OBJS|COMPAT_OBJS)(?:-\$\((\w+)\))?\s*(?:\+?=)\s*(.*)',line)
  if not m or (m[2] and config.get(m[2])!='yes'):continue
  names=re.findall(r'[\w/.-]+\.o\b',m[3].split('#')[0]);(compat if m[1]=='COMPAT_OBJS' else objs).extend(names)
 objs+=['../compat/'+x for x in compat];objs=sorted(set(objs));sources=[src/lib/(x[:-2]+'.c') for x in objs]
 for f in sources:
  if not f.exists():raise RuntimeError('Missing selected FFmpeg source '+str(f))
 def compile(f):
  stem=str(f.relative_to(src)).replace('/','_').replace('\\','_');obj=out/(stem+'.o');log=out/(stem+'.log')
  args=[sys.executable,'-E',str(root/'toolchain/emsdk/upstream/emscripten/emcc.py'),'-O2','-w','-pthread','-std=c11','-DHAVE_AV_CONFIG_H','-D_POSIX_C_SOURCE=200112','-D_XOPEN_SOURCE=600','-D_ISOC99_SOURCE','-D_FILE_OFFSET_BITS=64','-D_LARGEFILE_SOURCE','-I'+str(src),'-I'+str(src/'compat/atomics/gcc'),'-c',str(f),'-o',str(obj)]
  result=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True);log.write_text(result.stdout)
  return {'source':str(f.relative_to(src)),'object':str(obj),'exit':result.returncode}
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(compile,sources))
 all_results+=results
 failed=[r for r in results if r['exit']]
 print(lib,len(results),'sources; failures',len(failed),flush=True)
 (out/'results.json').write_text(json.dumps(all_results,indent=2))
 if failed:print(json.dumps(failed,indent=2));raise SystemExit(1)
 subprocess.run([sys.executable,'-E',str(root/'toolchain/emsdk/upstream/emscripten/emar.py'),'rcs',str(out/(lib+'.a'))]+[r['object'] for r in results],check=True)
