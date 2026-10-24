# Panel privado de estadísticas

Estado: monitor y formulario de opiniones publicados y verificados el 2026-10-14.

## Qué reutiliza

- `gh3-analytics.js` ya está cargado en el juego publicado y envía eventos
  anónimos a la función `gh3-analytics`.
- Supabase ya tiene `public.gh3_analytics_events` con RLS activo y sin políticas
  públicas. La escritura se hace únicamente desde la función existente.

## Qué agrega

- `dashboard/`: página privada, adaptable a PC y celular.
- `supabase/gh3-analytics-dashboard/`: función de lectura. Exige una contraseña
  larga, consulta con la clave secreta dentro de Supabase y devuelve estadísticas
  agregadas y opiniones voluntarias. No devuelve identificadores de sesión,
  solicitudes, registros ni hashes usados para limitar envíos.
- `stage-dashboard.mjs`: copia los tres archivos públicos al destino indicado.

El panel muestra visitas, embudo, dispositivos, origen, canciones, errores,
caché y actividad de los últimos cinco minutos. Esa actividad no equivale a
presencia exacta porque todavía no existe un heartbeat.

Las salas y sus creadores no aparecen: el duelo online y los apodos todavía no
están implementados. No se inventa identidad a partir de las sesiones anónimas.

## Pruebas

```powershell
npm run test:analytics
npm run stage:analytics
npm run test:analytics-browser
npm run test:feedback-browser
```

La prueba de navegador intercepta la API con datos agregados de ejemplo, valida
contraseña incorrecta/correcta y genera capturas en `artifacts/analytics/`.

## Publicación futura (requiere OK de Santi)

1. Desplegar `gh3-analytics-dashboard` en el proyecto
   `nvlwlmyuqorxaupcdbdb` (cuenta Supabase `sistemagym914@gmail.com`, organización
   `sistemagym914@gmail.com's Org`; el proyecto se llama `cabezones-futbol` y las
   estadísticas de GH3 comparten ese proyecto) con `verify_jwt: false`; la función implementa su propia
   autenticación por token SHA-256.
2. Copiar `dashboard/` a `estadisticas/` dentro del staging de
   `sante11/gh3-privado`:

   ```powershell
   node tools/analytics/stage-dashboard.mjs artifacts/privado/deploy-app/.vercel/output/static/estadisticas
   ```

   El lanzador `2-PUBLICAR-GH3.cmd` ya hace esta copia en la salida prebuilt y
   ejecuta `patch-vercel-config.mjs` para conservar los headers privados en
   publicaciones futuras.

3. Verificar contraseña incorrecta (401), correcta (200), datos reales y que la
   respuesta no contenga `session_id`.
4. Publicar el programa conservando `/gh3/`, sin tocar el proyecto de datos.

La contraseña está solamente en `artifacts/analytics/PANEL-ACCESS-LOCAL.md`, que
está excluido de Git y Vercel. Para rotarla, generar otra contraseña, cambiar el
hash de respaldo de la función y desplegar una versión nueva.

## Comentarios y calificaciones (2026-10-14)

El formulario pide una nota de 1 a 5 y permite elegir el motivo, agregar hasta
2000 caracteres y un apodo opcional de hasta 40 caracteres. Está disponible junto
a Jugar y en el panel de opciones del juego. Usa un diálogo que bloquea los
atajos de teclado mientras se escribe y conserva el mensaje si falla el envío.
No usa un bucle de render ni ejecuta GH3 para enviar una opinión.

El monitor privado muestra promedio, distribución de notas, motivos y las últimas
100 opiniones del período elegido (7/30/90 días), filtrables por nota y motivo.
Los totales cubren todo el período; los filtros cubren esos últimos 100 mensajes.
Los textos se dibujan mediante textContent, sin interpretar HTML.

Archivos nuevos:

- `feedback/gh3-feedback.js`: formulario público, sin claves secretas.
- `stage-feedback.mjs`: integra el formulario al staging de cualquier GH3_SRC.
  Reemplaza index.html sin escribir a través de enlaces duros de la copia fuente.
  `2-PUBLICAR-GH3.cmd` lo ejecuta automáticamente después de stage-privado.
- `supabase/gh3-feedback/`: API pública de escritura con validación de tamaño,
  origen, valores permitidos, señuelo anti-bots y reintentos idempotentes.
- `supabase/feedback-schema.sql`: SQL aplicado en la migración gh3_player_feedback. Tabla con
  RLS, sin permisos anon/authenticated. RPC invoker sólo para service_role,
  límite atómico de 3 envíos por red cada 10 minutos. El identificador de red usa
  un digest salado que cambia a diario; no guarda la IP cruda y se limpia al
  siguiente envío cuando supera un día. No equivale a CAPTCHA ni impide todo spam.

Publicado con aprobación explícita de Santi: gh3-feedback v1 con verify_jwt=true
(credential anon pública en el navegador, sin login de usuario; la clave secret
queda en servidor) y gh3-analytics-dashboard v2 con autenticación privada propia.
Verificado: datos inválidos400, sin credencial401, lectura pública de tabla401,
5 envíos simultáneos aceptan3/rechazan2 con429, reintento no duplica; monitor401/200.
La tabla tiene RLS y sin grants de lectura a anon/authenticated. Advisor sólo
reporta INFO rls_enabled_no_policy, esperado para tabla reservada a service_role.

