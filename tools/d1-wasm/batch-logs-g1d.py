from pathlib import Path
p=Path('artifacts/d1-wasm/rtsrc/include/g1d_metrics.h');s=p.read_text();s=s.replace('#include <vector>','#include <vector>\n#include <string>')
s=s.replace('inline void Report(){double now=Now();','inline void Report(){std::string output;auto emit=[&](const char* fmt,auto... values){char buffer[2048];int n=std::snprintf(buffer,sizeof(buffer),fmt,values...);if(n>0)output.append(buffer,std::min<size_t>(n,sizeof(buffer)-1));};double now=Now();')
s=s.replace('std::fprintf(stderr,"[g1d-thread]', 'emit("[g1d-thread]').replace('std::fprintf(stderr,"[g1d-frame]', 'emit("[g1d-frame]')
s=s.replace('frames.clear();}', 'frames.clear();EM_ASM({err(UTF8ToString($0));},output.c_str());}')
p.write_text(s)
