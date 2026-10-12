$ErrorActionPreference='Stop'
Set-Location -LiteralPath 'D:/guitar hero'
$env:D4_URL='http://127.0.0.1:5192/'
node tools/d1-wasm/run-g1d.mjs 220 g1d-node-final null silent decode
node tools/d1-wasm/verify-g1d.mjs 220 g1d-edge-final null silent decode
foreach ($gpuMode in @('none','null')) {
 foreach ($xmaMode in @('silent-consume','decode')) {
  node tools/d1-wasm/run-g1d.mjs 5 "g1d-reg-node-$gpuMode-$xmaMode" $gpuMode silent $xmaMode
  node tools/d1-wasm/verify-g1d.mjs 5 "g1d-reg-edge-$gpuMode-$xmaMode" $gpuMode silent $xmaMode
 }
}
node tools/d1-wasm/run-g1d.mjs 20 g1d-control-node-nop null nop decode
node tools/d1-wasm/verify-g1d.mjs 20 g1d-control-edge-nop null nop decode
node tools/d1-wasm/run-g1d.mjs 15 g1d-control-node-consume null silent silent-consume
$profilePath='D:/guitar hero/artifacts/d1-wasm/g1d/cpu-profiles'
New-Item -ItemType Directory -Force -Path $profilePath | Out-Null
$env:G1D_CPU_PROFILE=$profilePath
node tools/d1-wasm/run-g1d.mjs 60 g1d-node-profile null silent decode
Remove-Item Env:/G1D_CPU_PROFILE
python tools/d1-wasm/inventory-g1d.py after
