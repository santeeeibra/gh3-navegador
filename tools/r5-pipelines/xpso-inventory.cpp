// Read-only parser for rexglue/Xenia DXRT pipeline cache, schema version 20260226.
// Format reference: existing rexglue-sdk-090 graphics/d3d12/pipeline_cache.{h,cpp}.
// Byte decoding avoids reliance on compiler bitfield layout; XXH3 verifies each record.
#define XXH_INLINE_ALL
#include <xxhash.h>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <iomanip>
#include <vector>
#include <stdexcept>
static uint64_t le(const uint8_t* p,unsigned n){uint64_t v=0;for(unsigned i=0;i<n;++i)v|=uint64_t(p[i])<<(i*8);return v;}
static void hex64(uint64_t v){std::cout<<'"'<<std::hex<<std::setw(16)<<std::setfill('0')<<v<<std::dec<<'"';}
int main(int argc,char**argv){try{
 if(argc!=2)throw std::runtime_error("Usage: xpso-inventory cache.xpso");
 std::ifstream f(argv[1],std::ios::binary);if(!f)throw std::runtime_error("Open failed");
 std::vector<uint8_t>b((std::istreambuf_iterator<char>(f)),{});
 if(b.size()<12||le(b.data(),4)!=0x53504558||le(b.data()+4,4)!=0x54525844)throw std::runtime_error("Not XEPS DXRT");
 const uint32_t version=(uint32_t(b[8])<<24)|(uint32_t(b[9])<<16)|(uint32_t(b[10])<<8)|b[11];
 if(version!=0x20260226)throw std::runtime_error("Unsupported schema version");
 if((b.size()-12)%72)throw std::runtime_error("Truncated or different record size");
 const size_t count=(b.size()-12)/72;if(!count)throw std::runtime_error("Empty cache");
 for(size_t i=0;i<count;++i){auto*p=b.data()+12+i*72;if(XXH3_64bits(p+8,64)!=le(p,8))throw std::runtime_error("Record hash mismatch");}
 std::cout<<"{\"version\":\"20260226\",\"recordBytes\":72,\"descriptionBytes\":64,\"verifiedRecords\":"<<count<<",\"records\":[";
 for(size_t i=0;i<count;++i){auto*p=b.data()+12+i*72+8;if(i)std::cout<<',';
 std::cout<<"{\"record\":"<<i<<",\"vertex\":";hex64(le(p,8));
 std::cout<<",\"vertexModification\":";hex64(le(p+8,8));
 std::cout<<",\"pixel\":";hex64(le(p+16,8));
 std::cout<<",\"pixelModification\":";hex64(le(p+24,8));
 std::cout<<",\"stateWords\":["<<le(p+40,4)<<','<<le(p+44,4)<<"],\"renderTargetWords\":[";
 for(int j=0;j<4;++j){if(j)std::cout<<',';std::cout<<le(p+48+j*4,4);}
 std::cout<<"]}";
 }std::cout<<"]}\n";return 0;
 }catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}}
