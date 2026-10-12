# Read-only preparation of one captured draw. No modifications to capture or SDK.
import json,struct,hashlib,re,sys
from pathlib import Path
root=Path(__file__).resolve().parents[2]
run=root/(sys.argv[1] if len(sys.argv)>1 else 'artifacts/r5-native-capture/run4')
cap=run/'capture';out=root/'artifacts/r5-replay/data';out.mkdir(exist_ok=True)
validation=json.loads((run/'validation.json').read_text())
if validation['passed']!=validation['total']:raise SystemExit('Capture validation failed')
regs=(cap/'registers.bin').read_bytes();r=struct.unpack('<20483I',regs)
draw=validation['draw'][0]
if (draw['vs'],draw['ps'],draw['guestPrimitive'],draw['hostTopology'],draw['hostVertexCount'],draw['hostIndexType'])!=('57F6448DAC5BEB74','AB008EF1D1A8CB6D',6,5,4,0):raise ValueError('Unsupported draw identity/topology')
t0=next(t for t in validation['textures'] if t['texture']==0)
ta=next(t for t in validation['textures'] if t['texture']==3)
if (t0['width'],t0['height'],ta['width'],ta['height'],ta['pitchBytes'])!=(1280,720,1280,720,1280):raise ValueError('Unsupported video dimensions')
if any(v!=255 for v in (cap/'texture-3.bin').read_bytes()):raise ValueError('Translucent snapshot requires prior framebuffer, not supported by single-draw replay')
if not r[0x2204]&(1<<16) or r[0x2081]!=0 or r[0x2082]!=((720<<16)|1280) or r[0x200e]!=0 or r[0x200f]!=0x20002000:raise ValueError('Unsupported clipping/scissor')
if (r[0x2001]>>16)&15:raise ValueError('Only captured non-gamma RGBA8 render target supported')

native=(cap/'dxbc-system-constants.bin').read_bytes()
dxbc=json.loads((root/'artifacts/r5-replay/dxbc-offsets.json').read_text())
if len(native)!=dxbc['bytes']:raise ValueError('Native struct size differs')
layouts=json.loads((root/'artifacts/r4-shaders/uniform-layouts.json').read_text())
key='shader_57F6448DAC5BEB74.ucode.bin.vert.spv';layout=layouts[key]
source=bytearray(layout['sourceBytes']);members={m['name']:m for m in layout['members']}
used=set()
for stage,h in [('vert','57F6448DAC5BEB74'),('frag','AB008EF1D1A8CB6D')]:
 raw_code=(root/f'artifacts/r4-shaders/wgsl-repacked/shader_{h}.ucode.bin.{stage}.spv.wgsl').read_bytes()
 code=raw_code.decode('utf-8')
 used|=set(re.findall(r'xe_uniform_system_constants\.(\w+)',code))
 (out/f'{stage}.wgsl').write_bytes(raw_code)
mapping=[]
def setbytes(name,b,origin):
 m=members[name]
 if len(b)!=m['size']:raise ValueError((name,len(b),m['size']))
 source[m['sourceOffset']:m['sourceOffset']+len(b)]=b
 mapping.append({'name':name,'origin':origin,'sourceOffset':m['sourceOffset'],'gpuOffset':m['gpuOffset'],'bytes':len(b)})
for name in ['line_loop_closing_index','vertex_index_endian','vertex_index_min','vertex_index_max','texture_swizzled_signs','alpha_test_reference','color_exp_bias']:
 o=dxbc['offsets'][name];setbytes(name,native[o:o+members[name]['size']],'DXBC field '+name)
