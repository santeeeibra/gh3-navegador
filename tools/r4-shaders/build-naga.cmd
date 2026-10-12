@echo off
setlocal
cd /d "%~dp0..\.."
call "D:\Archivos de programa\ProductoVisualStudio2026\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 exit /b 1
set "PATH=%CD%\toolchain\r4-rust\bin;%PATH%"
set "CARGO_HOME=%CD%\toolchain\r4-cargo-home"
cd toolchain\r4-naga\naga-cli-30.0.0
cargo build --release --locked --offline --jobs 2
exit /b %errorlevel%
