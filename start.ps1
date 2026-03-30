# Restore Platform - Startup Script
# Fully self-healing: handles Docker not running, missing .env, bad configs,
# container failures, database not ready, schema patches, and user seeding.
# Place in your project root and run: .\start.ps1

Set-StrictMode -Off
$ErrorActionPreference = "Continue"
$global:stepsFailed = @()

# - Output helpers -
function Write-Header { param($msg) Write-Host ""; Write-Host $msg -ForegroundColor Cyan }
function Write-Ok     { param($msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn   { param($msg) Write-Host "  [!!] $msg" -ForegroundColor Yellow }
function Write-Fail   { param($msg) Write-Host "  [XX] $msg" -ForegroundColor Red }
function Write-Step   { param($msg) Write-Host "  [>>] $msg" -ForegroundColor White }
function Write-Info   { param($msg) Write-Host "       $msg" -ForegroundColor DarkGray }

Clear-Host
Write-Host ""
Write-Host "  RESTORE PLATFORM" -ForegroundColor Cyan
Write-Host "  Operational Resilience and Recovery Orchestration" -ForegroundColor Gray
Write-Host "  RESTORE-SDD-001 v1.1 Lean MVP" -ForegroundColor DarkGray
Write-Host ""

# - STEP 1: Ensure Docker is running -
Write-Header "[ 1 / 7 ]  Docker Desktop"

function Test-DockerRunning {
    try {
        $out = docker info 2>&1
        return ($LASTEXITCODE -eq 0)
    } catch { return $false }
}

function Start-DockerDesktop {
    # Search common install locations
    $paths = @(
        "C:\Program Files\Docker\Docker\Docker Desktop.exe",
        "$env:LOCALAPPDATA\Docker\Docker Desktop.exe",
        "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    )
    foreach ($p in $paths) {
        if (Test-Path $p) {
            Write-Step "Found Docker Desktop at: $p"
            Start-Process $p
            return $true
        }
    }
    # Try finding via registry
    try {
        $reg = Get-ItemProperty "HKLM:\SOFTWARE\Docker Inc.\Docker Desktop" -ErrorAction SilentlyContinue
        if ($reg -and $reg.AppPath -and (Test-Path $reg.AppPath)) {
            Start-Process $reg.AppPath
            return $true
        }
    } catch {}
    # Try Start Menu shortcut
    $shortcut = "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\Docker Desktop.lnk"
    if (Test-Path $shortcut) {
        Start-Process $shortcut
        return $true
    }
    return $false
}

if (Test-DockerRunning) {
    Write-Ok "Docker Desktop is already running"
} else {
    Write-Warn "Docker Desktop is not running - starting it automatically..."
    $launched = Start-DockerDesktop
    if (-not $launched) {
        Write-Fail "Could not find Docker Desktop. Trying 'docker' command directly..."
        # Sometimes Docker engine runs without Desktop (Docker Engine on Windows)
        Start-Sleep -Seconds 5
    } else {
        Write-Step "Waiting for Docker engine to become ready (up to 120 seconds)..."
    }

    $ready = $false
    for ($i = 1; $i -le 40; $i++) {
        Start-Sleep -Seconds 3
        if (Test-DockerRunning) { $ready = $true; break }
        if ($i % 5 -eq 0) {
            Write-Info "Still waiting for Docker... ($($i * 3)s elapsed)"
        }
    }

    if ($ready) {
        Write-Ok "Docker Desktop is now running"
    } else {
        Write-Fail "Docker did not start within 120 seconds."
        Write-Info "Please open Docker Desktop manually from your Start Menu."
        Write-Info "Once the taskbar icon stops animating, run this script again."
        Write-Host ""
        Read-Host "  Press Enter to exit"
        exit 1
    }
}

# - STEP 2: Load existing .env -
Write-Header "[ 2 / 7 ]  Configuration"

$envFile   = Join-Path $PSScriptRoot ".env"
$envValues = @{}

if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match "^([A-Za-z_][A-Za-z0-9_]*)=(.*)$") {
            $envValues[$matches[1].Trim()] = $matches[2].Trim()
        }
    }
    Write-Ok ".env loaded ($($envValues.Count) values)"
} else {
    Write-Warn ".env not found - will create from your inputs"
}

