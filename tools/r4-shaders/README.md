# R4 shaders — herramientas locales

Estado actual: constantes adaptadas; Naga acepta 71/71 y Edge acepta 65/71 módulos del corpus G0. GPU probe propio verifica 126/126 componentes tras empaquetado. Los 6 fragment pendientes fallan por uniformidad de derivadas; no hay frame GH3. Detalle: artifacts/r4-shaders/RESULTADO-R4-LAYOUT.md.
No publicar artifacts/r4-shaders: incluye shaders derivados del juego.

## Reproducir lo probado

Desde D:\guitar hero:

- `node tools/r4-shaders/inventory.mjs`: 142 archivos, 71 únicos por etapa+SHA256 (37 vertex, 34 fragment).
- `tools\r4-shaders\build-native.cmd`: build aislado con clang/VS/glslang locales, sin red.
- `node tools/r4-shaders/run-native-corpus.mjs`: un proceso por shader; logs, errores, hashes y resultados en artifacts/r4-shaders/native-conversion.json. Fallos devuelven salida 1.
- `node tools/r4-shaders/validate-edge.mjs --smoke`: shader compute propio válido + control inválido. Edge valida el módulo, crea el pipeline propio y ejecuta un dispatch.
- `node tools/r4-shaders/validate-edge.mjs <carpeta-WGSL> <reporte.json>`: validación de todos los módulos WGSL del directorio; sin creación de pipelines de GH3. Corpus vacío falla.
- `node tools/r4-shaders/make-own-fixture.mjs`: genera módulo SPIR-V compute propio de 140 bytes para probar Naga. Todavía NO validado ni convertido por Naga.

## Perfil de traducción y límites

Se usan SpirvShader y SpirvShaderTranslator del rexglue-sdk-090 existente. No se modifica ese SDK. Constructor con std::endian::little: Shader::DumpUcode escribe las palabras en orden del host Windows x64, no big endian guest.
Features(false), full_draw_index_uint32=true, escala 1, render targets del host, sin interlock, sin MSAA nativo 2x. Interfaz base de 16 interpoladores: no reproduce las modificaciones por draw del backend nativo. Si hay registros con direccionamiento dinámico, la herramienta rechaza el shader hasta tener SQ_PROGRAM_CNTL real, sin adivinarlo.
71/71 generaron SPIR-V, pero eso NO es un porcentaje de WGSL válido. Naga ya rechazó los 71 por layouts. Esto no determina si el SPIR-V es válido bajo las reglas completas de Vulkan: Naga no sustituye spirv-val. Tampoco prueba compatibilidad de layouts, texturas y parejas vertex/fragment de GH3.
Los shaders G0 no están separados por cuadro/pantalla: hay captura nativa identificada como menú en g0-native-3, pero cobertura Slow Ride pendiente de Claude. No hay imagen de GH3 en WebGPU.

## Licencia

Se revisó la licencia BSD-3 del SDK (con atribución a Xenia) antes de reutilizarlo. msaa-constants.cpp contiene dos tablas del SDK; atribución en el archivo y licencia completa LICENSE.rexglue.txt. glslang se compila desde el checkout ya disponible y conserva sus avisos originales.
Render360 todavía no se inspeccionó en esta tanda: acceso/descarga pendiente del permiso solicitado. No se copió código de Render360.

## Tanda Naga ejecutada

