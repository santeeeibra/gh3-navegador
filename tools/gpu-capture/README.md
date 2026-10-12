# gpu-capture — captura → replay → imagen/estado → informe automático

Recorrido repetible sobre nuestro renderer WebGPU de menú (las 32 capas de Codex,
`artifacts/r5-menu/menu-layers.json`). No ejecuta GH3. Todo queda local:
`toolchain/` y `artifacts/` están excluidos de Git y de Vercel. No publicar capturas
(`.wgpur`, `.rdc`, `.gfxr`, imágenes): contienen texturas y shaders del juego.

## Herramientas (descargadas ya compiladas, sin compilar nada)
| Herramienta | Dónde | Para qué la usamos |
|---|---|---|
| WebGPUReconstruct 2.1 | `toolchain/gpu-capture/webgpureconstruct-2.1` | Captura las llamadas WebGPU en Edge (módulo JS) y las reproduce nativo (Dawn D3D12/Vulkan). |
| RenderDoc 1.46 portable | `toolchain/gpu-capture/renderdoc-1.46` | Captura el replay **D3D12** y su Python extrae la imagen del destino y el estado tras cada DRAW. |
| GFXReconstruct 1.0.4 | `toolchain/gpu-capture/gfxreconstruct-1.0.4` | Graba el replay **Vulkan** (capa activada solo por variables de entorno del proceso), captura de pantalla del cuadro y JSON de llamadas. |

SHA-256 de los zips: `artifacts/gpu-capture/HERRAMIENTAS-SHA256.txt`.

## Uso
```
node tools/gpu-capture/pipeline.mjs <etiqueta> [--mode main|worker]
```
Reserva el turno de `artifacts/PRUEBAS-EN-CURSO.md` con un identificador único (`Reserva: claude-…`;
falla si el turno no está LIBRE, sea de Codex o de otra sesión), pasa ese identificador a los pasos
(`GPUCAP_TURN`) y libera solo esa reserva. Cada paso cierra únicamente los procesos que abrió: hijos
directos por su handle, el replayer lanzado por RenderDoc por el PID que RenderDoc informa (y solo si sigue
siendo `WebGPUNativeReplayDawn.exe`). Nunca se cierra nada por nombre de imagen. Código de salida: 0 ok; 2 = regresión, error de
captura o caso nuevo sin clasificar; 1 = falla de herramienta.

Pasos sueltos: `node tools/gpu-capture/turn.mjs reserve` imprime el identificador; correr los pasos con
`GPUCAP_TURN=<identificador>` y liberar con `GPUCAP_TURN=<identificador> node tools/gpu-capture/turn.mjs release`.
1. `edge-capture.mjs <etiqueta> [--mode main|worker] [--present] [--no-capture]` — Edge headless;
   guarda `capture.wgpur`, `draw-<n>.rgba` (lectura GPU tras cada DRAW), `final.rgba/png`,
   `edge-manifest.json` (hash de captura, de cada operación —estado y recursos— y de cada imagen).
2. `replay-native.mjs <etiqueta> [dawn] [rdoc] [gfxr]`.
3. `analyze.mjs <etiqueta> [--accept-baseline]` — compara, clasifica, guarda casos, escribe
   `INFORME.md` y `report.json` en `artifacts/gpu-capture/runs/<etiqueta>/`.
4. `check-negatives.mjs <etiqueta-buena>` — 9 fallas inyectadas en copias; todas deben detectarse.
   Borra solo sus copias `n<número>` que pasaron; deja `negatives/negatives.json`.
6. Captura nueva: `compare-r5f.mjs <vieja.r5f> <nueva.r5f> <salida.json>` (alinea por posición en el cuadro)
   y `prepare-layers.mjs <captura.r5f> <dir>` (copia parametrizada del preparador de Codex); después
   `pipeline.mjs <etiqueta> --fixture <dir>/menu-layers.json`.
5. `promote.mjs <clave...> --note "..." --evidence "..."` — pasa un caso a "conocido". Exige evidencia
   verificable (archivo:línea, corrida o salida de comando). Una IA puede proponer la nota; se
   registra solo después de comprobarla.

## Clases
- `replay-consistent`: bytes de Edge == replay nativo D3D12 (y RGB == Vulkan). Prueba que la cadena no
  pierde nada y que nuestro renderer es determinista. **No certifica fidelidad con la consola.**
- `color-precision`: diferencias ≤4/255 entre backends. Se informa; nunca se valida.
- `backend-divergence`: misma operación, diferencia mayor.
- `resource-incomplete`: faltan bytes del invitado (no se inventan).
- `translation` / `unsupported-state`: shader o estado rechazado por nuestra traducción.
- `capture-error`: herramienta falló, operación perdida o mal asociada en el replay, cuadros de más/menos.

Regresión: las lecturas por DRAW son acumuladas, así que un caso `validated` solo se compara cuando
toda la secuencia previa de operaciones (`prefixHash`) es idéntica; una capa nueva en el medio vuelve
"secuencia nueva" a las siguientes, no regresión.

Casos: `known-cases.json` (en este directorio; solo hashes y notas, sin datos del juego) tiene
`validated` (regresión: hashes de imagen esperados por operación) y `known` (clasificado con
evidencia). Todo caso nuevo queda `unknown` y se guarda en `artifacts/gpu-capture/cases/<clave16>/`
con `case.json` (contexto, hashes, origen .r5f), recursos y diferencias.

## Cómo enchufar otro renderer (para Codex)
- En el hilo o Worker que usa WebGPU, importar `WebGPUReconstruct.js` y llamar `start()` **antes** de
  tocar `navigator.gpu`; `finish()` en Worker manda `{type:'WebGPUCapture',data:Blob}` al hilo principal.
- Etiquetas: el análisis asocia operaciones por `label` (`target`, `<draw>/texture`), que llegan
  a D3D12/RenderDoc como `Dawn_InternalTexture_<label>`.
- Presentar un cuadro vacío al inicio y copiar el resultado a un canvas WebGPU (o OffscreenCanvas
  en Worker) al final: RenderDoc y GFXReconstruct trabajan por cuadro presentado.
- `page/render-layers.js` replica la lógica de `tools/r5-menu/verify-menu-layers.mjs` (copia, no
  importación): si el renderer cambia, actualizarla o exponer una función reutilizable.

## Limitaciones comprobadas
Ver `artifacts/gpu-capture/RESULTADO-GPU-CAPTURE.md`.
