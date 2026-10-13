# Revisión hw60 de Codex

Continuación de prueba2 de Claude, sin modificar su demo ni sus fuentes. El objetivo de Santi es fidelidad y 60 fps de toda la imagen con menor consumo; esta copia es diagnóstico intermedio de la autopista. No es una entrega final ni debe publicarse todavía.

`build.mjs` copia archivos mutables; enlaza solo wasm y chunks inmutables. El filtro de dibujos se injerta con una comprobación de una única coincidencia en cada bundle copiado. Los hashes de la base se comprueban antes/después. No volver a ejecutar build sobre una copia modificada sin respaldarla: la reemplaza.

```powershell
node tools/hw60/codex/build.mjs
node tools/hw60/codex/check.mjs
node tools/hw60/codex/check-filter.mjs
$env:DEMO_ROOT='artifacts/hw60-codex/demo'
$env:EXTRA_STATIC=(Get-ChildItem artifacts/hw60-codex/demo -File | Select-Object -ExpandProperty Name) -join ','
$env:GH3_QUERY='manual=1&r5lite=1&r5liveconsumer=hw60-colas.js&gfx=url'
$env:HW60_LABEL='mi-prueba'
$env:BOT_REFRET='100'
node tools/hw60/codex/run-song.mjs slowride
```

El replay y el runner reservan PRUEBAS-EN-CURSO. No ejecutar juntos. El check del filtro usa una captura real sin GPU ni motor. El robot de ingeniería inversa permite reapretar los trastes; rasgueos no equivalen a aciertos.

Cambios respecto de Claude: sampler conservado, atributos explícitos, ajuste temporal sobre hora de captura común entre Workers, congelación al detenerse el reloj, límite de cadencia, diagnóstico de memoria/tiempo, y un consumidor gráfico que omite solamente las piezas que la capa ya dibuja. Solo lo hace después de que estén listas todas sus texturas y mientras haya heartbeat. Al apagar la capa o vencer el heartbeat se usa el dibujo anterior.

`clockDomainDeltaMs` compara dos dominios: c155.w y el reloj guest 829B57B0. Su diferencia no prueba por sí sola un atraso de las notas o del audio; no compensarla automáticamente. Falta comparar notas contra el juicio del juego y referencias del mismo instante.

El resultado actual es aproximadamente 47 fps de capa y 27 fps de imagen base en Edge oculto, no 60 fps de toda la escena. Los shaders WebGL siguen siendo aproximaciones: brillo de colas, mezclas, animación y composición completa deben contrastarse con los originales. El consumo total y el comportamiento físico en iPhone no están acreditados.
