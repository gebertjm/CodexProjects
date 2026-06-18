$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example"
}

.\scripts\validate-env.ps1 | Out-Host
.\scripts\check-docker.ps1 | Out-Host

docker compose up --build -d
