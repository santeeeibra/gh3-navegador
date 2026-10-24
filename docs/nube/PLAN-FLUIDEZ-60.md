# Plan de fluidez 60 fps sincronizada (Santi 2026-10-23)

Estado: SOLO PLAN. No se tocó código del juego ni del sitio. Nada se publica sin OK de Santi.
Reglas del proyecto: copia aislada en `artifacts/d1-wasm/fluido/<paso>` (base: `artifacts/d1-wasm/alta100/op7`),
respaldo antes de tocar, un cambio por vez, medir antes y después, OK visual de Santi antes de seguir.

Marcas: COMPROBADO = medido y visto. HIPÓTESIS = razonado, sin medir. ESTIMADO = número esperado, no promesa.

## 1. Línea de base (COMPROBADO, op7, alta, PC de Santi: RTX 4060, pantalla 1920x1080 a 100 Hz)

| Qué | Dato | Fuente |
|---|---|---|
| Entrega de audio del juego | 98 a 102 % del tiempo real; parada más larga 36 ms; 0 silencios | grabadora, Miss Murder 207 s |
| Colchón de audio | 188 a 209 ms; 0 cortes; 1 salto al arrancar la canción (167 a 416 ms) | contadores del reproductor |
| Chasquidos posibles en la onda | 3 (a los 71, 103 y 194 s), amplitud 0,5 a 0,6 | grabadora |
| Velocidad del juego | 86 % promedio, mínimo 66 %, p10 78 % | `juegoPct` |
| Escenario (imágenes presentadas) | 59 por segundo | `imgEscenaS` |
| Escenario (armados reales) | unas 17 a 20 por segundo | notas del 22/10 (`snapsS`) |
| Capa de la autopista | 59 a 60 cambios por segundo, pero con ritmo irregular: mitad 10 ms, mitad 20 ms; 28 % de intervalos mayores a 20 ms | `frames.json` (robot) |
| Cuadros del navegador | cada 10 ms (la pantalla es de 100 Hz) | `frames.json` |
| Causa de la irregularidad | tope de 60 por segundo en `autopista60.js` (líneas 337 a 339: en 100/120 Hz dibuja "60 de cada segundo") | código |
| Gancho reloj-audio | en Miss Murder dejó de corregir a los ~20 s (vio una diferencia de 16 s y se rindió); con el robot en Slow Ride sí corregía (4.000 correcciones en 3 min) | contadores del gancho |
| Memoria del proceso de pantalla | crece unos 110 MB por minuto (1,56 a 1,90 GB en 3 min), igual en liviana; no es wasm ni JavaScript; dueño desconocido | regiones de memoria |
| Techo de la lógica | liviana (sin escenario) da 89 a 96 %: el juego mismo no pasa de ~90-95 % en esta PC | notas del 22/10 |

## 2. Qué es "fluidez total" (criterios para dar por bueno cada paso)
1. Autopista: una imagen nueva en cada cuadro de la pantalla, sin intervalos mayores al cuadro de la pantalla más 2 ms.
2. Notas, audio y juez: error entre el reloj del juego y el audio menor a 20 ms promedio y menor a 40 ms en el peor caso, durante TODA la canción.
3. Audio: 0 cortes, 0 saltos, y ningún chasquido que Santi pueda oír.
4. Escenario: ritmo parejo (desvío menor a 5 ms entre escenas) y cámara a 60 por segundo.
5. Velocidad del juego: al menos 90 % sin bajar de 80 %.
6. Memoria: crecimiento menor a 20 MB por minuto.
Todo con Edge visible y la canción jugada de verdad (no solo robot).

## 3. Pasos, en orden (esfuerzo: chico, medio, grande)

### Paso A. Autopista a la frecuencia de la pantalla (CHICO) - empezar acá
- Qué: sacar el tope de 60 por segundo cuando la pantalla va a más de 60 Hz; dibujar en cada cuadro con la posición de las notas calculada del reloj del audio.
- Antes: 28 % de intervalos mayores a 20 ms en 100 Hz. Meta (ESTIMADO): 0 %, una imagen nueva cada 10 ms (100 por segundo).
- En pantallas de 60 Hz no cambia nada. Mejora las de 90, 100, 120 y 144 Hz.
- Riesgo: la capa dibuja 66 % más veces en 100 Hz. Costo desconocido, se mide. Criterio de corte: si la velocidad del juego baja más de 2 puntos, se limita a 75 u 80 por segundo con ritmo parejo.
- Medición: ritmo de cuadros de la capa (`frames.json`), velocidad del juego, 3 canciones.

### Paso B. Chasquidos y microcortes de audio (CHICO a MEDIO)
- Qué: agregar una tecla de marca (por ejemplo M) para que Santi la apriete cuando oiga un corte; la grabadora anota el segundo de canción. Cruzar con los chasquidos de la onda.
- Si coinciden: el origen está en el sonido que produce el juego (decodificación). Se investiga con la versión espía.
- Si no coinciden: el audio del juego sale limpio y el corte está del lado del navegador o de Windows (salida de audio). Se prueba otra salida y otro navegador.
- Meta: causa identificada. No promete arreglo.

### Paso C. Que el gancho reloj-audio no se rinda (MEDIO)
- Qué: medir por qué en Miss Murder aparece una diferencia de 16 s (HIPÓTESIS: el tiempo de audio de la capa está mal anclado en esa canción). Cambiar "desacuerdo grande: no corrijo" por "re-anclo si el desacuerdo dura más de 1 s".
- Antes: corrige solo 20 s de 207. Meta (ESTIMADO): corrige toda la canción, error medio menor a 20 ms.
- Riesgo: toca el juicio. Se prueba con robot en 4 canciones y con Santi.

