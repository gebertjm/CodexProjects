$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

docker compose ps adminer db

$adminerPort = (Get-Content ".env" | Where-Object { $_ -match "^ADMINER_PORT=" } | ForEach-Object { $_.Split("=")[1] })
if (-not $adminerPort) {
  $adminerPort = "8081"
}

$response = Invoke-WebRequest -Uri ("http://localhost:" + $adminerPort) -UseBasicParsing
Write-Host "Adminer status:" $response.StatusCode
Write-Host "Adminer URL: http://localhost:$adminerPort"
