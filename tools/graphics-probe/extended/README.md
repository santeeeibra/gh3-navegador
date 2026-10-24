# Pruebas gráficas independientes ampliadas

Resultados y limitaciones: `D:\guitar hero\artifacts\graphics-probe\extended\README.md`.

- probe.cpp: tres casos originales compilados por PROBE_CASE; controles GDI/BeginScene separados.
- gradient.hlsl y passthrough.hlsl: shaders propios; build.ps1 usa MSVC/fxc ya instalados.
- test-native.ps1 y capture-native.ps1: API, readback opcional y captura visible identificada.
- bundle.py: WGB separados, sin recursos del juego.
- server.mjs y test-bottleship.mjs: runtime dist de solo lectura en 5188, red restringida y perfiles propios; snapshots y puntos de color.
- image-check.mjs y verify.mjs: API y evidencia visible se validan por separado; readback no aprueba presentación.
- capture-dxgi.cpp y build-capture.ps1: capturador auxiliar del monitor real, solo diagnóstico.
- probe-hybrid.cpp y probe-declaration-after-fvf.cpp: variantes anteriores conservadas para explicar diferencias de estado; no son el resultado final.

No tocar los archivos de la referencia azul de la carpeta superior al repetir la ampliación. No recompilar ni modificar BottleShip ni usar perfiles/puertos de Claude.
