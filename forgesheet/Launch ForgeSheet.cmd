@echo off
setlocal
set "ROOT=%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$root = [System.IO.Path]::GetFullPath('%ROOT%');" ^
  "$meta = Join-Path $root '.forgesheet-meta.json';" ^
  "$log = Join-Path $root '.forgesheet-launch.log';" ^
  "$node = 'C:\Program Files\nodejs\node.exe';" ^
  "$npm = 'C:\Program Files\nodejs\npm.cmd';" ^
  "$serverScript = Join-Path $root 'scripts\serve-dist.mjs';" ^
  "$stdoutLog = Join-Path $root '.forgesheet-server.out.log';" ^
  "$stderrLog = Join-Path $root '.forgesheet-server.err.log';" ^
  "$url = 'http://127.0.0.1:4173';" ^
  "function Write-Log([string]$message) { Add-Content -LiteralPath $log -Value ((Get-Date).ToString('s') + ' ' + $message) }" ^
  "Set-Content -LiteralPath $log -Value ((Get-Date).ToString('s') + ' Launch requested');" ^
  "if (!(Test-Path $node)) { Write-Log 'Node executable not found.'; exit 1 };" ^
  "if (!(Test-Path $npm)) { Write-Log 'npm executable not found.'; exit 1 };" ^
  "if (Test-Path $meta) {" ^
  "  try {" ^
  "    $existing = Get-Content $meta -Raw | ConvertFrom-Json;" ^
  "    if ($existing.pid -and (Get-Process -Id $existing.pid -ErrorAction SilentlyContinue)) {" ^
  "      Write-Log ('Stopping previous preview server pid ' + $existing.pid + ' before restart');" ^
  "      Stop-Process -Id $existing.pid -Force;" ^
  "      Start-Sleep -Milliseconds 500;" ^
  "    }" ^
  "  } catch {" ^
  "    Write-Log ('Existing meta could not be parsed: ' + $_.Exception.Message);" ^
  "  }" ^
  "  Remove-Item -LiteralPath $meta -Force -ErrorAction SilentlyContinue;" ^
  "}" ^
  "$env:Path = 'C:\Program Files\nodejs;' + $env:Path;" ^
  "if (!(Test-Path (Join-Path $root 'node_modules'))) {" ^
  "  Write-Log 'node_modules missing; running npm install';" ^
  "  $install = Start-Process -FilePath $npm -ArgumentList 'install' -WorkingDirectory $root -Wait -PassThru -NoNewWindow;" ^
  "  if ($install.ExitCode -ne 0) { Write-Log ('npm install failed with code ' + $install.ExitCode); exit 1 }" ^
  "}" ^
  "Write-Log 'Running repository and PHB generators';" ^
  "foreach ($args in @(@('run','repo:build'), @('run','phb:build'), @('run','phb:audit'), @('run','build'))) {" ^
  "  $proc = Start-Process -FilePath $npm -ArgumentList $args -WorkingDirectory $root -Wait -PassThru -NoNewWindow;" ^
  "  if ($proc.ExitCode -ne 0) { Write-Log ('Command failed: npm ' + ($args -join ' ') + ' exit ' + $proc.ExitCode); exit 1 }" ^
  "}" ^
  "if (!(Test-Path $serverScript)) { Write-Log 'Static server script not found after build.'; exit 1 };" ^
  "Write-Log 'Starting ForgeSheet static server';" ^
  "Remove-Item -LiteralPath $stdoutLog -Force -ErrorAction SilentlyContinue;" ^
  "Remove-Item -LiteralPath $stderrLog -Force -ErrorAction SilentlyContinue;" ^
  "$process = Start-Process -FilePath $node -ArgumentList @($serverScript) -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog;" ^
  "$ready = $false;" ^
  "for ($i = 0; $i -lt 40; $i++) {" ^
  "  Start-Sleep -Milliseconds 500;" ^
  "  if (!(Get-Process -Id $process.Id -ErrorAction SilentlyContinue)) {" ^
  "    Write-Log 'Static server exited before becoming ready.';" ^
  "    if (Test-Path $stderrLog) { Write-Log ('Server stderr: ' + ((Get-Content $stderrLog -Raw) -replace \"`r?`n\", ' | ')) }" ^
  "    break;" ^
  "  }" ^
  "  try {" ^
  "    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2;" ^
  "    if ($response.StatusCode -ge 200) { $ready = $true; break }" ^
  "  } catch {" ^
  "    Write-Log ('Waiting for preview server: ' + $_.Exception.Message);" ^
  "  }" ^
  "}" ^
  "if (-not $ready) {" ^
  "  Write-Log 'Static server did not become ready in time.';" ^
  "  if (Test-Path $stderrLog) { Write-Log ('Server stderr: ' + ((Get-Content $stderrLog -Raw) -replace \"`r?`n\", ' | ')) }" ^
  "  exit 1;" ^
  "}" ^
  "@{ pid = $process.Id; url = $url; startedAt = (Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $meta;" ^
  "Write-Log ('Server ready at ' + $url + ' with pid ' + $process.Id);" ^
  "Start-Process $url;"

if errorlevel 1 (
  echo ForgeSheet could not start. Please check ".forgesheet-launch.log" inside this folder.
  pause
)

endlocal
