@echo off
setlocal
cd /d "%~dp0..\.."
call "D:\Archivos de programa\ProductoVisualStudio2026\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 exit /b 1
set "PATH=%CD%\artifacts\xex-adapt\paso-b\toolbin;%PATH%"
"%CD%\toolchain\emsdk\upstream\bin\clang++.exe" -std=c++20 -O2 -Iartifacts/xex-adapt/paso-b/src/rexglue-sdk-090/thirdparty/xxHash tools/r5-pipelines/xpso-inventory.cpp -o artifacts/r5-pipelines/xpso-inventory.exe
exit /b %errorlevel%
