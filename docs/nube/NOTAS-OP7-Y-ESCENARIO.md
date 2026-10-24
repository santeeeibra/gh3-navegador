# Notas para seguir: op7, capa autopista60 y lag del escenario (Claude, 2026-10-22)

Estado al 22/10: op7 armado y probado LOCAL, sin publicar (falta OK de Santi). Detalle y tablas:
`artifacts/d1-wasm/alta100/RESULTADO-ALTA100.md` (secciones op7) y `artifacts/d1-wasm/modelos/RESULTADO-MODELOS-DIAG.md`.

## Qué es op7 y cómo se rearma (sin compilar, sin WSL)
Carpeta `artifacts/d1-wasm/alta100/op7` = op5 (lectores op2 + armador fuera del hilo CP) + wasm y JS nuevos + capa + banda + novedades.
1. wasm: `bash artifacts/d1-wasm/watchtf/link.sh <op7>/web <op7>/rep` con `rep/d2_r5_frame.o` = `hash-alta/hash/obj/d2_r5_frame.o`
   (receta del publicado fac60f0b cambiando solo ese objeto) → wasm aba13ad1. Copiar `web/gh3-web.wasm` a la carpeta.
2. JS: `node tools/op7/hash-js.mjs artifacts/d1-wasm/watchtf/control-web/gh3-web.js <op7>/web/gh3-web.js artifacts/d1-wasm/alta100/op2pub/gh3-web.js <op7>/gh3-web.js`
   (op2pub lee el wasm local; para publicar, partir del JS publicado con la URL de R2 en `findWasmBinary`).
3. `node tools/op7/armar-capa.mjs` (lector autopista60 + filtro en el armador), `node tools/op7/armar-banda.mjs` (banda visible),
   `node tools/op7/novedades.mjs` (novedades y cartel «ALTO Y BANDA 22/10» tomados del sitio).
4. Probar a mano: `JUGAR-GH3-OP7.cmd`. Medir: `node tools/modelos/med.mjs bien --tema slowride --perfil medir --root artifacts/d1-wasm/alta100/op7 --calidad completo --segundos 45 --aceptar 8 --plazo 260 --ver`
   y `node tools/r5-native60/resumen-alta.mjs <carpeta>`.

Medido (Edge visible, Slow Ride 45 s): alta 88 % (publicado 49 %), liviana 92 % (publicado 88–89 %), capa 59–60 img/s,
gancho corrigiendo (error medio −15 ms), robot sin perder.

## Antes de publicar cualquier cosa (checklist)
- MEDIR SIEMPRE CON EDGE VISIBLE (`--ver`): en headless la calidad alta puede quedar sin imágenes y dar un «juego %» falso.
- `grep -c relojAudioMemory gh3-web.js` = 1 (gancho reloj-audio en el JS).
- En una corrida: `capaMostradas` > 0 y `relojAudio.writes` > 0 (si no, la capa y el gancho están muertos aunque el JS los tenga).
- Sitio real: `node tools/modelos/online-alta.mjs --calidad liviano --cancion` muestra capa y gancho del sitio publicado.
- El sitio (`artifacts/pages-gh3/site/gh3`) tiene página y paneles más nuevos que op7: copiar solo los archivos que cambian
  (gh3-web.js/wasm, r5snap-native60-*.js, r5snap-armador.js, autopista60-filtro.js, *-arm.js, -gpu.js, novedades, versión), no el index de op7.

## Problema publicado encontrado (22/10)
op2pub (publicado hoy) perdió la capa autopista60 y el gancho reloj-audio: sus lectores `r5snap-native60-*.js` se rearmaron desde la
fuente sin `importScripts("autopista60-tap.js")` al final. Arreglo mínimo para lo publicado: agregar esa línea a los 3 lectores
(ya consultan `__hw60DrawFilter` en el hilo CP). op7 lo trae arreglado.

## PRIMERO (Santi 2026-10-22, antes de publicar op7): investigar la IMAGEN CLAVADA intermitente
**RESUELTO (Claude 2026-10-22, gpuval):** causa = cualquier error de validación WebGPU se trataba como «GPU perdida» y el
dibujador descartaba todo para siempre (las 3 clavadas tienen `gpuPerdida=true`). Es la misma causa de la pantalla negra contra
Tom Morello (64 de 86 intentos con `GPUValidationError` en estadísticas). Arreglo local `tools/gpuval/validacion-patch.mjs`
(probado con errores provocados: imagen sigue a 60). Detalle: `artifacts/d1-wasm/gpuval/RESULTADO-GPUVAL.md`.
Publicar op7 + gpuval: armar-sitio (abajo) y DESPUÉS `node tools/gpuval/validacion-patch.mjs artifacts/pages-gh3/site/gh3`.

Santi aprobó publicar op7, pero eligió investigar esto antes. Todo listo para publicar, SIN tocar todavía el sitio:
- Copia de prueba = sitio actual + op7: `artifacts/d1-wasm/op7-sitio/demo` (wasm local). Sitio actual tal cual con wasm local:
  `artifacts/d1-wasm/op7-sitio/base`. JS para publicar: `artifacts/d1-wasm/op7-sitio/gh3-web.publicar.js` (wasm en R2
  `gh3-web-aba13ad1.wasm`, nombre NUEVO: el R2 tiene caché inmutable de 1 año). Respaldo del sitio: `artifacts/respaldo/2026-10-22-op7-sitio/`.
