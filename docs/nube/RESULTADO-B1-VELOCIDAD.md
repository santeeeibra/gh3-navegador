# B1: velocidad del juego y CPU en modo celular (Claude, 2026-10-13)

Plan: `docs/nube/PLAN-GH3-FLUIDO-IPHONE.md` §4 (aprobado). Respaldo: `artifacts/respaldo/2026-10-13-b1-medidor/`.

## Qué cambió

- `web/gh3-native60/gh3-diag.js`: **medidor de velocidad del juego** (cartel e informe). Juego % = swaps del juego por
  segundo ÷ 60 (dato `d4.songRenderer.swap` que el renderer de canción ya informa cada ~1 s; con native60 usa el
  gobernador); reloj % = avance del reloj de la canción ÷ tiempo real; ventana de 5 s, más promedio y peor ventana de
  la canción; imágenes/s aparte. Informe: núcleos (`hardwareConcurrency`) y memoria del dispositivo. Sin tocar runtime.
  Copiado también a `artifacts/r5-native60/demo` (local, NO publicado).
- `tools/r5-native60/run-song.mjs`: guarda el medidor en cada muestra; la captura inicial ya no frena si no hay imagen.
- `tools/r5-native60/speed-table.mjs`: tabla de velocidad a partir de corridas.
- Por hilo (`[g1d-thread]`): el runtime sólo lo imprime al terminar → no entra en el informe en vivo; se reemplazó por el
  perfil de CPU por hilo en PC.

## Pruebas

`npm test` 72/72, `test:movil-tactil` 74/74, `test:movil-gobernador` 34/34.

## Corridas en PC (Edge, Slow Ride 45 s, robot, dibujo del celular `r5snap-song-render` + r5lite)

Afinidad 5 = CPU lógicas 0 y 2 (dos núcleos físicos). Corridas en `artifacts/r5-native60/runs/b1-*`.

| corrida | juego % (swaps/s) | reloj canción | imágenes/s | producción audio | cortes |
|---|---|---|---|---|---|
| (a) normal, 12 CPU | 79 % (47,4) | 100 % | 31,7 | 1,004 | 0 |
| (b) 2 núcleos, con imagen | 41 % (24,7) | 64 % | 9,9 | 0,970 | 2 |
| (c) 2 núcleos, SIN imagen | — (sin dato sin imagen) | 64 % | 0 | 0,935 | 5 |
| iPhone 11 (informe de Santi) | ~30 % (18) | — | — | 0,84 | 15 |

(c) figura como «falla» en el runner sólo porque exige imágenes; los datos son válidos. El medidor de la página dio
valores coherentes (b: 38 % / reloj 74 % en los últimos 5 s).

COMPROBADO:
- Con 2 núcleos la PC se comporta parecido al iPhone (más lento que normal, audio corto, cortes) → sirve como banco de
  pruebas; el iPhone queda algo peor (18 vs 25 swaps/s).
- **Sacar la imagen no acelera el juego** (reloj 64 % en ambos): el cuello es la CPU del juego, no el dibujo.

## Dónde se va la CPU con 2 núcleos (perfil 20 s, todos los hilos)

| hilo | ocupado | qué hace |
|---|---|---|
| em-pthread-13 (manda comandos a la GPU) | 100 % | **sub_822CA268 = espera activa 58 % del hilo** (16–19 s de 28), WriteRegister 8–10 %, sub_824CE958 |
| em-pthread-1 (lógica principal) | 70 % | **sub_822BF0F8 = espera activa ~35 %**, emscripten_futex_wake ~16 %, sub_82190258 ~15 % |
| em-pthread-23 | 14–41 % | sub_8272C7C0 + fma por software + normalize |
| productor de imagen (r5live) | 14 % (b) | BeginEvent, postMessage, preparar dibujos |

Total de todos los hilos: esperas activas (sub_822CA268 + sub_822BF0F8) ≈ 30 %, `emscripten_get_now` 10–14 %
(reloj consultado dentro de bucles), `futex_wake` ~10 %. **Más de la mitad del tiempo ocupado es esperar dando
vueltas**, no trabajo del juego.

