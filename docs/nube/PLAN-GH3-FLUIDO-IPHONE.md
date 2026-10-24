# Plan: GH3 original jugable y fluido en el navegador (referencia Budokai Tenkaichi 3 Web)

Claude, 2026-10-13. Plan para aprobar, SIN implementar. Fuentes leídas: REGLAS.md, CLAUDE.md,
AGENTS.md, artifacts/COORDINACION.md (hasta «CORRECCIÓN MÁS RECIENTE»), checkpoints de hoy,
RESULTADO de native60 / memlazy / renderer móvil, y los informes del iPhone 11 de Santi de hoy.

Etiquetas: **COMPROBADO** (medido o visto), **HIPÓTESIS** (falta probar), **PENDIENTE** (falta hacer).

---

## 0. Dónde estamos (al 2026-10-13, lo más nuevo manda)

| Tema | Estado |
|---|---|
| PC (Edge) | COMPROBADO: Slow Ride y Talk Dirty completas; native60 presenta ~59 img/s, pero la escena se recalcula a ~17,5 snapshots/s; el juego hace ~49 swaps/s (no 60). Escena con sombras/COPY/EDRAM/materiales incompletos. |
| iPhone 11 (dpl_HPr1…, dibujo `r5snap-song-*`) | COMPROBADO: Slow Ride entra y corre, pero el juego hace **1499 swaps en 84 s ≈ 18/s**, el sonido sale al **84 %** de lo necesario → 15 cortes en 30 s de canción; mando→juego p50 41 ms, **p95 1,05 s**, máx 5,6 s. |
| Cierres en iPhone | COMPROBADO: `abort()` del motor ~7 s después de elegir dificultad (Barracuda y Slow Ride) y cierres silenciosos de Safari (en «Página abierta», «Iniciando el motor», «Entrando a la canción»), **también con la versión anterior** dpl_ATVEhX5… → no lo causan los controles ni el gobernador. Intermitente: la última vez entró. Causa exacta: PENDIENTE (desde hoy el informe guarda las últimas 25 líneas del juego, también de la sesión cerrada). |
| Memoria | COMPROBADO: wasm fijo 1.772 MB (guest 1.040 MB + ~730 MB de runtime sin analizar). El 2026-10-12 ya hubo un abort por memoria (Sunshine, 3.500 MB) que MEMLAZY bajó. |
| CPU del juego (PC) | COMPROBADO (checkpoint OPTIM): esperas activas en sub_822CA268/sub_822BF0F8 ≈ 1 núcleo; parche de descanso sin mejora. Calientes: sub_82190258, sub_824CE958, fma por software, sub_8272C7C0. Codex con 2 CPU (afinidad máscara 3): 3,8–5,2 img/s y underruns. |
| Gobernador | Implementado; en iPhone sólo mira (no hay tablero con `r5snap-song-*`). Bajar la imagen **no** arregla una CPU que no alcanza. |

**Conclusión de partida:** el primer cuello en el iPhone 11 es la **CPU que ejecuta el juego** (simulación + productor de snapshots en el hilo del CP), no la GPU. Después viene la memoria. La fidelidad gráfica completa es el tercer problema.

---

## 1. Qué enseña la referencia (dragonballbt3.online) — COMPROBADO leyendo su código público

Cómo está hecho (runtime.html, native-shell.js, bt3-jspi.js / bt3-async.js, lab-speed.js; repo z3xox/Tenkaichi3Decomp):

