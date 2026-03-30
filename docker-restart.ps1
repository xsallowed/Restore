# =============================================================================
# Docker Restart Script - Restore Platform
# Run after deploying new files to rebuild and restart containers.
#
# USAGE:
#   .\docker-restart.ps1                      # Restart all services
#   .\docker-restart.ps1 -Service backend     # Restart one service only
#   .\docker-restart.ps1 -Service backend,worker,web
#   .\docker-restart.ps1 -FullRebuild         # Force rebuild all images
#   .\docker-restart.ps1 -WithRedis           # Include Redis (optional profile)
#   .\docker-restart.ps1 -SkipHealthCheck     # Skip waiting for healthy status
#   .\docker-restart.ps1 -Logs               # Tail logs after restart
# =============================================================================

param(
    [string]$RepoRoot       = "",
    [string[]]$Service      = @(),
    [switch]$FullRebuild,
    [switch]$WithRedis,
    [switch]$SkipHealthCheck,
    [switch]$Logs,
    [int]$HealthTimeout     = 120
)

# ── Colour helpers ─────────────────────────────────────────────────────────────
function Write-Header { param($msg) Write-Host "`n== $msg" -ForegroundColor Cyan }
function Write-Ok     { param($msg) Write-Host "  OK   $msg" -ForegroundColor Green }
function Write-Warn   { param($msg) Write-Host "  WARN $msg" -ForegroundColor Yellow }
function Write-Err    { param($msg) Write-Host "  ERR  $msg" -ForegroundColor Red }
function Write-Info   { param($msg) Write-Host "  ...  $msg" -ForegroundColor Gray }
function Write-Step   { param($msg) Write-Host "  >>   $msg" -ForegroundColor White }

# ── Auto-detect repo root ──────────────────────────────────────────────────────
function Find-RepoRoot {
    param([string]$StartPath)
    $current = $StartPath
    for ($i = 0; $i -lt 8; $i++) {
        if (Test-Path (Join-Path $current "docker-compose.yml")) {
            return $current
        }
        $parent = Split-Path $current -Parent
        if ([string]::IsNullOrEmpty($parent) -or $parent -eq $current) { break }
        $current = $parent
    }
    return $null
}

if ($RepoRoot -eq "") {
    $detected = Find-RepoRoot -StartPath $PSScriptRoot
    if ($null -eq $detected) {
        $detected = Find-RepoRoot -StartPath (Get-Location).Path
    }
    if ($null -ne $detected) {
        $RepoRoot = $detected
    } else {
        Write-Err "Could not find docker-compose.yml. Pass -RepoRoot explicitly:"
        Write-Err "  .\docker-restart.ps1 -RepoRoot 'C:\path\to\repo'"
        exit 1
    }
}

$RepoRoot = (Resolve-Path $RepoRoot).Path
Set-Location $RepoRoot

# ── Check Docker is running ────────────────────────────────────────────────────
Write-Host ""
Write-Host "Restore Platform - Docker Restart" -ForegroundColor White
Write-Host "  Repo root : $RepoRoot" -ForegroundColor Gray

try {
    docker info 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw }
}
catch {
    Write-Err "Docker is not running. Please start Docker Desktop and try again."
    exit 1
}

Write-Ok "Docker is running"

# ── Resolve which services to target ──────────────────────────────────────────
# All services defined in docker-compose.yml (excluding redis which needs a profile)
$allServices  = @("postgres", "backend", "worker", "web")
$appServices  = @("backend", "worker", "web")   # services with code that changes

if ($Service.Count -gt 0) {
    $targetServices = $Service
    Write-Host "  Services  : $($targetServices -join ', ')" -ForegroundColor Gray
} elseif ($FullRebuild) {
    $targetServices = $allServices
    Write-Host "  Services  : ALL (full rebuild)" -ForegroundColor Gray
} else {
    # Default: only restart app services (not postgres - preserves data)
    $targetServices = $appServices
    Write-Host "  Services  : $($targetServices -join ', ') (use -FullRebuild to include postgres)" -ForegroundColor Gray
}

if ($WithRedis) {
    $targetServices += "redis"
    Write-Host "  Redis     : included" -ForegroundColor Gray
}

Write-Host "  Rebuild   : $(if ($FullRebuild) { 'Yes - forcing image rebuild' } else { 'No - reusing images' })" -ForegroundColor Gray
Write-Host ""

# ── Helper: wait for a service to become healthy ───────────────────────────────
function Wait-ServiceHealthy {
    param(
        [string]$ServiceName,
        [int]$TimeoutSeconds
    )

    Write-Info "Waiting for $ServiceName to become healthy..."
    $elapsed = 0
    $interval = 3

    while ($elapsed -lt $TimeoutSeconds) {
        $status = docker compose ps $ServiceName --format "{{.Status}}" 2>$null
        $health = docker compose ps $ServiceName --format "{{.Health}}" 2>$null

        # Accept: explicit healthy, or simply Up (for services with no HEALTHCHECK e.g. worker, web)
        $isUp      = $status -match "^Up"
        $isHealthy = ($health -match "healthy") -or ($isUp -and ($health -eq "" -or $health -match "not"))
        $isCrash   = $status -match "Restarting" -or $status -match "Exit" -or $status -match "exited"

        if ($isHealthy) {
            Write-Ok "$ServiceName is up ($elapsed s)  [$status]"
            return $true
        }
        if ($isCrash) {
            Write-Err "$ServiceName is crash-looping or exited. Status: $status"
            Write-Host ""
            Write-Host "  Last 30 log lines for $ServiceName :" -ForegroundColor Yellow
            docker compose logs $ServiceName --tail 30
            Write-Host ""
            Write-Info "Full logs: docker compose logs $ServiceName"
            return $false
        }

        Start-Sleep -Seconds $interval
        $elapsed += $interval
        Write-Info "  Still waiting... ($elapsed / $TimeoutSeconds s)  Status: $status"
    }

    Write-Warn "$ServiceName did not become healthy within ${TimeoutSeconds}s"
    Write-Info "Check logs: docker compose logs $ServiceName"
    return $false
}

