# Para hacer en casa: medir el gobernador en la PC

Qué se busca: saber con números si el gobernador (la «calidad automática»)
ayuda. Se corre la misma canción dos veces: una con el gobernador **sólo
mirando** (no cambia nada, anota lo que *habría* hecho) y otra con el
gobernador **activo**. Después se comparan.

Todo se escribe en **PowerShell**, dentro de la carpeta del proyecto.

## 1. Traer lo nuevo

```powershell
git fetch origin movil-tactil-gobernador
git checkout movil-tactil-gobernador
git pull origin movil-tactil-gobernador
npm ci
```

## 2. Aplicar los cambios a la copia del juego (en este orden)

```powershell
node tools/r5-native60/build.mjs
node tools/r5-native60/apply-web.mjs
```

- El orden importa: `build.mjs` pisa la página; `apply-web.mjs` pone la nueva.
- `apply-web.mjs` guarda un respaldo de lo que reemplaza
  (`artifacts/r5-native60/demo-respaldo-<fecha>`). No borra nada.
- Si `apply-web.mjs` dice que falta el runtime, **parar** y avisarme.

## 3. Comprobar que nada se rompió

```powershell
npm test
```

Tiene que terminar con `# fail 0`.

## 4. Medir (cerrar otros programas pesados antes)

Primero la pista, canción completa:

```powershell
node tools/r5-native60/measure-gov.mjs slowride --full
```

Después la escena (la que tiene escenario y más trabajo):

```powershell
node tools/r5-native60/measure-gov.mjs slowride --full --escena
```

- Cada comando corre la canción **dos veces** (≈ 10 min en total). No usar la
  PC mientras tanto.
- Si el turno de pruebas está ocupado (`artifacts/PRUEBAS-EN-CURSO.md`),
  espera solo hasta 30 min y si no, se corta sin hacer nada.
- Al final muestra una tabla. Lo importante:
  - **Cortes** y **saltos** de audio: tienen que ser **0** en las dos.
  - Si aparece **FALLA** o **Avisos**, el comando termina con error: no es
    que se rompió la PC, es que hay algo para mirar.

### 4b. Medir la precarga (después de las dos anteriores)

```powershell
node tools/r5-native60/measure-gov.mjs slowride --full --escena --precarga
```

- Corre la canción dos veces **con el mismo navegador**: en la primera no hay
  nada recordado; en la segunda ya debería preparar todo durante la carga.
- Lo importante en la tabla: **«Pipelines compilados con la canción en
  juego»** tiene que bajar en la segunda (ideal: 0), y el audio seguir en 0
  cortes y 0 saltos.
- La segunda carga también va más rápido porque el juego queda en caché: eso
  es normal y no es mérito de la precarga.

## 5. Pasarme el resultado

Cada medición deja una carpeta `artifacts/r5-native60/runs/gov-slowride-...`
(la de precarga: `precarga-slowride-...`).
Abrí el archivo `comparacion.md` de cada una y pegame el contenido en el chat
(son tres: pista, escena y precarga). Con eso calibro los umbrales.

Si algo falla antes de la tabla, pegame las últimas ~20 líneas de la consola.

## 6. Celular (después de la PC)

Lo del celu (controles táctiles y gobernador) **no está publicado** y no se
publica desde GitHub: necesita los datos del juego que están sólo en la PC.
Cuando la PC dé bien, pedime publicarlo para el celu y lo hacemos juntos
(el procedimiento para esta versión todavía no está escrito en el repo).

En el celu, después de jugar: diagnóstico → **Copiar informe** y pegármelo.
Probar: una canción completa, navegar menús, y si se puede 15 min seguidos.
Para la precarga: jugar una canción, **cerrar y volver a abrir** la página y
jugar otra. En el segundo informe, `precarga.compiladasEnJuego` debería ser
0 o casi, y `precarga.hechas` mayor que 0.

## 7. ¿Aprobado o no?

**Aprobado** si en todas las mediciones:
- cortes y saltos de audio = 0 (con el gobernador activo y con la precarga);
- los controles no respondieron peor (la tabla no dice «respondieron peor»);
- la imagen no se ve peor de lo que esperás (en el celu, a ojo);
- la segunda corrida de precarga compiló menos en juego que la primera.

Después abrí Claude Code en la PC y pegá el prompt que corresponda de
`docs/nube/PROMPTS-CASA.md` (uno para aprobado, otro para no aprobado).

## Si querés volver atrás

Los archivos reemplazados están en la carpeta de respaldo del paso 2. Pedime y
los restauro; no hace falta hacerlo a mano.
