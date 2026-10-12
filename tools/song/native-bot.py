# Canción híbrida (Claude): referencia NATIVA del robot. Corre el GH3 nativo (con imagen), navega a Slow Ride
# y toca las notas Medium guiado por el reloj de la canción leído de la memoria del proceso (base 0x100000000 +
# 0x829B57B0, float BE ms). Teclado/mouse del nativo = mando: verde LT (clic derecho), rojo LB (5), amarillo RB (F),
# azul RT (clic izquierdo), naranja A (1); rasgueo cruceta abajo (flecha). Al perder aprieta 1 (Reintentar).
# Uso: py -3 tools/song/native-bot.py <etiqueta> <notas.json> [segundos=520] [rasgueo=down|up]
import ctypes, json, shutil, struct, subprocess, sys, time
from pathlib import Path
from PIL import ImageGrab

ROOT = Path(__file__).resolve().parents[2]
PB = ROOT / 'artifacts/xex-adapt/paso-b'
GAME = r'D:\Descargas\GH3LOR-XEX\GH3LOR-XEX\Guitar Hero 3 Legends of Rock'
label, notes_path = sys.argv[1], sys.argv[2]
secs = float(sys.argv[3]) if len(sys.argv) > 3 else 520
strum_key = sys.argv[4] if len(sys.argv) > 4 else 'down'
LEADS = [float(x) for x in (sys.argv[5] if len(sys.argv) > 5 else '0').split(',')]  # adelanto (ms) por intento
notes = json.loads(Path(notes_path).read_text())
VK = {'enter': (0x0D, 0x1C), '1': (0x31, 0x02), '5': (0x35, 0x06), 'f': (0x46, 0x21), 'down': (0x28, 0x50), 'up': (0x26, 0x48)}
OUT = ROOT / 'artifacts/song' / label
for d in ('user', 'cache', 'DLCs'):
    (OUT / d).mkdir(parents=True, exist_ok=True)
BIN = OUT / 'bin'; BIN.mkdir(exist_ok=True)
for name in ('gh3.exe', 'rexruntime.dll', 'rexgpu-xenos.dll', 'gh3recomp.toml'):
    shutil.copy2(PB / 'build/gh3' / name, BIN / name)
args = [str(BIN / 'gh3.exe'), f'--game_data_root={GAME}', f'--user_data_root={OUT / "user"}', f'--cache_root={OUT / "cache"}',
        f'--dlc_root={OUT / "DLCs"}', '--gpu_plugin=xenos', f'--log_file={OUT / "native.log"}', '--audio_mute=true']
ctypes.windll.winmm.timeBeginPeriod(1)
t0 = time.time()
proc = subprocess.Popen(args, cwd=str(OUT))
u, k32 = ctypes.windll.user32, ctypes.windll.kernel32
hproc = k32.OpenProcess(0x0010 | 0x0400, False, proc.pid)  # VM_READ | QUERY_INFORMATION
cb = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)

def read(addr, n):
    buf = ctypes.create_string_buffer(n); got = ctypes.c_size_t()
    ok = k32.ReadProcessMemory(hproc, ctypes.c_void_p(addr), buf, n, ctypes.byref(got))
    return buf.raw if ok and got.value == n else None

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
    u.ShowWindow(ctypes.c_void_p(h), 9); u.keybd_event(0x12, 0, 0, 0); u.keybd_event(0x12, 0, 2, 0)
    u.SetForegroundWindow(ctypes.c_void_p(h)); time.sleep(0.2)
    return u.GetForegroundWindow() == h

def key(k, down):
    vk, sc = VK[k]; u.keybd_event(vk, sc, 0 if down else 2, 0)

def mouse(btn, down):  # 'l' o 'r'
    u.mouse_event({('l', True): 0x0002, ('l', False): 0x0004, ('r', True): 0x0008, ('r', False): 0x0010}[(btn, down)], 0, 0, 0, 0)

def tap(k):
    key(k, True); time.sleep(0.25); key(k, False)

nav = [(140, 'enter'), (170, 'enter'), (191, '1'), (199, '1'), (203, 'enter')] + [(t, '1') for t in range(212, 269, 8)]
events, attempts = [], []
# Base de la memoria guest: la primera 1<<n que tenga la cabecera MZ del XEX en 0x82000000.
base = None
held = set()
def set_frets(mask):
    want = {i for i in range(5) if mask & (1 << i)}
    for i in range(5):
        on = i in want
        if on == (i in held): continue
        if i == 0: mouse('r', on)
        elif i == 1: key('5', on)
        elif i == 2: key('f', on)
        elif i == 3: mouse('l', on)
        else: key('1', on)
        (held.add if on else held.discard)(i)

i = 0; prev = None; frozen_since = time.time(); next_a = 0; strum_until = 0; shots_done = set()
while time.time() - t0 < secs and proc.poll() is None:
    t = time.time() - t0
    if nav and t >= nav[0][0]:
        focus(); tap(nav[0][1]); events.append({'t': round(t, 2), 'nav': nav[0][1]}); nav.pop(0); continue
    if base is None:
        for n in range(32, 40):
            if read((1 << n) + 0x82000000, 2) == b'MZ': base = 1 << n; events.append({'t': round(t, 2), 'base': hex(base)}); print('base', hex(base), flush=True); break
        time.sleep(0.5); continue
    raw = read(base + 0x829B57B0, 4)
    if raw is None: time.sleep(0.01); continue
    now = struct.unpack('>f', raw)[0]
    pn = time.time()
    if prev is not None and now < prev - 1000:
        attempts.append({'start_t': round(t, 1), 'lead': LEADS[len(attempts) % len(LEADS)], 'max': -1e9, 'strums': 0}); i = 0; set_frets(0)
        print('intento', len(attempts), flush=True)
    if prev is None or now != prev: frozen_since = pn
    prev = now
    if attempts and now > attempts[-1]['max']: attempts[-1]['max'] = now
    if now > 5000 and pn - frozen_since > 2.5 and pn > next_a:  # perdió: Reintentar
        next_a = pn + 3; set_frets(0); focus(); tap('1'); continue
    if attempts and now != 0:
        sec = int(now / 1000)
        if sec in (12, 22, 35, 50) and (len(attempts), sec) not in shots_done:
            shots_done.add((len(attempts), sec)); ImageGrab.grab().save(OUT / f'shot-a{len(attempts)}-{sec}s.png')
        now += attempts[-1]['lead']
        while i < len(notes) and notes[i]['t'] < now - 150: i += 1
        if i < len(notes):
            n = notes[i]
            if now >= n['t'] - 70: set_frets(n['mask'] & 31)
            if now >= n['t']:
                key(strum_key, True); strum_until = pn + 0.03; attempts[-1]['strums'] += 1; i += 1
    if strum_until and pn >= strum_until: key(strum_key, False); strum_until = 0
    time.sleep(0.001)
set_frets(0)
for kk in VK: key(kk, False)
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
(OUT / 'run.json').write_text(json.dumps({'attempts': attempts, 'events': events, 'strum': strum_key, 'emptyDlcRemoved': dlcRemoved, 'exitCode': proc.returncode}, indent=1), encoding='utf-8')
print('done', json.dumps([[a['start_t'], a['lead'], round(a['max'] / 1000, 1), a['strums']] for a in attempts]))
