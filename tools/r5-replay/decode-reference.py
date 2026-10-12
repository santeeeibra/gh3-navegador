# Tile addressing adapted from rexglue/Xenia texture util.cpp, BSD-3-Clause.
# See LICENSE.rexglue.txt. No guessed endian or format.
import json,struct,sys,hashlib
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[2]
run=root/(sys.argv[1] if len(sys.argv)>1 else 'artifacts/r5-native-capture/run4')
p=run/'capture';out=root/'artifacts/r5-replay/data';out.mkdir(exist_ok=True)
r=struct.unpack('<20483I',(p/'resolve-registers.bin').read_bytes())
raw=(p/'native-resolve.bin').read_bytes()
info=r[0x231b];pitch=r[0x231a]&16383;height=(r[0x231a]>>16)&16383
endian=info&7;fmt=(info>>7)&63;swap=(info>>24)&1
if endian!=0 or fmt!=6 or (info&8) or pitch!=1280 or height!=720:raise ValueError('Unimplemented resolve state, no guessing')
# Decode the measured packed RGBA32 tiled layout; inverse copy_dest_swap yields pre-resolve RGB.
def offset(x,y):
 macro=((x>>5)+(y>>5)*(pitch>>5))<<9
 micro=((x&7)+((y&14)<<2))<<2
 z=macro+((micro&~15)<<1)+(micro&15)+((y&1)<<4)
 return ((z&~511)<<3)+((y&16)<<7)+((z&448)<<2)+(((((y&8)>>2)+(x>>3))&3)<<6)+(z&63)
rgba=bytearray(pitch*height*4);addresses=set()
for y in range(height):
 for x in range(pitch):
  a=offset(x,y)
  if a+4>len(raw) or a in addresses:raise ValueError('Tile address outside captured resolve or overlapping')
  addresses.add(a);dest=(y*pitch+x)*4;pixel=raw[a:a+4]
  rgba[dest:dest+4]=bytes((pixel[2],pixel[1],pixel[0],pixel[3])) if swap else pixel
(out/'native-rgba.bin').write_bytes(rgba)
Image.frombytes('RGBA',(pitch,height),bytes(rgba)).save(root/'artifacts/r5-replay/native-reference.png')
report={'source':str(p.relative_to(root)),'width':pitch,'height':height,'format':fmt,'endian':endian,'inverseCopyDestSwap':swap,'uniqueMappedPixels':len(addresses),'rangeMax':max(addresses)+4,'sourceBytes':len(raw),'rgbaSha256':hashlib.sha256(rgba).hexdigest(),'distinctRGBA':len(set(struct.iter_unpack('<I',rgba))),'alphaRange':[min(rgba[3::4]),max(rgba[3::4])]}
(root/'artifacts/r5-replay/reference-decode.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
