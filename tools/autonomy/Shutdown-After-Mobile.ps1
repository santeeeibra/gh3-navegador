param([switch]$CheckOnly,[string]$StatusPath)
$ErrorActionPreference='Stop'
$workspaceRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$requestDir=Join-Path $workspaceRoot 'artifacts/mobile-priority'
$request=Get-Content -LiteralPath (Join-Path $requestDir 'request.json') -Raw | ConvertFrom-Json
if(!$StatusPath){$StatusPath=Join-Path $requestDir 'status.json'}
function Test-Ready {
 if(!(Test-Path -LiteralPath $StatusPath)){return $false}
 try{
  $state=Get-Content -LiteralPath $StatusPath -Raw | ConvertFrom-Json
  if($state.requestId -ne $request.requestId -or $state.status -ne 'completed'){return $false}
  foreach($field in @('touchComplete','mobileComplete','localChecksPassed','processesClosed')){
   if($state.$field -isnot [bool] -or $state.$field -ne $true){return $false}
  }
  if(!$state.checkpointFile){return $false}
  $checkpoint=[IO.Path]::GetFullPath((Join-Path $workspaceRoot $state.checkpointFile))
  if(!$checkpoint.StartsWith($workspaceRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){return $false}
  return Test-Path -LiteralPath $checkpoint -PathType Leaf
 }catch{return $false}
}
if($CheckOnly){if(Test-Ready){Write-Output 'READY';exit 0}else{Write-Output 'WAITING';exit 2}}
$cancel=Join-Path $requestDir 'CANCEL'
@{pid=$PID;requestId=$request.requestId;state='waiting';started=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $requestDir 'watcher.json')
while(!(Test-Path -LiteralPath $cancel)){
 if(Test-Ready){
  @{requestId=$request.requestId;state='shutdown-in-30-seconds';at=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $requestDir 'shutdown-receipt.json')
  Start-Sleep -Seconds 30
  if(!(Test-Path -LiteralPath $cancel) -and (Test-Ready)){
   & shutdown.exe /s /t 0
   if($LASTEXITCODE -ne 0){throw "Shutdown returned $LASTEXITCODE"}
   exit 0
  }
 }
 Start-Sleep -Seconds 15
}
@{pid=$PID;requestId=$request.requestId;state='cancelled';at=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $requestDir 'watcher.json')
