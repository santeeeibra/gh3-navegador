# Pedido a Claude — controles móviles visibles antes de jugar

Autorización de Santi en este chat, 2026-10-13:
«Dale que lo implemente claude».

Implementar en tu copia vigente del frontend móvil, con respaldo y regresión.
No sustituir tu index/runtime por los de native60. Codex sigue con renderer;
este pedido asigna a Claude la interfaz y los controles.

## Comportamiento aprobado

- Antes de cargar el juego, mostrar «Controles táctiles activados» y
  «Probar controles», con los cinco colores en orden original que responden
  al toque. La prueba es opcional y no debe requerir arrancar el wasm ni mandar
  entradas al juego. Mostrar «Jugar» como acción directa.
- Explicación breve: tocar el color cuando llega al aro; mantener para las
  notas largas; varios dedos para acordes. Indicar rasgueo automático si está
  activado, y explicación correcta de rasgueo manual si el usuario lo eligió.
- En canción, conservar las zonas alineadas con los aros reales, con bordes
  de color tenues visibles aun sin presionar y respuesta inmediata al toque.
  Evitar rellenos que oculten notas, rectángulos gigantes y animaciones continuas.
- Acceso claro a «Controles» y ajustes de tamaño/posición/visibilidad que se
  guardan en el dispositivo. Reutilizar ajustes existentes; migrar preferencias
  si hace falta, sin resetear la configuración actual del usuario.
- Respetar orientación, letterboxing y safe areas del iPhone; preservar la
  cruceta/confirmar/volver para menús, pausa y poder estelar en canción.

Maqueta orientativa (no conectar su código React al juego):
`C:/Users/santi/.codex/visualizations/2026/10/13/01a1335e-a60f-7ea0-8d70-d8ce3adc2e06/controles-moviles.canvas.tsx`.
Los colores de la maqueta vienen del tema del host; usar los colores propios
del juego en la implementación. La integración requiere áreas reales del canvas.

## Verificación

Comprobar antes de Jugar sin cargar chunks; multi-dedo, notas sostenidas y
repetidas, cancelación/pérdida de foco, orientación, ajustes persistentes y
ausencia de controles táctiles en PC salvo forzado. Confirmar que la prueba
previa no envía entradas ni empieza descargas del juego. Reservar el turno
único de PRUEBAS-EN-CURSO para cualquier ejecución del juego/GPU.
Validar móvil por emulación y distinguirla de prueba física iPhone11.

Santi precisó después: «El audio no se negocia. Tiene que escucharse siempre
constante y fluido. Al igual que la jugabilidad. Sacrifica otras cosas».
La UI no debe añadir procesamiento por cuadro ni retrasar controles/audio.
No se autorizó un despliegue nuevo con este pedido; entregar implementación
y evidencia local, coordinando la publicación por el flujo vigente.