HIPÓTESIS: con muchos núcleos esas vueltas no molestan (por eso el parche `optim/spin1` no mejoró con 3 núcleos), pero
con 2 núcleos le roban el núcleo al hilo que tiene que producir lo que se espera.

## Decisión propuesta para B2

Recorte más grande disponible: **las dos esperas activas** (sub_822CA268 en el hilo de GPU y sub_822BF0F8 en el
principal), ~30 % del tiempo de CPU más parte de get_now/futex_wake. Primer paso barato: probar el build ya hecho
`artifacts/d1-wasm/optim/spin1` (descanso de 250 µs en esos bucles) con **2 núcleos**, misma corrida (b). Si mejora,
ajustar el descanso o cambiar la vuelta por una espera real. Esperado: juego 41 % → 55–70 % en PC-2 núcleos (estimación,
sin medir).

## Pendiente

- iPhone: Santi juega Slow Ride con el medidor y pega el informe → requiere publicar `gh3-diag.js` (pedir OK).
- B2 con OK.

## B2 (2026-10-13, OK de Santi): descanso de 250 µs en las 4 esperas activas, 2 núcleos

Build: objetos de `optim/spin1` (sólo `gh3_recomp.16` parcheado: loc_822CA360/488 y loc_822BF184/1A8) enlazados sobre
la base actual MEMLAZY (`tools/optim/link-memlazy.sh`; el mismo enlace sin parche reproduce el wasm publicado, hash
c55c721e… idéntico). Copia de prueba `artifacts/d1-wasm/optim/b2/demo` (= demo publicada + wasm parcheado 645fcb1b…).
Corridas alternadas, afinidad 5, Slow Ride ~50 s, robot, dibujo del celular. `artifacts/r5-native60/runs/b2-*`.

| corrida | juego % (swaps/s) | reloj canción | imágenes/s | producción audio | cortes |
|---|---|---|---|---|---|
| base 1 | 37 % (21,9) | 68 % | 10,0 | 1,096 | 3 |
| base 2 | 33 % (20,0) | 74 % | 11,2 | 0,942 | 4 |
| **parche 1** | **65 % (38,7)** | **83 %** | 14,7 | 1,040 | **0** |
| **parche 2** | **68 % (40,9)** | **90 %** | 17,0 | 0,999 | **0** |

COMPROBADO (2+2 corridas, sin solaparse): con 2 núcleos el parche casi duplica la velocidad del juego (≈35 % → ≈66 %),
el reloj de la canción sube a 83–90 % y desaparecen los cortes. Confirma la hipótesis: con pocos núcleos las vueltas de
espera le robaban el núcleo al hilo que trabaja (con 3 núcleos el 12/10 no se había visto diferencia).

Regresión (todos los núcleos, Slow Ride COMPLETA con parche): ok, 477/477 rasgueos del robot, reloj 100 %, juego 77 %
(46 swaps/s, igual que sin parche 79 %), audio 0 cortes, 0 errores de página. `runs/b2-spin-full-*`.
Pendiente: publicar medidor + parche (OK aparte para el parche) y medir en iPhone.
Ojo: el proyecto Vercel gh3-privado estaba conectado a GitHub y publicaba Riff Duel en producción con cada push
(público). Santi lo corrigió en el panel (2026-10-13); el deploy privado de 70 temas da 410 (borrado).

PUBLICADO (OK Santi, lo subió Santi desde su terminal): dpl_DsozCGBrYnNdVh1Qaf6kmhp4Tsdc en riff-duel /gh3/; comprobado wasm 645fcb1b…, gh3-diag con medidor, /fase2/ 200, COEP require-corp. Próximo: informe del iPhone.

## B3 (2026-10-13): funciones que el traductor no descubrió (abort en iPhone)