function Get-EnvValue {
    param([string]$Key, [string]$Default = "")
    if ($envValues.ContainsKey($Key) -and $envValues[$Key] -ne "") {
        return $envValues[$Key]
    }
    return $Default
}

function Ask {
    param(
        [string]$Label,
        [string]$Key,
        [string]$Default = "",
        [bool]$Secret = $false,
        [string]$Hint = ""
    )
    $existing = Get-EnvValue -Key $Key -Default $Default
    if ($Hint -ne "") { Write-Info $Hint }
    if ($Secret -and $existing -ne "" -and $existing -ne $Default) {
        $display = "[already set - Enter to keep]"
    } elseif ($existing -ne "") {
        $display = "[$existing]"
    } else {
        $display = ""
    }
    $answer = Read-Host "  $Label $display"
    if ($answer -eq "") { return $existing }
    return $answer
}

function New-RandomSecret {
    param([int]$Length = 48)
    $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    return -join (1..$Length | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
}

Write-Host "  Press Enter on any prompt to keep the existing or default value." -ForegroundColor Gray
Write-Host ""

# LLM configuration
Write-Host "  --- LLM / AI Provider ---" -ForegroundColor DarkGray
$llmProvider = Ask -Label "LLM provider (openai or anthropic)" -Key "LLM_PROVIDER" -Default "anthropic"
if ($llmProvider -ne "openai" -and $llmProvider -ne "anthropic") {
    Write-Warn "Unrecognised value - defaulting to anthropic"
    $llmProvider = "anthropic"
}
if ($llmProvider -eq "anthropic") {
    $keyHint  = "Get from console.anthropic.com - API Keys (starts with sk-ant-)"
    $defModel = "claude-haiku-4-5-20251001"
} else {
    $keyHint  = "Get from platform.openai.com - API Keys (starts with sk-)"
    $defModel = "gpt-4o-mini"
}

$llmApiKey = Ask -Label "LLM API key" -Key "LLM_API_KEY" -Default "" -Secret $true -Hint $keyHint
$badKey = "sk-your-openai-or-anthropic-key-here"

if ($llmApiKey -eq "" -or $llmApiKey -eq $badKey) {
    Write-Warn "No LLM API key provided."
    Write-Info "The platform will start but SOE generation will not work."
    Write-Info "Add LLM_API_KEY to your .env file and restart to enable AI features."
    $llmApiKey = "REPLACE_WITH_YOUR_API_KEY"
}

$existingModel = Get-EnvValue -Key "LLM_MODEL" -Default $defModel
$llmModel = Ask -Label "LLM model" -Key "LLM_MODEL" -Default $existingModel

Write-Host ""

# Security secrets - auto-generate if missing or using placeholder values
Write-Host "  --- Security (auto-generated if not set) ---" -ForegroundColor DarkGray
$badJwt  = "change_me_to_a_long_random_string_in_production"
$badHmac = "change_me_to_a_different_long_random_string"

$jwtSecret  = Get-EnvValue -Key "JWT_SECRET"
$hmacSecret = Get-EnvValue -Key "HMAC_SECRET"

if ($jwtSecret -eq "" -or $jwtSecret -eq $badJwt) {
    $jwtSecret = New-RandomSecret -Length 48
    Write-Ok "JWT_SECRET auto-generated"
} else { Write-Ok "JWT_SECRET already set" }

if ($hmacSecret -eq "" -or $hmacSecret -eq $badHmac) {
    $hmacSecret = New-RandomSecret -Length 48
    Write-Ok "HMAC_SECRET auto-generated"
} else { Write-Ok "HMAC_SECRET already set" }

Write-Host ""

# Database
Write-Host "  --- Database ---" -ForegroundColor DarkGray
$dbPassword = Ask -Label "PostgreSQL password" -Key "POSTGRES_PASSWORD" -Default "restore_dev_secret" -Secret $true -Hint "Press Enter to use default: restore_dev_secret"

Write-Host ""

# Email (optional, skip cleanly)
Write-Host "  --- Email notifications (optional - Enter to skip) ---" -ForegroundColor DarkGray
$smtpHost = Ask -Label "SMTP host" -Key "SMTP_HOST" -Default ""
$smtpUser = ""; $smtpPass = ""; $smtpFrom = ""
if ($smtpHost -ne "") {
    $smtpUser = Ask -Label "SMTP username" -Key "SMTP_USER" -Default ""
    $smtpPass = Ask -Label "SMTP password" -Key "SMTP_PASS" -Default "" -Secret $true
    $smtpFrom = Ask -Label "From address"  -Key "SMTP_FROM" -Default "restore@yourorg.com"
}

# - STEP 3: Write .env -
Write-Header "[ 3 / 7 ]  Writing configuration..."

$autoKey   = "restore_auto_" + (Get-Random -Maximum 99999)
$dateStamp = Get-Date -Format "yyyy-MM-dd HH:mm"

$envLines = @(
    "# Restore Platform - Environment Variables",
    "# Written by start.ps1 on $dateStamp",
    "",
    "DATABASE_URL=postgresql://restore:$dbPassword@postgres:5432/restore",
    "POSTGRES_PASSWORD=$dbPassword",
    "",
    "JWT_SECRET=$jwtSecret",
    "HMAC_SECRET=$hmacSecret",
    "AUTOMATION_API_KEY=$autoKey",
    "",
    "LLM_PROVIDER=$llmProvider",
    "LLM_API_KEY=$llmApiKey",
    "LLM_MODEL=$llmModel",
    "",
    "STORAGE_PROVIDER=local",
    "STORAGE_BUCKET=restore-evidence",
    "",
    "SMTP_HOST=$smtpHost",
    "SMTP_PORT=587",
    "SMTP_USER=$smtpUser",
    "SMTP_PASS=$smtpPass",
    "SMTP_FROM=$smtpFrom",
    "WEBHOOK_URL=",
    "",
    "CORS_ORIGIN=http://localhost:5173",
    "PORT=3001",
    "NODE_ENV=development",
    "LOG_LEVEL=info",
    "WORKER_POLL_INTERVAL_MS=5000",
    "VITE_API_BASE_URL=http://localhost:3001/api/v1"
)

try {
    $envLines | Set-Content -Path $envFile -Encoding UTF8
    Write-Ok ".env written to $envFile"
} catch {
    Write-Warn "Could not write .env to $envFile - trying current directory..."
    $envFile = ".\.env"
    $envLines | Set-Content -Path $envFile -Encoding UTF8
    Write-Ok ".env written to current directory"
}

# - STEP 4: Choose start mode -
Write-Header "[ 4 / 7 ]  Start mode"
Write-Host ""
Write-Host "  1 - Quick start    use existing images, fastest" -ForegroundColor White
Write-Host "  2 - Full rebuild   rebuild all containers from current code" -ForegroundColor White
Write-Host "  3 - Clean rebuild  wipe all data and rebuild from scratch" -ForegroundColor Yellow
Write-Host ""
$mode = Read-Host "  Choose 1, 2 or 3 [default: 1]"
if ($mode -eq "") { $mode = "1" }

function Invoke-DockerCommand {
    param([string]$Desc, [scriptblock]$Cmd, [bool]$Critical = $false)
    Write-Step $Desc
    try {
        & $Cmd
        if ($LASTEXITCODE -ne 0 -and $Critical) {
            Write-Fail "$Desc failed (exit $LASTEXITCODE)"
            return $false
        }
    } catch {
        Write-Warn "$Desc threw an error: $_"
        if ($Critical) { return $false }
    }
    return $true
}

if ($mode -eq "2") {
    Write-Step "Stopping any running containers..."
    docker compose down 2>&1 | Out-Null
    Write-Step "Rebuilding all images - this takes 2 to 5 minutes..."
    docker compose build --no-cache
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Build failed. Attempting quick start instead..."
        $mode = "1"
    } else {
        Write-Ok "Full rebuild complete"
    }
} elseif ($mode -eq "3") {
    Write-Warn "Clean rebuild will delete all data including events, assets and audit logs."
    $confirm = Read-Host "  Type YES to confirm, anything else to cancel"
    if ($confirm -eq "YES") {
        Write-Step "Stopping containers and wiping volumes..."
        docker compose down -v 2>&1 | Out-Null
        Write-Step "Rebuilding all images..."
        docker compose build --no-cache
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "Build failed. Attempting quick start instead..."
            $mode = "1"
        } else {
            Write-Ok "Clean rebuild complete"
        }
    } else {
        Write-Step "Cancelled - running quick start instead"
        $mode = "1"
    }
}

