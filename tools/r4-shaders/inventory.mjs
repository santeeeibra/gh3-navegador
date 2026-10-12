import {readdir, readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, relative, join} from 'node:path';
import {createHash} from 'node:crypto';
const root = resolve(import.meta.dirname, '../..');
const input = resolve(process.argv[2] ?? join(root, 'artifacts/g0'));
const output = resolve(process.argv[3] ?? join(root, 'artifacts/r4-shaders/inventory.json'));
async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, {withFileTypes:true})) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile() && /\.ucode\.bin\.(vert|frag)$/.test(entry.name)) files.push(path);
  }
  return files.sort();
}
const files = [];
for (const path of await walk(input)) {
  const bytes = await readFile(path);
  files.push({path:relative(root,path).replaceAll('\\','/'), stage:path.endsWith('.vert')?'vertex':'fragment', bytes:bytes.length,
    sha256:createHash('sha256').update(bytes).digest('hex'), wordAligned:bytes.length>0&&bytes.length%4===0});
}
const unique = new Map();
for (const file of files) {
  const key = file.stage+':'+file.sha256;
  if (!unique.has(key)) unique.set(key,{...file, occurrences:[]});
  unique.get(key).occurrences.push(file.path);
}
const report = {at:new Date().toISOString(), input, dumpByteOrder:'native little-endian on this Windows x64 host (Shader::DumpUcode writes ucode_data directly)',
  fileCount:files.length, uniqueStageAndHashCount:unique.size,
  counts:Object.fromEntries(['vertex','fragment'].map(stage=>[stage,[...unique.values()].filter(f=>f.stage===stage).length])),
  conversionStatus:'not run', webgpuStatus:'not run', slowRideCoverage:'not confirmed',
  files, unique:[...unique.values()]};
await mkdir(resolve(output,'..'),{recursive:true});
await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output, files:report.fileCount, unique:unique.size, counts:report.counts}));
if(files.some(f=>!f.wordAligned))process.exitCode=1;
