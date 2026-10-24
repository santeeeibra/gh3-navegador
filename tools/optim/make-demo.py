# Copia de prueba: demo base (enlaces duros) + wasm nuevo + tabla ASM_CONSTS del glue nuevo dentro del gh3-web.js de la demo.
# Uso: python tools/optim/make-demo.py <demo_base> <web_nuevo> <salida>
import os, re, shutil, sys
base, web, out = sys.argv[1:4]
if os.path.exists(out): shutil.rmtree(out)
shutil.copytree(base, out, copy_function=os.link)
grab = lambda s: re.search(r'var ASM_CONSTS = \{.*?\n\};', s, re.S)
new = grab(open(f'{web}/gh3-web.js', encoding='utf-8').read()).group(0)
os.remove(f'{out}/gh3-web.js'); s = open(f'{base}/gh3-web.js', encoding='utf-8').read(); m = grab(s)
open(f'{out}/gh3-web.js', 'w', encoding='utf-8').write(s[:m.start()] + new + s[m.end():])
os.remove(f'{out}/gh3-web.wasm'); shutil.copy(f'{web}/gh3-web.wasm', f'{out}/gh3-web.wasm')
print('demo', out)
