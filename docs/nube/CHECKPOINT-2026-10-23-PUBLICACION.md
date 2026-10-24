# Checkpoint 2026-10-23: publicación «BANDA COMPLETA» y fluidez (para seguir después de un /clear)

## Estado
- Sitio armado en `artifacts/pages-gh3/site/gh3` = producción (op7+gpuval) + 4 cambios. NO desplegado: el clasificador bloqueó `wrangler pages deploy` aunque Santi lo autorizó. Lo sube Santi con `2b-SUBIR-LO-ARMADO.cmd`. Después: verificar online (`node tools/modelos/online-alta.mjs --limpiar`, cartel «BANDA COMPLETA 23/10», hashes de los 3 .js vs locales).
- Respaldo del sitio anterior: `artifacts/respaldo/2026-10-23-sitio-antes-de-torsos-C`. El wasm no cambió (ya está en R2).
- Prueba previa (robot, `artifacts/d1-wasm/publicar-23-10/demo`): juego 87 %, pausa re-ancla una vez, error de reloj medio 25 ms, 0 errores, torsos visibles. Falta confirmación de Santi jugando.

## Qué entra (archivos tocados en el sitio)
1. `gh3-relojaudio.js` (Paso C): re-anclaje del ancla fija tras pausa (60 llamadas seguidas con error grande y sin medida buena -> suelta ancla) y tope 6 ms/cuadro (`?relojaudiocap=`).
2. `autopista60.js`: si el cuadro no está `complete`, dibuja el último completo del historial (`st.incompleteHold`) en vez de apagar la capa (autopista negra).
3. `r5snap-native60-scene-arm.js`: variante sin sombra del PS `18D176E1514D82CA` (torsos de la banda), generada con `tools/op7/armar-torsos.mjs`.
4. `gh3-novedades.js` (VERSION `2026-10-23-banda-completa`), `gh3-version.js` (`BANDA COMPLETA 23/10`), `index.html` (`?v=20261023a`).

## Descubrimientos para no repetir
- Tras pausar, el contador de muestras de audio sigue y el ancla fija queda vieja: el gancho veía error >0,5 s (`nBig`) y no corregía nunca más. Con juego al 80-86 % el tope de 2 ms no alcanza.
- Estadísticas del gancho: Int32 en ptr+104 = [calls,nCorr,nNeg,nZero,nStale,nBig,nCapped,nStill,nMeas,nFrozen]. El disparador debe resetearse solo cuando cambia nMeas (si no, nunca dispara).
- Autopista negra: causa = `fr.complete` falso (falta una textura). Razones de ocultado en `hw60.hides`; `med.mjs` ahora las guarda en `resultado.json` (`s.hides`), resumen con `tools/modelos/resumen-negros.mjs`.
- Torsos invisibles en alta: materiales que leen mapas de sombra salen negros/descartados; se arreglan con variantes sin sombra (WGSL necesita `diagnostic(off, derivative_uniformity);`).
- Windows: symlinks de directorio necesitan admin; usar junction `mklink /J`. Copias de prueba sin `chunks` (robocopy `/XD chunks`). Probar el sitio directo falla por el wasm en R2: usar una copia con wasm local.
- No puedo leer las críticas de jugadores (el monitor de estadísticas pide login propio y el proyecto de Supabase con el feedback no es visible para mi conector). Santi las pegará.

## Pendiente (nada sin OK de Santi)
- Que Santi corra `2b-SUBIR-LO-ARMADO.cmd`, y yo verifique online.
- Críticas de jugadores: agrupar por tema (audio, imagen, menús, celular, carga).
- Sin explicar: microcortes de audio al inicio (juego mide limpio, hipótesis: salida de Windows/Edge), lag ocasional, franja negra con juego al 50 % (640x360), error «Integridad de canción incorrecta» (hipótesis: copia en caché del perfil de prueba).
- Plan fluidez `docs/nube/PLAN-FLUIDEZ-60.md`: faltan D (escenario parejo), E (preset «Fluida»), F (dueño del crecimiento de memoria), G (techo de lógica), I (video de escena); H (precarga, `artifacts/d1-wasm/fluido/h/demo`) sin medir con jefes y sin publicar. fluido-ab (autopista a Hz de pantalla) sin publicar, Santi debe elegir.
- Importar partida de Santi: pausado (ver memoria `partida-guardada-importar`).
