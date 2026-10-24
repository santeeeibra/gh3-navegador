#!/usr/bin/env bash
# Claude 2026-10-22 (gpuval): una corrida de 30 s de canción por copia/calidad; dice img, error fatal y validación.
cd "$(dirname "$0")/../.."
for par in "$@"; do root=${par%:*}; q=${par##*:}
  timeout 300 node tools/modelos/med.mjs bien --tema slowride --perfil medir --root $root --calidad $q --segundos 30 --aceptar 8 --plazo 230 --ver --sincaptura >/dev/null 2>&1
  d=$(ls -d artifacts/gh3-$( [ $q = completo ] && echo completo || echo liviano )/accesos/*-bien 2>/dev/null | tail -1)
  [ -z "$d" ] && d=$(ls -dt artifacts/gh3-*/accesos/*-bien | head -1)
  node -e "const r=require('./$d/resultado.json');const z=r.muestras.at(-1)||{};const v=z.rend?.val;console.log('$root','$q','juego',z.juegoPct,'img',z.imgEscenaS,'capa',z.capaMostradas,'gpuPerdida',z.gov?.gpuPerdida,'fatal',JSON.stringify((z.rend?.fatal||'').slice(0,200)),'val',v?v.n:null,JSON.stringify(v?.mensajes||[]).slice(0,400),'salteados',z.rend?.valSalteados,'robot',JSON.stringify(z.robot),'$d')"
done
