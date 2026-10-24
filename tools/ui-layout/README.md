# Controles y panel lateral

Copia independiente y publicada: `artifacts/ui-layout/demo`, base `artifacts/d1-wasm/ui3/demo` con productor barato. No se modifican ui3, WASM, audio ni shaders.

Preparar: `node tools/ui-layout/prepare.mjs` y `node tools/analytics/stage-feedback.mjs artifacts/ui-layout/demo`.

Probar la interfaz: `node tools/ui-layout/verify.mjs`.

Jugar localmente: `node tools/ui3/serve.mjs artifacts/ui-layout/demo 5459`, abrir `http://127.0.0.1:5459/gh3/`. Reservar turno antes de una prueba del motor.

La guía original pasa al lateral izquierdo en escritorio desde 1000×480, desde la portada y durante el juego; se conserva en el panel móvil. El centro muestra video/Jugar antes de iniciar y el juego después. Los botones principales y pestañas quedan fuera del desplazamiento de ajustes. Trucos tiene sección propia al lado de Partida. Las acciones que necesitan el motor se habilitan al conectar la entrada. El logo usa 96px en ventanas altas, 68/48px en ventanas bajas. La cinta opcional pasa a Gráficos.

STRUM conserva las acciones internas de rasgueo y suma K como alternativa a ↓. Se migra una sola vez el segundo espacio vacío, conservando teclas personales y colisiones. La guía refleja los bindings actuales. Sonido incluye instrucciones de teclado, cruceta Xbox/PlayStation y guitarra, calibración original y ajuste manual, más devolución explícita del foco al lienzo. No cambia la simulación ni el tono/ritmo del audio.

Para publicar con aprobación, usar esta copia como GH3_SRC en el flujo normal. El script de staging ya detecta gh3-layout.js y gh3-strum-keys.js por sus etiquetas script. Manifest y chunks no cambian. Conservar formulario/monitor.