- **Es una descompilación (código fuente C del juego de PS2) compilada nativa**, con renderer, sonido y entrada nuevos. No es un emulador ni una recompilación binaria. El programa wasm es chico, **un solo hilo** (sin pthreads ni SharedArrayBuffer), bucle con requestAnimationFrame, WebGL2 (`BT3_GPU_API: 'gl'`), memoria que crece sola.
- Dos builds: JSPI (Chrome/Edge) y **Asyncify para Safari**, elegida en el arranque.
- Disco: lo lee del archivo del usuario «en el lugar» (`File.slice`) o desde «piezas» por red (`index.json` + piezas enteras, inmutables, en **Cache API** `bt3-files-<revisión>`). **Caché de archivos en memoria con presupuesto: 256 MiB en teléfono, 768 MiB en PC** (`webCacheBudget`). Es un presupuesto de *caché*, no la memoria total.
- **Precarga por combate**: arma la lista exacta de archivos del round (recortada a lo necesario: «el rango viejo incluía >100 MiB de menús»), la descarga antes de empezar con pantalla de «Preparando recursos», y verifica **0 lecturas de red durante la pelea** (`networkReadsDuringFight`). En online, barrera con el rival antes de empezar.
- **Velocidad medida por contadores de simulación, nunca por imágenes interpoladas** (`lab-speed.js`: «velocidad de consola %» = campos/59,94 Hz y «simulación de combate %» = updates/29,97 Hz). Interpolación opcional, **apagada en online**.
- Safari: sonido desbloqueado en cada toque con un buffer silencioso, `audioSession = 'playback'`, `wakeLock`, `storage.persist()`, viewport real con `visualViewport`, guardado `FS.syncfs` cada 5 s y al salir.
- Online: lobby por WebSocket (`/net/ws?room=…&role=host|join`), códigos de sala de 4 letras, cola de emparejamiento; el port de PC usa **rollback** + TURN.

**Qué se puede trasladar a GH3:**
1. Medir «velocidad del juego %» con contadores del juego (swaps del juego/s y reloj de canción vs tiempo real), separado de imágenes presentadas y de snapshots. → bloque B1.
2. Presupuesto de caché por dispositivo (teléfono más chico) y caché inmutable por revisión: ya tenemos cargador por partes (Cache/IndexedDB); falta el **presupuesto en memoria** y contarlo. → E2.
3. Precarga por canción con lista exacta y **0 lecturas de red en canción** como criterio. Ya existe la compuerta de Codex («Sin Preparar», 0 pedidos en canción en PC): falta verificarla en iPhone y medir su memoria. → E2.
4. Trucos de Safari que no tengamos (buffer silencioso en el toque, wakeLock, persist). → E2 (chicos).
5. Lobby con código de sala por WebSocket y barrera de inicio. → E6.

**Qué NO se puede trasladar (depende de su motor):**
- Su velocidad viene de tener **código fuente nativo de un juego de PS2** (mucho más liviano) en un hilo. Nosotros ejecutamos el binario de Xbox 360 recompilado, con varios hilos del juego, traducción de memoria big-endian y el procesador de comandos de la GPU. No hay descompilación de GH3: hacerla sería un proyecto de años; **no se propone** sin evidencia.
- Asyncify/JSPI: no aplica (usamos hilos reales y SharedArrayBuffer, que Safari soporta).
- WebGL2 porque ellos lo usan: su renderer es propio y simple; el nuestro traduce shaders Xenos. Se evalúa con datos (E4).
- Rollback: requiere simular el juego varias veces por cuadro y guardar/restaurar estado; con el iPhone al 30 % de velocidad es imposible. En GH3 el duelo no necesita rollback (cada uno toca su propia canción). → E6.

---

## 2. Etapas

Cada bloque: respaldo en `artifacts/respaldo/<fecha>-<tema>/`, un cambio por vez, medir antes/después, regresiones (`npm test`, `test:movil-tactil`, `test:movil-gobernador`, Slow Ride completa en PC con robot) y turno en `artifacts/PRUEBAS-EN-CURSO.md`. Medir siempre: tiempo real, pausas entre cuadros (máx, >34 ms, >100 ms), memoria, audio (cortes/saltos desde antes de Jugar), latencia de entrada (p50/p95/máx), y **por separado** swaps del juego/s, snapshots/s e imágenes presentadas/s.

### E1. Diagnóstico del abort() y de los cierres en iPhone

