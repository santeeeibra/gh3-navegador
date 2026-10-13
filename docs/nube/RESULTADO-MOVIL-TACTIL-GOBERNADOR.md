# Resultado: controles táctiles + gobernador móvil (Claude en la nube, 2026-10-13)

Rama `movil-tactil-gobernador`. Entregado como PR **sin merge y sin publicar**.
En la nube no hay datos del juego, wasm ni bundles del juego: **nada de esto se
probó con GH3 real ni en un iPhone**. Lo que sigue separa COMPROBADO / PENDIENTE /
HIPÓTESIS.

## Qué cambia, en simple

1. **Antes de Jugar (celular o `?touch=1`)**: debajo de «Jugar» aparece
   «Controles táctiles activados», con los 5 colores, una explicación corta
   (tocar al llegar al aro, mantener en notas largas, varios dedos para acordes,
   rasgueo automático o manual según el ajuste) y dos botones:
   - «Probar controles»: pantalla con los 5 colores en el mismo lugar y tamaño
     que en la canción. Se iluminan al tocar, con varios dedos. No carga el
     juego, no descarga nada y no manda nada al mando. Tiene su «Jugar».
   - «Controles»: la misma pantalla con los ajustes abiertos.
2. **En la canción**: las zonas tienen un borde tenue del color siempre visible
   (sin relleno que tape notas); al tocar se llenan al instante. Ajustes que se
   guardan: altura, ancho, tamaño y **visibilidad del borde** (nuevo). Los
   ajustes viejos se conservan. Respeta los márgenes del iPhone (la barra de
   inicio). El botón de ajustes ahora se llama «Controles». Volver/Start,
   cruceta en menús, pausa y estrella siguen igual. En PC no aparece nada.
3. **Gobernador** (`gh3-governor.js`): cada 100 ms mira cuánto colchón tiene el
   audio y si baja, cuánto tarda la preparación de imágenes, la GPU, la memoria
   y la latencia de los controles. Si hay riesgo baja la calidad visual en el
   mismo instante; la sube despacio y de a un escalón cuando todo está tranquilo
   un rato. Estados: normal → protegido → mínimo.
   - CPU: preparar como máximo 1 imagen cada 25 ms (≈ la mitad a 60 Hz), sin
     convertir texturas nuevas de escena; en mínimo, sólo pista/notas/colas/HUD.
   - GPU: 1280×720 → 960×540 → 640×360 (con nitidez moderada).
   - Memoria: menos texturas guardadas sin usar (64 → 40 → 24 MiB).
   - Nunca toca el audio, el reloj, el mando ni el juicio. En celular actúa;
     en PC sólo observa y anota (`?gov=1` lo activa, `?gov=0` lo apaga).
4. **Telemetría barata**: el worklet de audio escribe su estado en memoria
   compartida (sin mensajes por bloque). El informe de diagnóstico y «Copiar
   estado del sonido» incluyen el resumen del gobernador con métricas
   separadas: imágenes presentadas / swaps del juego / snapshots / producción de
   audio / latencia de controles / cortes.

## COMPROBADO (en la nube, sin el juego)

| Prueba | Resultado |
|---|---|
| `npm test` (24 previas + 30 nuevas: worklet, gobernador, aplicar) | 54/54 ✓ (las previas necesitan `npm ci` antes) |
| `npm run test:movil-tactil` (Chromium, emulación iPhone 11 896×414) | 74/74 ✓ |
| `npm run test:movil-gobernador` (WebGPU SwiftShader + worklet real) | 27/27 ✓ (3 corridas seguidas) |

Detalle de lo comprobado:
- **Audio**: el worklet nuevo produce **las mismas muestras, una por una**, que
  el anterior (ritmo real, parón, producción lenta y rápida). La telemetría
  coincide con sus contadores y `process()` no manda mensajes.
- **Prueba de controles**: cero pedidos de red durante toda la prueba, cero
  escrituras al mando, el juego no arranca; «Jugar» desde la prueba sí arranca
  la carga. Acordes, sostenidas, deslizar, cancelar, perder foco, girar.
- **Controles en canción**: cada zona = su traste, alineada a los aros con
  bandas negras, bordes visibles sin apretar, se ilumina dentro del mismo
  evento de toque, 4 toques = 4 rasgueos, ajustes guardados y migrados,
  valores inválidos acotados, márgenes seguros, nada al mando estando apagado,
  PC sin táctil salvo `?touch=1`, `?touch=0` lo apaga.
