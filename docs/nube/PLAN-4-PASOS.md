# PLAN ÚNICO VIGENTE — GH3 fluido y jugable (aprobado por Santi 2026-10-14)

Santi: «guardá esos 4 pasos y olvidá el resto de pasos pendientes». **Este plan reemplaza a todos los pendientes
anteriores** (PLAN-GH3-FLUIDO-IPHONE E1–E6, paso 2 «perfil sin imagen», mediciones de retraso, propuestas UI3 2–4,
modo historia/online, etc.). No retomarlos salvo pedido explícito de Santi.

Forma de trabajo: lógica primero, poca prueba y error. Una sola prueba al final de cada paso. No publicar sin OK.

## Por qué
COMPROBADO por Santi (PC, 2026-10-14): siguiendo el sonido acierta, siguiendo las notas erra; con 1 cuadro en vuelo
peor. Las notas llegan a saltos (~25 imágenes nuevas/s + extrapolación) y atrasadas respecto del audio.
En GH3 la posición de cada nota depende sólo del tiempo de canción y del chart → se puede dibujar a 60 fps con el
mismo reloj del audio que suena, independiente de la velocidad del juego.

## Los 4 pasos
1. **Autopista propia a 60 fps** (Claude, Opus 5.5 high). Retomar hw60 (`artifacts/hw60`, `artifacts/hw60-codex`):
   autopista, notas, colas y notas estrella dibujadas por la página con texturas/geometría del juego, posicionadas con
   el reloj del audio realmente reproducido (AudioWorklet). El juego no dibuja su autopista (evitar dibujo doble, ya
   resuelto en hw60-codex). Juicio y puntaje siguen siendo del GH3 original.
2. **Escenario y personajes a la velocidad del juego** (Codex): sin extrapolación de cuadros intermedios.
3. **Celular** (Codex): escenario liviano (menos imágenes, sin sombras), autopista a 60.
4. **Memoria iPhone** (Claude): que no se cierre al cargar canción.

Terminado = Santi toca siguiendo las notas y acierta igual que siguiendo el sonido, en PC y luego en iPhone 11.
