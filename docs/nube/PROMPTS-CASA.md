# Prompts para Claude Code en la PC (después de medir)

Primero seguí `docs/nube/MEDIR-GOBERNADOR-EN-PC.md`. Después abrí Claude Code
en la carpeta del proyecto, en la rama `movil-tactil-gobernador`, y pegá
**uno** de estos dos prompts. Reemplazá lo que está entre `<< >>` por lo tuyo.

---

## Si está APROBADO

```text
Leé REGLAS.md, docs/nube/CHECKPOINT-CLAUDE-2026-10-13-MOVIL.md,
docs/nube/RESULTADO-MOVIL-TACTIL-GOBERNADOR.md y docs/nube/MEDIR-GOBERNADOR-EN-PC.md.
Estamos en la rama movil-tactil-gobernador (PR https://github.com/santeeeibra/gh3-navegador/pull/1).

Medí en la PC y lo apruebo. Resultados:

PISTA:
<<pegar comparacion.md de gov-slowride-pista-...>>

ESCENA:
<<pegar comparacion.md de gov-slowride-escena-...>>

PRECARGA:
<<pegar comparacion.md de precarga-slowride-escena-...>>

CELULAR (si ya lo probé, informe copiado del diagnóstico):
<<pegar o escribir "todavía no">>

Lo que vi a ojo:
<<ej.: "se ve bien", "en el celu se nota más borroso en mínimo">>

Qué quiero, de a un paso y explicándome en simple (no soy programador):
1. Revisá los resultados contra los criterios de "¿Aprobado o no?" de la guía.
   Si algo no cumple, decímelo antes de seguir.
2. Si los datos muestran que conviene ajustar umbrales del gobernador
   (gh3-governor.js, CONFIG) o el límite de ritmo de audio (?audiorate),
   proponeme el cambio con los números y esperá mi OK.
3. Corré npm test, npm run test:movil-tactil y npm run test:movil-gobernador.
   Si todo da bien, mergeá el PR 1 a main.
4. Para publicarlo en el celu: buscá cómo se publicó la versión móvil anterior
   (docs/nube/CHECKPOINT-CLAUDE-2026-10-12-OPTIM.md, artifacts/privado/deploy-movil)
   y proponeme el plan. No publiques nada sin mi OK.
5. Al final actualizá el checkpoint con lo hecho y lo pendiente.
```

---

## Si NO está aprobado

```text
Leé REGLAS.md, docs/nube/CHECKPOINT-CLAUDE-2026-10-13-MOVIL.md,
docs/nube/RESULTADO-MOVIL-TACTIL-GOBERNADOR.md y docs/nube/MEDIR-GOBERNADOR-EN-PC.md.
Estamos en la rama movil-tactil-gobernador (PR https://github.com/santeeeibra/gh3-navegador/pull/1).

Medí en la PC y NO lo apruebo. Resultados (los que llegué a sacar):

PISTA:
<<pegar comparacion.md o "no llegué">>

ESCENA:
<<pegar comparacion.md o "no llegué">>

PRECARGA:
<<pegar comparacion.md o "no llegué">>

Si algún comando falló, últimas líneas de la consola:
<<pegar>>

Qué estuvo mal (con mis palabras):
<<ej.: "el audio se cortó", "los controles responden tarde", "no arranca">>

Qué quiero, de a un paso y explicándome en simple (no soy programador):
1. No mergees ni publiques nada.
2. Si el juego de la PC quedó roto, primero dejalo andando como antes:
   apply-web.mjs guardó un respaldo en artifacts/r5-native60/demo-respaldo-<fecha>/.
   Mostrame qué vas a restaurar antes de hacerlo.
3. Averiguá qué parte causa el problema. Cada parte se puede apagar o
   separar para probar:
   - Gobernador: ?gov=0 lo apaga, ?gov=observa sólo mira.
   - Controles táctiles: ?touch=0 los apaga.
   - Precarga y texturas en canción: commits 4cc0d83, 7e1aba5 y b210a96.
   - Medición (no cambia el juego): 753d7d9, 3500806, 2ca483f, 8eee218.
   - Táctil, telemetría y gobernador: 85a8257, bb1983c, ea62ef2.
   Si hace falta correr el juego, respetá el turno de artifacts/PRUEBAS-EN-CURSO.md.
4. Explicame la causa y proponeme el arreglo (o deshacer esa parte con
   git revert). Esperá mi OK antes de cambiar código.
5. Al final actualizá el checkpoint con lo que encontraste.
```