# =============================================================================
# STEP 1 - STOP TARGET SERVICES
# =============================================================================
Write-Header "Step 1 - Stopping Services"

# Stop only the target services (leave others running if not targeted)
$stopArgs = @("compose", "stop") + $targetServices
Write-Step "docker compose stop $($targetServices -join ' ')"
docker @stopArgs

if ($LASTEXITCODE -ne 0) {
    Write-Warn "docker compose stop returned non-zero. Continuing anyway..."
} else {
    Write-Ok "Services stopped"
}

# =============================================================================
# STEP 2 - REBUILD IMAGES (if requested or default for app services)
# =============================================================================
Write-Header "Step 2 - Building Images"

# Always rebuild app services since code changed - skip postgres (no custom image)
$buildableServices = $targetServices | Where-Object { $_ -ne "postgres" -and $_ -ne "redis" }

if ($buildableServices.Count -eq 0) {
    Write-Info "No buildable services in target list (postgres and redis use stock images)"
} else {
    $buildArgs = @("compose", "build")
    if ($FullRebuild) {
        $buildArgs += "--no-cache"
        Write-Step "docker compose build --no-cache $($buildableServices -join ' ')"
    } else {
        Write-Step "docker compose build $($buildableServices -join ' ')"
    }
    $buildArgs += $buildableServices

    docker @buildArgs

    if ($LASTEXITCODE -ne 0) {
        Write-Err "docker compose build failed. Check the errors above."
        Write-Info "Common fixes:"
        Write-Info "  - Check for TypeScript errors: cd backend ; npx tsc --noEmit"
        Write-Info "  - Check Dockerfile syntax"
        Write-Info "  - Run with -FullRebuild to clear cache"
        exit 1
    }
    Write-Ok "Images built successfully"
}

# =============================================================================
# STEP 3 - START SERVICES
# =============================================================================
Write-Header "Step 3 - Starting Services"

$upArgs = @("compose", "up", "-d")

# Add profile for redis if requested
if ($WithRedis) {
    $upArgs += "--profile"
    $upArgs += "with-redis"
}

$upArgs += $targetServices
Write-Step "docker compose up -d $($targetServices -join ' ')"
docker @upArgs

if ($LASTEXITCODE -ne 0) {
    Write-Err "docker compose up failed. Check errors above."
    exit 1
}
Write-Ok "Services started"

# =============================================================================
# STEP 4 - HEALTH CHECKS
# =============================================================================
Write-Header "Step 4 - Health Checks"

if ($SkipHealthCheck) {
    Write-Info "Skipped (-SkipHealthCheck). Services may still be starting up."
} else {
    # Brief pause to let containers initialise before we start polling
    Start-Sleep -Seconds 5

    $allHealthy = $true

    foreach ($svc in $targetServices) {
        $healthy = Wait-ServiceHealthy -ServiceName $svc -TimeoutSeconds $HealthTimeout
        if (-not $healthy) { $allHealthy = $false }
    }

    Write-Host ""
    if ($allHealthy) {
        Write-Ok "All services are healthy"
    } else {
        Write-Warn "One or more services may not be healthy. Check logs above."
    }
}

# =============================================================================
# STEP 5 - STATUS SUMMARY
# =============================================================================
Write-Header "Step 5 - Container Status"
Write-Step "docker compose ps"
docker compose ps

# =============================================================================
# STEP 6 - URLS
# =============================================================================
Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Services Ready" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Web app  : http://localhost:5173" -ForegroundColor Green
Write-Host "  API      : http://localhost:3001/api/v1" -ForegroundColor Green
Write-Host "  API docs : http://localhost:3001/api/docs" -ForegroundColor Green
Write-Host "  Postgres : localhost:5432  (db: restore)" -ForegroundColor Gray
if ($WithRedis) {
    Write-Host "  Redis    : localhost:6379" -ForegroundColor Gray
}
Write-Host ""
Write-Host "  Useful commands:" -ForegroundColor White
Write-Host "  docker compose logs -f backend     # backend logs" -ForegroundColor Gray
Write-Host "  docker compose logs -f worker      # worker logs" -ForegroundColor Gray
Write-Host "  docker compose logs -f web         # frontend logs" -ForegroundColor Gray
Write-Host "  docker compose ps                  # container status" -ForegroundColor Gray
Write-Host "  docker compose down                # stop everything" -ForegroundColor Gray
Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# =============================================================================
# OPTIONAL - TAIL LOGS
# =============================================================================
if ($Logs) {
    Write-Header "Tailing Logs (Ctrl+C to stop)"
    $logServices = $targetServices | Where-Object { $_ -ne "postgres" -and $_ -ne "redis" }
    $logArgs = @("compose", "logs", "-f") + $logServices
    Write-Step "docker compose logs -f $($logServices -join ' ')"
    docker @logArgs
}
