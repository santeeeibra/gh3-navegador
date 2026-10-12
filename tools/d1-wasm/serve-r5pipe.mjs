// Local only. Sirve la copia r5pipe (2 cuadros en vuelo) con el servidor existente.
import path from 'node:path';
process.env.D4_ROOT=path.resolve('artifacts/d1-wasm/r5pipe/demo');
await import('./serve-d4.mjs');