Informe del iPhone (dpl_Dsoz…): `[FATAL] Call to invalid or unregistered function at guest address 0x825E9670`, ~10 s
después de elegir dificultad (mismo síntoma que las versiones anteriores). 0x825E9670 = pasamanos de 9 instrucciones
justo después de sub_825E9658, que rexglue no registró (sólo se llama por tabla). Búsqueda en todo el .text: 78 pasamanos
iguales sin registrar. `tools/optim/orphan-thunks.py` los traduce con el mismo estilo que rexglue (comprobado: 506/506
pasamanos ya generados salen idénticos) y arma copias de gh3_init.cpp/gh3_register.cpp con las 78 altas; se compilan
sólo 3 archivos y se enlaza sobre spin250 (`artifacts/d1-wasm/optim/b3/`, wasm 79431bd0…). Demo `optim/b3/demo`.
PC: Slow Ride COMPLETA (todos los núcleos) ok 477/477, reloj 100 %, 0 cortes, 0 errores; 2 núcleos 67 % / reloj 89 %,
0 cortes (igual que B2). En el iPhone (sin B3) Santi completó tramos: juego 44 % (antes ~30 %), reloj 77 %, audio
estirado ~0,23 s fuera de sincronía y latencia de mando p95 218 ms → falla notas aunque toque a tiempo. Cuello: CPU.
PUBLICADO B3 (OK Santi): dpl_D7hZzBTicacjqxwzqtLSvqydEoUe en riff-duel /gh3/, wasm 79431bd0… comprobado, /fase2/ 200.

## B4 (2026-10-13): motor sin contadores de diagnóstico (`-DG1D_OFF`)

Perfil B1: `g1d::Wait` (medición de esperas, líneas [g1d-thread]) y `R6Note`/`r6sl` ([r6-sleep]/[r6-aw]) consultaban el
reloj en cada espera (~8 % del CPU con 2 núcleos). Guardas `#ifdef G1D_OFF` en `rtsrc/include/g1d_metrics.h` y
`rtsrc/src/core/threading_posix.cpp` (respaldo `artifacts/respaldo/2026-10-13-b4-metricas/`); sin la bandera sólo cambian
números de línea. Se recompila sólo threading_posix con la bandera (vista `optim/b4/view`, `link-memlazy.sh` acepta VIEW),
sobre b3 (esperas + 78 funciones). Demo `optim/b4/demo`, wasm 5d3f7816…. Nota: el objeto publicado venía de una fuente
3 min anterior con una opción `G1_SLEEP` que la página nunca activa (comportamiento igual).

| | 2 núcleos juego | 2 núcleos reloj | todos los núcleos juego / reloj |
|---|---|---|---|
| b3 (publicada) | 67–68 % | 92 % | 77 % / 100 % |
| b4 | 69–70 % | 87–89 % | **85 %** / 99 % (Slow Ride completa ok, 0 cortes, 0 errores) |

Con 2 núcleos la ganancia queda dentro del ruido; con todos los núcleos +8 puntos. Perfil b4 (2 núcleos): ya ningún hilo
al 100 % (principal 40 %, GPU 29 %, productor de imagen 21 %, hilo 23 21 %). Lo que queda está repartido: código del juego
(sub_824CE958 8,5 %, sub_82190258 6,8 %, sub_8272C7C0+fma 8 %), futex_wake ~10 % (Signal/WaitMultiple), reloj de libc
~5 %, productor de imagen ~10 %. Cada recorte restante vale 2–4 %.

PUBLICADO B4 (OK Santi): dpl_4esssibfpEAnfuCg4ScptkusRGTR, wasm 5d3f7816… comprobado.

## B5 (2026-10-13): filtro de figuras en el motor (`?r5livevs=`, objeto r5lite/rt-obj2) — DESCARTADO

Activo (salta ~160 draws/cuadro) pero el productor cuesta igual (6,1–6,6 vs 6,0–6,4 ms/cuadro; r5lite ya evitaba lo
pesado) y la velocidad no cambia (2 núcleos 70–72 % vs 71–75 %). No se publica; página sin cambios.

## B6 (2026-10-13): intervalo mínimo entre imágenes del motor (`?r5livemin=<ms>`) — NO publicado

`tools/d1-wasm/r5_frame.cpp` (respaldo `artifacts/respaldo/2026-10-13-b6-ritmo/`): con el parámetro, el productor no
arranca un cuadro vivo hasta pasados N ms del anterior (lee la URL del worker con EM_ASM; sin parámetro = igual que
antes). Objeto con las banderas publicadas (`-O3 -msimd128 -msse2`, reproducción idéntica comprobada), `optim/b6`.

