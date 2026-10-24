"""Resolve hashes from the copy's own debug name dictionary, without guessing."""
import json
import re
import sys
import zlib
from pathlib import Path

source = Path(sys.argv[1])
raw = source.read_bytes()
body = zlib.decompress(raw, -15)
names = {}
for key, name in re.findall(rb'0x([0-9a-fA-F]{8})[ \t]+([^\r\n\x00]+)', body):
    text = name.decode('utf-8', errors='replace').strip()
    names.setdefault(key.decode().upper(), [])
    if text not in names[key.decode().upper()]:
        names[key.decode().upper()].append(text)
out = Path('artifacts/original-textures/debug-names.json')
out.write_text(json.dumps(names, indent=2))
for folder in sys.argv[2:]:
    p = Path(folder)/'pak-manifest.json'
    report = json.loads(p.read_text())
    for row in report['entries']:
        row['resolvedFull'] = names.get(row['fullHash'], [])
        row['resolvedShort'] = names.get(row['shortHash'], [])
    p.with_name('pak-manifest-named.json').write_text(json.dumps(report, indent=2))
    for row in report['entries']:
        label = ' | '.join(row['resolvedFull']+row['resolvedShort'])
        if re.search(r'gem|highway|score|fret|neck|hud|font', label, re.I):
            print(row['index'], row['type'], label)
print(f'{len(names)} hash keys resolved from local debug dictionary')
