@echo off
setlocal
set VS=D:\Archivos de programa\ProductoVisualStudio2026
set PATH=C:\Program Files (x86)\Microsoft Visual Studio\Installer;%PATH%
call "%VS%\VC\Auxiliary\Build\vcvars64.bat" >nul
if not defined INCLUDE (echo [ERROR] vcvars64 no configuro el entorno & exit /b 1)
cd /d "%~dp0"
cl /nologo /O2 /LD /EHsc xinput_proxy.cpp /Fe:xinput1_4.dll /link /DEF:xinput1_4.def