- **Problema:** el juego se cierra al cargar canción (a veces), con las dos versiones.
- **Reutilizable:** informe `gh3-diag.js` (ya guarda últimas 25 líneas del juego, también de la sesión cerrada), MEMLAZY (aviso «[rexwasm] respaldo nuevo» al pedir bloques), registro `[g1]`.
- **Cambios:** (a) en el runtime, imprimir el **motivo** antes de abortar (qué asignación falló, tamaño, quién la pidió: malloc del host, bloque guest nuevo, hilo nuevo, archivo) — hoy sólo dice «native code called abort()»; (b) informe con picos: memoria wasm, bloques guest pedidos, bytes de archivos cargados en memoria, texturas GPU, núcleos (`hardwareConcurrency`).
  Archivos: `tools/d1-wasm/rex_wasm_seg.cpp` / `src/system/xmemory.cpp` (copias de memlazy), pre-js del runtime, `web/gh3-native60/gh3-diag.js`.
- **Incertidumbre:** el cierre silencioso de Safari (jetsam) no deja mensaje; sólo se ve el último latido. Alternativa: latido cada 1 s cerca de la carga + registrar la última etapa conocida.
- **Prueba / aceptación:** 5 intentos de Slow Ride en el iPhone 11 con el informe nuevo; aceptado cuando cada cierre trae una causa nombrada (p. ej. «falló bloque guest de 64 MB a los 1.836 MB») o, si es silencioso, la memoria y la etapa del último segundo. Comparación con la versión anterior: ya hecha (también cae).
- **Dónde:** cambios y build en PC (toolchain WSL/emsdk); prueba en iPhone físico (Santi).

### E2. Memoria y recursos por canción

- **Problema:** 1.772 MB fijos + archivos + GPU es demasiado para Safari en un iPhone 11 (4 GB de RAM).
- **Reutilizable:** cargador por demanda con compuerta antes del chart (Codex, «Sin Preparar»: 0 pedidos en canción en PC), manifiesto por canción (Slow Ride = 15 archivos, ~51 MB), MEMLAZY, presupuesto de texturas de Codex (64 MiB), gobernador (presupuesto de memoria visual).
- **Cambios:** (1) analizar los ~730 MB fuera del guest (heap del runtime: ¿copias de archivos en MEMFS/WORKERFS, búferes de audio XMA, arenas del productor?); (2) bajar el xex reservado 256→64 MB (ya identificado, −192 MB); (3) presupuesto de caché de archivos en memoria por dispositivo (estilo Budokai: más chico en teléfono) y liberar los archivos de la canción anterior al cambiar de tema; (4) precarga de la lista exacta de la canción antes de empezar, criterio 0 lecturas en canción; (5) buffer silencioso en el toque, wakeLock y `storage.persist()` si faltan.
  Archivos: runtime (copias aisladas de memlazy), `gh3-chunks-sw.js`/cargador, `index.html`, `gh3-diag.js`.
- **Incertidumbre:** Safari no informa la memoria del proceso; medimos lo que reservamos. HIPÓTESIS: el pico está en la carga de la canción (archivos + decodificación + texturas a la vez).
- **Prueba / aceptación:** PC: Slow Ride completa sin regresión y memoria wasm/heap/archivos por debajo de un tope acordado (p. ej. ≤1.400 MB total); iPhone: 10 cargas seguidas de Slow Ride (cerrar y abrir entre medio) **sin cierre**, 0 lecturas de red en canción.
- **Dónde:** PC para medir/armar; iPhone para aceptar.

### E3. Renderer original completo y más barato

