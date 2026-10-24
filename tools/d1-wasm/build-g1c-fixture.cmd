@echo off
call "D:/Archivos de programa/ProductoVisualStudio2026/VC/Auxiliary/Build/vcvars64.bat" >nul
cd /d "%~dp0/../.."
cl /nologo /O2 /MD /I artifacts/xex-adapt/paso-b/src/rexglue-sdk-090/thirdparty/FFmpeg artifacts/d1-wasm/rtsrc/src/audio/g1c_fixture.c /Foartifacts/d1-wasm/g1c/fixture-native.obj /Feartifacts/d1-wasm/g1c/fixture-native.exe /link artifacts/xex-adapt/paso-b/src/rexglue-sdk-090/out/win-amd64/libavcodec.lib artifacts/xex-adapt/paso-b/src/rexglue-sdk-090/out/win-amd64/libavutil.lib bcrypt.lib
