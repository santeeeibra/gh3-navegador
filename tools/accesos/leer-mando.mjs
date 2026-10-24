// Claude 2026-10-15: lee qué informa el mando al navegador (Edge visible, sin juego). Uso: node tools/accesos/leer-mando.mjs [segundos]
import {chromium} from 'playwright';
const seg = Number(process.argv[2] || 10);
const b = await chromium.launch({channel: 'msedge', headless: false});
try {
  const p = await b.newPage();
  await p.route('http://localhost/mando', r => r.fulfill({contentType: 'text/html', body: '<h1>Leyendo el mando: no lo toques</h1>'}));
  await p.goto('http://localhost/mando');
  const out = await p.evaluate(async seg => {
    const muestras = [];
    for (let k = 0; k < seg * 2; k++) {
      const gs = [...navigator.getGamepads()].filter(Boolean).map(g => ({i: g.index, id: g.id, mapping: g.mapping || 'no estándar',
        botones: g.buttons.map((x, j) => (x.pressed || x.value > 0.05) ? j + ':' + x.value.toFixed(2) : null).filter(Boolean),
        ejes: g.axes.map(a => +a.toFixed(2))}));
      muestras.push(gs); await new Promise(r => setTimeout(r, 500));
    }
    return {total: muestras.at(-1).length, primera: muestras.find(m => m.length) || [], ultima: muestras.at(-1)};
  }, seg);
  console.log(JSON.stringify(out, null, 1));
} finally { await b.close(); }