- **Problema:** faltan sombras, superficies intermedias COPY/EDRAM, mips/rectángulos, materiales; y el productor de snapshots cuesta CPU (~11 ms con R5OPT, escena ~29 ms de preparación).
- **Reutilizable:** native60 (134 WGSL originales, igualdad de píxeles con replay de 258 draws), pipeline gpu-capture (Edge ↔ RenderDoc/GFXReconstruct), R5F/R5L, `song-actors` de Codex.
- **Cambios:** es **zona Codex** (renderer/shaders). Lo mío: el productor (CP) — evitar reconstruir/copiar lo que no cambió entre swaps, subir sólo diferencias, mover trabajo fuera del hilo del CP.
- **Incertidumbre:** sin la escena completa no sabemos el costo real; comparar contra GH3 nativo (RenderDoc) es la única verdad.
- **Prueba / aceptación:** captura de Slow Ride en 3 momentos fijos: píxeles vs nativo dentro de umbral acordado; costo del productor ms/swap antes/después; 0 regresiones de audio.
- **Dónde:** PC (Codex + Claude coordinados).

### E4. Backend móvil (WebGPU vs WebGL2)

- **Problema:** en iPhone native60 no mostró imagen (sin probar a fondo); `r5snap-song-*` sí.
- **Reutilizable:** el mismo cuadro capturado (`song-actors`, 281 draws) y el benchmark de 4 variantes de Codex; `hw60.js` (WebGL2 mínimo) como referencia.
- **Cambios:** prueba chica, sin el juego: una página que reproduce **el mismo cuadro** en WebGPU (worker y hilo principal) y, si es viable traducir esos shaders, en WebGL2. Medir en el iPhone: ms/cuadro, memoria, errores, fidelidad (hash o diferencia de píxeles).
- **Incertidumbre:** traducir Xenos→GLSL ES puede no cubrir todo; no asumir que WebGL2 sea más rápido.
- **Prueba / aceptación:** tabla iPhone 11: WebGPU-worker / WebGPU-principal / WebGL2 con ms p50/p95, MiB y diferencia de píxeles; se elige uno por datos.
- **Dónde:** PC para armar; iPhone para medir; decide Codex+Claude con Santi.

### E5. Fluidez de toda la imagen

- **Problema:** 60 imágenes no son 60 cuadros calculados; hoy el juego calcula ~49/s en PC y ~18/s en iPhone.
- **Reutilizable:** interpolación/extrapolación de native60 (≤100 ms), medición de cadencia, gobernador.
- **Cambios:** **primero subir la simulación** (bloque B1/B2 abajo); después interpolar pista/cámara/animaciones sin tocar juicio de notas, reloj de canción ni entrada.
- **Prueba / aceptación:** Slow Ride completa: velocidad de simulación ≥ 98 % (estilo Budokai), audio 0 cortes desde antes de Jugar, mando→juego p95 ≤ 50 ms, intervalos de imagen >34 ms < 1 %. En iPhone el hito intermedio admite menos imágenes si audio y juicio están perfectos (prioridad de Santi: audio y jugabilidad no se negocian).
- **Dónde:** PC y iPhone.

### E6. Duelo online por enlace

- **Problema:** jugar contra otro por link.
- **Reutilizable:** Riff Duel (prototipo online ya probado con dos sesiones: nota, puntaje remoto, desconexión) y su servidor; idea de lobby/código de sala de Budokai.
- **Diseño propuesto:** cada jugador corre **su propio GH3** y toca su canción; se sincroniza el **inicio** (barrera como Budokai: ambos con recursos listos) y se intercambian puntaje/estrella/fallos cada ~100 ms por WebSocket. **Sin rollback** (no hace falta y el iPhone no podría). El modo «Batalla» del original (ataques) queda para después: requiere inyectar eventos en el juego.
- **Prueba / aceptación:** dos dispositivos distintos (PC + iPhone o dos celulares): inicio a ±50 ms, puntajes que coinciden con lo que muestra cada juego, desconexión detectada y avisada en < 5 s.
- **Dónde:** PC + nube (servidor) + dos dispositivos físicos. Va al final: sin E1–E2 no hay base estable.

---

## 3. Bloques chicos y orden

