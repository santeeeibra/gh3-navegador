import ctypes,time,json
from pathlib import Path
from PIL import ImageGrab
u=ctypes.windll.user32
pid=17544
cb=ctypes.WINFUNCTYPE(ctypes.c_bool,ctypes.c_void_p,ctypes.c_void_p)
windows=[]
@cb
def enum(hwnd,_):
 p=ctypes.c_ulong();u.GetWindowThreadProcessId(ctypes.c_void_p(hwnd),ctypes.byref(p))
 if p.value==pid and u.IsWindowVisible(ctypes.c_void_p(hwnd)): windows.append(hwnd)
 return True
u.EnumWindows(enum,0)
if windows:
 h=windows[0];u.SetForegroundWindow(ctypes.c_void_p(h));u.SetCursorPos(1900,10);time.sleep(.6)
 ImageGrab.grab().save('D:/guitar hero/artifacts/d1-wasm/g1d/native-natural/desktop-observation.png')
 print('Desktop captured for checking obstruction, not yet accepted as evidence')
else: print('No visible native window')

