from pathlib import Path
p=Path('artifacts/d1-wasm/rtsrc/src/core/threading_posix.cpp');s=p.read_text();s=s.replace('  g1d::Wait metric(2);\n','')
s=s.replace('  WaitResult Wait(std::chrono::milliseconds timeout) {','  WaitResult Wait(std::chrono::milliseconds timeout) {\n    g1d::Wait metric(2);')
s=s.replace('      locks.clear();\n\n      auto now', '      locks.clear();\n      g1d::Wait metric(2);\n      auto now')
p.write_text(s)
p=Path('artifacts/d1-wasm/rtsrc/src/system/xthread.cpp');s=p.read_text().replace('X_STATUS XThread::Exit(int exit_code) {','X_STATUS XThread::Exit(int exit_code) {\n  g1d::End();');p.write_text(s)
p=Path('artifacts/d1-wasm/rtsrc/include/g1d_metrics.h');s=p.read_text().replace('cpu{-1},cpuAt{0}', 'cpu{-1},cpuAt{0},cpuBase{-1}')
s=s.replace('s.cpu=Cpu();s.cpuAt=t;', 'double c=Cpu();if(s.cpuBase.load()<0)s.cpuBase=c;s.cpu=c>=0?c-s.cpuBase.load():-1;s.cpuAt=t;')
p.write_text(s)
