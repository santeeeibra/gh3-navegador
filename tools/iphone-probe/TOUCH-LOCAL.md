# Controles táctiles GH3: prueba local

Desde `D:\guitar hero`, ejecutar `npm run dev` y abrir http://localhost:5173/gh3/?touch=1 . Tocar Jugar y esperar la preparación de Slow Ride. Es la prueba parcial existente del original.

En PC, `touch=1` fuerza los controles; las herramientas de desarrollador de Edge/Chrome permiten emular un iPhone 11 horizontal (896 × 414). El mouse sirve para probar una zona; los acordes requieren varios dedos o la prueba automatizada por CDP.

- Cada zona corresponde al círculo verde, rojo, amarillo, azul o naranja. Mantené las notas y usá RASGUEO como antes: tocar un traste no genera un rasgueo automático.
- Abrí Ajustes táctiles. Altura 0 ubica las zonas sobre los círculos; valores positivos las bajan y negativos las suben. Ancho y tamaño vertical ajustan las áreas. Las zonas se limitan a la pantalla y el ancho no invade el círculo vecino.
- Mientras el panel está abierto aparece la vista previa numerada; se bloquea la entrada táctil al mando para evitar notas accidentales. Listo vuelve al juego. Esto no pausa el reloj: usá pausa antes de ajustar durante una canción.
- Los valores se guardan automáticamente en localStorage (`gh3TouchZones.v1`). Recargá la misma dirección para comprobarlo; cada navegador/origen guarda su propia configuración. Restablecer recupera 0 / 100 / 18.
- Las zonas se recalculan con el tamaño, orientación y escala de la imagen, incluyendo las bandas negras de object-fit: contain. En vertical los círculos son más pequeños; horizontal ofrece más espacio para los dedos.

`npm run test:gh3-touch` verifica con Edge y toques reales de CDP la entrada al mando existente, cinco notas, acordes y rasgueo simultáneo, deslizamiento, liberación, controles de teclado combinados, sliders, recarga, restablecimiento y orientación. Evidencia: `artifacts/touch-zones/verification.json` y `preview.png`. Usa una imagen de prueba con receptores, sin ejecutar GH3; no acredita rendimiento del juego ni Safari físico.

El servidor local incluye COOP/COEP y MIME de WASM para el SharedArrayBuffer del juego. Para un iPhone físico hace falta servir desde la PC en HTTPS confiable, conservando esos encabezados: HTTP por IP de la red local no ofrece el contexto seguro requerido por el juego. No se realizó ningún despliegue.

Fuentes: `src/original/gh3-touch.js`. Los builds copian esa fuente sobre la entrega histórica generada; no editar solamente `dist/`. No se cambiaron gh3-input, el motor, puntaje ni reloj de sincronización.
