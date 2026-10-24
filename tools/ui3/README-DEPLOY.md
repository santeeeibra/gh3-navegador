# Deploy en dos proyectos (Claude 2026-10-14)
- `sante11/lvh3-datos` (https://lvh3-datos.vercel.app): sólo `/gh3/chunks/<sha256>` (3,6 GB, inmutables). Carpeta
  `artifacts/privado/deploy-datos`. Se sube una vez: `1-SUBIR-DATOS-GH3-UNA-VEZ.cmd`. Volver a subir sólo si cambia el manifest.
- `sante11/gh3-privado` (lasvegasherogame.com): programa + página (~95 MB), `artifacts/privado/deploy-app`. La ruta
  `/gh3/chunks/(hash)` se reescribe (proxy) a lvh3-datos: mismo origen para el navegador, COOP/COEP intactos.
  Deploy: `2-PUBLICAR-GH3.cmd` (GH3_SRC = copia a publicar; stage con GH3_NO_CHUNKS=1).
- Si el manifest cambia (partes nuevas), rearmar deploy-datos con `tools/ui3/stage-privado.mjs` (sin GH3_NO_CHUNKS) y resubir.
