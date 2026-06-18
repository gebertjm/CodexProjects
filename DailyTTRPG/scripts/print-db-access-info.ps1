$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

$envMap = @{}
Get-Content ".env" | ForEach-Object {
  if ($_ -match "^[A-Z0-9_]+=") {
    $parts = $_.Split("=", 2)
    $envMap[$parts[0]] = $parts[1]
  }
}

$adminerPort = if ($envMap.ContainsKey("ADMINER_PORT")) { $envMap["ADMINER_PORT"] } else { "8081" }

Write-Host "Open: http://localhost:$adminerPort"
Write-Host "System: PostgreSQL"
Write-Host "Server: db"
Write-Host "Username:" $envMap["POSTGRES_USER"]
Write-Host "Database:" $envMap["POSTGRES_DB"]
Write-Host "Password: use POSTGRES_PASSWORD from .env"
