from pathlib import Path
import shutil,json,hashlib
root=Path('D:/guitar hero');rt=root/'artifacts/d1-wasm/rtsrc';out=root/'artifacts/d1-wasm/g1d';backup=out/'pre-instrumentation';backup.mkdir(exist_ok=True)
files=['src/core/threading_posix.cpp','src/system/xthread.cpp','src/graphics/command_processor.cpp']
video='src/kernel/xboxkrnl/xboxkrnl_video.cpp'
sdk=root/'artifacts/xex-adapt/paso-b/src/rexglue-sdk-090'
(rt/video).parent.mkdir(parents=True,exist_ok=True)
if not (rt/video).exists():
 shutil.copy2(sdk/video,rt/video)
 (rt/'src.orig/kernel/xboxkrnl').mkdir(parents=True,exist_ok=True);shutil.copy2(sdk/video,rt/'src.orig/kernel/xboxkrnl/xboxkrnl_video.cpp')
files.append(video)
for rel in files:
 p=rt/rel;shutil.copy2(p,backup/p.name);s=p.read_text();s='#include "g1d_metrics.h"\n'+s
 if p.name=='xthread.cpp':
  s=s.replace('void XThread::Execute() {','void XThread::Execute() {\n  g1d::Lifetime metric(thread_id_,creation_params_.start_address);')
  s=s.replace('void XHostThread::Execute() {','void XHostThread::Execute() {\n  g1d::Lifetime metric(thread_id_,0);')
 if p.name=='threading_posix.cpp':
  s=s.replace('void Sleep(std::chrono::microseconds duration) {','void Sleep(std::chrono::microseconds duration) {\n  g1d::Wait metric(1);')
  s=s.replace('WaitResult Wait(WaitHandle* wait_handle, bool is_alertable, std::chrono::milliseconds timeout) {','WaitResult Wait(WaitHandle* wait_handle, bool is_alertable, std::chrono::milliseconds timeout) {\n  g1d::Wait metric(2);')
  s=s.replace('bool is_alertable, std::chrono::milliseconds timeout) {\n  auto result', 'bool is_alertable, std::chrono::milliseconds timeout) {\n  g1d::Wait metric(2);\n  auto result')
  s=s.replace('std::chrono::milliseconds timeout) {\n  std::vector<PosixConditionBase*> conditions;', 'std::chrono::milliseconds timeout) {\n  g1d::Wait metric(2);\n  std::vector<PosixConditionBase*> conditions;')
 if p.name=='command_processor.cpp':s=s.replace('  // wait until a register or memory location is a specific value','  g1d::Reg metric;\n  // wait until a register or memory location is a specific value')
 if p.name=='xboxkrnl_video.cpp':s=s.replace('  // All of these parameters are REQUIRED.','  g1d::Swap();\n  // All of these parameters are REQUIRED.')
 p.write_text(s)
p=root/'tools/d1-wasm/gh3_headless.cpp';shutil.copy2(p,backup/p.name);s=p.read_text();s='#include "g1d_metrics.h"\n'+s;s=s.replace('if (null_gpu && i % 2 == 1) g1::Report();','if (null_gpu && i % 2 == 1) {g1::Report();g1d::Report();}');p.write_text(s)
p=root/'artifacts/d1-wasm/rt-obj/results.tsv';(out/'results-before.sha256').write_text(hashlib.sha256(p.read_bytes()).hexdigest())
print('Instrumentacion de observacion aplicada a copias runtime; sin cambios del guest')
