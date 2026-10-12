"""Independent CPU BC3 + bilinear reference for the captured full-screen quad.
Not a native-frame comparison: validates this isolated fixture's sampling only.
"""
import io
import json
import math
import struct
from pathlib import Path
from PIL import Image

root = Path('artifacts/r5-menu/isolated-draw-395')
m = json.loads((root/'manifest.json').read_text())
t = m['texture']
assert t['format'] == 'bc3-rgba-unorm'
header = [124,0x81007,t['height'],t['width'],len((root/'texture.bin').read_bytes()),0,1]+[0]*11
header += [32,4,int.from_bytes(b'DXT5','little'),0,0,0,0,0,0x1000,0,0,0,0]
assert len(header) == 31
texture = Image.open(io.BytesIO(b'DDS '+struct.pack('<31I',*header)+(root/'texture.bin').read_bytes())).convert('RGBA')
actual = Image.frombytes('RGBA',(1280,720),(root/'gpu-readback.rgba').read_bytes())
errors = []
samples = []
for y in range(13,720,29):
    for x in range(11,1280,37):
        # Original vertex shader maps (0,0)-(1280,720). Xenos half-pixel
        # correction puts the first pixel center exactly at UV 0, not UV .5/W.
        sx = x/1280*t['width'] + 0.0014648438 - 0.5
        sy = y/720*t['height'] + 0.0014648438 - 0.5
        ix,iy=math.floor(sx),math.floor(sy)
        dx,dy=sx-ix,sy-iy
        expected = []
        for channel in range(4):
            value = 0
            for ox,oy,weight in [(0,0,(1-dx)*(1-dy)),(1,0,dx*(1-dy)),(0,1,(1-dx)*dy),(1,1,dx*dy)]:
                pixel=texture.getpixel((max(0,min(t['width']-1,ix+ox)),max(0,min(t['height']-1,iy+oy))))
                value += pixel[channel]*weight
            expected.append(value)
        # Captured blend is src-alpha/one-minus-src-alpha on transparent target.
        alpha=expected[3]/255
        expected=[v*alpha for v in expected]
        got=actual.getpixel((x,y))
        delta=max(abs(got[i]-expected[i]) for i in range(4))
        errors.append(delta)
        if len(samples)<8:samples.append(dict(x=x,y=y,actual=got,expected=expected,error=delta))
report=dict(scope='Independent CPU decoder and bilinear reference, NOT native framebuffer equality',
            samples=len(errors),maxChannelError=max(errors),meanMaxChannelError=sum(errors)/len(errors),examples=samples)
report['ok']=report['maxChannelError']<=2
(root/'cpu-pixel-check.json').write_text(json.dumps(report,indent=2))
print(json.dumps({k:v for k,v in report.items() if k!='examples'}))
assert report['ok'], 'GPU pixels disagree with independent CPU reference'
