Write-Host "Esperando que termine benchmark..."
do {
  Start-Sleep -Seconds 60
  $bench = Get-ChildItem "artifacts\\bench\\*-Rock" -Directory -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($bench -and (Test-Path "$($bench.FullName)\\bench.json")) {
    Write-Host "Benchmark terminado. Generando resumen..."
    & powershell -File tools\\bench\\auto-resumen.ps1
    
    # Subir a GitHub Gist (necesita token en GITHUB_TOKEN)
    $resumen = Get-Content "C:\\Users\\Santi\\Desktop\\resumen_benchmark_gh3.txt" -Raw
    $token = $env:GITHUB_TOKEN
    
    if ($token) {
      Write-Host "Subiendo a GitHub Gist..."
      $body = @{
        description = "Benchmark GH3 - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
        public = $false
        files = @{
          "resumen_benchmark_gh3.txt" = @{
            content = $resumen
          }
        }
      } | ConvertTo-Json -Depth 5
      
      try {
        $headers = @{
          "Authorization" = "token $token"
          "Accept" = "application/vnd.github.v3+json"
        }
        $response = Invoke-RestMethod -Uri "https://api.github.com/gists" -Method POST -Headers $headers -Body $body -ContentType "application/json"
        $url = $response.html_url
        Write-Host ""
        Write-Host "="*80
        Write-Host "GIST CREADO (privado):"
        Write-Host $url
        Write-Host "="*80
        "BENCHMARK GH3 TERMINADO`n`nResultado: $url`n`nExpira: nunca" | Out-File "C:\\Users\\Santi\\Desktop\\LINK_RESUMEN.txt"
      } catch {
        Write-Host "Error creando Gist: $_"
        Write-Host "Resumen guardado solo localmente en Escritorio"
      }
    } else {
      Write-Host "GITHUB_TOKEN no configurado. Guardando solo localmente."
    }
    
    Write-Host "Apagando PC en 30 segundos..."
    Start-Sleep -Seconds 30
    shutdown /s /t 0
    break
  }
} while ($true)