| Bloque | Qué | Resultado verificable |
|---|---|---|
| **B1** | **Medir la velocidad real del juego y dónde se va la CPU en condiciones de celular** (detalle abajo) | Tabla de funciones/hilos que más gastan con 2 núcleos en PC, comparada con el iPhone |
| B2 | Primer recorte de CPU según B1 (uno solo, el más grande) | Velocidad de simulación sube en PC-2núcleos y en iPhone, sin regresión |
| B3 | E1: motivo del abort + picos de memoria en el informe | Cada cierre trae causa |
| B4 | E2: recortar memoria (xex 64 MB, heap fuera del guest, caché con presupuesto) | 10 cargas seguidas sin cierre |
| B5 | E4: prueba de backend con el mismo cuadro en iPhone | Tabla de decisión |
| B6+ | E3, E5, E6 | según resultados |

Orden B1 → B2 antes que memoria porque hoy, cuando la canción sí entra, **no se puede jugar** (18 swaps/s); arreglar los cierres sin velocidad no da un juego jugable. B3 es barato y puede ir en paralelo dentro del mismo build.

---

## 4. Primer bloque recomendado: B1 «velocidad del juego y CPU en modo celular»

**Qué resuelve:** saber con números por qué el iPhone corre el juego al ~30 % y qué parte conviene recortar primero (lógica del juego, esperas entre hilos, fma por software, productor de snapshots en el hilo del CP, audio XMA).

**Pasos (cada uno chico):**
1. **Medidor de velocidad** en la página (estilo `lab-speed.js`): «velocidad del juego %» = swaps del juego por segundo / 60 y reloj de canción / tiempo real, en ventana de 5 s, separado de imágenes presentadas. Va al informe y al cartel. Archivos: `web/gh3-native60/gh3-diag.js` (y leer `[g1]`/contadores ya existentes; sin tocar el runtime).
2. **Núcleos y tiempo por hilo** en el informe: `hardwareConcurrency` y el `[g1d-thread]` de cada hilo (tiempo esperando vs trabajando) que el runtime ya imprime.
3. **PC imitando celular:** correr Slow Ride en Edge con afinidad de 2 núcleos (`set-affinity.ps1` de Codex, máscara 3) y el modo de calidad «muy» del celular, con perfil de CPU por hilo (herramienta del checkpoint OPTIM). Una corrida con productor R5L encendido y otra sin imagen (`r5live` apagado) para separar **juego** de **imagen**.
4. Comparar: velocidad del juego PC-2núcleos vs iPhone (si da parecido, la PC sirve como banco de pruebas y no hace falta el iPhone en cada intento).

**Archivos:** `web/gh3-native60/gh3-diag.js` (medidor e informe), `tools/r5-native60/run-song.mjs` o copia (corrida con afinidad), sin tocar runtime, renderer ni audio. Respaldo antes.

**Prueba y aceptación:**
- `npm test` + táctil + gobernador en verde.
- Informe del iPhone muestra «velocidad del juego ≈ 30 %» coherente con los swaps del registro (1499/84 s).
- En PC: tabla con velocidad del juego en (a) normal, (b) 2 núcleos con imagen, (c) 2 núcleos sin imagen, y las 10 funciones/hilos más caros en (b) y (c).
- Decisión escrita para B2: «el recorte más grande disponible es X, se espera +Y %».

**Requiere:** PC (corridas con turno; ~15 min de juego en total), iPhone (Santi juega Slow Ride una vez y pega el informe). Nube: sólo la parte de página y pruebas (sin juego).

**No incluye:** publicar (si hace falta publicar el medidor para el iPhone, se pide OK aparte), cambiar el runtime, tocar zona de Codex.

---

## 5. Lo que falta saber / quién lo hace

- iPhone físico (Santi): informes con el medidor (B1), cierres con causa (B3), 10 cargas (B4), backend (B5).
- PC: todo lo que corre el juego (datos del juego, wasm, runtime no están en GitHub).
- Codex: renderer (E3/E4); coordinar por `artifacts/COORDINACION.md` y un turno de pruebas a la vez.
- Desconocido hoy: cuántos núcleos ve Safari en el iPhone 11; memoria real del proceso (Safari no la da); si el abort es malloc del host o bloque guest.
