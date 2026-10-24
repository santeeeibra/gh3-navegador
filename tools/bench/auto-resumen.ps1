# Auto-resumen benchmark (Kiro 2026-10-19)
$bench = Get-ChildItem "artifacts\bench\*-Rock" -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (!$bench -or !(Test-Path "$($bench.FullName)\bench.json")) {
  "Benchmark aún no terminó. Reintentá en unos minutos." | Out-File "C:\Users\Santi\Desktop\resumen_benchmark_gh3.txt"
  exit
}
$data = Get-Content "$($bench.FullName)\bench.json" | ConvertFrom-Json
$out = @()
$out += "="*80
$out += "RESUMEN BENCHMARK GH3 - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
$out += "="*80
$out += ""
$out += "Carpeta: $($data.copy)"
$out += "Timestamp: $($data.timestamp)"
$out += ""
foreach ($esc in $data.escenarios) {
  $out += ""
  $out += "--- $($esc.escenario.ToUpper()) ---"
  $m = $esc.mediana
  $out += "  Imágenes nuevas/s: $([math]::Round($m.imgS, 1))"
  $out += "  % cuadros >50ms: $([math]::Round($m.pctLentos, 1))%"
  $out += "  Paradas reloj >2s: $($m.paradasReloj)"
  $out += "  Cortes audio: $($m.cortesAudio)"
  $out += ""
  $out += "  3 corridas:"
  for ($i=0; $i -lt $esc.runs.Count; $i++) {
    $r = $esc.runs[$i]
    $out += "    Run $($i+1): img/s=$([math]::Round($r.imgS,1)) lentos=$([math]::Round($r.pctLentos,1))% dur=$([math]::Round($r.durMs/1000))s"
  }
}
$out += ""
$out += "="*80
$out += "ANÁLISIS frames.json (primera corrida slowride)"
$out += "="*80
$run1 = $data.escenarios[0].runs[0].out
if (Test-Path "$run1\frames.json") {
  $frames = Get-Content "$run1\frames.json" | ConvertFrom-Json
  $song = $frames.frames | Where-Object {$_.stage -eq 'song'}
  $out += ""
  $out += "Total frames canción: $($song.Count)"
  $out += "Frames nuevos: $(($song | Where-Object newFrame).Count)"
  $out += "Frames >50ms: $(($song | Where-Object {$_.prepareMs -gt 50}).Count)"
  $avg = ($song | Measure-Object -Property prepareMs -Average).Average
  $out += "Promedio prepareMs: $([math]::Round($avg, 1))ms"
  $max = ($song | Measure-Object -Property prepareMs -Maximum).Maximum
  $out += "Máximo prepareMs: $([math]::Round($max, 1))ms"
} else {
  $out += "frames.json no encontrado en $run1"
}
$out += ""
$out += "="*80
$out += "CONCLUSIÓN"
$out += "="*80
$out += ""
if ($data.escenarios[0].mediana.pctLentos -gt 10) {
  $out += "BOTTLENECK DETECTADO: >10% frames lentos"
  $out += "Revisar frames.json para identificar causa (CPU/GPU/memoria)"
} else {
  $out += "Rendimiento aceptable: <10% frames lentos"
}
$out += ""
$out += "Baseline guardado en: artifacts/bench/baseline.json"
$out += "Datos completos en: $($bench.FullName)"
$out += ""
$out | Out-File "C:\Users\Santi\Desktop\resumen_benchmark_gh3.txt" -Encoding UTF8
Write-Host "Resumen guardado en Escritorio"
