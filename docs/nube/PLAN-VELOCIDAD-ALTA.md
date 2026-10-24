# Plan: velocidad del juego en calidad alta (propuesto 2026-10-24, espera OK de Santi)

Meta: subir «juego %» en alta (hoy 85-88 % con el robot en Slow Ride) para que sobre margen y la autopista pueda ir a 100/120/144 por segundo sin trabar.
Base: `artifacts/d1-wasm/fluido/mejora/demo` (shaders de fábrica + 50/s). Cada paso en copia aislada, 2 corridas de robot de 60 s (ruido ±3), robot normal (no el visual), `--plazo 220 --aceptar 8`. Se queda solo lo que gane 2 puntos o más. A Santi se le da UNA prueba al final.

Datos de partida (perfil de hoy, 17 s de alta): hashing XXH3 en el hilo del procesador de órdenes de video (~2 s), consultas de hora `_emscripten_get_now` en todos los hilos (~4,3 s, 6 % del total), armador del escenario 62 % de un núcleo.

0. Perfil limpio de 60 s en alta y en liviana (misma canción): tabla de qué hilo y qué función se lleva el tiempo, y cuánto cuesta el escenario. Decide el orden de 1-3.
   HECHO 2026-10-24: ver `artifacts/d1-wasm/fluido/RESULTADO-VELOCIDAD-P0.md` (orden: 2, 1, 3).
1. No rehashear búferes iguales en el procesador de órdenes (pendiente viejo «Alta»).
2. Consultas de hora más baratas (pendiente viejo de «Media 2 núcleos»; ayuda también a celular).
   HECHO 2026-10-24: +1,5 puntos (bajo el umbral), ver RESULTADO-VELOCIDAD-P0.md; candidato acumulable.
3. Sacar el lector de native60 del hilo del procesador de órdenes (pendiente viejo «Alta»).
4. Autopista adaptable: 100/s (o el Hz del monitor) solo si sobra margen; si no, 50/s. Con histéresis para que no salte.
5. Regresión (audio, 0 errores, autopista y escenario visibles) y `PROBAR-*.cmd` único para Santi.

Descartado (no repetir): ver `artifacts/d1-wasm/fluido/RESULTADO-A100.md`.
