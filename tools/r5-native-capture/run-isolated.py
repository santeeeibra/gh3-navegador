import os, json, time, shutil, subprocess, ctypes, hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[2]
out=root/'artifacts/r5-native-capture'/('run'+(os.environ.get('R5_RUN_SUFFIX','')))
out.mkdir(exist_ok=True)
base=root/'artifacts/xex-adapt/paso-b/build/gh3'
files=[base/x for x in ('gh3.exe','rexruntime.dll','rexgpu-xenos.dll','gh3recomp.toml')]
source=root/'artifacts/xex-adapt/paso-b/src/rexglue-sdk-090/src/graphics/d3d12/command_processor.cpp'
files+=[source,root/'artifacts/xex-adapt/paso-b/build/gh3/rexglue-sdk/src/graphics/CMakeFiles/rexgpu-xenos.dir/d3d12/command_processor.cpp.obj']
def hashes(): return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
before=hashes()
for x in ('bin','capture','user','cache','DLCs'): (out/x).mkdir(exist_ok=True)
if (out/'capture/events.jsonl').exists(): raise SystemExit('Refusing to overwrite previous capture')
for p in files[:4]: shutil.copy2(p,out/'bin'/p.name)
shutil.copy2(root/'artifacts/r5-native-capture/rexgpu-xenos.dll',out/'bin/rexgpu-xenos.dll')
game=Path(r'D:\Descargas\GH3LOR-XEX\GH3LOR-XEX\Guitar Hero 3 Legends of Rock')
def inventory():
    return {str(p.relative_to(game)):[p.stat().st_size,p.stat().st_mtime_ns] for p in game.rglob('*') if p.is_file()}
game_before=inventory()
args=[str(out/'bin/gh3.exe'),f'--game_data_root={game}',f'--user_data_root={out/"user"}',f'--cache_root={out/"cache"}',f'--dlc_root={out/"DLCs"}','--gpu_plugin=xenos',f'--log_file={out/"native.log"}','--audio_mute=true']
env=os.environ.copy();env['GH3_R5_CAPTURE_DIR']=str(out/'capture')
t=time.monotonic();p=subprocess.Popen(args,cwd=out,env=env)
u=ctypes.windll.user32
cb=ctypes.WINFUNCTYPE(ctypes.c_bool,ctypes.c_void_p,ctypes.c_void_p)
focused=False
presses=[140,170]
key_events=[]
@cb
def focus(h,_):
    pid=ctypes.c_ulong();u.GetWindowThreadProcessId(ctypes.c_void_p(h),ctypes.byref(pid))
    if pid.value==p.pid and u.IsWindowVisible(ctypes.c_void_p(h)):
        u.SetForegroundWindow(ctypes.c_void_p(h))
    return True
try:
    while p.poll() is None and time.monotonic()-t<float(os.environ.get("R5_SECONDS","220")):
        if (out/'capture/complete.txt').exists(): time.sleep(2);break
        if not focused and time.monotonic()-t>3:
            u.EnumWindows(focus,0);focused=True
        if presses and time.monotonic()-t>=presses[0]:
            u.EnumWindows(focus,0)
            # START, only while this test process owns the foreground window.
            h=u.GetForegroundWindow();pid=ctypes.c_ulong()
            u.GetWindowThreadProcessId(ctypes.c_void_p(h),ctypes.byref(pid))
            if pid.value==p.pid:
                u.keybd_event(0x0D,0x1C,0,0);time.sleep(.2);u.keybd_event(0x0D,0x1C,2,0)
                key_events.append({'seconds':time.monotonic()-t,'key':'START'})
            presses.pop(0)
        time.sleep(.2)
finally:
    u=ctypes.windll.user32
    cb=ctypes.WINFUNCTYPE(ctypes.c_bool,ctypes.c_void_p,ctypes.c_void_p)
    @cb
    def close(h,_):
        pid=ctypes.c_ulong();u.GetWindowThreadProcessId(ctypes.c_void_p(h),ctypes.byref(pid))
        if pid.value==p.pid: u.PostMessageW(ctypes.c_void_p(h),0x0010,0,0)
        return True
    if p.poll() is None: u.EnumWindows(close,0)
    try:p.wait(15)
    except subprocess.TimeoutExpired:
        p.terminate()
        try:p.wait(5)
        except subprocess.TimeoutExpired:p.kill();p.wait()
after=hashes()
result={'keyEvents':key_events,'exitCode':p.returncode,'seconds':time.monotonic()-t,'captureComplete':(out/'capture/complete.txt').exists(),'baselineHashesBefore':before,'baselineHashesAfter':after,'baselineUnchanged':before==after,'gameFilesMetadataUnchanged':game_before==inventory(),'captureFiles':{q.name:{'bytes':q.stat().st_size,'sha256':hashlib.sha256(q.read_bytes()).hexdigest()} for q in (out/'capture').glob('*') if q.is_file()}}
(out/'run.json').write_text(json.dumps(result,indent=2))
print(json.dumps({k:result[k] for k in ('exitCode','seconds','captureComplete','baselineUnchanged','gameFilesMetadataUnchanged')},indent=2))
