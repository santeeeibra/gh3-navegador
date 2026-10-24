import json,pathlib,struct,re
root=pathlib.Path(__file__).resolve().parents[2]
out=root/'artifacts/graphics-probe'
bmp=(out/'native/render-target.bmp').read_bytes()
offset=struct.unpack_from('<I',bmp,10)[0]
w,h=struct.unpack_from('<ii',bmp,18)
assert w==640 and abs(h)==480
pixels=bmp[offset:offset+w*abs(h)*4]
matching=sum(pixels[i:i+3]==bytes([160,96,32]) for i in range(0,len(pixels),4))
native_log=(out/'native/dx9-probe.log').read_text()
def value(text,stage):
 m=re.search(r'stage='+re.escape(stage)+r' result=0x([0-9A-F]+)',text)
 return int(m.group(1),16) if m else None
native={'renderTargetCapturedAndObserved':True,'width':w,'height':abs(h),'matchingRgbPixels':matching,'totalPixels':w*abs(h),'allPixelsCorrect':matching==w*abs(h),'renderElapsedMs':value(native_log,'render-elapsed-ms'),'frames':value(native_log,'final-frame-count'),'exitCode':value(native_log,'exit-code'),'desktopWindowCaptureVerified':False,'limitation':'CopyFromScreen and PrintWindow captured white; native visible presentation not established by those methods.'}
ev=json.loads((out/'bottleship/evidence.json').read_text())
logs=json.loads((out/'bottleship/runtime-logs.json').read_text())
text='\n'.join(x.get('message','') for x in logs)
stages=[]
for x in logs:
 s=x.get('message','')
 m=re.search(r'"(t=\d+ stage=.*?)\\r\\n',s)
 if m:stages.append(m.group(1))
import base64
response=json.loads((out/'bottleship/guest-log-response.json').read_text())
guest_log=base64.b64decode(response['content']).decode('utf8') if response.get('encoding')=='base64' else response.get('content','')
(out/'bottleship/dx9-probe.log').write_text(guest_log)
(out/'bottleship/dx9-probe-stages.log').write_text('\n'.join(x for x in text.splitlines() if 'stage=' in x)+'\n')
bs={'observedBlue':ev.get('blueObserved',False),'capturedBlueSamples':ev.get('blueFrames',0),'renderElapsedMs':value(text,'render-elapsed-ms'),'frames':value(text,'final-frame-count'),'exitCode':value(text,'exit-code'),'pageErrors':ev.get('pageErrors'), 'guestShot':ev.get('guestShot',False),'runtime':'Existing dist build served read-only on 127.0.0.1:5188; not Claude current Vite runtime'}
bs['passed']=bs['observedBlue'] and bs['exitCode']==0 and bs['renderElapsedMs']>=15000
summary={'native':native,'bottleship':bs,'bundle':json.loads((out/'bundle-evidence.json').read_text())}
(out/'verification.json').write_text(json.dumps(summary,indent=2))
print(json.dumps(summary,indent=2))

