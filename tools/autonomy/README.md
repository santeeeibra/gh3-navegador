# Controlador local GH3

Primera versión: cola finita, un proceso por dueño, dependencias y resultados JSON entregados automáticamente. Node instalado + wrapper PowerShell; ninguna dependencia nueva ni plugin. Estado/logs están en artifacts/autonomy, excluido de publicación.

## Uso sencillo

Desde D:\guitar hero:

```powershell
pwsh -NoProfile -File tools/autonomy/Control-GH3.ps1 -Action Status
pwsh -NoProfile -File tools/autonomy/Control-GH3.ps1 -Action Run
```

Run procesa la cola smoke (3 tareas SOLO LECTURA: Claude → Codex → Claude), en primer plano. No relanza tareas completadas ni bloqueadas. El resumen está en artifacts/autonomy/RESUMEN.md. No iniciar otro Claude/Codex manual sobre la misma zona mientras haya trabajo del controlador.

Para pausa/detención, desde otra terminal:

```powershell
pwsh -NoProfile -File tools/autonomy/Control-GH3.ps1 -Action Pause
pwsh -NoProfile -File tools/autonomy/Control-GH3.ps1 -Action Stop
pwsh -NoProfile -File tools/autonomy/Control-GH3.ps1 -Action Resume
```

Pause/Stop impiden NUEVAS tareas. La tanda activa termina para conservar resultado; no prometen interrumpir al instante. Resume quita las señales, no inicia tareas ni reinicia fallos. No cerrar la terminal abruptamente: si queda lock/state running, hay que comprobar procesos y checkpoint antes de recuperarlos. Timeout: 3 min en smoke; configurable por cola. Al vencer se termina el árbol de proceso Windows: puede no existir checkpoint y no se reintenta automáticamente.

## Controles y límites

Después de corregir el acceso de Claude, recuperar sin reiniciar contadores:

```powershell
pwsh -NoProfile -File tools/autonomy/Control-GH3.ps1 -Action Retry -Task claude-checkpoint
pwsh -NoProfile -File tools/autonomy/Control-GH3.ps1 -Action Run
```

Retry no llama al modelo. Solo recupera estados bloqueados/requiere decisión, conserva errores y rechaza un tercer intento. Codex puede hacer esta recuperación cuando Santi confirme que corrigió el acceso.

- Máximo 3 lanzamientos por dueño en una ejecución y máximo 2 intentos acumulados por tarea. Los fallos detienen nuevos lanzamientos. No hay reintentos automáticos. Para repetir una tarea bloqueada hace falta una recuperación deliberada del estado, conservando intentos y evidencias.
- Un controlador por directorio de estado (lock exclusivo). Estados persistidos con rename. Si un proceso se interrumpe, no se presume que el trabajo se completó.
- Un proceso Claude y un proceso Codex pueden coexistir. resources en cada tarea reserva builds/directorios compartidos; una sola instancia por dueño. Mensajes de predecesores completados se adjuntan al dependiente; no hay llamadas al modelo por espera ni mensajes periódicos.
- Claude: Opus 5.5 medium, herramientas desactivadas en smoke, MCP extra desactivado, sin configuración user/project adicional ni ultracode. Se conserva login de suscripción. No usar --bare (requiere credencial API).
- Codex: exec con autenticación existente, sandbox read-only en smoke. El prompt prohíbe herramientas; este sandbox permite leer, no garantiza cero lecturas. Los resultados JSON se validan y tienen que citar evidencia.
- Se eliminan del entorno hijo claves/base URL de API para evitar seleccionar facturación API por variables. Esto NO prueba por sí solo que ninguna configuración administrada pueda seleccionar otra ruta: revisar auth y el proveedor real en la prueba antes de trabajo productivo. No se editan credenciales ni configuración global.
- El resultado completed de smoke significa intercambio/lectura, NO avance del juego. Las tareas work están desactivadas por defecto. Requieren allowedPaths (instrucción al modelo) y acceptanceCommand (verificador local), además de -AllowWork. No activar R3a hasta pasar smoke y revisar el verificador de esa tarea. Las instrucciones por rutas y locks cooperativos no equivalen a aislamiento de sistema de archivos; habrá que revisar diffs/evidencia de cada tarea real y respetar las zonas.
- Compilaciones en espera no invocan modelos. No hay promesa de un techo exacto para cuota Pro/Max. usage.json recoge consumo reportado; dólares estimados no equivalen a cargos reales de suscripción. No activar créditos extra.

## Pruebas

```powershell
node --test tools/autonomy/controller.test.mjs
```

Verifican dependencias/ciclos, exclusión por dueño/build, evidencia, fallo sin relanzamiento, pausa, lock, entrega de resultado y persistencia. Adaptadores simulados sin consumo de modelos. Corridas reales se registran por separado y requieren autenticación válida.

## Estado de la primera prueba (2026-10-09)

ACTUALIZACIÓN FINAL: smoke completado Claude → Codex → Claude con el login claude.ai guardado. El 403 de abajo correspondía al token impuesto por CLAUDE_CODE_OAUTH_TOKEN en el entorno. Se omite esa variable solo en procesos hijos del controlador; no se editó/eliminó ningún token ni credencial global. Auth sin esa variable: loggedIn=true, authMethod=claude.ai, firstParty. Resultado principal: artifacts/autonomy/RESUMEN.md, completed. Opus 5.5 confirmado en modelUsage. El controlador terminó; R3a no empezó.

Consumo reportado de las dos llamadas Opus: 9.958 tokens de creación de caché, 2.660 leídos de caché, 4 input no cacheados y 1.844 output (incluye razonamiento reportado). Codex revisión: 22.849 input y 164 output. No son porcentajes de cuota ni evidencia de ahorro frente a otra estrategia; no repetir pruebas triviales innecesarias. Son referencias de arranque. Se conserva la primera falla para auditoría; la recuperación fue explícita y no reinició intentos.

Las seis pruebas locales pasaron. Claude auth status reporta oauth_token; Codex login status reporta ChatGPT. La primera inferencia Claude falló con 403 oauth_not_allowed_for_organization: la organización asociada al token rechaza uso de suscripción en Claude Code. No usar API como fallback. Hasta solucionar acceso/login/permiso de esa cuenta, smoke no puede completar Claude → Codex → Claude. No hay trabajo R3a iniciado.

La comprobación Codex independiente está en artifacts/autonomy/codex-access/ y no reemplaza el intercambio completo. Consultar su RESUMEN.md. No tocar CLAUDE.md ni el historial restaurado por Claude.

Verificación final: 7/7 tests del controlador y npm test 24/24. Prueba Codex completada sin llamadas a herramientas: 22.353 tokens de entrada, 411 de salida (232 de razonamiento, según usage), cero input cacheado. Es una referencia de arranque con configuración/instrucciones existentes, NO demuestra ahorro y sugiere evitar sesiones triviales repetidas. Claude rechazó la petición antes de inferencia (usage todo cero en el resultado del proveedor). No se verificó todavía consumo Opus ni colaboración real completa.
