# Diseño móvil: audio y jugabilidad primero — 2026-10-13

IMPLEMENTACIÓN APROBADA Y DELEGADA A CLAUDE. Santi: «Perfecto que aplique
Claude esto». Después: «Y luego apaga mi pc», «Dale apura». No repetir pregunta
de aprobación para este alcance. Traspaso ejecutable y condición de apagado en
artifacts/mobile-priority/PEDIDO-CLAUDE.md. Todavía no hay implementación ni
validación nuevas por el solo hecho de esta aprobación.

Prioridad explícita nueva de Santi: «El audio no se negocia. Tiene que escucharse
siempre constante y fluido. Al igual que la jugabilidad. Sacrifica otras cosas.
Pensa un sistema mas avanzado». Este archivo es un diseño, no implementación
ni evidencia de funcionamiento físico en iPhone. El objetivo original de GH3
se conserva; la calidad de la escena puede bajar para proteger su ejecución.

## Contrato de funcionamiento

La canción mantiene su ritmo, tono y sincronía con el juicio del juego. No
usar ralentización perceptible como solución a falta de CPU. Las correcciones
de deriva entre relojes requieren medición y límites que no alteren el ritmo.
Controles y reglas de acierto mantienen prioridad, incluso al bajar gráficos.
Las colas visuales no pueden atrasar el registro de un toque. La presentación
interpolada a60/s no prueba que lógica ni respuesta de controles funcionen a60Hz.

En la base inspeccionada el worklet adapta consumo entre0,96 y1,03 y tiene
target9600 muestras a48kHz (~200ms de cola interna, aparte de salida). Ese
parche no certifica audio a ritmo original bajo sobrecarga sostenida. No ampliar
el buffer indiscriminadamente: más cola puede agregar demora/desincronía.
Antes de cambiar audio/reloj, coordinar con Claude y probar su relación con
el reloj original y juicio, no sólo el reloj visual del overlay.

## Gobernador de trabajo

Medir reserva de audio y tendencia de producción, duración/picos de tareas CPU
de preparación, GPU, pausas entre cuadros, entradas y confirmación del juego,
memoria explícita y señales de device loss. Las stats actuales de audio publicadas
cada segundo son insuficientes para prevención: exponer telemetría ligera de
productor/consumidor por SAB con lecturas baratas desde los workers. No hacer
allocations, logs, locks o mensajes de alta frecuencia dentro del worklet.

Estado normal → protegido → mínimo. Recortar tareas visuales inmediatamente
ante riesgo y recuperar calidad lentamente tras estabilidad sostenida. Usar
histeresis y mínimos de permanencia para evitar oscilación. Los umbrales de
reserva/tiempos se calibran en iPhone real; ningún valor de ejemplo es garantía.
Un underrun hace fallar la validación aunque luego se recupere el sonido.

Separar respuesta a cuello CPU, GPU y memoria:

- CPU: parar compresión/conversión, compilación y trabajos decorativos; reducir
  frecuencia de preparación/captura de escena antes de leer/copiar recursos
  caros. Reutilizar geometría/texturas estables. El paso del CP al worker debe
  preservar recursos inmutables: no diferir lecturas de memoria del guest que
  pueden cambiar después del swap. Mantener entradas/juicio/hilos de audio.
  Perfilar también el juego recompilado; bajar resolución no acelera su lógica.
- GPU: bajar resolución interna de escena, coste de sombras/reflejos/efectos
  y antialiasing. Mantener pista/notas/colas/HUD legibles y shaders originales
  donde la carga permita. Separar capas originales sólo después de implementar
  y validar dependencias/pasadas; el renderer actual no tiene ese grafo completo.
- Memoria: formatos GPU compatibles, mip correcto/tamaño selectivo, presupuesto
  de recursos activos+inactivos y expulsión después de terminar su uso GPU.
  Evitar copias simultáneas comprimida+RGBA+staging innecesarias. No confundir
  presupuesto de texturas con memoria wasm/driver.