if ($mode -eq "1") {
    Write-Step "Stopping any existing containers cleanly..."
    docker compose down 2>&1 | Out-Null
}

# - STEP 5: Start containers -
Write-Header "[ 5 / 7 ]  Starting containers..."

docker compose up -d 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Warn "First start attempt failed - retrying after 10 seconds..."
    Start-Sleep -Seconds 10
    docker compose up -d 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Could not start containers."
        Write-Info "Run: docker compose logs   to see what went wrong."
        Write-Info "Common fixes:"
        Write-Info "  - Ports 5173, 3001 or 5432 already in use: stop the conflicting process"
        Write-Info "  - Out of disk space: run docker system prune -f"
        Write-Info "  - Corrupt images: run docker compose build --no-cache"
        Write-Host ""
        Read-Host "  Press Enter to exit"
        exit 1
    }
}
Write-Ok "Containers started"

# - STEP 6: Wait for database -
Write-Header "[ 6 / 7 ]  Waiting for database..."

$dbReady = $false
Write-Step "Polling PostgreSQL readiness (up to 90 seconds)..."
for ($i = 1; $i -le 30; $i++) {
    Start-Sleep -Seconds 3
    $check = docker compose exec postgres pg_isready -U restore 2>&1
    if ($check -match "accepting connections") {
        $dbReady = $true
        Write-Ok "PostgreSQL is ready after $($i * 3) seconds"
        break
    }
    if ($i % 4 -eq 0) { Write-Info "Still waiting... ($($i * 3)s)" }
}

