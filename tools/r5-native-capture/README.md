# Captura local R5 (Codex)

Captura opcional de un draw nativo del intro, autorizada por Santi el 2026-10-09.
No conecta el backend WebGPU ni modifica el SDK/build habitual o el CP wasm.

`build-isolated.py` copia command_processor.cpp de D3D12 a artifacts/r5-native-capture/src,
inyecta capture.inc y obtiene compilación/enlace del Ninja existente. Solo compila un objeto
separado y enlaza una DLL separada. Usa vcvars64 y el enlazador local en un proceso hijo.

`run-isolated.py` copia exe/runtime/config a una carpeta local de prueba, sustituye únicamente
su DLL gráfica y fija GH3_R5_CAPTURE_DIR solo para ese proceso. Sin esa variable no vuelca.
No sobrescribe una carpeta que ya tenga events.jsonl. R5_RUN_SUFFIX separa intentos.
Tiempo máximo 220 s; START a 140/170 s solo si el proceso propio tiene el foco.
Cierra únicamente ese proceso. Audio silenciado; user/cache/DLCs locales separados.
Datos originales: solo lectura. No ejecutar otro build del juego a la vez.

Selección: primer draw VS57F6448DAC5BEB74 / PSAB008EF1D1A8CB6D que llega al punto
previo a registrar Draw. Guarda registros completos, microcódigo, constantes D3D12,
fetch constants, texturas lineales 2D k_8 sin mips, buffers guest de vértices/índices.
Los rangos tienen límites físicos de 512 MiB y presupuesto acumulado de binarios de 16 MiB.
La extensión/pitch viene de GetGuestTextureLayout, sin inventar dimensiones ni endian.
Cada bloque guest se copia y compara inmediatamente contra una segunda lectura; esto detecta
algunas escrituras concurrentes, pero NO prueba una instantánea atómica de todo el draw
ni igualdad con recursos ya cargados antes en el cache de texturas GPU.

Para la siguiente copia/resolve, exclusivamente en este build y una vez, fuerza readback
FULL (sin leer el buffer del cuadro anterior). Guarda native-resolve.bin y registros de resolve.
El binario de resolve conserva el formato/tiling/endian guest; no es PNG ni RGBA lineal.
Se registra cuántos draws adicionales alcanzaron el sitio de captura antes de ese resolve.
No asumir referencia del mismo draw si el número es distinto de cero. Este readback requiere
sincronización GPU y puede alterar tiempos de esta prueba; no sirve para medir rendimiento.

complete.txt significa que llegó a leer un resolve; validate-capture.py comprueba por separado
integridad, ausencia de errores, rangos/tamaños, fetch contra registros y hashes de shaders.
Las constantes DXBC NO tienen el layout XeSystemConstants de SPIR-V: no subirlas directamente
con pack-uniform.mjs. Deben mapearse explícitamente usando campos y registros.

Todo lo generado contiene datos locales del juego: conservar en artifacts/, sin Git/deploy.
Compilar: python tools/r5-native-capture/build-isolated.py; ejecutar build-isolated.cmd generado.
Capturar: python -I tools/r5-native-capture/run-isolated.py.
Validar: python tools/r5-native-capture/validate-capture.py <carpeta run>.

Selectores posteriores opcionales: GH3_R5_REQUIRE_DETAIL exige Y no uniforme; GH3_R5_REQUIRE_OPAQUE exige alfa255 de tex3. Son filtros de captura, sin omitir draws del juego. Run5 es el caso de replay verificado; run3 inicial era uniforme y run4 dependía del framebuffer previo. Resultado: artifacts/r5-replay/RESULTADO-R5-REPLAY.md.
