import fs from 'node:fs/promises';
import path from 'node:path';

// Project-owned home-screen artwork, independent of game/runtime resources.
export async function addAppIcon(destination) {
  const icons = [180, 192, 512].map(size => `gh3-guitar-v1-${size}.png`);
  icons.push('gh3-guitar-v1-maskable-512.png');
  for (const name of icons) await fs.copyFile(path.join('assets/app-icon', name), path.join(destination, name));
  const manifest = {
    name: 'Guitar Hero III', short_name: 'GH3', id: '/gh3/',
    start_url: '/gh3/', scope: '/gh3/', display: 'standalone', orientation: 'landscape',
    background_color: '#0d0b10', theme_color: '#0d0b10',
    icons: [
      {src: icons[1], sizes: '192x192', type: 'image/png', purpose: 'any'},
      {src: icons[2], sizes: '512x512', type: 'image/png', purpose: 'any'},
      {src: icons[3], sizes: '512x512', type: 'image/png', purpose: 'maskable'},
    ],
  };
  await fs.writeFile(path.join(destination, 'gh3-guitar-v1.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');
  const htmlPath = path.join(destination, 'index.html');
  let html = await fs.readFile(htmlPath, 'utf8');
  html = html.replace(/<link\b[^>]*\brel=["'](?:manifest|apple-touch-icon|icon)["'][^>]*>/gi, '');
  html = html.replace(/<\/head>/i, [
    '<link rel="manifest" href="gh3-guitar-v1.webmanifest">',
    '<link rel="apple-touch-icon" sizes="180x180" href="gh3-guitar-v1-180.png">',
    '<link rel="icon" type="image/png" sizes="192x192" href="gh3-guitar-v1-192.png">',
    '</head>',
  ].join('\n'));
  // Unlink first: staged outputs may be hard-linked to someone else's demo.
  await fs.unlink(htmlPath);
  await fs.writeFile(htmlPath, html);
}
