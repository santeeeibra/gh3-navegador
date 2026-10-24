"""Reuse the verified R4 structural normalizer and uniform repacker, isolated outputs."""
import sys, json, hashlib
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'tools/r4-shaders'))
from importlib import import_module
normalize = import_module('normalize-spirv').normalize
repack = import_module('repack-spirv').repack
folder = ROOT / 'artifacts/r5-menu/shader-probe'
results = []
for source in sorted((folder / 'raw').glob('*.spv')):
    try:
        normalized, normal_info = normalize(source.read_bytes())
        binary, layout = repack(normalized)
        destination = folder / 'repacked' / source.name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(binary)
        results.append(dict(name=source.name, ok=True, normalization=normal_info,
                            layout=layout, sha256=hashlib.sha256(binary).hexdigest()))
    except Exception as error:
        results.append(dict(name=source.name, ok=False, error=str(error)))
(folder / 'repack.json').write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps(dict(total=len(results), repacked=sum(r['ok'] for r in results))))
if not results or not all(r['ok'] for r in results): sys.exit(1)
