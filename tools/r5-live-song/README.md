# Slow Ride con gráficos originales parciales (local)

Ejecutar `JUGAR-SLOW-RIDE-ORIGINAL.cmd` y abrir http://127.0.0.1:5424/?r5lite=1 en Edge.
Elegir la carpeta que contiene default.xex y DATA, pulsar Arrancar y luego Ir
directo a tocar. Teclado: A S D F G, rasgueo con flecha arriba/abajo. Conservar
la coordinación de turno de pruebas antes de ejecutar el juego.

El canvas muestra dibujos del juego original: vértices, texturas y shaders
traducidos desde Xenos. Se omiten escenario y efectos no aceptados; los mips
se aproximan usando solo el nivel base. No es un framebuffer completo ni
una certificación de 60 cuadros/s. La autopista provisoria queda oculta.
El audio, navegación y controles se conservan de la copia de songlive.
El modo liviano del productor (`r5lite=1`) queda activo por defecto; para
comparar con el anterior se puede abrir con `r5lite=0` explícito.

- `convert-slowride.py`: R4 sobre 134 ucode del manifiesto, por frecuencia de
  uso; constantes exactas del analizador del SDK. Originales intactos.
- `build-live.mjs`: copia `songlive/song` a `artifacts/r5-songlive/demo`; añade
  handlers exclusivamente al JS copiado y compila consumidores propios.
- `thread-consumer.mjs`: lectura R5L selectiva en CP, recursos copiados antes
  de entregar a otro hilo; un cuadro activo y un bitmap en tránsito.
- `gpu-worker.mjs` / `arena-renderer.mjs`: WebGPU persistente en worker propio,
  uploads agrupados y recursos reutilizables. Sin readbacks en producción.
- `live-reader.mjs`: proyección viva acotada; no reemplaza el validador R5F
  completo. El banco de registros se consume antes de avanzar el generador.
- `check-live-reader.mjs`: comparación de los campos consumidos de 1.083
  dibujos reales con el lector completo y controles de archivos truncados.
- `verify-live.mjs <etiqueta> <segundos>`: Edge oculto, navegación rápida,
  AudioWorklet y robot del recorrido ya comprobado. Requiere GPUCAP_TURN
  obtenido con `node tools/gpu-capture/turn.mjs reserve "Codex: ..."`.
- `summarize-live.mjs <etiqueta>`: swaps y presentaciones por tiempo real,
  costos y ventanas de diez segundos. Conserva todas las muestras originales.

Opciones locales: `r5liveconsumer=r5snap-song-scene.js` dibuja también los
elementos compatibles del escenario; tiene mayor costo. `r5snap-song-inline.js`
conserva el control anterior que dibujaba en el hilo CP. No son otros motores.

No publicar `artifacts/r5-songlive`: contiene código y recursos derivados del
juego. No se modifican CPU, CP, audio, entrada, r5_frame ni builds de Claude.
