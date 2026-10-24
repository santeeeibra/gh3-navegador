# G0: corre el GH3 nativo (recomp, GPU xenos) con volcado de shaders y pulsa START (Enter) en la
# pantalla de título. Datos de usuario/caché/DLC en una carpeta aislada; la carpeta del juego solo se lee.
# Uso: python -I tools/g0/run-native-g0.py <segundos> <t:tecla,...> <etiqueta> [trace]
#   tecla: enter (START), 1 (verde/A), 2 (rojo/B), down, up, left, right. Solo "140" = enter.
import ctypes, json, os, re, shutil, subprocess, sys, time
from pathlib import Path
from PIL import ImageGrab

ROOT = Path(__file__).resolve().parents[2]
PB = ROOT / 'artifacts/xex-adapt/paso-b'
GAME = r'D:\Descargas\GH3LOR-XEX\GH3LOR-XEX\Guitar Hero 3 Legends of Rock'
secs = float(sys.argv[1]) if len(sys.argv) > 1 else 185
KEYS = {'enter': (0x0D, 0x1C), '1': (0x31, 0x02), '2': (0x32, 0x03), 'down': (0x28, 0x50), 'up': (0x26, 0x48), 'left': (0x25, 0x4B), 'right': (0x27, 0x4D)}
presses = []
for item in (sys.argv[2].split(',') if len(sys.argv) > 2 and sys.argv[2] != '-' else []):
    t, _, k = item.partition(':')
    presses.append((float(t), k or 'enter'))
label = sys.argv[3] if len(sys.argv) > 3 else 'g0-native'
OUT = ROOT / 'artifacts/g0' / label
for d in ('user', 'cache', 'DLCs', 'shaders'):
    (OUT / d).mkdir(parents=True, exist_ok=True)

# Binarios copiados a una carpeta aislada para poder ajustar el .toml (nivel de log) sin tocar el build.
BIN = OUT / 'bin'; BIN.mkdir(exist_ok=True)
for name in ('gh3.exe', 'rexruntime.dll', 'rexgpu-xenos.dll', 'gh3recomp.toml'):
    shutil.copy2(PB / 'build/gh3' / name, BIN / name)
TRACE = len(sys.argv) > 4 and sys.argv[4] == 'trace'
if TRACE:
    cfg = (BIN / 'gh3recomp.toml').read_text(encoding='utf-8')
    (BIN / 'gh3recomp.toml').write_text(re.sub(r'^log_level\s*=.*$', 'log_level = "trace"', cfg, flags=re.M), encoding='utf-8')
args = [str(BIN / 'gh3.exe'), f'--game_data_root={GAME}', f'--user_data_root={OUT / "user"}',
        f'--cache_root={OUT / "cache"}', f'--dlc_root={OUT / "DLCs"}', '--gpu_plugin=xenos',
        f'--log_file={OUT / "native.log"}'] + ([] if os.environ.get('G0_AUDIO') == '1' else [f'--dump_shaders={OUT / "shaders"}', '--audio_mute=true']) + (['--log_level=trace', '--log_noisy=true'] if TRACE else [])
# R6: G0_AUDIO=1 deja el audio encendido y sin volcado de shaders (con G1_AUDIO_WAV=<ruta> graba WAV).
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
    u.ShowWindow(ctypes.c_void_p(h), 9)
    # Truco habitual para que Windows permita traer la ventana al frente: tocar Alt antes.
    u.keybd_event(0x12, 0, 0, 0); u.keybd_event(0x12, 0, 2, 0)
    u.SetForegroundWindow(ctypes.c_void_p(h)); time.sleep(0.4)
    return u.GetForegroundWindow() == h

def shot(name):
    if focus():
        u.SetCursorPos(1900, 10); time.sleep(0.4)
        ImageGrab.grab().save(OUT / name)
        return True
    return False

events = []
pending = sorted(presses)
shots = sorted(set([p + 12 for p, _ in presses] + [p - 2 for p, _ in presses]))
while time.time() - t0 < secs and proc.poll() is None:
    t = time.time() - t0
    if pending and t >= pending[0][0]:
        ok = focus()
        vk, sc = KEYS[pending[0][1]]
        ext = 1 if pending[0][1] in ("down", "up", "left", "right") else 0  # flechas = teclas extendidas
        u.keybd_event(vk, sc, ext, 0); time.sleep(0.25); u.keybd_event(vk, sc, 2 | ext, 0)
        events.append({'t': round(t, 2), 'event': 'key', 'key': pending[0][1], 'focused': ok}); print('key', pending[0][1], t, ok, flush=True)
        pending.pop(0)
    if shots and t >= shots[0]:
        name = f'screen-{int(shots[0])}s.png'
        events.append({'t': round(t, 2), 'event': 'screenshot', 'file': name, 'ok': shot(name)})
        print('shot', name, flush=True); shots.pop(0)
    time.sleep(0.1)
alive = proc.poll() is None
if alive:
    # Cierre ordenado (WM_CLOSE) para que el log se escriba completo; si no cierra, se termina.
    h = window()
    if h: u.PostMessageW(ctypes.c_void_p(h), 0x0010, 0, 0)
    try: proc.wait(20)
    except subprocess.TimeoutExpired: pass
if proc.poll() is None:
    proc.terminate()
    try: proc.wait(10)
    except subprocess.TimeoutExpired: proc.kill()
# El ejecutable crea una carpeta DLCs vacía dentro de la carpeta del juego; se quita SOLO si está vacía.
dlc = Path(GAME) / 'DLCs'
dlcRemoved = False
if dlc.is_dir() and not any(dlc.iterdir()):
    dlc.rmdir(); dlcRemoved = True
(OUT / 'run.json').write_text(json.dumps({'seconds': secs, 'presses': presses, 'events': events,
    'aliveAtEnd': alive, 'emptyDlcRemoved': dlcRemoved, 'exitCode': proc.returncode, 'args': args[1:]}, indent=1), encoding='utf-8')
print('done', alive, proc.returncode)
