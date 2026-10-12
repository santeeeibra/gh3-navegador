param([string]$Only="")
$ErrorActionPreference='Stop'
$root='D:/guitar hero'
$vc='D:/Archivos de programa/ProductoVisualStudio2026/VC/Tools/MSVC/14.51.36231'
$sdk='C:/Program Files (x86)/Windows Kits/10';$ver='10.0.26100.0'
$out="$root/artifacts/graphics-probe/extended"
$env:INCLUDE="$vc/include;$sdk/Include/$ver/um;$sdk/Include/$ver/shared;$sdk/Include/$ver/ucrt;$out"
$env:LIB="$vc/lib/x86;$sdk/Lib/$ver/um/x86"
& "$sdk/bin/$ver/x64/fxc.exe" /nologo /T ps_2_0 /E main /Fh "$out/gradient-bytecode.h" /Vn gradientBytecode /Fo "$out/gradient.ps" "$PSScriptRoot/gradient.hlsl"
if($LASTEXITCODE){throw 'Shader compile failed'}
& "$sdk/bin/$ver/x64/fxc.exe" /nologo /T vs_2_0 /E main /Fh "$out/vertex-bytecode.h" /Vn vertexBytecode /Fo "$out/vertex.vs" "$PSScriptRoot/passthrough.hlsl"
if($LASTEXITCODE){throw 'Vertex shader compile failed'}
$names=@('blue-scene-control','triangle','texture','shader','gdi-control')
for($i=0;$i -lt 5;$i++){
 $name=$names[$i];if($Only -and $name -ne $Only){continue};$dir="$out/$name";New-Item -ItemType Directory -Force $dir | Out-Null
 & "$vc/bin/Hostx64/x86/cl.exe" /nologo /W4 /Os /GS- /Zl /Oi- "/DPROBE_CASE=$i" "/DPROBE_TITLE=`"Independent DX9 $name`"" /c "$PSScriptRoot/probe.cpp" "/Fo$dir/probe.obj"
 if($LASTEXITCODE){throw "Compilation failed: $name"}
 & "$vc/bin/Hostx64/x86/link.exe" /nologo /machine:x86 /subsystem:windows /entry:probeMain /nodefaultlib "$dir/probe.obj" kernel32.lib user32.lib gdi32.lib d3d9.lib "/out:$dir/probe.exe"
 if($LASTEXITCODE){throw "Link failed: $name"}
}