- Santi autorizó descargas y retiró explícitamente el límite de velocidad para esta tanda. Rust 1.99.0 y Naga CLI 30.0.0 son locales al proyecto, sin rustup ni cambios globales. Cargo usa --locked --offline. No game data publicado.
- `python tools/r4-shaders/provision-naga.py`: componentes oficiales con hashes del manifiesto, dependencias con hashes de Cargo.lock, descargas seriales. La versión/manifiesto de Rust usada queda en toolchain/r4-downloads/channel-rust-stable.toml; hashes/resultados en artifacts/r4-shaders/toolchain-downloads.json. Archivo raíz naga-cli descargado por HTTPS y hash registrado; consulta adicional de checksum en API crates.io dio 403, no se presenta como verificación independiente.
- `tools\\r4-shaders\\build-naga.cmd`: compilación offline con VS local; Naga disponible en toolchain/r4-naga/naga-cli-30.0.0/target/release/naga.exe.
- `node tools/r4-shaders/run-naga-corpus.mjs --own`: fixture propio convertido y revalidado; `node tools/r4-shaders/validate-edge.mjs artifacts/r4-shaders/own-wgsl artifacts/r4-shaders/edge-own-naga.json --compute`: pipeline compute y dispatch en Edge, comprobados.
- `node tools/r4-shaders/run-naga-corpus.mjs`: preserva fallos íntegros de los 71, sin desactivar validación. Resultado: naga-conversion.json.
- `python tools/r4-shaders/normalize-spirv.py`: copia que ordena los miembros de XeSystemConstants por offset y remapea accesos/decoraciones; no mueve sus bytes en memoria. `node tools/r4-shaders/run-naga-corpus.mjs --normalized`: revela el siguiente problema de arrays de buffers. El original permanece intacto.
- Variante **experimental, escritorio**: `node tools/r4-shaders/run-native-corpus.mjs --single-memory`, luego `python tools/r4-shaders/normalize-spirv.py --single-memory` y `node tools/r4-shaders/run-naga-corpus.mjs --single-memory --normalized`. Un buffer físico de 512 MiB en lugar de array de 4 descriptores. No asigna realmente ese buffer ni certifica iPhone; requiere límites adecuados y estrategia de memoria R5. Resultado: naga-single.json, 0/71 por alineación uniforme.
- `python tools/r4-shaders/test-normalization.py`: comprueba de forma independiente identidad/tipo/offset de miembros y referencias de 18.839 access chains en 142 módulos de ambas variantes. No demuestra equivalencia numérica ni rasterización.
- Licencias MIT/Apache de Naga preservadas en este directorio; fuentes/dependencias con avisos originales bajo toolchain/.

## Siguiente tanda

Adaptar layouts de constantes para WGSL con mapa explícito de offsets y uploads de R5 que empaqueten los mismos valores. Resolver shared memory sin arrays de descriptores y sin suponer 512 MiB disponibles en móvil. Volver a validar, registrar el siguiente error real y comprobar fidelidad numérica (Naga advierte que no conserva NoContraction). No apagar validación ni cambiar offsets sin adaptar uploads. Agregar corpus Slow Ride con manifiesto confirmado, después del primer conjunto compatible.
Revisar README/licencias y rutas gráficas de Render360 antes de copiar piezas. R5 no iniciado. CP/CPU/audio/entrada/streaming no editados.


## Layout de constantes (tanda posterior)
- python tools/r4-shaders/repack-spirv.py: copia del perfil single-memory canonicalizado, modifica solo offsets de XeSystemConstants y genera uniform-layouts.json para uploads.
- node tools/r4-shaders/run-naga-corpus.mjs --repacked: 71/71 validación Naga/emisión/revalidación.
- node tools/r4-shaders/validate-edge.mjs artifacts/r4-shaders/wgsl-repacked artifacts/r4-shaders/edge-repacked.json: 65/71 módulos, salida1 por seis fragment con derivadas no uniformes.
- node tools/r4-shaders/verify-uniform-gpu.mjs: compute propio usa la estructura del shader convertido y lee 126 valores bit a bit; 126/126. Solo prueba el empaquetado.
- pack-uniform.mjs: helper de uploads para el futuro R5; fuente snapshot host, no dirección guest. Bloque fuente504 bytes útiles, GPU528. No está conectado al runtime.
- Archivos antiguos/reportes anteriores describen la tanda anterior. Los shaders originales quedan intactos. Profile single-memory512MiB sigue experimental de escritorio, sin asignación/upload ni prueba iPhone.
