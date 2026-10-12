#!/usr/bin/env bash
# Corrida medida modo celular (3 núcleos). Uso: bash tools/optim/run.sh <demo_dir> <etiqueta> [prof=1]
# Imprime solo: ok, img/s, ritmo del reloj, CPU ocupada total (si prof).
cd "$(dirname "$0")/../.."; D="$1"; TAG="$2"; P="${3:-1}"; LOG="artifacts/d1-wasm/optim/run-$TAG.log"
env GH3_TEST_OWNER=Claude CPU_AFFINITY=${CPU_AFFINITY:-0x15} ${P:+$( [ "$P" = 1 ] && echo CPU_PROF=25 CPU_PROF_DELAY=8 )} DEMO_ROOT="$D" \
 GH3_QUERY='manual=1&r5lite=1&r5liveconsumer=r5snap-song-render.js&audiotap=1' node tools/d1-wasm/demand-game-check-claude.mjs slowride ${FULL:+--full} > "$LOG" 2>&1
OUT=$(grep -o '"out":"[^"]*"' "$LOG" | tail -1 | sed 's/"out":"//;s/"$//;s#\\#/#g')
node -e '
const r=require(process.argv[1]+"/verification.json");const s=r.samples.filter(x=>x.clock>5000);const a=s[0],b=s.at(-1);
const fps=(b.presented-a.presented)/((b.t-a.t)/1000),rate=(b.clock-a.clock)/(b.t-a.t);
let cpu="";try{const c=require(process.argv[1]+"/cpu-top.json");const busy=c.threads.reduce((n,t)=>n+t.busyMs,0),tot=c.threads[0].totalMs;cpu=" cpu_nucleos="+(busy/tot).toFixed(2)+" top="+c.topAll.slice(0,5).map(x=>x.f.replace("__imp__","")+":"+x.pct+"%").join(",")}catch{}
console.log(process.argv[2],"ok="+r.ok,"img/s="+fps.toFixed(1),"ritmo="+rate.toFixed(3),"error="+(r.error||"").split("\n")[0].slice(0,80)+cpu)' "$OUT" "$TAG"
