import fs from 'node:fs/promises';
import path from 'node:path';

const destination = path.resolve(process.argv[2] || 'artifacts/privado/deploy-app/.vercel/output/static/gh3');
const index = path.join(destination, 'index.html');
let html = await fs.readFile(index, 'utf8');
if (!html.includes('src="gh3-feedback.js"')) html = html.replace('</head>', '<script src="gh3-feedback.js" defer></script>\n</head>');
if (!html.includes('src="gh3-feedback.js"')) throw new Error('Falta </head> en el destino');
// Staging uses hard links. Replace the destination file without modifying its source.
const temp = index + '.feedback-tmp';
await fs.writeFile(temp, html); await fs.rename(temp, index);
await fs.copyFile('tools/analytics/feedback/gh3-feedback.js', path.join(destination, 'gh3-feedback.js'));
console.log(`Opiniones integradas en ${destination}`);
