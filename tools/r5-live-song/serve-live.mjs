// Local only. Reuse the existing allowlisted HTTP server without editing it.
import path from 'node:path';
process.env.D4_ROOT=path.resolve('artifacts/r5-songlive/demo');
await import('../d1-wasm/serve-d4.mjs');
