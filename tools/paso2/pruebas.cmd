@echo off
rem paso2 (Claude 2026-10-15): las 4 corridas de a una, sin ventana, prioridad baja y sólo núcleos 6-11 (máscara FC0),
rem para no trabar la PC de Santi. Salida en artifacts\d1-wasm\paso2\logs y runs.
cd /d "%~dp0\..\.."
set GH3_QUERY=manual=1
set BOT_GUITAR=1
set BOT_VIA=1
set GH3_TEST_OWNER=Claude (paso2)
set DEMO_ROOT=artifacts/d1-wasm/paso2/demo
set QUAL=liviano
set HW60_LABEL=p2-liviana
start "" /b /wait /belownormal /affinity FC0 node tools/paso2/run-song.mjs talkdirtytome --wait --full > artifacts\d1-wasm\paso2\logs\p2-liviana.log 2>&1
set QUAL=completo
set HW60_LABEL=p2-completa
start "" /b /wait /belownormal /affinity FC0 node tools/paso2/run-song.mjs talkdirtytome --wait --full > artifacts\d1-wasm\paso2\logs\p2-completa.log 2>&1
set DEMO_ROOT=artifacts/d1-wasm/autopista60-pub/demo
set TARGET_MS=100000
set QUAL=liviano
set HW60_LABEL=antes-liviano-td
start "" /b /wait /belownormal /affinity FC0 node tools/paso2/run-song.mjs talkdirtytome --wait > artifacts\d1-wasm\paso2\logs\antes-liviano-td.log 2>&1
set QUAL=completo
set HW60_LABEL=antes-completa-td
start "" /b /wait /belownormal /affinity FC0 node tools/paso2/run-song.mjs talkdirtytome --wait > artifacts\d1-wasm\paso2\logs\antes-completa-td.log 2>&1
echo TODAS-TERMINADAS
