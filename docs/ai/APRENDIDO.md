# APRENDIDO — atajos para no releer todo
Formato: una línea por dato, con la etiqueta [tema]. Buscar con Grep ("[online]", "[trucos]"...), no leer entero.
Al cerrar cada tarea: agregar 1-3 líneas (dónde está el código, trampa encontrada, cómo se probó). Sin historia ni opiniones. Si un dato queda falso, corregirlo o borrarlo.
Rutas relativas a artifacts/pages-gh3/site/gh3/ salvo que diga otra cosa. La fuente de verdad del sitio es artifacts/pages-gh3/site (no pages-gh3 suelto: no existe en la raíz).

## Dónde está cada cosa
- [online] cliente: juego/online.mjs (clase Online + panelOnline), conexión y mensajes WebSocket; uso en juego/app.mjs (~línea 360+: abrirOnline, avisoOnline, online).
- [online] servidor/Worker: artifacts/online-salas/src/index.js (Sala2.webSocketMessage); tests node artifacts/online-salas/test-*.mjs. El Worker se despliega aparte del sitio (gh3-salas): cambiar tipos de mensaje exige desplegarlo con OK.
- [menus] estado de menús: nav (juego/navigation.mjs) + app.mjs render()/drawMenu(); move/activate/back/tier son las entradas de teclado/mando/clic.
- [panel] panel de la derecha (Teclas/Sonido/Gráficos/Partida/Online): interfaz-relanzamiento.mjs.
- [trucos] truco en juego: juego/gameplay/trucos-menu.mjs; el panel de afuera (trucos-panel.mjs) se quitó el 08/11.
- [controles] juego/rl/controles-core.mjs, gh3-pad-ui.js.

## Trampas
- [online] el servidor solo reenvía tipos de mensaje conocidos: un tipo nuevo no llega sin tocar src/index.js.
- [busqueda] Grep/Glob sobre toda la raíz D:\guitar hero da timeout (carpetas enormes): buscar siempre dentro de artifacts/pages-gh3/site/gh3 o docs.
- [controles] no correr preparar-controles.mjs (pisa interfaz y panel).

