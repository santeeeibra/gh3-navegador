@echo off
setlocal
cd /d "%~dp0..\..\.."
call "D:\Archivos de programa\ProductoVisualStudio2026\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 exit /b 1
set "PATH=D:\guitar hero\artifacts\xex-adapt\paso-b\toolbin;%PATH%"
set "R5_CMAKE=D:\Archivos de programa\ProductoVisualStudio2026\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"
set "R5_NINJA=D:/Archivos de programa/ProductoVisualStudio2026/Common7/IDE/CommonExtensions/Microsoft/CMake/Ninja/ninja.exe"
"%R5_CMAKE%" -S tools/r5-menu/shader-probe -B artifacts/r5-menu/shader-probe/build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_POLICY_VERSION_MINIMUM=3.5 "-DCMAKE_MAKE_PROGRAM=%R5_NINJA%" "-DCMAKE_CXX_COMPILER=D:/guitar hero/toolchain/emsdk/upstream/bin/clang++.exe" "-DCMAKE_C_COMPILER=D:/guitar hero/toolchain/emsdk/upstream/bin/clang.exe"
if errorlevel 1 exit /b 1
"%R5_CMAKE%" --build artifacts/r5-menu/shader-probe/build --target primitive-shader --parallel 3
exit /b %errorlevel%
