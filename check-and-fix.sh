#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

echo "======================================"
echo "🚀 Starting Project Checks & Fixes"
echo "======================================"

# ==========================================
# 1. Backend Checks (Python)
# ==========================================
echo ""
echo "🔍 [1/4] Checking Backend (Python)..."
cd backend

if [ -d ".venv" ]; then
    echo "   Activating virtual environment..."
    source .venv/Scripts/activate 2>/dev/null || source .venv/bin/activate
fi

# Run Ruff for linting and formatting if available
if command -v ruff &> /dev/null; then
    echo "   Running Ruff linter (with --fix)..."
    ruff check . --fix
    echo "   Running Ruff formatter..."
    ruff format .
else
    echo "   ⚠️ Ruff is not installed, skipping linting."
fi

# Run pytest if available
if command -v pytest &> /dev/null; then
    echo "   Running Backend tests..."
    pytest
else
    echo "   ⚠️ Pytest is not installed, skipping backend tests."
fi

cd ..

# ==========================================
# 2. Frontend Checks (TypeScript/React)
# ==========================================
echo ""
echo "🔍 [2/4] Checking Frontend (TypeScript/React)..."
cd frontend

if [ -f "package.json" ]; then
    # Ensure dependencies are installed
    if [ ! -d "node_modules" ]; then
        echo "   Installing frontend dependencies..."
        npm install
    fi
    echo "   Running frontend linting (tsc)..."
    npm run lint
else
    echo "   ⚠️ package.json not found, skipping frontend checks."
fi

cd ..

# ==========================================
# 3. Mobile Checks (Flutter)
# ==========================================
echo ""
echo "🔍 [3/4] Checking Mobile (Flutter)..."
cd mobile

if command -v flutter &> /dev/null; then
    echo "   Running Flutter analyze..."
    flutter analyze
    echo "   Running Flutter tests..."
    flutter test
else
    echo "   ⚠️ Flutter CLI not found, skipping mobile checks."
fi

cd ..

# ==========================================
# 4. Edge Checks (Python)
# ==========================================
echo ""
echo "🔍 [4/4] Checking Edge (Python)..."
cd edge

if command -v pytest &> /dev/null; then
    echo "   Running Edge tests..."
    pytest
else
    echo "   ⚠️ Pytest is not installed globally, skipping edge tests."
fi

cd ..

echo ""
echo "======================================"
echo "✅ All checks completed successfully!"
echo "======================================"
