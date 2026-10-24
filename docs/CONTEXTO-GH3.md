# Contexto técnico Guitar Hero III Web

## ACTUALIZACIÓN 19/10/2026

### Parada de ~28s al empezar canción

**Hipótesis compilaciones de shaders: REFUTADA**
- Evidencia A (InPrivate, Sunshine): parada 28s con reloj clavado en ~2.2s (filas 888-915)
- Solo 2 compilaciones cayeron en esa ventana; las otras 5 ocurrieron después
- Otro informe: 5 compilaciones perdieron ~3s (inconsistente con 28s)
- Conclusión: las compilaciones no explican la parada

**Hipótesis actual: descarga de chunks en caché HTTP fría**
- Canción se lee desde `/gh3/chunks/<sha256>` via service worker + fetch con Range
- Decodificación Vorbis/MP3 en CPU
- Robot local (servidor sin latencia) no reproduce la parada
- Prueba pendiente: jugar Sunshine 2 veces en ventana normal y comparar

**Si se confirma:** bajar los chunks durante la pantalla de carga, antes de empezar la canción

**Diagnóstico agregado (artifacts/d1-wasm/fetch-diag/demo):**
- Monitoreo de fetch para `/gh3/chunks/`: inicio, duración, bytes, caché
- Detector de parada: si reloj no avanza >2s, registra fetch pendientes, AudioContext.state, navigator.connection
- Todo incluido en botón copiar

### Referentes técnicos

**Proyectos similares (recompilación nativa→WASM+WebGPU):**
- ps2-web-recomp: PS2 a WASM+WebGPU, GT4 50 fps
- PSXRecomp: PlayStation 1
- UnleashedRecomp: pipelines WebGPU compilados durante carga de assets

**Ideas pendientes de revisión:**
- Flags de compilación wasm: -O3, -flto, -msimd128, wasm-opt --enable-threads
- Pool de pthreads: tamaño configurable vs fijo
- Memoria inicial/máxima ajustada
