#!/usr/bin/env bash
# Claude 2026-10-16: una corrida del robot sobre la copia c1id + análisis resumido. Uso: bash tools/c1-strum/corrida.sh <nombre> <c1strum> [opciones del robot...]
set -uo pipefail; cd "$(dirname "$0")/../.."
N=$1; M=$2; shift 2; L=artifacts/sincronia-rea/c1id/$N.log
node tools/c1-strum/run-c1.mjs bien --root artifacts/sincronia-rea/c1id/demo --perfil medir --espera 500 --plazo 90 --segundos 17 --q "a60reloj=audio&c1strum=$M" --adelanto 200 "$@" > $L 2>&1; echo "$N EXIT $?"
D=$(grep -o '"out":"[^"]*' $L | sed 's/.*accesos\\//'); echo "carpeta $D"
OUT=artifacts/sincronia-rea/c1id/analysis-$N.json node tools/c1-strum/analyze-c1.mjs $D > /dev/null || exit 1
node -e "const c=require('./artifacts/sincronia-rea/c1id/analysis-$N.json').cases[0],f=x=>x==null?'-':x.toFixed(0);
console.log(JSON.stringify({ok:c.ok,errPag:c.pageErrors.length,aciertos:c.hits,fallos:c.missed,cola:c.queueStats,rechazos:c.rejectReasons.map(r=>r.reason),errAcierto:c.hitErrorMs,capa:c.layerFPS,cortes:c.audioUnderruns,saltos:c.audioSkips}));
console.log('nota tipo id | evento→juicio | errJuicio | errRobot | corrección | dom-nativo | base-nativo');
for(const r of c.rows)console.log(r.index,r.kind,r.queueId??'-','|',f(r.eventToJudgementMs),'|',f(r.judgementErrorMs),'|',f(r.pressClockErrorMs),'|',f(r.usedMs-r.nativeBaseMs),'|',r.domMs!=null?f(r.domMs-r.nativeBaseMs):'-','|',r.baseAtWrite!=null?f(r.baseAtWrite-r.nativeBaseMs):'-')"
