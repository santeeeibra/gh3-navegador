$ErrorActionPreference='Stop'
$root=Split-Path (Split-Path $PSScriptRoot)
$vc='D:/Archivos de programa/ProductoVisualStudio2026/VC/Tools/MSVC/14.51.36231'
$sdk='C:/Program Files (x86)/Windows Kits/10'
$ver='10.0.26100.0'
$out=Join-Path $root 'artifacts/graphics-probe'
$env:INCLUDE="$vc/include;$sdk/Include/$ver/um;$sdk/Include/$ver/shared;$sdk/Include/$ver/ucrt"
$env:LIB="$vc/lib/x86;$sdk/Lib/$ver/um/x86"
& "$vc/bin/Hostx64/x86/cl.exe" /nologo /W4 /Os /GS- /Zl /Oi- /c "$PSScriptRoot/dx9-probe.cpp" "/Fo$out/dx9-probe.obj"
if($LASTEXITCODE){throw 'Compilation failed'}
& "$vc/bin/Hostx64/x86/link.exe" /nologo /machine:x86 /subsystem:windows /entry:probeMain /nodefaultlib "$out/dx9-probe.obj" kernel32.lib user32.lib d3d9.lib "/out:$out/dx9-probe.exe"
if($LASTEXITCODE){throw 'Link failed'}