o=dxbc['offsets']['vertex_index_offset'];setbytes('vertex_base_index',native[o:o+4],'DXBC vertex_index_offset; shader no index loading')
f=struct.unpack_from('<I',native,dxbc['offsets']['flags'])[0]
flagmap=[(1,8),(2,9),(3,10),(4,11),(5,12),(6,15),(7,16),(8,17),(9,18),(10,19),(11,20),(12,21),(13,22)]
flags=sum(((f>>a)&1)<<b for a,b in flagmap)
if (f&1) or (r[0x2000]>>16)&3:raise ValueError('UAV/memexport or MSAA outside this replay')
setbytes('flags',struct.pack('<I',flags),'DXBC flags remapped by named definitions; no index load/MSAA/interlock')
ns=list(struct.unpack_from('<3f',native,dxbc['offsets']['ndc_scale']))
no=list(struct.unpack_from('<3f',native,dxbc['offsets']['ndc_offset']))
# This captured draw disables viewport XY transformation and clipping: SDK selects 8192 square.
if r[0x2206]&63 or abs(ns[0]-2/8192)>1e-10 or abs(ns[1]+2/8192)>1e-10:raise ValueError('Unexpected native viewport; do not guess')
width,height=1280,720
oldns=ns[:];oldno=no[:]
ns[0]*=8192/width;no[0]=(no[0]+1)*8192/width-1
ns[1]*=8192/height;no[1]=(no[1]-1)*8192/height+1
# Vulkan origin_bottom_left=true differs from native D3D12; Naga entry flips Y back for WGSL.
ns[1]*=-1;no[1]*=-1
setbytes('ndc_scale',struct.pack('<3f',*ns),'Equivalent 8192 native viewport -> target viewport, then SPIR-V Y convention')
setbytes('ndc_offset',struct.pack('<3f',*no),'Same mathematical viewport conversion including captured half pixel')
fetch=bytearray(regs[0x4800*4:(0x4800+192)*4]);swizzles=[0]*16;textures=[]
for t in validation['textures']:
 i=t['texture'];raw=(cap/f'texture-{i}.bin').read_bytes();fw=struct.unpack('<6I',(cap/f'texture-fetch-{i}.bin').read_bytes())
 if t['format']!=2 or t['endian']!=0:raise ValueError('Only measured k_8, endian-none supported')
 tight=b''.join(raw[y*t['pitchBytes']:y*t['pitchBytes']+t['width']] for y in range(t['height']))
 (out/f'texture-{i}.bin').write_bytes(tight)
 swizzles[i//2]|=t['swizzle']<<(12*(i%2))
 # Actual shader instructions use filter fetch constants; this snapshot uses clamp and linear.
 mag=(fw[3]>>19)&3;mini=(fw[3]>>21)&3;mip=(fw[3]>>23)&3
 clampx=(fw[0]>>10)&7;clampy=(fw[0]>>13)&7
 textures.append({**t,'bytes':len(tight),'magFilter':mag,'minFilter':mini,'mipFilter':mip,'clampX':clampx,'clampY':clampy})
setbytes('texture_swizzles',struct.pack('<16I',*swizzles),'Measured guest swizzle applied to r8 texture host layout in shader')
if used-set(m['name'] for m in mapping):raise ValueError('Consumed system fields not mapped: '+str(used-set(m['name'] for m in mapping)))
(out/'system-source.bin').write_bytes(source)
gpu=bytearray(layout['gpuBytes'])
for m in layout['members']:gpu[m['gpuOffset']:m['gpuOffset']+m['size']]=source[m['sourceOffset']:m['sourceOffset']+m['size']]
(out/'system-gpu.bin').write_bytes(gpu)
# Remap the only shader-consumed physical range to offset zero in a compact replay SSBO.
vertex_resource=next(v for v in validation['checks'] if v['name']=='vertices-95.bin-range')
original_fetch=struct.unpack_from('<I',fetch,95*8)[0]
struct.pack_into('<I',fetch,95*8,original_fetch&3)
(out/'fetch.bin').write_bytes(fetch);(out/'memory.bin').write_bytes((cap/'vertices-95.bin').read_bytes())
# Compact constant register map of this pixel microcode: c0,c1,c2,c3,c255, in ascending order.
pixel=b''.join(regs[(0x4000+4*(256+i))*4:(0x4000+4*(256+i)+4)*4] for i in [0,1,2,3,255])
(out/'float-pixel.bin').write_bytes(pixel)
(out/'bool-loop.bin').write_bytes(regs[0x4900*4:(0x4900+40)*4])
blend=r[0x2201];mask=r[0x2104]&15
# Field decoding reviewed against SDK; native blending becomes inert for opaque video samples.
manifest={'capture':str(run.relative_to(root)),'width':width,'height':height,'systemMap':mapping,
 'usedSystemFields':sorted(used),'zeroUnusedFields':sorted(set(members)-used),'nativeFlags':f,'spirvFlags':flags,
 'nativeNdcScale':oldns,'nativeNdcOffset':oldno,'wgslNdcScaleBeforeEntryYFlip':ns,'wgslNdcOffsetBeforeEntryYFlip':no,
 'vertexPhysicalRangeRemap':{'source':original_fetch&~3,'destination':0,'bytes':80},
 'textures':textures,'blendRegister':blend,'colorMask':mask,'rasterRegister':r[0x2205],'depthRegister':r[0x2200],
 'shaderHashes':{s:hashlib.sha256((out/f'{s}.wgsl').read_bytes()).hexdigest() for s in ['vert','frag']},
 'pixelFloatRegisters':[0,1,2,3,255]}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2));print(json.dumps({'textures':textures,'flags':flags,'colorMask':mask,'blendRegister':hex(blend)},indent=2))
