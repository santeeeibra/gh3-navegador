import fs from 'node:fs/promises';
import path from 'node:path';

const destination = path.resolve(process.argv[2] || 'artifacts/analytics/dashboard-preview');
await fs.mkdir(destination, { recursive: true });
for (const file of ['index.html', 'dashboard.css', 'dashboard.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'sw.js']) {
  await fs.copyFile(path.resolve('tools/analytics/dashboard', file), path.join(destination, file));
}
console.log(`Panel preparado en ${destination}`);
