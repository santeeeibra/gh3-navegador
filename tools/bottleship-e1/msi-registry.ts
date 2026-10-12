// Vuelca las tablas Registry/Property del MSI (solo lectura; no ejecuta acciones del instalador).
import {readFileSync} from 'node:fs';
import {MsiDatabase} from '../../toolchain/bottleship/packages/formats/src/msi/index.ts';
const db = new MsiDatabase(readFileSync(process.argv[2]));
const out: any = {};
for (const t of ['Registry', 'Property', 'Media', 'CustomAction', 'InstallExecuteSequence']) { try { out[t] = db.table(t); } catch (e) { out[t] = String(e); } }
console.log(JSON.stringify(out, null, 1));
