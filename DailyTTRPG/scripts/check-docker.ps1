$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

Write-Host "Checking Docker CLI..."
docker --version

Write-Host ""
Write-Host "Checking Docker Compose..."
docker compose version

Write-Host ""
Write-Host "Checking Docker daemon..."
docker info --format '{{.ServerVersion}}'