- Medido sitio+op7 (Edge visible, 45 s): alta 86 %, liviana 93 %, muy 93 %; capa y gancho andan. Sitio actual: capa 0 siempre.
- SÍNTOMA (COMPROBADO): al empezar la canción el dibujador deja de recibir escenas para siempre (`rend.recibidos` fijo, img 0);
  juego, audio y robot siguen. Visto 1 de 7 arranques en liviana con op7 (`artifacts/gh3-liviano/accesos/2026-10-22T18-37-04-bien`)
  y 2 de 2 con op2pub (publicado) en alta con Edge OCULTO (`17-01-52`, `17-05-01`; ahí `gob` = todo salteado por el gobernador).
  Sitio actual en visible: 0 de 4. Repetir arranques: `N=4 Q=liviano bash tools/op7/repetir.sh <copia> [<copia>...]` (dice CLAVADA/ok).
- Pistas (sin probar): en op7 el puente del hilo CP (`__r5liveConsumer` de `r5snap-native60-*.js`, ver `tools/r5-native60/armador-stage.mjs`)
  saltea si `busy`=1; si el armador muere o se traba, `busy` nunca vuelve a 0. En op2pub el gobernador/`__mitad` (`Ge(...)` en el
  lector) puede quedar salteando todo si el GPU no devuelve un cuadro. Pasos: capturar la consola de TODOS los workers en una corrida
  clavada (agregar a med.mjs una opción tipo `--ucode` pero para cualquier línea/error de workers), ver si hay `[armador]` error o
  worker muerto (`w.onerror`), y mirar en el armador/GPU qué espera. Idea de red de seguridad: vigía en el puente que detecte `busy`
  trabado > 2 s y lo registre/recupere (cuidado: el GPU worker tiene el canvas transferido; no se puede recrear fácil).
- Publicar después (con OK de Santi): `node tools/op7/armar-sitio.mjs --dest artifacts/pages-gh3/site/gh3 --js artifacts/d1-wasm/op7-sitio/gh3-web.publicar.js`
  y que Santi corra `3-PUBLICAR-OP7.cmd` (sube el wasm a R2 con rclone y despliega con wrangler). Verificar online con
  `node tools/modelos/online-alta.mjs --calidad liviano --cancion` (capa > 0, gancho `writes` > 0) y en alta.

## PLAN ACORDADO (Santi 2026-10-22): fluidez del escenario en «Alto», 7 pasos en este orden
Empezar por 1 y 2 juntos. Base: copia de op7 (aislada, p. ej. `artifacts/d1-wasm/fluido/<paso>`; no tocar op7 ni el sitio).
Un cambio por vez, medir antes/después con Edge visible, captura y OK visual de Santi antes de seguir. Nada se publica sin OK.
- [ ] 1. Ritmo parejo de escenas (intervalos fijos).
- [ ] 2. Cámara suave a 60 (mezclar vista/proyección entre dos escenas).
- [ ] 3. Personajes suaves (mezclar huesos entre dos escenas).
- [ ] 4. Opción «fondo tranquilo» (escenario un poco más oscuro/suave).
- [ ] 5. Hash en el armador (no copiar lo que no cambió).
- [ ] 6. Reutilizar lo armado del escenario quieto.
- [ ] 7. Dos armadores alternados.
Medir con `snapsS` e `img` de `resumen-alta.mjs` y, para 1–4, saltos de imagen con `frames.json` (ver detalle abajo).
Pendiente aparte: OK de Santi para publicar op7, y pasar la rama `watchpoint-reloj-teclasfix` a main (preguntado, sin respuesta).

## Lag del escenario en «Alto» (lo que ve Santi)
Causa (COMPROBADO): el escenario, la banda y la cámara se re-arman ~17–20 veces/s (`snapsS` del resumen; armado 23–28 ms en el
worker armador). La autopista y las notas van a 60 por la capa. Publicado: ~14/s. Ideas SIN medir, para armar plan:
- Que no se note (barato):
  1. Ritmo parejo: mostrar cada escena nueva a intervalos fijos (p. ej. cada 3 cuadros = 20/s exactos). Un 20 parejo se ve mejor
     que un 17–25 irregular.
  2. Interpolar la cámara a 60: entre dos escenas, mezclar las matrices de vista/proyección. La mayor parte del «salto» que se
     percibe es el movimiento de cámara. Revisar primero qué interpola hoy native60 (CLAUDE.md dice «interpolación a 60»).
  3. Interpolar los huesos de los personajes entre dos escenas (más difícil; agrega ~50 ms de atraso visual al fondo, que no importa).
  4. Fondo un poco más oscuro o suave (opción «fondo tranquilo»): el ojo mira la autopista y nota menos el fondo.
- Que vaya más rápido (más escenas por segundo):
  5. Usar el hash en el armador: su `api` solo tiene `readPhysical`; con hash podría no copiar búferes/texturas sin cambios
     (el hilo CP tiene el wasm con `_r5l_hash128`; el armador no: calcular en el CP o hash en JS).
  6. Recordar lo ya armado del escenario quieto: re-armar solo lo que cambió (personajes, luces) y reutilizar el resto.
  7. Dos armadores alternados (uno arma la escena n y otro la n+1): hasta ~2× si hay núcleos libres; cuidar el orden y la
     posible mezcla de cuadros.
  8. Revisar si público/luces/LOD (interruptores) ahora sí aceleran el ARMADO (antes solo se midió la velocidad del juego).
Recomendación inicial: 1 + 2 (rápidas, se nota mucho) y después 5 o 6 (velocidad real).

## Techo de velocidad
Liviana (sin escenario) da 89–93 %: el juego mismo no pasa de ~90 % en esta PC. Para 100 % hay que acelerar la lógica:
consultas de hora `_emscripten_get_now` (~21 s de CPU por minuto entre hilos), `sub_82190258`, enlace final con optimizador
(hoy `-O0`; hipótesis).
