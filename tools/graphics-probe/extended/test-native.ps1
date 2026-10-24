$ErrorActionPreference='Stop'
$root='D:/guitar hero';$out="$root/artifacts/graphics-probe/extended"
$oldCapture=$env:DX9_CAPTURE
try{
 $env:DX9_CAPTURE='1'
 foreach($case in @('triangle','texture','shader')){
  & 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe' -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot/capture-native.ps1" -Exe "$out/$case/probe.exe" -Out "$out/$case/native"
  if($LASTEXITCODE){throw "Native capture failed: $case"}
 }
 Add-Type -AssemblyName System.Drawing
 foreach($case in @('triangle','texture','shader')){
  $p="$out/$case/native/render-target.bmp";$bmp=[System.Drawing.Image]::FromFile($p)
  try{$bmp.Save($p.Replace('.bmp','.png'),[System.Drawing.Imaging.ImageFormat]::Png)}finally{$bmp.Dispose()}
 }
}finally{if($null -eq $oldCapture){Remove-Item Env:DX9_CAPTURE -ErrorAction SilentlyContinue}else{$env:DX9_CAPTURE=$oldCapture}}
