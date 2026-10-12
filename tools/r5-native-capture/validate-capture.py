import sys,json,hashlib,struct
from pathlib import Path
root=Path(__file__).resolve().parents[2]
run=Path(sys.argv[1]);folder=run/'capture'
rows=[json.loads(s) for s in (folder/'events.jsonl').read_text().splitlines()]
meta=json.loads((run/'run.json').read_text())
errors=[r for r in rows if 'error' in r]
draws=[r for r in rows if r.get('draw')]
refs=[r for r in rows if r.get('reference')]
resources=[r for r in rows if 'resource' in r]
textures=[r for r in rows if 'texture' in r]
regs=(folder/'registers.bin').read_bytes()
checks=[]
def check(name,ok):checks.append({'name':name,'ok':bool(ok)})
check('oneSelectedDraw',len(draws)==1)
check('oneFullReference',len(refs)==1 and refs[0]['readbackMode']=='full')
check('noCaptureErrors',not errors)
check('fourVideoTextures',sorted(r['texture'] for r in textures)==[0,1,2,3])
check('registerBlockSize',len(regs)==0x5003*4)
check('binaryBudget',sum(p.stat().st_size for p in folder.glob('*.bin'))<=16*1024*1024)
for r in resources:
    check(r['resource']+'-size', (folder/r['resource']).stat().st_size==r['length'])
    check(r['resource']+'-range',r['address']+r['length']<=0x20000000)
    check(r['resource']+'-secondRead',r['immediateSecondReadEqual'])
for t in textures:
    i=t['texture']; raw=(folder/f'texture-fetch-{i}.bin').read_bytes()
    check(f'texture-{i}-registerMatch', raw==regs[(0x4800+i*6)*4:(0x4800+i*6+6)*4])
    w=struct.unpack('<6I',raw)
    width=(w[2]&8191)+1;height=((w[2]>>13)&8191)+1
    pitch=((w[0]>>22)&511)*32;pitch=(pitch+255)&~255
    address=((w[1]>>12)&0x1ffff)*4096
    r=next(r for r in resources if r['resource']==f'texture-{i}.bin')
    check(f'texture-{i}-decodedFields',width==t['width'] and height==t['height'] and pitch==t['pitchBytes'] and (w[1]&63)==t['format'] and ((w[1]>>6)&3)==t['endian'] and ((w[3]>>1)&4095)==t['swizzle'] and address==r['address'])
    check(f'texture-{i}-extent',r['length']==pitch*(height-1)+width)
shader_matches=[]
for stage,h,ext in [('vs','57F6448DAC5BEB74','vert'),('ps','AB008EF1D1A8CB6D','frag')]:
    raw=(folder/f'{stage}.ucode.bin').read_bytes()
    candidates=list((root/'artifacts/g0').rglob(f'shader_{h}.ucode.bin.{ext}'))
    matches=[]
    reversed_words=b''.join(raw[i:i+4][::-1] for i in range(0,len(raw),4))
    for p in candidates:
        b=p.read_bytes()
        if b==raw:matches.append({'path':str(p.relative_to(root)),'wordByteOrder':'same'})
        elif b==reversed_words:matches.append({'path':str(p.relative_to(root)),'wordByteOrder':'reversed32'})
    check(stage+'-matchesG0Microcode',bool(matches))
    shader_matches.append({'stage':stage,'matches':matches})
check('baselineUnchanged',meta['baselineUnchanged'])
check('gameFileSizesAndTimesUnchanged',meta['gameFilesMetadataUnchanged'])
check('runExitZero',meta['exitCode']==0)
check('manifestHashes',all(hashlib.sha256((folder/k).read_bytes()).hexdigest()==v['sha256'] for k,v in meta['captureFiles'].items()))
result={'checks':checks,'passed':sum(c['ok'] for c in checks),'total':len(checks),'draw':draws,'reference':refs,'textures':textures,'shaderMatches':shader_matches,'errors':errors,'limitations':['Immediate second reads are not a global atomic snapshot or proof of GPU texture cache coherence','Native resolve remains guest encoded; no decoded pixel comparison performed','DXBC system constants layout is not SPIR-V layout','Additional draws before resolve must be considered when identifying reference']}
(run/'validation.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
if not all(c['ok'] for c in checks):sys.exit(1)
