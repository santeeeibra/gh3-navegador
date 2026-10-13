import fs from 'node:fs/promises';
import {chromium} from 'playwright';

// Export the generated master at standard home-screen resolutions.
const source = await fs.readFile('assets/app-icon/gh3-guitar-v1.png');
const browser = await chromium.launch({channel: 'msedge', headless: true});
try {
  const page = await browser.newPage();
  for (const [size, maskable] of [[180, false], [192, false], [512, false], [512, true]]) {
    const data = await page.evaluate(async ({source, size, maskable}) => {
      const image = new Image();
      image.src = 'data:image/png;base64,' + source;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const context = canvas.getContext('2d');
      context.fillStyle = '#0d0b10';
      context.fillRect(0, 0, size, size);
      context.imageSmoothingQuality = 'high';
      // Keep the whole guitar inside Android's central circular safe area.
      const extent = maskable ? Math.round(size * 0.56) : size;
      const inset = (size - extent) / 2;
      context.drawImage(image, inset, inset, extent, extent);
      return canvas.toDataURL('image/png').split(',')[1];
    }, {source: source.toString('base64'), size, maskable});
    const name = `gh3-guitar-v1-${maskable ? 'maskable-' : ''}${size}.png`;
    await fs.writeFile('assets/app-icon/' + name, Buffer.from(data, 'base64'));
    console.log(name);
  }
} finally {
  await browser.close();
}
