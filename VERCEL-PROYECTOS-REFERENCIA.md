# ⚠️ PROYECTOS VERCEL - NO EQUIVOCARSE

## Proyectos correctos en guitarra-heroe scope

### 1. **gh3-privado** (EL QUE USAMOS)
- **URL:** https://vercel.com/guitarra-heroe/gh3-privado/deployments
- **Alias:** lasvegasherogame.com/gh3/
- **Contenido:** Programa + página de juego (~95 MB)
- **Deploy:** 2-PUBLICAR-GH3.cmd SIN --project (Vercel lo detecta automáticamente)
- **Variables:** GH3_SRC, GH3_DST, GH3_NO_CHUNKS=1

### 2. **lvh3-datos** (DATOS SOLO, subido UNA VEZ)
- **URL:** https://vercel.com/guitarra-heroe/lvh3-datos/deployments
- **Alias:** lvh3-datos.vercel.app
- **Contenido:** Chunks de juego (3.6 GB, inmutables)
- **Deploy:** 1-SUBIR-DATOS-GH3-UNA-VEZ.cmd (solo si manifest.json cambió)
- **NO TOCAR** salvo que haya partes nuevas

### 3. ❌ PROYECTO EQUIVOCADO (ignorar/eliminar)
- **deploy-audioworklet-60-prod** ← ERROR de Codex 2026-10-20 08:02
- No usar, borrar si aparece

## Checklist antes de cada deploy

- [ ] Es gh3-privado? → OK, continuar
- [ ] Es otro proyecto? → DETENER y preguntar a Santi
- [ ] Verificar alias en: https://vercel.com/guitarra-heroe/gh3-privado/settings/domains
- [ ] Confirmar lasvegasherogame.com apunta a gh3-privado

## Comando correcto

`powershell
cd ''d:\\guitar hero''
=''artifacts/d1-wasm/audioworklet-60/demo''
node tools/ui3/stage-privado.mjs
node tools/analytics/stage-feedback.mjs artifacts/privado/deploy-app/.vercel/output/static/gh3
node tools/analytics/stage-dashboard.mjs artifacts/privado/deploy-app/.vercel/output/estadisticas
node tools/analytics/patch-vercel-config.mjs artifacts/privado/deploy-app/.vercel/output
cd artifacts\\privado\\deploy-app
vercel deploy --prebuilt --prod --yes --scope guitarra-heroe
`

**NO AGREGAR:** --project deploy-audioworklet-60-prod

