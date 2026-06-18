$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

$required = @(
  "POSTGRES_DB",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_PORT",
  "BACKEND_PORT",
  "FRONTEND_PORT",
  "ADMINER_PORT",
  "DATABASE_URL",
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD"
)

if (-not (Test-Path ".env")) {
  Write-Error ".env was not found. Run: Copy-Item .env.example .env"
  exit 1
}

$envContent = Get-Content ".env"
$missing = @()

foreach ($key in $required) {
  if (-not ($envContent | Where-Object { $_ -match "^${key}=" })) {
    $missing += $key
  }
}

if ($missing.Count -gt 0) {
  Write-Error ("Missing env keys: " + ($missing -join ", "))
  exit 1
}

Write-Host "Environment file looks good."
