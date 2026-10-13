# WebGPU original y cadencia independiente — 2026-10-13

Trabajo autorizado por Santi («Si dale»); fuentes `tools/r5-native60`, copia
`artifacts/r5-native60/demo`. No publicado. Base de Claude conservada.

## Comprobado

Los 134 shaders incluidos son traducciones originales WGSL; no se usan variantes
que quitan sombras. Para un cuadro real, los 258 dibujos admitidos dan los mismos
píxeles que el replay de referencia al avanzar 0 ms, volver a 0 ms y compactar
las arenas. SHA256 RGBA:
`c73a493af3af2be1d15753d19d9f7fc9e665651bcb2cac6f3a2e304774fda5c8`.
Es comparación contra el replay parcial existente, no contra Xbox 360 completa.

Pruebas de juego en Edge/PC, autopista/notas/colas originales, sin escenario:

- `runs/native5-road-full-slowride-1791868385428`: final del chart, reloj
  249043,84 ms; ventana medida 245,09 s, 58,75 cuadros presentados/s.
  Cero underruns, silentBlocks y skips de audio durante la corrida;
  cero errores de página, señal RMS final 0,062. 477 rasgueos, no certificar
  477 aciertos con ese dato. Sin pedidos de audio de red durante canción.
- `runs/native6-road-full-talkdirtytome-1791868763764`: final del chart,
  reloj 224581,69 ms; ventana 220,61 s, 58,65 cuadros/s.
  Cero underruns, silentBlocks y skips, cero errores de página;
  señal RMS final 0,061. 460 rasgueos. Durante esta corrida hubo un pequeño
  benchmark CPU aparte de preparación; no repetir esa superposición en
  mediciones futuras. Los contadores siguieron en cero.

No son 60 FPS constantes y no hubo audición manual de toda la salida. Los
contadores confirman continuidad del worklet en esta PC, no el altavoz ni iPhone.

Escenario original parcial, antes del último ajuste de temporizador:
`runs/native4-scene-compacted-slowride-1791867936359`, reloj final45,43 s,
41,64 cuadros/s ventana completa,42,84 después del reloj10 s. Audio0/0/0.
La compactación redujo uploads acumulados36,4→5,57 GB entre dos corridas
de recorrido parecido, con cargas visuales no idénticas. No atribuir esa
diferencia a RAM total. Buffers finales7,5 MiB, texturas GPU20,53 MiB.

## Cambios

GPU dedicado y port directo a página, snapshots inmutables, un cuadro en vuelo,
arenas/bind groups/texturas reutilizados, subidas limitadas a rangos activos,
compactación al salir de cine/menús, cachés de texturas limitadas e imágenes
vacías secundarias descartadas. La pista avanza entradas capturadas con la
geometría original; shaders de notas y colas conservan textura/fade/glow propios.
Avance limitado100 ms, imagen congelada si la fuente supera500 ms.

La última revisión corrige pérdida de intervalos por cuadros apenas tardíos y
añade histograma de pausas entre bitmaps. La preparación comparte geometría e
índices idénticos dentro de un snapshot; comparación CPU comprobó igualdad de
todos los assets/texturas/rechazos y vaciado de la caché al cambiar de snapshot.
Benchmark CPU aislado39,40→39,05 ms: mejora pequeña, no reclamar aceleración
significativa de CPU con esa prueba.

Prueba posterior `runs/native7-scene-cadence-slowride-1791869233289`:
escena parcial hasta reloj45,36 s;58,40 cuadros/s ventana completa y59,24
después del reloj10 s. Cero underruns/silentBlocks/skips, errores de página y
pedidos de audio de red en canción. Cadencia: cuatro pausas mayores100 ms
al comienzo, máximo259,07 ms; después10 s ninguna mayor100 ms, pero49
intervalos mayores34 ms. No equivale a60 FPS constantes sin microtirones.
La fuente original aportó17,83 snapshots/s después10 s: el resto proviene
de extrapolación de entradas, no de60 simulaciones del juego por segundo.

Revisión con pipelines preparados fuera de la presentación:
`runs/native8-scene-full-prewarm-slowride-1791869563585`, SlowRide hasta el final
del chart, reloj249,17 s; ventana249,32 s,58,92 cuadros/s. Sin errores de página
ni pedidos de audio de red durante canción. Pausa máxima61,45 ms, ninguna
mayor100 ms; se redujeron las pausas largas iniciales, pero persisten intervalos
irregulares (419 mayores34 ms en el registro completo). Fuente17,55snapshots/s.

Audio de esa última corrida:1underrun/50silentBlocks acumulados ya en la primera
muestra (reloj3,46 s), iguales al final;0skips. No se puede ubicar ese evento entre
navegación/carga/comienzo del tema con esta evidencia. NO afirmar cero cortes
de toda esta corrida; no hubo nuevos eventos en los249,32s medidos. El runner
ahora registra cambios de esos contadores desde antes de Jugar para ubicarlos
en próximas corridas. Ese registro adicional no estaba en esta ejecución.

Último replay aislado de esa revisión:60,03 cuadros/s por port directo,
igualdad de píxeles antes/después/compactación y0errores. No son FPS de juego.

## Pendiente del objetivo de Santi

60 FPS de toda la imagen, sombras y superficies COPY/EDRAM originales,
mipmaps, algunos materiales y expansión de rectángulos después del VS.
La escena conserva omisiones: no afirmar fidelidad completa aunque mejore su FPS.
Extrapolación de constantes de escena experimental; sincronía de toda la animación
y cámara pendiente de comparación nativa. Medición física iPhone11 pendiente.

Mapa de surfaces/dependencias: `surface-audit.json`; reglas de reproducción en
`tools/r5-native60/README.md`. Regresiones generales del repo: npm test24/24.
