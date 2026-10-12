"""Read-only sampling of native per-swap performance counters. No debugger or injection.
The native window is visible; run ONLY after explicit user authorization.
"""
import ctypes, hashlib, json, re, shutil, struct, subprocess, time
from pathlib import Path
root=Path(__file__).resolve().parents[2]
out=root/'artifacts/d1-wasm/g1/native'
out.mkdir(parents=True,exist_ok=True)
src=root/'artifacts/xex-adapt/paso-b/build/gh3'
bindir=out/'bin'; bindir.mkdir(exist_ok=True)
for name in ['gh3.exe','rexruntime.dll','rexgpu-xenos.dll','gh3recomp.toml']:
 shutil.copy2(src/name,bindir/name)
game=Path(r'D:/Descargas/GH3LOR-XEX/GH3LOR-XEX/Guitar Hero 3 Legends of Rock')
view=out/'game-view'; view.mkdir(exist_ok=True)
shutil.copy2(game/'default.xex',view/'default.xex')
# Full isolated local data copy: never follow a junction into the original.
link=view/'DATA'
if link.is_junction() or link.is_symlink():
 raise RuntimeError('DATA view must be an isolated copy, never a link')
shutil.copytree(game/'DATA',link,dirs_exist_ok=True)
for name in ['user','cache','DLCs','mods']:(out/name).mkdir(exist_ok=True)
config=(bindir/'gh3recomp.toml').read_text(encoding='utf-8')
config=re.sub(r'^mods_root\s*=.*$',f"mods_root = '{(out/'mods').as_posix()}'",config,flags=re.M)
(bindir/'gh3recomp.toml').write_text(config,encoding='utf-8')
dll=bindir/'rexruntime.dll'
# Discover the snapshot storage from the existing GetSnapshotCounter export.
objdump=root/'toolchain/emsdk/upstream/bin/llvm-objdump.exe'
exports=subprocess.check_output([str(objdump),'-p',str(dll)],text=True)
rva=int(re.search(r'0x([0-9a-f]+)\s+\?GetSnapshotCounter@',exports)[1],16)
binary=dll.read_bytes(); pe=struct.unpack_from('<I',binary,0x3c)[0]
imagebase=struct.unpack_from('<Q',binary,pe+24+24)[0]
disasm=subprocess.check_output([str(objdump),'-d',f'--start-address={imagebase+rva}',f'--stop-address={imagebase+rva+32}',str(dll)],text=True)
snapshot_va=int(re.search(r'lea[q]?\s+.*#\s+0x([0-9a-f]+)',disasm)[1],16)
snapshot_rva=snapshot_va-imagebase
(out/'counter-disassembly.txt').write_text(disasm)
args=[str(bindir/'gh3.exe'),f'--game_data_root={view}',f'--user_data_root={out/"user"}',f'--cache_root={out/"cache"}',f'--dlc_root={out/"DLCs"}','--gpu_plugin=xenos',f'--log_file={out/"native.log"}','--log_level=info']
proc=subprocess.Popen(args,cwd=out)
k=ctypes.WinDLL('kernel32',use_last_error=True)
k.OpenProcess.argtypes=[ctypes.c_ulong,ctypes.c_bool,ctypes.c_ulong];k.OpenProcess.restype=ctypes.c_void_p
k.ReadProcessMemory.argtypes=[ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p,ctypes.c_size_t,ctypes.POINTER(ctypes.c_size_t)]
k.CloseHandle.argtypes=[ctypes.c_void_p]
handle=k.OpenProcess(0x1010,False,proc.pid)
assert handle,ctypes.get_last_error()
base=None
start=time.perf_counter()
try:
 for attempt in range(30):
  query=f"(Get-Process -Id {proc.pid}).Modules | Where-Object ModuleName -eq 'rexruntime.dll' | ForEach-Object {{ $_.BaseAddress.ToInt64() }}"
  text=subprocess.check_output(['powershell','-NoProfile','-Command',query],text=True).strip()
  if text:base=int(text);break
  time.sleep(.1)
 assert base,'native module not loaded'
 samples=[]
 while time.perf_counter()-start<35 and proc.poll() is None:
  buf=ctypes.create_string_buffer(17*8);n=ctypes.c_size_t()
  if not k.ReadProcessMemory(handle,base+snapshot_rva,buf,len(buf),ctypes.byref(n)):
   raise OSError(ctypes.get_last_error())
  values=struct.unpack('<17q',buf.raw)
  samples.append({'t':time.perf_counter()-start,'frameTimeUs':values[0],'fpsSnapshot':values[1],'drawsPerFrame':values[2],'xmaFrames':values[5],'activeThreads':values[10]})
  time.sleep(.1)
 result={'method':'ReadProcessMemory only, native common PM4 per-swap snapshot. 10 Hz sampling, not exact cumulative swaps/s.', 'seconds':time.perf_counter()-start,'pid':proc.pid,'snapshotRva':snapshot_rva,'dllSha256':hashlib.sha256(binary).hexdigest(),'samples':samples}
 valid=[s['frameTimeUs'] for s in samples if s['t']>=10 and s['frameTimeUs']>0]
 result['sampledSwapRateEstimate']=1e6/(sum(valid)/len(valid)) if valid else None
 (out/'native.json').write_text(json.dumps(result,indent=2))
 print(json.dumps({k:v for k,v in result.items() if k!='samples'}))
finally:
 k.CloseHandle(handle)
 # Close only the test process we created; leave other games untouched.
 if proc.poll() is None:
  u=ctypes.WinDLL('user32');callback=ctypes.WINFUNCTYPE(ctypes.c_bool,ctypes.c_void_p,ctypes.c_void_p)
  @callback
  def close(hwnd,param):
   pid=ctypes.c_ulong();u.GetWindowThreadProcessId(ctypes.c_void_p(hwnd),ctypes.byref(pid))
   if pid.value==proc.pid:u.PostMessageW(ctypes.c_void_p(hwnd),0x10,0,0)
   return True
  u.EnumWindows(close,0)
  try:proc.wait(timeout=8)
  except subprocess.TimeoutExpired:proc.terminate();proc.wait(timeout=8)