- **Worker GPU real** (bundle `r5snap-native60-gpu.js`) con dibujos y shaders
  **sintéticos**: escala 100 → 75 → 50 → 75 → 100 % en marcha con la imagen
  correcta y sin perder el dispositivo; presupuesto de 24 MiB aplicado; la
  pista (esencial) siempre se dibuja y la escena con textura nueva se difiere
  bajo presión y vuelve al terminar (también si la textura cambió mientras).
- **Gobernador**: con telemetría simulada (21 casos) y con el worklet real:
  recorte en el mismo tick, mínimo ante colchón crítico o corte, recuperación
  escalonada ≥5 s y ≥10 s, sin oscilar con señal ruidosa (1 cambio en 2 min),
  espera duplicada si oscila lento, separación CPU/GPU/memoria, anticipo al
  arrancar/cargar/empezar canción, «observa» no actúa, latencia de entrada
  medida (resolución 8 ms).
- La prueba encontró y corregí dos errores míos antes de entregar: una
  medición de producción de audio de 100 ms (ruidosa) que daba protecciones
  falsas al arrancar, y una textura diferida que no se actualizaba después.

## PENDIENTE (no se puede hacer desde la nube)

1. **GH3 real en la PC de Santi** (con el turno de PRUEBAS-EN-CURSO libre):
   - Aplicar: `node tools/r5-native60/build.mjs` y después
     `node tools/r5-native60/apply-web.mjs` (guarda respaldo de lo que reemplaza).
     **Ojo**: el orden importa; `build.mjs` copia la base vieja encima.
   - Primero `?gov=observa` (no cambia nada) y una canción completa de pista y
     una de escena: copiar el informe (diagnóstico → Copiar informe). Ver si el
     gobernador *habría* recortado y por qué.
   - Después `?gov=1` con las mismas canciones. Comparar: cortes y saltos de
     audio (deben ser 0 en todo el audio esperado, desde antes de Jugar),
     `bloquesEstirados`, fps presentados vs swaps del juego vs snapshots,
     latencia de controles, tiempo en cada estado.
2. **iPhone 11 físico**: lo mismo, más 15 min seguidos (calor), canciones
   completas, navegación, cargas y videos. Revisar `formatosGpu` en el informe
   (qué compresión soporta de verdad), memoria y si hubo cierre por memoria.
3. **Calibrar umbrales** con esos informes (`gh3Governor.setConfig(…, true)`
   los guarda en el dispositivo). Los valores actuales son iniciales.
4. **Presentación al lienzo WebGPU**: en la nube ningún lienzo WebGPU puede
   mostrar imagen (falla incluso un programa mínimo), así que la prueba usa un
   lienzo falso. El cambio de escala en el lienzo real queda por ver.
5. **Ritmo adaptable del audio**: el worklet (de antes) estira el sonido hasta
   4 % más lento si falta producción. Eso choca con «no ralentizar», pero
   cambiarlo sin medir arriesga cortes. Lo dejé igual (idéntico) y agregué:
   contador `bloquesEstirados` y `?audiorate=0.005` para probar un límite de
   ±0,5 % en el juego real. Decidir después de medir.
6. **Captura del flujo de comandos en el runtime** (`gh3-web.js`, no está en el
   repo): el gobernador evita la preparación y las lecturas caras, pero la
   captura previa del runtime sigue en cada swap. Recortarla requiere tocar el
   runtime.
7. **Sombras/reflejos/partículas por separado**: native60 no clasifica esos
   dibujos; hoy se baja la resolución y en mínimo sale toda la escena.
8. **ASTC/ETC2/KTX2, precarga con presupuesto** de shaders/texturas/música fuera
   del tramo de juego: no implementado (sólo se informa el soporte real).
9. **Swaps del juego por segundo** como señal de riesgo: apagada hasta tener un
   valor de referencia medido.

## HIPÓTESIS (a confirmar con las mediciones)

- Espaciar la captura a ~30 snapshots/s libera tiempo del hilo del CP y ayuda a
  que el juego produzca audio a tiempo. La pista sigue moviéndose con la
  extrapolación existente (≤100 ms); no cambia entradas ni juicio.
- 960×540 y 640×360 bajan el costo de GPU (56 % y 25 % de píxeles), pero no
  aceleran la lógica del juego ni la CPU (ya se vio en PC).
- El filtro «sólo pista» (el de la calidad colas/«muy») incluye el HUD: no
  verificado en esta rama.

Números previos de la PC (pista ~58,7 fps; escena parcial ~58,9 fps con 1
corte inicial; preparación de escena ~29 ms/snapshot) son **contexto**, no
resultados de esta rama. Con ~29 ms de preparación, en PC el gobernador
marcaría riesgo de CPU casi siempre: por eso en PC sólo observa.
