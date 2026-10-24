# Carga de texturas y confirmaciones entre hilos

Paso aislado para la vía Xbox 360/WebGPU, preparado el 2026-10-08. No ejecuta GH3.

## Componente

`src/original/graphics/texture-upload.js` exporta `uploadRgba8(device, descriptor)`.
Recibe `width`, `height`, `data` (`Uint8Array`, incluida memoria WASM compartida),
`bytesPerRow` opcional, `label` y `timeoutMs`. Devuelve una textura RGBA8 cuando
la cola confirma la carga. El llamador mantiene los datos inmutables hasta que
la promesa termine y destruye la textura cuando deja de usarla.

Valida dimensiones, límites del dispositivo, tamaño de datos y separación de filas.
Admite filas con relleno y dimensiones impares. Las llamadas deben ser seriales
en un dispositivo dedicado, por los error scopes de WebGPU. Libera la textura
si la carga falla o vence el plazo. El plazo no cancela trabajo ya enviado a la GPU.

## Prueba reproducible

Desde la raíz, con Git Bash y el Emscripten existente:

```sh
bash tools/graphics-upload/build.sh
node tools/graphics-upload/verify.mjs
```

No necesita descargas. El servidor temporal escucha solo en 127.0.0.1, aplica
COOP/COEP y sirve una lista explícita de archivos. El verificador bloquea red externa.
Se cierra tras la prueba; el componente no está conectado al cargador público.

`probe.cpp` tiene dos pthreads reales Emscripten wasm32: productor C++ bloqueante
con futex y propietario GPU con event loop JS asíncrono. Una única ranura compartida
admite una carga en vuelo. Ready y fence son secuencias monotónicas con release/acquire.
El productor no reutiliza sus bytes hasta la confirmación. La prueba añade lectura
GPU para comprobar cada píxel; esa lectura no pertenece al cargador reutilizable.

Se prueban seis texturas lineales RGBA8, tamaños 7x5, 13x3, 31x7, 33x2, 9x17 y 65x4,
con relleno de filas y datos calculados en C++. El resultado GPU se compara con un
patrón independiente calculado en JS, no con los bytes enviados. Dos controles:

- `corrupt-upload`: altera realmente un byte de la tercera carga; se detecta una
  diferencia exacta y el productor se detiene tras dos cargas correctas.
- `drop-fence`: la tercera carga llega bien, pero no se entrega la confirmación;
  el productor sale por timeout de 3 s en vez de quedarse bloqueado.

Además se rechazan cuatro descriptores inválidos y se prueba el timeout del
cargador reteniendo su promesa de completion tras una carga real. Se repite la
corrida normal en una página nueva después de los controles.

## Alcance y próximo enlace con rexglue

Es una pieza reutilizable y una prueba del contrato entre hilos; todavía no es un
backend Xenos. No interpreta PM4, registros de textura, tiling, endian, BC/DXT,
mipmaps, shaders guest, eDRAM, MSAA guest ni resolves. No se cambiaron fuentes,
configuración ni salida del codegen de Claude en artifacts/xex-adapt.

El siguiente paso de integración es traducir un descriptor de textura Xenos a
píxeles/formato host, conservar sus alias y vigilar invalidaciones, y utilizar la
confirmación para liberar su almacenamiento. El productor real debe manejar
los errores y tiempos límite antes de reutilizar memoria. El formato comprimido
y los layouts Xbox necesitan pruebas propias; no pasar sus bytes directamente
como RGBA8. La ruta actual usa EM_JS, no Emdawnwebgpu ni una implementación de
GraphicsSystem de rexglue. No se hizo prueba física en iPhone.

Referencia de API: https://gpuweb.github.io/types/interfaces/GPUQueue.html

## Adelanto visible local

`node tools/graphics-upload/serve.mjs` abre un servidor en http://127.0.0.1:5180/.
La galería muestra los píxeles reales devueltos por la GPU durante la prueba de
pthread. Incluye repetir, dato alterado, espera perdida y acceso a graphics.html
(escena 3D propia existente, no gráficos GH3). No publica nada en Vercel.

`node tools/graphics-upload/verify-preview.mjs` comprueba los botones, las seis
imágenes, los dos negativos, el reinicio por navegación, el layout a 390 px y el
acceso a la escena WebGPU. Evidencia en preview-verification.json y capturas
preview.png / preview-mobile.png / scene-3d.png bajo artifacts/graphics-upload/.
La visualización móvil es simulación de viewport, no prueba física en iPhone.