## Hecho (más nuevo arriba)
- 08/11 [online][menus] el anfitrión manda {t:'menu',screen,group,selected,song,difficulty,page} y el invitado lo espeja (app.mjs emitirMenu/aplicarMenuRemoto/espejo). Test: artifacts/online-salas/test-menu.mjs. Falta: desplegar Worker y probar con 2 personas.
- 08/11 [panel] se quitó la sección Trucos del panel de afuera.
- 08/11 [online][pruebas] prueba rápida sin navegador: wrangler dev --local --port 8898 --config artifacts/online-salas/wrangler.toml + dos WebSocket de node a ws://127.0.0.1:8898/api/sala/SALAB (salas fijas SALAA-SALAT; otras dan error). El navegador integrado queda trabado en el cartel Relanzamiento: no sirve para probar la UI.
- 08/11 [deploy] Worker: cd artifacts/online-salas && wrangler deploy (versión a0d31178, cuenta fikadesign3; falla "fetch failed" a veces: reintentar). Pages prueba: cd artifacts/pages-gh3 && wrangler pages deploy site --project-name lvh3 --branch online-prueba --commit-dirty=true (6284e9aa, alias online-prueba.lvh3.pages.dev). Producción /gh3/ sin menú espejo todavía.
- 08/11 [online][menus] Santi probó en online-prueba (6284e9aa): menú espejo del invitado FUNCIONA. Pendiente solo publicar en main con OK (Worker ya está desplegado).
- 08/11 [deploy] PUBLICADO main d939163b (menú espejo). Cartel de versión: app.mjs chequearBuild/mostrarBuild lee gh3/juego/build.json (lo escribe publicar-0511.mjs); solo avisa con botón ACTUALIZAR, nunca recarga solo; quien tenía la página abierta con código viejo no lo recibe hasta recargar.
- 08/11 [deploy] PUBLICADO main cd341471 + Worker af86bdd7: cartel de versión, 'Siguiendo a', sonidos, results espejado, sugerencia de canción. Verificado 703/703 archivos por hash. Respaldo artifacts/respaldo/publicar-gh3-2026-11-08T05-02-39-758Z. Interfaz de estos 4 cambios SIN probar en navegador.
- 08/11 [panel][partidas] pestaña Partida = copia de seguridad (gh3/partidas-copia.mjs, lista blanca de claves gh3.*/gh3padmap/gh3TouchZones/gh3NombreOnline/gh3-settings/motor01.*; NO toca IndexedDB gh3-data ni claves del panel de estadísticas). Probado ida/vuelta/deshacer en 8840 con datos de prueba; sin publicar. También: quitado cartel y botón DESAFÍO INAUGURAL (juego/rl/relanzamiento.mjs). Prueba de UI sin pasar por el cartel: servidor gh3-candidato (8840) + javascript_tool.
- 08/11 [online][coop] puntaje/rockómetro compartidos en coop: gameplay/session.mjs compartir() (suma puntos, promedia rock; solo HUD, la falla sigue por jugador en el motor). Look en sala: app.mjs sincronizarLook/publicarLook manda lo confirmado del perfil (antes mandaba lo que se miraba) y llama online.guia() para la cara propia. Sin probar con 2; respaldo en artifacts/respaldo/2026-11-08-coop-compartido.
- 08/11 [deploy] coop compartido + look en vivo subido a online-prueba (5925543b); falta prueba de 2 y publicar en main con OK.
- 08/11 [relanzamiento] cartel de novedades RELANZAMIENTO desactivado (juego/rl/relanzamiento.mjs línea ~101; ?intro=1 lo sigue mostrando). Sin subir.
- 08/11 [online][invitar] botón Invitar ya existía en la barra de sala (juego/online.mjs, inv.onclick); ahora comparte texto+link (apodo, modo, código; hoja nativa en celular, portapapeles en PC), destacado en paso 1. Link = origin+pathname de top + ?sala=CODE (app.mjs ya lo abre). Solo node --check; sin probar en navegador ni desplegar. Respaldo artifacts/respaldo/online.mjs.antes-invitar.
- 08/11 [online][eleccion] antes de tocar online: app.mjs empezarEleccion/confirmarEleccion/arrancarEleccion (chars -> guitars; Atrás salta; 'nombre' forzado = "ya eligió"; publicarLook callado mientras se elige). Presentación con 3 estados en juego/presentacion-online.mjs (chip mientras elegís, tarjeta LISTO flotando, todos listos con destello y 2,4 s antes de cargar).
- 08/11 [online][pausa] pausa compartida en coop: motor main.js alternarPausa -> parent.__gh3Online.pausa -> {t:'pausa'} -> __motor.pausaRemota. Necesita Worker desplegado (src/index.js ya editado, SIN desplegar). Mando solo en ventana con foco: gh3/foco-mando.js (parchea Navigator.getGamepads) cargado en 3 index.html. Subido a online-prueba 9eddb8e2.
- 08/11 [deploy] Worker gh3-salas con 'pausa' desplegado (4deaa397).
- 08/11 [canciones propias][concierto] tools/canciones/crear-paquete.mjs: .chart/.mid + audio -> paquete lvh-paquete en site/concierto/paquetes/<id>/ (+indice.json; --quitar id). Usa chart.js/paquete.js del motor para HOPO y validar; texturas por hardlink desde original-local. Trampa: nota corta = pulso/8, sostenida solo si >1/3 negra; paquete.json exige las 51 texturas. Test: node --test tests/canciones-paquete.test.mjs. Sin probar en navegador (falta OK); ?paquete=<id>.
- 08/11 [online][presentacion] escenario 3D en la presentación: escena.js encuadreMenu modos pres-yo/pres-compa/pres-duo (+vaivén en dibujar); presentacion-online.mjs mete iframe escena (modelo=yo guitarrista, modelo2=compa bajista) y alterna cámaras; app.mjs urlPresenta/lookQ, arranque espera escena lista (2,6-6 s). Sin probar en navegador.
- 08/11 [panel][guia] guía de controles (izquierda) arranca siempre recogida: gh3/gh3-notas.js ~línea 188 (b.click() incondicional; ya no recuerda abierta).
- 08/11 [canciones propias] probado en navegador (servidor gh3-candidato:8840, /concierto/?paquete=id): carga, audio wav y notas OK. Trampa corregida: el motor pide 3 texturas extra de Star Power fuera de paquete.json, por eso se enlaza toda tex/. El server concierto-web:8803 sirve OTRA carpeta (motor-06-concierto/web), no el sitio.
- 08/11 [online][reinicio] Reiniciar en online: motor reiniciar -> parent.__gh3Online.reiniciar (solo anfitrión) -> {t:'reiniciar'} -> Worker arma ronda nueva misma canción y manda lista con reinicio:true -> app cierra frame y relanza sin elección. Worker editado SIN desplegar. Presentación: precargarEscena al empezar la elección; 'todos' dura 5 s con escena lista.
- 08/11 [deploy] Worker con 'reiniciar' desplegado.
- 08/11 [canciones propias][chart auto] tools/canciones/generar-chart.py (numpy+ffmpeg, sin librosa): audio -> .chart por ataques; tempo 110-170 bpm por autocorrelación; solo borrador, notas a su ms real. crear-paquete.mjs --silencio-ms N antepone silencio (mp3 libmp3lame; libvorbis no está en este ffmpeg) y corre el chart. Paquete byob instalado en concierto/paquetes (local, no publicar); quitar con --quitar byob.
