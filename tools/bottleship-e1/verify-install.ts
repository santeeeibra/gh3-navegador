// Verifica la extracción por claves contra la tabla File (tamaño) y MsiFileHash (MD5) del MSI y la reubica
// con sus nombres instalados (rename en el mismo disco, sin copiar). No ejecuta acciones del instalador.
// Uso: bun verify-install.ts <msi> <dir-claves> <dir-instalación> <reporte.json> [claves-cruzadas...]
import {readFileSync, writeFileSync, mkdirSync, renameSync, existsSync, statSync, openSync, readSync, closeSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {createHash} from 'node:crypto';
import {MsiDatabase, msiFilePaths} from '../../toolchain/bottleship/packages/formats/src/msi/index.ts';

const [msiPath, keysDir, outDir, reportPath, ...crossKeys] = process.argv.slice(2);
const db = new MsiDatabase(readFileSync(msiPath));
const hashes = new Map<string, string>();
for (const row of db.table('MsiFileHash')) {
    const b = Buffer.alloc(16);
    for (let i = 0; i < 4; i++) b.writeUInt32LE((row[`HashPart${i + 1}`] as number) >>> 0, i * 4);
    hashes.set(row.File_ as string, b.toString('hex'));
}
function md5(path: string): string {
    const h = createHash('md5'), fd = openSync(path, 'r'), buf = Buffer.alloc(8 << 20);
    let n; while ((n = readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
    closeSync(fd); return h.digest('hex');
}
const report: any = {msi: msiPath, files: 0, bytes: 0, md5Checked: 0, md5WithoutHash: 0, failures: [], skippedDuplicates: [], crossVolume: []};
const seen = new Set<string>();
for (const f of msiFilePaths(db, 'INSTALLDIR')) {
    const src = join(keysDir, f.key), dst = join(outDir, f.path);
    const lower = f.path.toLowerCase();
    const where = existsSync(src) ? src : existsSync(dst) ? dst : null;
    if (!where) { report.failures.push({key: f.key, error: 'missing'}); continue; }
    const size = statSync(where).size;
    if (size !== f.size) { report.failures.push({key: f.key, error: `size ${size} != ${f.size}`}); continue; }
    const expected = hashes.get(f.key);
    let actual: string | undefined;
    if (expected) {
        actual = size ? md5(where) : '0'.repeat(32);
        if (actual !== expected) { report.failures.push({key: f.key, error: `md5 ${actual} != ${expected}`}); continue; }
        report.md5Checked++;
    } else report.md5WithoutHash++;
    if (crossKeys.includes(f.key)) report.crossVolume.push({key: f.key, path: f.path, size, md5: actual, expected});
    if (seen.has(lower)) { report.skippedDuplicates.push({key: f.key, path: f.path}); continue; }  // Readme localizados
    seen.add(lower);
    if (where === src) { mkdirSync(dirname(dst), {recursive: true}); renameSync(src, dst); }
    report.files++; report.bytes += size;
}
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({files: report.files, bytes: report.bytes, md5Checked: report.md5Checked, noHash: report.md5WithoutHash, failures: report.failures.length, dup: report.skippedDuplicates.length, cross: report.crossVolume}));
