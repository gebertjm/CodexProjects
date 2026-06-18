param(
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDirectory "..")
Set-Location $repoRoot

$envFile = ".env.production"
$composeFile = "docker-compose.sms-neon.yml"
$projectName = "dailyrpg-sms-neon"

function Write-Step($message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Read-EnvValue($name, $fallback) {
  if (-not (Test-Path $envFile)) {
    return $fallback
  }

  $line = Get-Content $envFile |
    Where-Object { $_ -match "^\s*$([regex]::Escape($name))\s*=" } |
    Select-Object -First 1

  if (-not $line) {
    return $fallback
  }

  $value = ($line -split "=", 2)[1].Trim()
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $fallback
  }

  return $value
}

function Test-DockerReady {
  try {
    docker info *> $null
    return $true
  } catch {
    return $false
  }
}

function Start-DockerDesktopIfAvailable {
  $dockerDesktopPath = "C:\Program Files\Docker\Docker\Docker Desktop.exe"

  if (Test-Path $dockerDesktopPath) {
    Write-Step "Starting Docker Desktop"
    Start-Process -FilePath $dockerDesktopPath -WindowStyle Hidden
    return $true
  }

  return $false
}

function Wait-ForDocker {
  if (Test-DockerReady) {
    return
  }

  if (-not (Start-DockerDesktopIfAvailable)) {
    throw "Docker is not running, and Docker Desktop was not found at the default install path."
  }

  Write-Step "Waiting for Docker to become ready"
  for ($attempt = 1; $attempt -le 60; $attempt++) {
    if (Test-DockerReady) {
      return
    }

    Start-Sleep -Seconds 2
  }

  throw "Docker did not become ready within two minutes."
}

function Wait-ForUrl($url) {
  Write-Step "Waiting for SMS Simulator at $url"

  for ($attempt = 1; $attempt -le 60; $attempt++) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  }

  throw "The SMS Simulator did not respond at $url within two minutes."
}

function Validate-NeonEnv {
  if (-not (Test-Path $envFile)) {
    throw "$envFile was not found. Create it from .env.production.example and set DATABASE_URL to your Neon connection string."
  }

  $databaseUrl = Read-EnvValue "DATABASE_URL" ""
  if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
    throw "$envFile is missing DATABASE_URL."
  }

  if ($databaseUrl -match "YOUR-NEON-ENDPOINT|USER:PASSWORD") {
    throw "$envFile still contains placeholder DATABASE_URL values."
  }

  if ($databaseUrl -notmatch "neon\.tech") {
    Write-Host ""
    Write-Host "Warning: DATABASE_URL does not look like a Neon host. Continuing because you explicitly launched the Neon simulator." -ForegroundColor Yellow
  }
}

try {
  Write-Host "DailyTTRPG SMS Simulator Launcher - Neon DB" -ForegroundColor Green
  Write-Host ""
  Write-Host "This mode writes simulator accounts, characters, campaigns, and actions to the database in .env.production." -ForegroundColor Yellow

  Validate-NeonEnv
  Wait-ForDocker

  Write-Step "Starting DailyTTRPG SMS Simulator against Neon"
  docker compose `
    --env-file $envFile `
    --project-name $projectName `
    -f $composeFile `
    up --build -d backend frontend | Out-Host

  $frontendPort = Read-EnvValue "FRONTEND_PORT" "8080"
  $url = "http://localhost:$frontendPort/dev/sms-simulator"

  Wait-ForUrl $url

  if (-not $NoBrowser) {
    Write-Step "Opening browser"
    Start-Process $url
  }

  Write-Host ""
  Write-Host "SMS Simulator is ready against Neon: $url" -ForegroundColor Green
  Write-Host "Use Verify Persistence in the simulator to confirm Neon-backed writes." -ForegroundColor Green
  Start-Sleep -Seconds 3
} catch {
  Write-Host ""
  Write-Host "Could not open the Neon-backed SMS Simulator." -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host ""
  Write-Host "This window will close automatically in 20 seconds." -ForegroundColor Yellow
  Start-Sleep -Seconds 20
  exit 1
}
