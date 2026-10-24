#!/usr/bin/env bash
# Claude 2026-10-22: N arranques de canción por copia (Edge visible, 12 s de canción) para ver si la imagen se clava.
cd "$(dirname "$0")/../.."
Q=${Q:-liviano}; N=${N:-4}
for i in $(seq 1 $N); do for root in "$@"; do
  timeout 240 node tools/modelos/med.mjs bien --tema slowride --perfil medir --root $root --calidad $Q --segundos 12 --aceptar 8 --plazo 170 --ver --sincaptura >/dev/null 2>&1
  d=$(ls -d artifacts/gh3-liviano/accesos/*-bien | tail -1)
  node -e "const r=require('./$d/resultado.json');const c=r.muestras.filter(m=>m.clock>3000);const a=c[0],z=c.at(-1);const dr=a&&z?(z.rend?.recibidos-a.rend?.recibidos):null;console.log('$i',r.root.split('/').slice(-1)[0],'$Q','recibidosEnCancion',dr,'fatal',JSON.stringify((z?.rend?.fatal||'').slice(0,300)),'img',z?.imgEscenaS,'capa',z?.capaMostradas,dr===0?'CLAVADA':'ok','$d')"
done; done
