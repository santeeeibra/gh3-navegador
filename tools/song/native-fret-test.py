# Canción híbrida (Claude): prueba NATIVA corta para saber si GH3 toma los trastes del mando común durante la
# partida. Navega igual que r6-song-nativo3 (Enter/1) hasta Slow Ride y, ya en la partida, MANTIENE teclas
# (teclado del nativo = mando: 1-5 trastes A,B,Y,X,LB; flechas = cruceta) mientras saca capturas.
# Carpetas de usuario/caché/DLC aisladas; la carpeta del juego solo se lee (DLCs vacía se borra al final).
# Uso: py -3 -I tools/song/native-fret-test.py <etiqueta> [segundos=330]
import ctypes, json, shutil, subprocess, sys, time
from pathlib import Path
from PIL import ImageGrab

ROOT = Path(__file__).resolve().parents[2]
PB = ROOT / 'artifacts/xex-adapt/paso-b'
GAME = r'D:\Descargas\GH3LOR-XEX\GH3LOR-XEX\Guitar Hero 3 Legends of Rock'
label = sys.argv[1] if len(sys.argv) > 1 else 'fret-test'
secs = float(sys.argv[2]) if len(sys.argv) > 2 else 330
VK = {'enter': (0x0D, 0x1C), '1': (0x31, 0x02), '2': (0x32, 0x03), '3': (0x33, 0x04), '4': (0x34, 0x05), '5': (0x35, 0x06),
      'down': (0x28, 0x50), 'up': (0x26, 0x48), 'f': (0x46, 0x21)}
# (t, acción, teclas): tap = toque 0,25 s; down/up = mantener/soltar; shot = captura.
plan = [(140, 'tap', 'enter'), (170, 'tap', 'enter'), (191, 'tap', '1'), (199, 'tap', '1'), (203, 'tap', 'enter')]
plan += [(t, 'tap', '1') for t in range(212, 269, 8)]
# Un botón por vez (teclado del nativo: 1=A 2=B 3=Y 4=X 5=LB F=RB), captura con el botón apretado.
TESTS = [('1',), ('2',), ('3',), ('4',), ('5',), ('f',), ('1', '2')]
t = 316.0
for rep in range(3):
    for keys in TESTS:
        plan += [(t, 'down', k) for k in keys] + [(t + 0.8, 'shot', '+'.join(keys))] + [(t + 1.2, 'up', k) for k in keys]
        t += 1.8
plan.sort(key=lambda p: p[0])
OUT = ROOT / 'artifacts/song' / label
for d in ('user', 'cache', 'DLCs'):
    (OUT / d).mkdir(parents=True, exist_ok=True)
BIN = OUT / 'bin'; BIN.mkdir(exist_ok=True)
for name in ('gh3.exe', 'rexruntime.dll', 'rexgpu-xenos.dll', 'gh3recomp.toml'):
    shutil.copy2(PB / 'build/gh3' / name, BIN / name)
args = [str(BIN / 'gh3.exe'), f'--game_data_root={GAME}', f'--user_data_root={OUT / "user"}', f'--cache_root={OUT / "cache"}',
        f'--dlc_root={OUT / "DLCs"}', '--gpu_plugin=xenos', f'--log_file={OUT / "native.log"}', '--audio_mute=true']
t0 = time.time()
proc = subprocess.Popen(args, cwd=str(OUT))
u = ctypes.windll.user32
cb = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)

def window():
    found = []
    @cb
    def enum(hwnd, _):
        p = ctypes.c_ulong(); u.GetWindowThreadProcessId(ctypes.c_void_p(hwnd), ctypes.byref(p))
        if p.value == proc.pid and u.IsWindowVisible(ctypes.c_void_p(hwnd)): found.append(hwnd)
        return True
    u.EnumWindows(enum, 0)
    return found[0] if found else None

def focus():
    h = window()
    if not h: return False
    if u.GetForegroundWindow() == h: return True
    u.ShowWindow(ctypes.c_void_p(h), 9)
    u.keybd_event(0x12, 0, 0, 0); u.keybd_event(0x12, 0, 2, 0)
    u.SetForegroundWindow(ctypes.c_void_p(h)); time.sleep(0.2)
    return u.GetForegroundWindow() == h

events = []
while time.time() - t0 < secs and proc.poll() is None:
    t = time.time() - t0
    while plan and t >= plan[0][0]:
        _, act, k = plan.pop(0); ok = focus()
        if act == 'shot':
            name = f'screen-{t:.1f}s-{k}.png'; ImageGrab.grab().save(OUT / name); events.append({'t': round(t, 2), 'shot': name, 'focused': ok})
        else:
            vk, sc = VK[k]
            if act in ('tap', 'down'): u.keybd_event(vk, sc, 0, 0)
            if act == 'tap': time.sleep(0.25)
            if act in ('tap', 'up'): u.keybd_event(vk, sc, 2, 0)
            events.append({'t': round(t, 2), 'key': k, 'act': act, 'focused': ok})
        print(events[-1], flush=True)
    time.sleep(0.02)
for k in ('1', '2', '3', '4', '5', 'f', 'down'):
    vk, sc = VK[k]; u.keybd_event(vk, sc, 2, 0)  # no dejar teclas trabadas
alive = proc.poll() is None
if alive:
    h = window()
    if h: u.PostMessageW(ctypes.c_void_p(h), 0x0010, 0, 0)
    try: proc.wait(20)
    except subprocess.TimeoutExpired: pass
if proc.poll() is None:
    proc.terminate()
    try: proc.wait(10)
    except subprocess.TimeoutExpired: proc.kill()
dlc = Path(GAME) / 'DLCs'; dlcRemoved = False
if dlc.is_dir() and not any(dlc.iterdir()):
    dlc.rmdir(); dlcRemoved = True
(OUT / 'run.json').write_text(json.dumps({'seconds': secs, 'events': events, 'aliveAtEnd': alive, 'emptyDlcRemoved': dlcRemoved,
    'exitCode': proc.returncode, 'args': args[1:]}, indent=1), encoding='utf-8')
print('done', alive, proc.returncode)
