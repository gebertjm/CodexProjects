param(
  [switch]$WithDemo
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

if (-not (Test-Path ".env")) {
  Write-Error ".env was not found. Run: Copy-Item .env.example .env"
  exit 1
}

$envMap = @{}
Get-Content ".env" | ForEach-Object {
  if ($_ -match "^[A-Z0-9_]+=") {
    $parts = $_.Split("=", 2)
    $envMap[$parts[0]] = $parts[1]
  }
}

$dbUser = $envMap["POSTGRES_USER"]
$dbName = $envMap["POSTGRES_DB"]

if (-not $dbUser -or -not $dbName) {
  Write-Error "POSTGRES_USER or POSTGRES_DB is missing from .env"
  exit 1
}

$seedFiles = Get-ChildItem ".\db\seeds\*.sql" | Sort-Object Name
if (-not $WithDemo) {
  $seedFiles = $seedFiles | Where-Object { $_.BaseName -notmatch "^9" }
}

Write-Host "Loading SRD phase 1 seeds into" $dbName "as" $dbUser
if ($WithDemo) {
  Write-Host "Development demo seeds are enabled."
} else {
  Write-Host "Development demo seeds are disabled."
}

foreach ($file in $seedFiles) {
  Write-Host ""
  Write-Host "Applying $($file.Name)..."
  Get-Content $file.FullName -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U $dbUser -d $dbName
}

Write-Host ""
Write-Host "SRD phase 1 seed load completed."
