$ErrorActionPreference='Stop'
$vc='D:/Archivos de programa/ProductoVisualStudio2026/VC/Tools/MSVC/14.51.36231';$sdk='C:/Program Files (x86)/Windows Kits/10';$ver='10.0.26100.0'
$out='D:/guitar hero/artifacts/graphics-probe/extended'
$env:INCLUDE="$vc/include;$sdk/Include/$ver/um;$sdk/Include/$ver/shared;$sdk/Include/$ver/ucrt";$env:LIB="$vc/lib/x86;$sdk/Lib/$ver/um/x86"
& "$vc/bin/Hostx64/x86/cl.exe" /nologo /W4 /Os /GS- /Zl /Oi- /c "$PSScriptRoot/capture-dxgi.cpp" "/Fo$out/capture-dxgi.obj"
if($LASTEXITCODE){throw 'Capture compile failed'}
& "$vc/bin/Hostx64/x86/link.exe" /nologo /machine:x86 /subsystem:windows /entry:captureMain /nodefaultlib "$out/capture-dxgi.obj" kernel32.lib user32.lib d3d11.lib dxgi.lib "/out:$out/capture-dxgi.exe"
if($LASTEXITCODE){throw 'Capture link failed'}
