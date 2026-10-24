# Remove only the isolated G1b native test copy. Evidence files are retained.
$ErrorActionPreference = 'Stop'
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$nativeRoot = [IO.Path]::GetFullPath((Join-Path $workspaceRoot 'artifacts/d1-wasm/g1d/native-natural'))
$expectedPrefix = $workspaceRoot + [IO.Path]::DirectorySeparatorChar
if (-not $nativeRoot.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected cleanup root' }
foreach ($name in @('game-view','bin','user','cache','DLCs','mods')) {
  $target = [IO.Path]::GetFullPath((Join-Path $nativeRoot $name))
  if (-not $target.StartsWith($nativeRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Cleanup outside native copy' }
  if (Test-Path -LiteralPath $target) {
    $item = Get-Item -LiteralPath $target
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Unexpected link: $target" }
    $links = @(Get-ChildItem -LiteralPath $target -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })
    if ($links.Count) { throw 'Unexpected link inside isolated copy' }
    Remove-Item -LiteralPath $target -Recurse -Force
  }
}
Write-Output 'Copia nativa aislada borrada; registros conservados.'

