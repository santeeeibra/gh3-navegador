import fs from 'node:fs';
const sdk='artifacts/xex-adapt/paso-b/src/rexglue-sdk-090';
const src=fs.readFileSync(sdk+'/src/graphics/pipeline/texture/util.cpp','utf8');
const a=src.indexOf('int32_t GetTiledOffset2D('),b=src.indexOf('\nint32_t GetTiledOffset3D(',a);
if(a<0||b<0)throw Error('SDK reference function not found');
fs.mkdirSync('artifacts/r5-menu/layout-reference',{recursive:true});
fs.copyFileSync(sdk+'/LICENSE','tools/r5-menu/LICENSE.rexglue.txt');
const cpp=`// SDK reference extracted without modifying SDK. See LICENSE.rexglue.txt.\n#include <cstdint>\n#include <cstdio>\nnamespace rex { uint32_t align(uint32_t n,uint32_t a){return (n+a-1)/a*a;} }\nnamespace xenos { constexpr uint32_t kTextureTileWidthHeight=32; }\n${src.slice(a,b)}\nint main(){for(unsigned l=0;l<=4;l++)for(unsigned pitch:{32u,64u,96u,320u})for(int y=0;y<70;y++)for(int x=0;x<70;x++)printf("%d\\n",GetTiledOffset2D(x,y,pitch,l));}\n`;
fs.writeFileSync('artifacts/r5-menu/layout-reference/reference.cpp',cpp.replace('#include <cstdio>','#include <cstdio>\n#include <initializer_list>'));
