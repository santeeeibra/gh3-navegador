# R5 pipelines — herramientas locales
Lee los WGSL y caches existentes, crea pipelines en Edge. No publica ni dibuja GH3.
1. node tools/r5-pipelines/inventory.mjs
2. node tools/r5-pipelines/validate.mjs
3. tools\r5-pipelines\build-xpso.cmd
4. artifacts\r5-pipelines\xpso-inventory.exe artifacts/g0/g0-native-3/cache/shaders/shareable/415607F7.rtv.d3d12.xpso > artifacts/r5-pipelines/native-cache.json
5. node tools/r5-pipelines/validate.mjs --native-pairs

Resultado:65/65 pipelines de diagnóstico y30/30 parejas identificadas en cache. Captura/resource bytes y estados nativos no reproducidos. El cache incluye modificaciones DXBC; no reutilizarlas como bits de SPIR-V. Los objetos de pipeline se crean con layouts automáticos y estados de prueba, no son un backend integrado.

Leer artifacts/r5-pipelines/RESULTADO-R5-PIPELINES.md. Datos/caches/shaders quedan bajo artifacts/, excluidos de publicación. XXH3 compila desde el header existente, sin modificarlo; licencia completa en LICENSE.xxHash.txt. Esquema de cache basado en rexglue/Xenia del SDK local, documentación sin código copiado.
