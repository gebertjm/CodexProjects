$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

$frontend = Invoke-WebRequest -Uri "http://localhost:8080" -UseBasicParsing
$health = Invoke-RestMethod -Uri "http://localhost:3000/health"
$db = Invoke-RestMethod -Uri "http://localhost:3000/api/health/db"
$rulesets = Invoke-RestMethod -Uri "http://localhost:3000/api/rulesets"
$races = Invoke-RestMethod -Uri "http://localhost:3000/api/dnd5e/races"
$classes = Invoke-RestMethod -Uri "http://localhost:3000/api/dnd5e/classes"

Write-Host "Frontend status:" $frontend.StatusCode
Write-Host "Health status:" ($health | ConvertTo-Json -Compress)
Write-Host "DB status:" ($db | ConvertTo-Json -Compress)
Write-Host "Rulesets returned:" $rulesets.data.Count
Write-Host "Races returned:" $races.data.Count
Write-Host "Classes returned:" $classes.data.Count
