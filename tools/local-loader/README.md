# Cargador automático de GH3 — prueba local

Autorizado por Santi el 2026-10-11: preparar la experiencia de carga automática
y caché, probándola con servidor local. No es autorización para publicar GH3.

Abrir `JUGAR-GH3-CARGADOR-LOCAL.cmd`. El acceso levanta un servidor exclusivamente
en `127.0.0.1:5440` y abre Edge. Elegir **Preparar canciones** y, cuando termina,
**Jugar**. Inicia la navegación rápida existente hasta Slow Ride; conserva los
controles/el audio de la copia de `r5pipe`. La siguiente visita prepara automáticamente la selección guardada.
El servidor local debe seguir abierto. Esto no es un enlace público.

La ventana tiene una guía visual Xbox/PS4 con las teclas actuales. Cambia de
menús a canción automáticamente (o permite elegir la vista), sigue cualquier
reasignación hecha en Ajustes y marca las teclas mantenidas. No modifica los
controles de GH3: en canción son LT/LB/RB/RT/A en Xbox y L2/L1/R1/R2/✕ en PS4.

La preparación muestra porcentaje y MB reales. Al jugar, una pantalla de carga
muestra bytes del programa mientras llegan, preparación del motor, señales de
menús y carga de canción. La compilación y la navegación se muestran por etapas,
sin inventar porcentaje ni cuenta regresiva. Al empezar la cuenta regresiva del
juego se retira; al regresar al menú permite interactuar. Si deja de recibir
señales o pasa mucho tiempo sin avances, aparece un aviso y Reintentar; los errores
del worker/renderer también aparecen en pantalla. Los diagnósticos quedan plegados.

## Cómo se carga

- Un catálogo inventaría `DATA` y `default.xex`; nunca modifica la carpeta original
  ni sirve `$SYSTEMUPDATE`, instrucciones locales o archivos arbitrarios.
- Cada archivo tiene partes de 2 MiB verificadas por SHA-256. Se guardan como
  Blobs en IndexedDB (`gh3-local-chunks-v1`), separadas del guardado de progreso.
- La preparación incluye 45 archivos comunes del recorrido registrado de Slow
  Ride y tres por canción (audio/índice/chart). Las primeras cuatro suman
  378.985.932 bytes (361,4 MiB); no se precargan los 3,4 GB completos.
- Esa lista de comunes procede de un recorrido, no garantiza todos los héroes,
  escenarios, dificultades o canciones. Los 659 archivos están enumerados: una
  dependencia no preparada se lee por partes desde el servidor local, con
  comprobación de integridad, y se guarda para las siguientes visitas. Esa lectura
  síncrona puede provocar una pausa: la telemetría `localCache` registra qué falta
  para ampliar los paquetes, sin cambiar CPU/CP ni reconstruir el wasm.
- Una visita posterior recupera también los Blobs de dependencias descubiertas,
  además de los paquetes seleccionados. El adaptador verifica esos bytes antes de
  usarlos; no vuelve a transferir partes ya presentes y válidas.
- WORKERFS conserva directorios, tamaños, búsquedas y lectura. Solo se adapta su
  `read` en la copia; los datos grandes no se vuelcan íntegros a MEMFS. La caché
  de bytes calientes está limitada a 32 MiB; los demás Blobs permanecen en el
  almacenamiento del navegador.
- Interrumpir la preparación conserva partes confirmadas; reintentar verifica y
  reutiliza esas partes. Una parte dañada se vuelve a pedir. No se borran datos ni
  guardados automáticamente; los errores de espacio se muestran al usuario.
- La partida usa la implementación existente de r5pipe (`gh3-data`). Cada puerto
  es un sitio distinto: la partida de localhost:5432 no se migra automáticamente
  a 127.0.0.1:5440. No se debe borrar la copia original.

## Construcción y verificación

```powershell
node tools/local-loader/build.mjs
node tools/local-loader/server.mjs 5440
node tools/local-loader/check.mjs
node tools/local-loader/prepare-check.mjs
node tools/local-loader/ui-check.mjs
# Solo con reserva propia vigente en GPUCAP_TURN:
node tools/local-loader/game-check.mjs 140
```

`build.mjs --reuse-data` reutiliza hashes previamente calculados únicamente si
carpeta, tamaños y fechas coinciden. El build normal vuelve a leer/verificar todo.
Los archivos generados y el wasm permanecen en `artifacts/local-loader`, excluido
de Git y publicación. `sources-sha256.json` permite comprobar que r5pipe no cambió.

`check.mjs` prueba integridad, lectura por rangos, servidor acotado, interrupción,
recuperación, almacenamiento dañado y cambios en los datos de origen con fixtures
propias, incluyendo el adaptador dentro de un Worker real. `prepare-check.mjs` prueba los cuatro paquetes reales sin ejecutar el juego
y cierra/reabre Edge con un perfil persistente. Una prueba con juego/GPU requiere
la reserva de `artifacts/PRUEBAS-EN-CURSO.md`; no reutilizar ni liberar la de otro.

`ui-check.mjs` comprueba guía y reasignación real, feedback de tecla, porcentaje,
layout de escritorio/390 px y las etapas, inactividad y errores de carga con una
fixture sin ejecutar GH3. `game-check.mjs` comprueba además bytes del wasm contra
su tamaño, ocultación de la carga y guía en modo canción junto al juego real.

## Límites

Se conserva el renderer parcial existente: este cargador no corrige las notas que
aparecen tarde, la imagen 3D incompleta ni agrega online. Carga inicial/cacheo
comprobables no equivalen a certificar carrera completa, celulares o Safari.
Recuperar recursos sin su servidor no equivale a inicio totalmente offline:
la página y el programa se siguen sirviendo desde el servidor local.
