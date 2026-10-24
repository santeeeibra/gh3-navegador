@echo off
setlocal
cd /d "%~dp0..\.."
call "D:\Archivos de programa\ProductoVisualStudio2026\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 exit /b 1
set "PATH=D:\guitar hero\artifacts\xex-adapt\paso-b\toolbin;%PATH%"
set "R4_CMAKE=D:\Archivos de programa\ProductoVisualStudio2026\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"
set "R4_NINJA=D:/Archivos de programa/ProductoVisualStudio2026/Common7/IDE/CommonExtensions/Microsoft/CMake/Ninja/ninja.exe"
"%R4_CMAKE%" -S tools/r4-shaders -B artifacts/r4-shaders/build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_POLICY_VERSION_MINIMUM=3.5 "-DCMAKE_MAKE_PROGRAM=%R4_NINJA%" "-DCMAKE_CXX_COMPILER=D:/guitar hero/toolchain/emsdk/upstream/bin/clang++.exe" "-DCMAKE_C_COMPILER=D:/guitar hero/toolchain/emsdk/upstream/bin/clang.exe"
if errorlevel 1 exit /b 1
"%R4_CMAKE%" --build artifacts/r4-shaders/build --target xenos-to-spirv --parallel 3
exit /b %errorlevel%