Deploy Vercel: dpl_5K3tsQ3Aj93EdwCbV5vMjDJabo1F, READY. Verificado Edge390:
comentario desde página real → confirmación → visible en monitor privado; cero
pageErrors. Las cuatro opiniones técnicas de prueba se retiraron por UUID y texto
exactos. Hashes de GH3 JS/WASM/manifest y chunk verificados; datos no se resubieron.
Evidencia: artifacts/feedback/RESULTADO-PUBLICACION-2026-10-14.md.

## Registro diario — preparado localmente el 2026-10-15

Todavía NO publicado ni aplicado al backend. La versión pública sigue igual.

- Historial independiente del período agregado: fecha en Argentina, tipo de evento,
  más recientes primero y páginas de 200 registros. La consulta fija un instante
  de corte para evitar duplicados al cargar páginas anteriores.
- Alias HMAC diarios permiten relacionar intentos sin devolver session_id ni
  attempt_id originales. La clave queda sólo en servidor.
- Errores nuevos: nombre, mensaje corto y causa saneados, recurso público sin
  consulta/fragmento y estado HTTP cuando existe. Los antiguos mantienen sólo su
  información original. Cancelaciones y caché alternativa se distinguen de fallos.
- Muestras cada 30 s únicamente con canción reconocida, reloj avanzando y página
  visible. Velocidad de juego y reloj, imágenes de la escena (NO autopista60),
  cortes/saltos de audio como diferencias entre muestras. Núcleos y memoria sólo
  cuando el navegador los informa. No equivalen a uso real de CPU ni latencia.
- Cliente limitado a 16 eventos/minuto; ingesta conserva el límite previo de
  20/minuto por sesión, origen, UUID y tamaño. Metadata con allowlist y margen
  bajo los 2048 bytes de la tabla. No hay bucle de render ni sondeo de alta frecuencia.

Preparación reproducible sin arrancar el motor:

```powershell
node tools/analytics/stage-monitor.mjs
node tools/analytics/stage-dashboard.mjs
npm run test:analytics
node --test tests/analytics-activity.test.mjs tests/analytics-staged.test.mjs
node tests/analytics-dashboard-browser.mjs
```

La copia de revisión está en artifacts/monitor-diario/demo; conserva los hashes
JS/WASM/manifest y NO copia chunks. No es una carpeta de juego local completa:
para probarla jugando necesita la entrega de chunks configurada. El navegador de
prueba sólo abre el panel con una API simulada y datos de ejemplo.

Publicación posterior, sólo con OK de Santi: revisar/aplicar la propuesta
supabase/monitor-events-proposed.sql (amplía CHECK, sin borrar filas), desplegar
la ingesta gh3-analytics incluyendo shared/telemetry.js y el backend del panel
incluyendo activity.js/shared/telemetry.js; después publicar el cliente y panel.
El backend actual descarta detalle nuevo y rechaza los tres eventos nuevos:
publicar sólo el cliente NO habilita esta entrega. La tabla mantiene RLS y sus
permisos actuales; esta propuesta no cambia contraseñas ni grants.

Resultado y limitaciones: artifacts/monitor-diario/RESULTADO-2026-10-15.md.


## Resumen en la base, por semana y última hora (Claude 2026-10-22)

Problema (COMPROBADO): la función bajaba hasta 50.000 eventos crudos; con ~3.200 eventos/hora cubrían ~15 h
(«30 días» mostraba solo desde la noche anterior) y tardaba hasta 88 s. El ciclo «En vivo» del panel relanzaba la
carga cada segundo mientras tardaba, así que nunca terminaba (y al recargar se veía el formulario de contraseña).

- `supabase/dashboard-summary.sql`: `gh3_dashboard_summary(días, audiencia)`, `gh3_dashboard_weekly(semanas, audiencia)`,
  `gh3_dashboard_last_hour(audiencia)`; solo service_role. Probado con PGlite y 22.060 eventos reales: mismos números
  que `buildDashboard` (totales, embudo, días, dispositivos, origen, canciones), 0,2 s.
- La función usa esos resúmenes (`fromSummary` en aggregate.js) y, si el SQL no está aplicado, vuelve a la lectura cruda.
- Panel: «Por semana» (última semana completa contra la anterior + tabla), «Última hora» en el cuadro En vivo, entra
  directo al recargar con «Cargando…», y no lanza otra carga mientras una sigue.
- `gh3-analytics.js`: cada error igual una vez por visita, máximo 20 por visita; muestras de rendimiento cada 60 s.
- Publicar: `4-PUBLICAR-ESTADISTICAS.cmd` (SQL al portapapeles + editor de Supabase, función con el CLI, sitio con wrangler).
  Respaldo: `artifacts/respaldo/2026-10-22-estadisticas`.

### v2 (mismo día, tras publicar la v1)
- Medido en la base real (COMPROBADO): 213.000 eventos en 3 días (~100.000/día, 126 MB de base); el resumen v1 tardaba 11,2 s
  y la base corta a los 8 s (rol authenticator), así que el panel caía a la lectura cruda (`source: events`).
- v2: `gh3_daily_stats` guarda el resumen de cada día terminado (una vez, `gh3_rollup_ensure`); solo «hoy» se calcula en el
  momento (47.000 eventos: 0,74 s). Sesiones del período = suma de sesiones diarias.
- Latidos: la ingesta publicada (v3) los rechazaba (0 en la base). Ahora `gh3-analytics` los guarda en `gh3_live_sessions`
  (una fila por visita, upsert) en vez de como eventos, y el panel lee de ahí.
- Retención (OK de Santi 2026-10-22): `gh3_rollup_ensure` borra eventos crudos de más de 14 días SOLO si su día ya está resumido
  (hasta 20.000 por llamada). El «Registro de actividad» del panel solo tiene detalle de los últimos 14 días.