| r5livemin=40 | juego % | reloj | imágenes/s |
|---|---|---|---|
| b4 2 núcleos | 72–74 % | 86–89 % | 15,6–16,6 |
| b6 2 núcleos | 78–83 % | 91 % | **7,3–7,6** |
| b6 todos los núcleos (completa, 477/477, 0 errores) | 91 % (vs 85 %) | 100 % | 8,6 |

El juego gana 6–10 puntos pero las imágenes caen a la mitad (el productor arma ~1/3 de cuadros y el consumidor de
canción presenta menos todavía; hipótesis: el consumidor usa pares de cuadros consecutivos o descarta por ocupado).
Inaceptable para jugar. Alternativa: que el consumidor (zona Codex) avise "listo" y el productor saltee sólo cuando el
dibujo está ocupado.

## B7 (2026-10-13): señal «listo» de Codex conectada al productor — NO adoptado (se conserva B4)

`LiveDue()` en `tools/d1-wasm/r5_frame.cpp` consulta `globalThis.__r5liveReady()` (Codex, `artifacts/r5-live-ready`) antes de
capturar; sin la función = como antes. Build `optim/b7` (consumidores de Codex + wasm a68263b7…). Misma sección (Slow Ride,
robot, query del celular `r5snap-song-render` + r5lite). Estabilidad = percentiles del intervalo entre swaps ([vb]).

| corrida | juego % (swaps/s) | reloj | imágenes/s | cortes | swap p50/p95/p99 ms | renderer descartó ocupado/recibidos |
|---|---|---|---|---|---|---|
| B4 2 núcleos ×2 | 71–72 % (42,8–43,5) | 88–89 % | 16–16,5 | 0 | 18 / 49 / 78–83 | 338–365 / ~2050 |
| B7 2 núcleos ×2 | 80–81 % (48,3–48,4) | 92 % | **8,7–9,5** | 0 | 17 / 42 / 68–69 | 0 / ~1000 |
| B4 todos (completa) | 85 % (50,9) | 99 % | 22,3 | 0 | 16 / 33 / 46 | 3123 / 12575 |
| B7 todos (completa, 477/477, 0 errores) | 91 % (54,3) | 100 % | **10,6** | 0 | 16 / 32 / 44 | 0 / 5810 |

Mejora el juego y la estabilidad, pero las imágenes presentadas caen a la mitad (como B6): la señal vale 0 también mientras
la imagen anterior espera ser mostrada (retención de 100 ms, según la entrega), y eso corta el solapamiento que B4 tenía.
Regla acordada: sin pérdida de imágenes → se conserva B4. Fuente r5_frame.cpp queda con la consulta (inactiva sin la función).

## Perfil de camino crítico, todos los núcleos, B4 (2026-10-13)

Misma sección, perfil de 20 s desde los 10 s de canción (`runs/b4-prof-all-*`): 84 % (50,6 swaps/s), reloj 100 %, 26 img/s, 0 cortes.
Por hilo (ejecutando / esperando / inactivo), OBSERVADO:
- Hilo CP (comandos gráficos + productor + consumidor de imagen): 53 % / 0 / 47 %. De su tiempo ocupado (11,4 s), 8,6 s
  (76 %) es productor R5L + consumidor de imagen; reloj dentro de eso sólo 0,5 s.
- Principal del juego: 52 % / 48 % (espera en el bucle parcheado de sub_822BF0F8).
- Envío de GPU del juego: 32 % / 68 % (espera en el bucle parcheado de sub_822CA268).
- Hilo 23 (sub_8272C7C0 + fma): 49 % / 51 % en Sleep voluntario → no es camino crítico.
- Ningún hilo al 100 %.
A/B misma sección SIN preparar imágenes (`?r5live=0`, `runs/b4-noimg-all-*`, 1 corrida): **93 % (55,6 swaps/s)**,
reloj 100 %, 0 cortes, swap p95/p99 31/42 ms (vs 84 %, 34/46 ms con imagen).
Conclusión: el trabajo de imagen en el hilo del CP es una parte medida del cuello (≈9 puntos con todos los núcleos; con 2
núcleos B7 sugiere más). Sin imagen tampoco se llega a 60 (93 %): el resto no está identificado (falta perfil sin imagen).
Audio sin cortes no prueba sincronía (no se midió desfase audio/notas/input en esta tanda).
