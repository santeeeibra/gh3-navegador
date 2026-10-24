@echo off
setlocal
rem Benchmark GH3 (Kiro 2026-10-19): 3 corridas × 2 canciones, mediana, comparación contra baseline
rem Uso: bench.cmd <carpeta> [baseline]
rem   carpeta: artifacts/d1-wasm/relojpub/demo (o paquete1)
rem   baseline: artifacts/bench/baseline.json (opcional, si no existe lo crea desde paquete1)

if "%~1"=="" (
  echo Uso: bench.cmd carpeta [baseline]
  exit /b 1
)

set COPY=%~1
set BASELINE=%~2
if "%BASELINE%"=="" set BASELINE=artifacts\bench\baseline.json

node tools\bench\bench.mjs "%COPY%" "%BASELINE%"
