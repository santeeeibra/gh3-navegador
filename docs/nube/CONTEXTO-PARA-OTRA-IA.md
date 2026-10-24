# Contexto del proyecto para consultar a otra IA (2026-10-24)

## Qué es
Guitar Hero III: Legends of Rock (copia Xbox 360 propia de Santi, `default.xex`) corriendo en el navegador. El ejecutable de Xbox 360 se recompila con rexglue (C++) a WebAssembly con Emscripten (4.0.0, pthreads con SharedArrayBuffer). Duelo online a futuro. Santi no es programador. Vía PC original en pausa (SecuROM; no se elude DRM). Hosting: Cloudflare Pages + R2 para el wasm (71 MB).

## Cómo está armado (arquitectura real)
- Hilos: ~20 workers. Hilo del juego (código del Xbox recompilado, lógica secuencial), procesador de órdenes de video (CP), audio (XMA decodificado, reloj de audio), armador del escenario, dibujo en GPU.
- Dibujo en 3 calidades: **completa** (native60: WebGPU con los shaders originales, hilo GPU propio, interpolación a 60), **liviana** y **muy liviana** (WebGL2 simple, solo autopista/notas/HUD, pensada para celulares).
- Capa de autopista aparte (autopista60) guiada por el reloj del audio, a 50 actualizaciones/s (100/s costó ~4 puntos de velocidad).
- Velocidad del juego («juego %» = velocidad vs tiempo real): alta 85-90 %, liviana ~92-100 %.

## Mediciones (robot de pruebas, Slow Ride, 60 s, PC de Santi: 12 núcleos, 16 GB, monitor 100 Hz, WebGPU)
- Hilo del juego ocupado ~53 %; no está saturado: espera a otros hilos.
- CPU total ocupada: alta 289 s por 60 s (~4,8 núcleos), liviana 245 s.
- Consultas de hora (`performance.now`, desde sueños/esperas cortas) ~27 s por 60 s; con parche bajó a 18,6 s pero el juego solo ganó +1,5 puntos (ruido ±3).
- Hash XXH3 de destinos de copias de pantalla en el hilo CP: 6,6 s (solo alta). Armador del escenario: 35 s en alta vs 9 s en liviana.
- Conclusión: el techo no es el hardware sino la parte secuencial del juego y la sincronización entre hilos. Más núcleos no suben el «juego %» por sí solos.

## Qué se hizo hoy
- Prueba de equipo al primer arranque (núcleos, memoria, WebGPU, Hz real, CPU, GPU) que recomienda calidad; calibración opcional de audio/imagen (con «Omitir»); sección «Mi equipo» en Ajustes. Umbrales provisorios (solo hay datos de una PC).

## Restricciones
- Todo en el navegador (sin servidor de juego). No se puede cambiar el código del juego, solo el recompilado, el runtime y el dibujo.
- Recompilar el wasm exige la fuente exacta de producción (hoy hay un hueco en la fuente de `r5_frame.cpp`).
- Lagazos antiguos = shaders compilados en plena canción (arreglado con lista precompilada).

## Pregunta para la otra IA
Para PCs potentes (8+ núcleos, GPU dedicada, WebGPU, monitores 100-240 Hz) que sobran de recursos: ¿cuál sería el plan más lógico y de menor riesgo para aprovecharlas? Ideas a evaluar: (1) más hilos/offload de lo que no es secuencial (hash, lectura/armado de datos de dibujo, decodificación de audio); (2) calidad «ultra» (resolución interna mayor, texturas, sombras) en la GPU que sobra; (3) autopista a la frecuencia del monitor (100/144/240) cuando haya margen; (4) elegir la cantidad de hilos según el equipo; (5) cómo atacar la parte secuencial (hilo del juego y esperas/sueños cortos) sin romper la sincronía con el audio. Pedir: orden de prioridad, riesgos, cómo medir cada paso, y qué NO vale la pena.
