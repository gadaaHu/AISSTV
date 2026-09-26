$ErrorActionPreference = "Stop"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "🚀 Starting Project Checks & Fixes" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

# ==========================================
# 1. Backend Checks (Python)
# ==========================================
Write-Host "`n🔍 [1/4] Checking Backend (Python)..." -ForegroundColor Yellow
Set-Location -Path .\backend

if (Test-Path ".venv") {
    Write-Host "   Activating virtual environment..."
    if (Test-Path ".venv\Scripts\activate.ps1") {
        . .\.venv\Scripts\activate.ps1
    }
}

# Check for Ruff
if (Get-Command ruff -ErrorAction SilentlyContinue) {
    Write-Host "   Running Ruff linter (with --fix)..."
    ruff check . --fix
    Write-Host "   Running Ruff formatter..."
    ruff format .
} else {
    Write-Host "   ⚠️ Ruff is not installed, skipping linting." -ForegroundColor DarkYellow
}

# Check for Pytest
if (Get-Command pytest -ErrorAction SilentlyContinue) {
    Write-Host "   Running Backend tests..."
    pytest
} else {
    Write-Host "   ⚠️ Pytest is not installed, skipping backend tests." -ForegroundColor DarkYellow
}

Set-Location -Path ..

# ==========================================
# 2. Frontend Checks (TypeScript/React)
# ==========================================
Write-Host "`n🔍 [2/4] Checking Frontend (TypeScript/React)..." -ForegroundColor Yellow
Set-Location -Path .\frontend

if (Test-Path "package.json") {
    if (-Not (Test-Path "node_modules")) {
        Write-Host "   Installing frontend dependencies..."
        npm install
    }
    Write-Host "   Running frontend linting (tsc)..."
    npm run lint
} else {
    Write-Host "   ⚠️ package.json not found, skipping frontend checks." -ForegroundColor DarkYellow
}

Set-Location -Path ..

# ==========================================
# 3. Mobile Checks (Flutter)
# ==========================================
Write-Host "`n🔍 [3/4] Checking Mobile (Flutter)..." -ForegroundColor Yellow
Set-Location -Path .\mobile

if (Get-Command flutter -ErrorAction SilentlyContinue) {
    Write-Host "   Running Flutter analyze..."
    flutter analyze
    Write-Host "   Running Flutter tests..."
    flutter test
} else {
    Write-Host "   ⚠️ Flutter CLI not found, skipping mobile checks." -ForegroundColor DarkYellow
}

Set-Location -Path ..

# ==========================================
# 4. Edge Checks (Python)
# ==========================================
Write-Host "`n🔍 [4/4] Checking Edge (Python)..." -ForegroundColor Yellow
Set-Location -Path .\edge

if (Get-Command pytest -ErrorAction SilentlyContinue) {
    Write-Host "   Running Edge tests..."
    pytest
} else {
    Write-Host "   ⚠️ Pytest is not installed globally, skipping edge tests." -ForegroundColor DarkYellow
}

Set-Location -Path ..

Write-Host "`n======================================" -ForegroundColor Green
Write-Host "✅ All checks completed successfully!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
