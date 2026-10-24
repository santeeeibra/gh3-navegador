# Generate a standalone offset helper build from the existing native compile configuration.
import json
from pathlib import Path
root=Path(__file__).resolve().parents[2];out=root/'artifacts/r5-replay'
entries=json.loads((root/'artifacts/r5-native-capture/compile-database.json').read_text())
e=next(e for e in entries if e['file'].replace('\\','/').endswith('/src/graphics/d3d12/command_processor.cpp'))
c=e['command'];c=c[:c.index(' -MD ')];c=c.replace('-Drexgpu_xenos_EXPORTS','').replace('-D_DLL -D_MT -Xclang --dependent-lib=msvcrt','')
c+=' --ld-path="'+str(root/'artifacts/xex-adapt/paso-b/toolbin/lld-link.exe')+'" "'+str(root/'tools/r5-replay/dxbc-offsets.cpp')+'" -o "'+str(out/'dxbc-offsets.exe')+'"'
bat='@echo off\ncall "D:\\Archivos de programa\\ProductoVisualStudio2026\\VC\\Auxiliary\\Build\\vcvars64.bat" >nul\n'+c+'\nif errorlevel 1 exit /b 1\n"'+str(out/'dxbc-offsets.exe')+'" > "'+str(out/'dxbc-offsets.json')+'"\n'
(out/'build-offsets.cmd').write_text(bat)
