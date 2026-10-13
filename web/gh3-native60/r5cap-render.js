// Claude 2026-10-12 (prueba celular, copia aislada): envoltorio del consumidor r5snap-song-render.js de Codex (sin modificarlo).
// Deja pasar como máximo R5CAP_FPS cuadros por segundo (por defecto 30); los demás se descartan antes de dibujar.
importScripts('r5snap-song-render.js');
(() => {
  const inner = globalThis.__r5liveConsumer, fps = Number(new URL(self.location.href).searchParams.get('r5capfps')) || 30;
  const gap = 1000 / fps - 2; let last = -1e9, passed = 0, dropped = 0;
  globalThis.__r5cap = { get passed() { return passed; }, get dropped() { return dropped; }, fps };
  globalThis.__r5liveConsumer = (bytes, info, api) => {
    const now = performance.now();
    if (now - last < gap) { dropped++; return 0; }
    last = now; passed++;
    return inner(bytes, info, api);
  };
})();
