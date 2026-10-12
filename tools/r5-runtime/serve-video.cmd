@echo off
cd /d "%~dp0\..\.."
set "R5_LIVE_OUT=artifacts/r5-video-simd"
set "R5_RUNTIME_WASM=artifacts/r5-video-simd/gh3-web.wasm"
node tools/r5-runtime/serve-live.mjs 5191