if (-not $dbReady) {
    Write-Warn "PostgreSQL did not respond in 90 seconds - checking container status..."
    $pgStatus = docker compose ps postgres 2>&1
    Write-Info $pgStatus

    # Try restarting just the postgres container
    Write-Step "Restarting postgres container..."
    docker compose restart postgres 2>&1 | Out-Null
    Start-Sleep -Seconds 15

    $check = docker compose exec postgres pg_isready -U restore 2>&1
    if ($check -match "accepting connections") {
        Write-Ok "PostgreSQL ready after restart"
        $dbReady = $true
    } else {
        Write-Warn "PostgreSQL still not responding - will attempt schema setup anyway"
    }
}

# - STEP 7: Patch schema and seed users -
Write-Header "[ 7 / 7 ]  Database setup..."

function Invoke-Psql {
    param([string]$Sql, [string]$Desc = "")
    $result = docker compose exec postgres psql -U restore -d restore -c $Sql 2>&1
    if ($Desc -ne "") {
        if ($LASTEXITCODE -eq 0) { Write-Ok $Desc }
        else { Write-Warn "$Desc may have failed: $result" }
    }
    return $result
}

# Retry schema setup up to 3 times
$schemaOk = $false
for ($attempt = 1; $attempt -le 3; $attempt++) {
    try {
        Invoke-Psql "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;" "password_hash column" | Out-Null
        Invoke-Psql "CREATE EXTENSION IF NOT EXISTS pgcrypto;" "pgcrypto extension" | Out-Null
        Invoke-Psql "ALTER TABLE runbooks ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;" "is_active column" | Out-Null
        $schemaOk = $true
        break
    } catch {
        Write-Warn "Schema attempt $attempt failed - waiting 5 seconds..."
        Start-Sleep -Seconds 5
    }
}

