// Lee solo los encabezados CFHEADER/CFFOLDER/CFFILE de los CAB del instalador (sin descomprimir).
import {openSync, readSync, closeSync} from 'node:fs';
import {parseCabHeader} from '../../toolchain/bottleship/packages/formats/src/cab/index.ts';
for (const path of process.argv.slice(2)) {
    const fd = openSync(path, 'r'); const buf = new Uint8Array(4 << 20); readSync(fd, buf, 0, buf.length, 0); closeSync(fd);
    const dv = new DataView(buf.buffer);
    const info = parseCabHeader(buf, 0);
    const flags = dv.getUint16(30, true), size = dv.getUint32(8, true);
    const spanStart = info?.files.filter(f => f.folderIndex >= 0xfffd).length;
    console.log(JSON.stringify({path, size, flags, folders: info?.folders.length, files: info?.files.length, continuedFiles: spanStart,
        folderInfo: info?.folders.map(f => ({blocks: (f as any).numBlocks ?? (f as any).dataBlocks, comp: (f as any).compression ?? (f as any).typeCompress})),
        lastFiles: info?.files.slice(-2), firstFiles: info?.files.slice(0, 2)}));
}
