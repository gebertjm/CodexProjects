$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

$db = Invoke-RestMethod -Uri "http://localhost:3000/api/health/db"
Write-Host ($db | ConvertTo-Json -Compress)
