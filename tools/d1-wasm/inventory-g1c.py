import json,hashlib
from pathlib import Path
root=Path('D:/Descargas/GH3LOR-XEX/GH3LOR-XEX/Guitar Hero 3 Legends of Rock');out=Path(__file__).resolve().parents[2]/'artifacts/d1-wasm/g1c'
rows=[]
for p in sorted(root.rglob('*')):
 st=p.stat();row=dict(path=p.relative_to(root).as_posix(),directory=p.is_dir(),size=0 if p.is_dir() else st.st_size,mtimeNs=st.st_mtime_ns)
 if p.is_file():
  with p.open('rb') as f:row['sha256']=hashlib.file_digest(f,'sha256').hexdigest()
 rows.append(row)
(out/'original-after.json').write_text(json.dumps(rows,indent=2))
before=json.loads((out/'original-before.json').read_text());old={x['path']:x for x in before};new={x['path']:x for x in rows}
diffs=[dict(path=k,before=old.get(k),after=new.get(k)) for k in sorted(old.keys()|new.keys()) if old.get(k)!=new.get(k)]
result=dict(originalRoot=str(root),beforeEntries=len(old),afterEntries=len(new),files=sum(not x['directory'] for x in rows),allInventoryAndSha256Identical=not diffs,differences=diffs)
(out/'original-integrity.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2));assert not diffs
