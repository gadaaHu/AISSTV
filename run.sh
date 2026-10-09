#!/usr/bin/env bash
#
# Start the AISSTV stack (Postgres + Mosquitto + backend API).
#
#   cd "AISSTV Camera Attendance-System"
#   bash run.sh
#
# Safe to re-run: it only creates the database schema if it is missing.
#
# The web UI is a separate, long-running process — the command is printed at the
# end. The native iOS app cannot be built on Linux (it needs macOS + Xcode).

set -euo pipefail
cd "$(dirname "$0")"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

# ---- prerequisites ---------------------------------------------------------
command -v docker >/dev/null 2>&1 || die "Docker is not installed. Run:
    sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2
    sudo usermod -aG docker \$USER    # then log out and back in"

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  die "Docker Compose is not available. See the install line above."
fi

docker info >/dev/null 2>&1 || die "Cannot talk to the Docker daemon.
Either it is not running, or your user is not in the 'docker' group yet:
    sudo usermod -aG docker \$USER    # then log out and back in"

command -v curl >/dev/null 2>&1 || die "curl is required. sudo apt-get install -y curl"

# ---- environment -----------------------------------------------------------
if [ ! -f .env ]; then
  warn ".env not found — copying .env.example. Edit the secrets before exposing this."
  cp .env.example .env
fi

# ---- database + broker -----------------------------------------------------
log "Starting Postgres and Mosquitto"
"${COMPOSE[@]}" up -d postgres mosquitto

log "Waiting for Postgres to accept connections"
for i in $(seq 1 60); do
  if "${COMPOSE[@]}" exec -T postgres pg_isready -U app -d attendance >/dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 60 ]; then
    die "Postgres did not become ready within 60s. Check: ${COMPOSE[*]} logs postgres"
  fi
  sleep 1
done

# ---- schema ----------------------------------------------------------------
# The backend has NO migration step of its own: on a fresh volume
# `python -m scripts.seed` hits UndefinedTable, and because the container command
# is `scripts.seed && uvicorn ...`, uvicorn never starts. `create_all` builds
# every table the models define, and is idempotent, so this is safe every run.
log "Ensuring the database schema exists"
"${COMPOSE[@]}" run --rm backend python -c "
import asyncio
from app.db import Base, engine
from app import models          # importing registers every table

async def _init():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

asyncio.run(_init())
"

# ---- the rest --------------------------------------------------------------
log "Starting the backend"
"${COMPOSE[@]}" up -d

log "Waiting for the API to answer on :8000"
for i in $(seq 1 60); do
  if curl -fsS http://localhost:8000/health >/dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 60 ]; then
    warn "The API has not answered yet. Inspect it with: ${COMPOSE[*]} logs backend"
  fi
  sleep 1
done

echo
if curl -fsS http://localhost:8000/health 2>/dev/null; then
  echo
  log "Backend is up."
else
  echo
  warn "Backend did not report healthy — see the logs command below."
fi

cat <<'EOF'

  ── Run the web UI (separate terminal) ─────────────────────────────────────
     cd frontend
     npm install          # first time only
     npm run dev          # then open http://localhost:3000

  ── Sign in ───────────────────────────────────────────────────────────────
     admin / admin123

  ── Useful ────────────────────────────────────────────────────────────────
     API docs      http://localhost:8000/docs      (no sign-in needed)
     Logs          docker compose logs -f backend
     Stop          docker compose down             (keeps your data)
     Reset data    docker compose down -v          (DELETES the database)

  The native iOS app in ios/ cannot be built on Linux — it needs macOS and
  Xcode. Its Swift code is compiled by the GitHub Actions workflow instead
  (.github/workflows/ios-build.yml) once you push.

EOF
