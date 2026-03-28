@echo off
setlocal
set "ROOT=%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$root = [System.IO.Path]::GetFullPath('%ROOT%');" ^
  "$meta = Join-Path $root '.forgesheet-meta.json';" ^
  "$log = Join-Path $root '.forgesheet-launch.log';" ^
  "function Write-Log([string]$message) { Add-Content -LiteralPath $log -Value ((Get-Date).ToString('s') + ' ' + $message) }" ^
  "if (!(Test-Path $meta)) {" ^
  "  Write-Log 'Stop requested but no metadata file was found.';" ^
  "  exit 0;" ^
  "}" ^
  "try {" ^
  "  $state = Get-Content $meta -Raw | ConvertFrom-Json;" ^
  "  if ($state.pid -and (Get-Process -Id $state.pid -ErrorAction SilentlyContinue)) {" ^
  "    Stop-Process -Id $state.pid -Force;" ^
  "    Write-Log ('Stopped ForgeSheet preview server pid ' + $state.pid);" ^
  "  } else {" ^
  "    Write-Log 'Metadata existed but no running process matched the saved pid.';" ^
  "  }" ^
  "} catch {" ^
  "  Write-Log ('Failed to parse or stop from metadata: ' + $_.Exception.Message);" ^
  "} finally {" ^
  "  Remove-Item -LiteralPath $meta -Force -ErrorAction SilentlyContinue;" ^
  "}"

if errorlevel 1 (
  echo ForgeSheet could not be stopped cleanly. Please check ".forgesheet-launch.log" inside this folder.
  pause
)

endlocal
