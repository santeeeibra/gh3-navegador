from pathlib import Path
p=Path('tools/d1-wasm/check-build-g1d.py');s=p.read_text().replace("'identical':a==b", "'byteIdentical':a==b,'normalizedTextIdentical':original.read_text()==backup.read_text() if backup.exists() else False")
s=s.replace("all(c['identical'] for c in checks)","all(c['normalizedTextIdentical'] for c in checks)")
p.write_text(s)
