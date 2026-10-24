import difflib
from pathlib import Path
r=Path('D:/guitar hero');s=r/'artifacts/xex-adapt/paso-b/src/rexglue-sdk-090';rt=r/'artifacts/d1-wasm/rtsrc'
for rel in ['system/xthread.cpp','graphics/command_processor.cpp']:
 a=s/'src'/rel;b=rt/'src.orig'/rel
 print(rel,'SDK mtime',a.stat().st_mtime,'backup mtime',b.stat().st_mtime)
 print(''.join(difflib.unified_diff(b.read_text().splitlines(True),a.read_text().splitlines(True),fromfile='historical backup',tofile='current SDK'))[:6500])
