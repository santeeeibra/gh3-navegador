"""Separate BC decoding differences from original-shader sampling differences.

The hardware-decoded comparison is diagnostic, not an independent reference.
"""
import array
import io
import json
import math
import struct
from pathlib import Path
from PIL import Image

root = Path('artifacts/r5-menu/isolated-draw-395')
t = json.loads((root/'manifest.json').read_text())['texture']
w,h=t['width'],t['height']
raw=(root/'texture.bin').read_bytes()
header=[124,0x81007,h,w,len(raw),0,1]+[0]*11
header += [32,4,int.from_bytes(b'DXT5','little'),0,0,0,0,0,0x1000,0,0,0,0]
cpu=Image.open(io.BytesIO(b'DDS '+struct.pack('<31I',*header)+raw)).convert('RGBA')
gpu=array.array('f');gpu.frombytes((root/'gpu-decoded.f32').read_bytes())
assert len(gpu)==w*h*4
actual=Image.frombytes('RGBA',(1280,720),(root/'gpu-readback.rgba').read_bytes())
decoder_errors=[abs(gpu[i]*255-v) for i,v in enumerate(cpu.tobytes())]
sampling=[]
for y in range(13,720,29):
    for x in range(11,1280,37):
        sx=x/1280*w+0.0014648438-0.5
        sy=y/720*h+0.0014648438-0.5
        ix,iy=math.floor(sx),math.floor(sy);dx,dy=sx-ix,sy-iy
        expected=[]
        for channel in range(4):
            value=0
            for ox,oy,weight in [(0,0,(1-dx)*(1-dy)),(1,0,dx*(1-dy)),(0,1,(1-dx)*dy),(1,1,dx*dy)]:
                xx=max(0,min(w-1,ix+ox));yy=max(0,min(h-1,iy+oy))
                value+=gpu[(yy*w+xx)*4+channel]*255*weight
            expected.append(value)
        expected=[v*expected[3]/255 for v in expected]
        got=actual.getpixel((x,y))
        sampling.append(dict(x=x,y=y,actual=got,expected=expected,error=max(abs(got[i]-expected[i]) for i in range(4))))
report=dict(scope='Diagnostic: hardware BC decoding versus Pillow; sampling uses hardware decoded texels',
 decoder=dict(maxError=max(decoder_errors),meanError=sum(decoder_errors)/len(decoder_errors)),
 sampling=dict(samples=len(sampling),maxError=max(s['error'] for s in sampling),meanError=sum(s['error'] for s in sampling)/len(sampling),worst=sorted(sampling,key=lambda s:s['error'],reverse=True)[:8]))
report['samplingOk']=report['sampling']['maxError']<=1
report['nativeEqualityCertified']=False
(root/'decoder-diagnostic.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
assert report['samplingOk'], 'Sampling disagrees even using hardware-decoded texels'
