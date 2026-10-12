# Puente: jugar GH3 desde el celular — paso a paso

Todo se hace en TU PC de casa (por Steam Link si estás afuera). El celu o la otra PC solo abren un link.

## Antes de empezar
- La PC prendida, sin suspensión, con internet.
- Cerrá cualquier GH3 que esté abierto (la otra sesión de Claude puede estar usándolo: esperá a que termine).

## En la PC de casa
1. Abrí la carpeta `D:\guitar hero` y hacé doble clic en **`JUGAR-PUENTE.cmd`**.
   - Se abren dos cosas: una ventana negra "Ayudante del mando" (**dejala abierta**) y el juego.
   - La primera vez copia el juego a `build\gh3-puente` (unos segundos).
2. Esperá a que el juego llegue a la pantalla de inicio. Tocá la ventana del juego una vez para que quede en primer plano.
3. En Edge o Chrome abrí: https://riff-duel.vercel.app/puente/host.html
4. Tocá **"Compartir ventana del juego"**, elegí la ventana de **Guitar Hero** (no la pantalla entera) y marcá **compartir audio** si aparece.
5. En la página aparece un **link para el amigo** (con el código de sala). Copialo.
   - En el log tiene que decir `sala: SUBSCRIBED`.

## En el celular (o en la otra PC)
6. Abrí ese link (Safari, Chrome o Brave) y tocá **Conectar**.
7. Si queda en "connecting": en Brave bajá los escudos para el sitio, o probá otro navegador. Algunas redes de empresa bloquean este tipo de conexión.
8. Tocá el video para que arranque el sonido.
9. Los botones de abajo mueven el juego. Si el anfitrión dice `ayudante de mando: conectado`, está llegando.

## Si algo falla
- **El celu ve la imagen pero los botones no mueven nada:** mirá el log del anfitrión.
  - `ayudante de mando: NO responde` → falta la ventana negra del ayudante (cerrala y volvé a abrir `JUGAR-PUENTE.cmd`).
  - Si dice conectado y el juego no reacciona: avisame cuál botón probaste y qué pasó.
- **No se ve la imagen:** volvé a tocar "Compartir ventana" y elegí la ventana del juego.
- **Los trastes no son los que esperás:** en GH3 con mando los trastes pueden ir en otros botones. Probá L1, L2, R1, R2 y A, y anotá cuáles andan; los ajusto.
- **Tu mando de PS4:** en esta variante no se ve (el modo XInput usa mandos de Xbox). Con `JUGAR-GH3.cmd` de siempre todo sigue como estaba.

## Para terminar
- Cerrá el juego y la ventana negra del ayudante.
- Para quitar la entrada del celular del todo: borrá `artifacts\xex-adapt\paso-b\build\gh3-puente`.

## Qué NO se tocó
- Tu configuración de mandos de Windows, DS4Windows, Steam Input: nada.
- La carpeta original del juego y `build\gh3`.
- No hay drivers nuevos.