Modo mínimo: pista/notas/colas/HUD y audio/controles; escena reducida o ausente.
Suavizar movimiento no reemplaza acelerar CPU ni corrige sincronía/juicio lento.
Si la simulación original no alcanza tiempo real aun con ese mínimo, ese
dispositivo no cumple el contrato; no certificarlo con una tasa visual de60.

## Recursos preparados antes de tocar

Datos comprimidos de música listos en caché antes de empezar. Decodificación
adelantada acotada, sin cargar toda la canción PCM en RAM. Preparar shaders
necesarios y texturas estáticas fuera del tramo de juego; controlar también la
carga durante menús/videos. Suspender tareas de fondo cuando falta margen.

Preparar variantes ASTC/ETC2/BC o KTX2 según capacidades comprobadas del
adaptador. KTX2 es un contenedor; su transcodificación también consume CPU.
Convertir/guardar fuera del juego y mantener fallback. ASTC/ETC2 no están
implementados en nuestra ruta ni certificados en el iPhone de Santi. Convertir
BC original a otro formato introduce recompresión con posible pérdida visual:
validar alfa, sRGB, normal maps y texturas de dos canales; no cambiar sólo un
nombre de formato ni recomprimir dinámicamente cada cuadro.

Resolución: probar escena960x540 desde1280x720 (56,25% píxeles), luego640x360
si hace falta (25%). No esperar mejoras equivalentes de FPS: geometría, CPU
del juego y transferencia permanecen. Reconstrucción espacial sencilla y
nitidez moderada; evitar desenfoque general o filtros temporales que dejen
rastro en notas rápidas. Efectos/público sólo pueden actualizarse con menor
frecuencia si se demuestra que no alteran scripts/estado jugable.

## Orden de implementación y reparto

1. Instrumentación ligera de audio/reloj/entrada y picos CPU/GPU, y protocolo
   de prioridad compartido. Claude: audio/entrada/CPU/CP. Codex: renderer.
2. Prototipo del gobernador en copias aisladas, con un cuadro GPU en vuelo,
   adaptaciones por motivo del cuello y protección anticipada.
3. Reducir preparación/copias/subidas y precalentar con presupuesto; luego
   resolución y formatos móviles, comparando la misma escena admitida.
4. iPhone11 real, prueba sostenida de al menos15min para detectar degradación
   por carga/calor, además de canciones completas y navegación/carga/vídeos.
   No depender de una API de temperatura: observar caída de rendimiento.

Aceptar sólo con cero nuevos underruns/skips durante todo el audio esperado,
sin cortes auditivos, sin reinicios ni cambios de velocidad y con latencia de
entrada/sincronía medidas. Registrar eventos desde antes de Jugar; la última
corrida native8 tenía1underrun antes de su primera muestra3,46s y NO satisface
el requisito para toda la corrida. No borrar contadores para aprobar.

## Evidencia que orienta el diseño

- Native4: preparación de escena ~29,1ms CPU/snapshot en PC. Native8:58,92
  presentaciones/s pero17,55snapshots/s; son métricas distintas. No se midió
  aún latencia efectiva de entrada→juicio con esta ruta.
- Renderer anterior aislado: texturas reducidas162,06→55,94MiB de asignaciones
  explícitas; ahorro65,5%, con pérdida de detalle. No es RAM total ni FPS del
  juego, y no se ejecutó en iPhone físico.
- Renderer anterior/juego con afinidad dos CPU de PC y GPU de PC: bajar
  texturas+540p no resolvió el conjunto y hubo underruns. No usar esa simulación
  para certificar un dispositivo móvil ni extrapolarla a native60.

Referencias primarias consultadas:
- https://www.w3.org/TR/webgpu/ (compresión como features del adaptador).
- https://gpuweb.github.io/types/types/GPUFeatureName.html
- https://www.khronos.org/ktx/ (contenedor y compresión nativa GPU).
- https://github.khronos.org/KTX-Software/ktxtools/ktx_encode.html
