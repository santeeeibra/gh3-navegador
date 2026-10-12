$ErrorActionPreference='Stop'
Set-Location -LiteralPath 'D:/guitar hero'
$env:D4_URL='http://127.0.0.1:5179/'
foreach ($gpuMode in @('none','null')) {
 foreach ($xmaMode in @('silent-consume','decode')) {
  $testLabel="g1c-reg-node-$gpuMode-$xmaMode"
  node tools/d1-wasm/run-d3.mjs 5 $testLabel $gpuMode silent $xmaMode
  $testLabel="g1c-reg-edge-$gpuMode-$xmaMode"
  node tools/d1-wasm/verify-d4.mjs 5 $testLabel $gpuMode silent $xmaMode
 }
}
node tools/d1-wasm/run-d3.mjs 20 g1c-control-node-nop null nop decode
node tools/d1-wasm/verify-d4.mjs 20 g1c-control-edge-nop null nop decode
node tools/d1-wasm/run-d3.mjs 15 g1c-control-node-consume null silent silent-consume