if (-not $schemaOk) {
    Write-Warn "Schema patches may not have applied cleanly - continuing..."
}

# Seed users
Write-Step "Creating user accounts..."
$seedSql = @"
INSERT INTO users (email, display_name, tier, roles, password_hash) VALUES
  ('admin@restore.local',     'Admin User',         'ADMIN',  ARRAY['ADMIN'],     crypt('password', gen_salt('bf'))),
  ('commander@restore.local', 'Incident Commander', 'SILVER', ARRAY['COMMANDER'], crypt('password', gen_salt('bf'))),
  ('analyst@restore.local',   'SOC Analyst',        'BRONZE', ARRAY['RESPONDER'], crypt('password', gen_salt('bf'))),
  ('ciso@restore.local',      'CISO',               'GOLD',   ARRAY['EXECUTIVE'], crypt('password', gen_salt('bf')))
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  tier = EXCLUDED.tier;
"@

$seedResult = docker compose exec postgres psql -U restore -d restore -c $seedSql 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Ok "User accounts ready"
} else {
    Write-Warn "User seeding returned a warning - checking count anyway..."
}

# Verify user count
$countResult = docker compose exec postgres psql -U restore -d restore -t -c "SELECT COUNT(*) FROM users;" 2>&1
$userCount = ($countResult | Where-Object { $_ -match "^\s*\d+" } | Select-Object -First 1)
if ($userCount) {
    Write-Ok "Users in database: $($userCount.Trim())"
} else {
    Write-Warn "Could not confirm user count - the accounts may still be available"
}

# Verify all containers are running
Write-Host ""
Write-Step "Final container health check..."
$psOutput = docker compose ps 2>&1
$allUp = ($psOutput | Where-Object { $_ -match "Up|running|healthy" }).Count
$allDown = ($psOutput | Where-Object { $_ -match "Exit|stopped|error" }).Count
if ($allDown -gt 0) {
    Write-Warn "$allDown container(s) are not running. Attempting restart..."
    docker compose up -d 2>&1 | Out-Null
    Start-Sleep -Seconds 5
}
Write-Ok "Containers running: approximately $allUp active"

# - Done -
Write-Host ""
Write-Host "  ---------------------------------------------------------" -ForegroundColor Cyan
Write-Host "  Restore is running!" -ForegroundColor Green
Write-Host "  ---------------------------------------------------------" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Web app  :  http://localhost:5173" -ForegroundColor White
Write-Host "  API      :  http://localhost:3001/api/v1/health" -ForegroundColor White
Write-Host ""
Write-Host "  Login accounts  (password: password)" -ForegroundColor Gray
Write-Host ""
Write-Host "  admin@restore.local      ADMIN   Full access" -ForegroundColor White
Write-Host "  commander@restore.local  SILVER  Tactical coordination" -ForegroundColor White
Write-Host "  analyst@restore.local    BRONZE  Operational execution" -ForegroundColor White
Write-Host "  ciso@restore.local       GOLD    Executive read-only" -ForegroundColor White
Write-Host ""
Write-Host "  Useful commands:" -ForegroundColor Gray
Write-Host "  docker compose ps                   check container status" -ForegroundColor DarkGray
Write-Host "  docker compose logs backend --tail 20   backend logs" -ForegroundColor DarkGray
Write-Host "  docker compose logs worker  --tail 20   worker logs" -ForegroundColor DarkGray
Write-Host "  docker compose down                  stop everything" -ForegroundColor DarkGray
Write-Host ""

$open = Read-Host "  Open http://localhost:5173 in your browser now? Y or N [default: Y]"
if ($open -ne "N" -and $open -ne "n") {
    Start-Process "http://localhost:5173"
}

Write-Host ""