### Paso D. Escenario parejo y cámara a 60 (MEDIO) - pasos 1 y 2 del plan del 22/10
- Qué: mostrar cada escena nueva a intervalos fijos (20 por segundo exactos) y mezclar la cámara entre dos escenas para que se mueva a 60.
- Antes: 17 a 20 irregular. Meta (ESTIMADO): 20 parejo y cámara suave. No sube la velocidad real, mejora lo que se ve.
- Después, si hace falta (pasos 3 a 7 de `NOTAS-OP7-Y-ESCENARIO.md`): personajes suaves, hash en el armador, reutilizar lo quieto, dos armadores. ESTIMADO: de 20 a 30 o 40 escenas por segundo con los últimos tres, hasta 2x con dos armadores.

### Paso E. Preset "Fluida" con recortes (CHICO)
- Qué: opción que deja el escenario simple (o apagado) y la autopista completa. Base: calidad liviana.
- Antes: alta 86 %. Meta (ESTIMADO): 92 a 96 % en esta PC, sin escenario complejo. Se ofrece al jugador como opción, no obliga.
- Los interruptores de público, luces y LOD ya medidos no cambian la velocidad del juego (queda por revisar si aceleran el armado).

### Paso F. Memoria que crece (MEDIO a GRANDE)
- Qué: encontrar el dueño del bloque que sube 110 MB por minuto (no es basura ni JavaScript ni wasm). Candidato (HIPÓTESIS): datos de la canción que se leen por pedazos.
- Meta: menos de 20 MB por minuto. Relacionado con tu síntoma "cada vez más lag".

### Paso G. Techo de la lógica del juego (GRANDE, al final)
- Hoy el wasm se enlaza sin optimizador (`-O0`, HIPÓTESIS en las notas) y hay ~21 s de CPU por minuto en consultas de hora.
- Qué: medir con la versión espía qué función manda; reducir consultas de hora; probar el enlace optimizado.
- Meta (ESTIMADO, muy incierto): llegar a 100 % sin escenario y 95 % con escenario. Es el único paso que puede acercar de verdad la alta a 60 completos.

### Paso H. Precargar cinemáticas y datos de la canción antes del nivel (MEDIO) - idea de Santi 2026-10-23
- COMPROBADO en la carpeta del juego: hay videos Bink reales en `DATA/MOVIES/BIK`: `Satan-Battle_WIN` y `Satan-Battle_LOSS` (2,9 MB cada uno), `Player1_wins` y `Player2_wins`, `singleplayer_01` a `08` y `_end` (13 a 24 MB), los de jefes `slash` (102 MB), `tommorello` (100 MB), `brettmichaels` (105 MB) y `sexpistols` (154 MB), `loading_flying`, `Fret_Flames`, `Golden_Guitar` y los `video_shoot_poor/medium/good/encore` (pantalla de video de ese escenario), más `z_*_encore_audio`.
- Qué: cuando el jugador elige una canción o un jefe, bajar a la caché los pedazos (chunks) de esos videos y de los datos de la canción, antes de que el juego los pida. Para win/lose: las dos variantes (ganar y perder) mientras se juega; son chicas (unos 3 MB).
- Beneficio esperado (ESTIMADO): se acaban las esperas y las imágenes clavadas al entrar a un jefe (Tom Morello ya mostró ese problema) y los tirones por lecturas a mitad de canción. NO hay evidencia de que los microcortes de audio vengan de cargas: en la medición no había pedidos de datos que coincidieran.
- HIPÓTESIS a medir: `Fret_Flames` y los `video_shoot_*` se decodifican dentro del wasm durante la canción y cuestan CPU. Se mide qué videos abre el juego en una canción normal y cuánto cuesta cada uno.
- Riesgo: ancho de banda del jugador y memoria (precargar jefes de 100 MB en celular sería un error: hacerlo solo en PC o solo el siguiente).

### Paso I. Escenario como video grabado (GRANDE, proyecto aparte) - idea de Santi 2026-10-23
- Idea: el juego solo procesa notas y juicio; el fondo es un video a 60 fps (con variantes normal, ganar, perder).
- Lo que tiene a favor (ESTIMADO): el fondo pasa de 20 escenas por segundo a 60 parejos; el juego queda como en liviana (92 a 96 %); se ahorra la memoria y el trabajo del armador de escenas.
- Lo que cuesta: hay que GRABAR los videos desde el propio juego, a 60 por segundo, y hoy el juego solo arma 20 escenas por segundo; haría falta un modo de captura más lento que el tiempo real. Peso aproximado (ESTIMADO): 70 a 150 MB por canción y por variante; con decenas de canciones son varios GB. El fondo dejaría de reaccionar al juego (público, llamas, poder estelar) salvo que se graben variantes.
- Recomendación: no empezar por acá. Primero A, B, D y E. Si después sigue sin alcanzar, hacer una prueba piloto con una sola canción.

## 4. Orden recomendado y qué se espera ver después de cada uno
1. A (autopista) y B (marca de cortes): baratos, se notan o descartan enseguida.
2. C (gancho): quita desfasajes silenciosos del juez.
3. D (escenario): lo que Santi ve como "30 fps".
4. E (preset fluida): da una opción segura para quien tenga una PC más lenta.
5. F y G: los que mueven los números de fondo; más trabajo.

## 5. Lo que NO se puede prometer
- 60 fps de verdad en escenario completo con la lógica actual: con el juego al 86 a 92 % el escenario se renueva a 20 a 30 por segundo como máximo. Lo que sí se puede es que la autopista, las notas y el audio sean parejos y que el escenario se vea fluido.
- Que desaparezcan los microcortes si el origen está en la salida de audio de Windows.
- Números de iPhone: no se midieron en este plan.
