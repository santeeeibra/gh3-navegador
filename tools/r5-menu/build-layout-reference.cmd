@echo off
setlocal
cd /d "%~dp0..\.."
call "D:\Archivos de programa\ProductoVisualStudio2026\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 exit /b 1
"toolchain\emsdk\upstream\bin\clang++.exe" artifacts/r5-menu/layout-reference/reference.cpp -std=c++20 -O2 --ld-path="D:/guitar hero/artifacts/xex-adapt/paso-b/toolbin/lld-link.exe" -o artifacts/r5-menu/layout-reference/reference.exe
exit /b %errorlevel%
