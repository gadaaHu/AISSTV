# RUNBOOK — AISSTV Camera Attendance System

How to get each part of the system running. Start with
[Part 1](#part-1--backend) because everything else needs it.

| Part | Component | Needs |
|---|---|---|
| [1](#part-1--backend) | Backend API + MQTT ingest | Docker, **or** Python 3.11–3.13 |
| [2](#part-2--ios-app-native-swiftui) | **iOS app (native SwiftUI)** | **macOS** + Xcode 16 |
| [3](#part-3--flutter-app) | Flutter app (Android/iOS) | Flutter SDK |
| [4](#part-4--web-admin-frontend) | Web admin frontend | Node 20+ |
| [5](#part-5--edge-ai-camera) | Edge AI camera node | Python + a camera or RTSP feed |
| [6](#part-6--build-the-ios-app-without-a-mac-ci) | Build the iOS app with no Mac | A GitHub repository |

### What runs on which operating system

| Component | Linux | macOS | Windows |
|---|---|---|---|
| Backend (Part 1) | ✅ | ✅ | ✅ |
| Web admin UI (Part 4) | ✅ | ✅ | ✅ |
| Edge camera node (Part 5) | ✅ | ✅ | ⚠️ webcam access only |
| Flutter app → Android | ✅ | ✅ | ✅ |
| Flutter app → iOS | ❌ | ✅ | ❌ |
| **Native iOS app (Part 2)** | ❌ | ✅ | ❌ |

> ### The iOS app requires macOS. This is not a project limitation.
>
> Xcode exists only on macOS, so an iOS app **cannot be built or launched on
> Linux** — including an Ubuntu VM. There is no iOS SDK, simulator or
> `xcodebuild` for Linux, and running macOS itself inside VirtualBox on a
> non-Apple PC is neither practical nor licensed.
>
> So:
> - To **build and verify** it without a Mac → [Part 6](#part-6--build-the-ios-app-without-a-mac-ci)
>   (GitHub's macOS runners compile it for you).
> - To **run it on a screen** → you need a Mac, or a cloud Mac service
>   (MacinCloud, MacStadium, Scaleway Mac mini).
> - To **use the system on Linux today** → Parts 1 and 4. The backend and the
>   web admin UI both run on Linux and expose the same Dashboard, Cameras,
>   Employees, Leaves and Events screens the iOS app does.

---

## Before you start: the database schema

**The backend does not create its own schema.** There is no `alembic upgrade`
step and no `create_all` anywhere in it, and its single migration is missing four
tables (`holidays`, `leave_requests`, `work_schedules`, `incidents`) plus
thirteen `cameras` columns.

So on a **fresh database** the backend crashes at startup: `scripts/seed` runs
`select(User)` against a table that does not exist, and because the container
command is `python -m scripts.seed && uvicorn ...`, uvicorn never launches.

Run the bootstrap below **once**, before the first start. It creates every table
the models define, which is enough for development. It is a workaround, not a
substitute for a real migration — see [Known gaps](#known-gaps).

### With Docker

```bash
docker compose up -d postgres mosquitto

# Create the schema (uses the backend image, so it has the app and its deps)
docker compose run --rm backend python -c "
import asyncio
from app.db import Base, engine
from app import models          # importing registers every table

async def _init():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

asyncio.run(_init())
"
```

Then continue with Part 1.

### With a local Python environment

```bash
cd backend
python -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Point DATABASE_URL at your Postgres before running this
python -c "
import asyncio
from app.db import Base, engine
from app import models

async def _init():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

asyncio.run(_init())
"
```

> **Python version matters.** The pinned dependencies
> (`asyncpg==0.30.0`, `pydantic==2.9.2`, `greenlet==3.1.1`) have no wheels for
> Python 3.14 and will try to build from source. Use **3.11–3.13**, which is what
> the Dockerfiles target. The `backend/.venv` in this repo is stale — it was
> created at an older path and contains only `pip` — so recreate it.

---

## Part 1 — Backend

### With Docker (recommended)

```bash
cp .env.example .env          # then edit the secrets
docker compose up -d
docker compose ps             # backend should be "healthy"
curl http://localhost:8000/health
# {"status":"ok","env":"dev","db":true}
```

Services: Postgres on `5433`, Mosquitto on `1883`, API on `8000`, web UI on
`3000`.

Two things to know about this compose file:

- The **`edge` service has been removed** from the working copy (the deletion is
  uncommitted), so no camera data is ingested. Run the edge node separately
  (Part 5).
- The credentials in it are development defaults and are committed:
  `admin` / `admin123`, `JWT_SECRET: dev-secret-change-me-in-production`, and
  `POSTGRES_PASSWORD: app`. **Change all of them before exposing this anywhere.**

### Without Docker

```bash
cd backend
source .venv/bin/activate
export DATABASE_URL="postgresql+asyncpg://app:app@localhost:5432/attendance"
export MQTT_HOST=localhost
python -m scripts.seed
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

`--host 0.0.0.0` matters: bound to `127.0.0.1` (the default) a phone or another
machine cannot reach it.

Interactive API docs: <http://localhost:8000/docs> — live and unauthenticated.

---

## Part 2 — iOS app (native SwiftUI)

Source: [`ios/`](ios/). Full detail, including a longer troubleshooting table, is
in [`ios/README.md`](ios/README.md).

### 2a. Run in the Simulator

1. **Open the project**

   ```bash
   open ios/AISSTV.xcodeproj
   ```

2. **Pick a simulator** — the scheme `AISSTV` is shared, so choose any iPhone
   simulator from the destination menu.

3. **Run** — ⌘R.

4. **Sign in** with the seeded account: `admin` / `admin123`.

The default server address is `http://localhost:8000`, which works in the
Simulator because it shares the Mac's network. If the backend is elsewhere, tap
**Server** at the bottom of the sign-in screen and change it there.

From the command line:

```bash
xcodebuild -project ios/AISSTV.xcodeproj -scheme AISSTV \
           -destination 'platform=iOS Simulator,name=iPhone 16' build
```

### 2b. Run on a physical iPhone

A phone cannot reach the Mac's `localhost`, so there are four steps.

**1. Signing.** Select the `AISSTV` target ▸ *Signing & Capabilities*:

- Tick **Automatically manage signing**.
- Choose your **Team** (a free Apple ID works — *Xcode ▸ Settings ▸ Accounts*).
- If Xcode says the bundle identifier is already taken, change
  `com.aisstv.attendance` to something unique, e.g. `com.yourname.aisstv`.

`CODE_SIGN_STYLE` is already `Automatic`; `DEVELOPMENT_TEAM` is deliberately
empty so you choose your own. With free provisioning the app expires after
7 days.

**2. Enable Developer Mode on the phone.** *Settings ▸ Privacy & Security ▸
Developer Mode*, turn it on, then restart the phone. (iOS 16+; the menu appears
after the phone has been connected to Xcode once.)

**3. Find the Mac's address, and bind the backend to the network.**

```bash
ipconfig getifaddr en0            # e.g. 192.168.1.20
```

or *System Settings ▸ Wi-Fi ▸ Details ▸ TCP/IP*. The phone must be on the **same
Wi-Fi network**. Then make sure the backend listens on all interfaces — with
Docker the published ports already do; with uvicorn pass `--host 0.0.0.0`.

**4. Point the app at it.** Launch the app, tap **Server** on the sign-in
screen, and enter the address:

```
192.168.1.20:8000
```

The scheme is optional. Press **Test connection** — it confirms both that the
server answered *and* that its database is reachable — then Save. The change
applies to the next request; no rebuild, no restart.

> The Server screen is deliberately reachable **before** signing in. If it were
> only behind the login, a wrong address would make the app impossible to fix.

### Common iOS failures

| Symptom | Fix |
|---|---|
| `Cannot reach the server at http://…` | Wrong address; backend bound to `127.0.0.1`; phone on another network; macOS firewall. Use **Test connection**. |
| `iOS blocked this cleartext HTTP request (App Transport Security)` | The host is not a private/LAN address, so `NSAllowsLocalNetworking` does not cover it. Use `https://`, or add the host to `NSExceptionDomains` in `ios/Supporting/AISSTV-Info.plist`. |
| `Server answered, but its database is not reachable` | The API is up, Postgres is not. `/health` always returns HTTP 200, so the `db` flag is the real signal. |
| Signed in, then bounced back to sign-in | The stored token was rejected (401) — usually because the app now points at a different backend than the one that issued it. Sign in again. |
| Face ID never prompts | Simulators have no biometry. Enrol it via *Features ▸ Face ID ▸ Enrolled*. Without biometry the app skips the prompt by design. |
| Camera button in face enrolment is disabled | Simulators have no camera; the photo-library picker still works. |
| Leaves / Incidents screens error | Their tables are missing from the database — run the bootstrap at the top of this file. |

---

## Part 3 — Flutter app

Source: `mobile/`.

```bash
cd mobile
flutter pub get

# The generated Freezed / json_serializable files are gitignored, so a fresh
# clone must regenerate them before it will compile.
dart run build_runner build --delete-conflicting-outputs

flutter run
```

Point it at the backend with a compile-time define (Android emulators reach the
host as `10.0.2.2`):

```bash
flutter run --dart-define=API_BASE=http://10.0.2.2:8000
```

---

## Part 4 — Web admin frontend

Source: `frontend/`.

```bash
cd frontend
npm install
npm run dev            # http://localhost:3000, proxies /api to localhost:8000
```

Sign in with the seeded `admin` / `admin123`.

Before building a production image, note that `frontend/.dockerignore` is empty
while the Dockerfile does `COPY . .` after `npm install`, so a host
`node_modules/` is copied over the container's. Fill that file in first.

---

## Part 5 — Edge AI camera

Source: `edge/`. The edge node is the only producer of attendance events, so
without it the dashboard stays empty.

```bash
cd edge
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pip install ultralytics pyyaml                            # see the note below
python enroll.py --id emp-001 --name "Abebe Kebede"       # build the face gallery
python main.py --config config.yaml
```

Notes:

- `edge/requirements.txt` **does not list `ultralytics`, `torch` or `pyyaml`**
  even though `main.py` imports all three, and its pins do not match any working
  environment. Install them explicitly; `ultralytics` pulls `torch`.
- Use `config.yaml` for a local webcam (`camera.url: "0"`). Use
  `config.docker.yaml` only inside the container — it currently lacks keys that
  `main.py` requires (`camera.id`, `camera.zone`, `detector.*`, `face.*`,
  `attendance.shift_start`) and its topic has six levels instead of the five the
  backend subscribes to, so the containerised edge delivers nothing.
- The MQTT topic must match the backend's wildcard
  `attendance/+/+/+/events`. `config.yaml` uses
  `attendance/acme/hq/cam-01/events`, which does match.
- Mosquitto runs with `allow_anonymous true` and is published on the host, so
  anyone on the network can publish forged clock-ins. Lock it down before this
  is used for real attendance.

---

## Known gaps

1. **No schema migration path.** The bootstrap above creates tables directly;
   `alembic upgrade head` alone is not enough, because the single revision
   predates four models and thirteen camera columns.
2. **`docker compose up` on a clean machine fails** until the bootstrap is run.
3. **Anonymous MQTT broker** — no authentication, no TLS, published to the host.
4. **Default credentials** are committed in `docker-compose.yml` and
   `backend/app/config.py`.
5. **Face photos are served unauthenticated** at `/uploads/faces/<name>`, and the
   upload handler does not sanitise the filename (path traversal).
6. **`routers/alerts.py` is never registered**, so `GET /alerts/stream` returns
   404 — there is no live alert feed; clients poll instead.
7. **CI cannot fail.** `.github/workflows/docker-publish.yml` runs
   `python -m compileall app/ || true`, and never builds the frontend before
   publishing its image.
8. **The iOS app has never been compiled.** It was authored on Windows with no
   Swift toolchain; it is checked by `ios/tools/verify_project.py` and two
   independent static reviews. Expect the possibility of a small fix on the
   first build.

See `PROJECT-REVIEW.md` for the full findings list.

---

## Part 6 — Build the iOS app without a Mac (CI)

You do not need to own a Mac to know whether the app compiles: GitHub's macOS
runners will do it. `.github/workflows/ios-build.yml` builds the app for the
Simulator SDK with code signing disabled, so it needs no certificates.

**How to trigger it**

```bash
cd "AISSTV Camera Attendance-System"     # the git repository root

git add ios .github/workflows/ios-build.yml
git commit -m "Add native iOS app and its CI build"
git push
```

Then open your repository on GitHub ▸ **Actions** ▸ **iOS build**.

It runs on every push or pull request that touches `ios/**`, and on demand via
**Run workflow** (`workflow_dispatch`).

**What it checks, in order**

1. `python3 ios/tools/verify_project.py --root ios` — the static checks: Xcode
   project graph, plist and asset validity, duplicate type declarations, every
   `APIClient` call resolving, preview safety.
2. `xcodebuild -list` — proves the project file and the `AISSTV` scheme are
   readable. A malformed `project.pbxproj` fails here with a clear message.
3. `xcodebuild build` for `generic/platform=iOS Simulator` — the real compile.

Every failing run uploads `xcodebuild.log` as an artefact, so the exact compiler
error can be read (or pasted back to me) without digging through the console.

> **This is the first real compiler check this code has ever had.** It was
> written on Windows with no Swift toolchain, so treat the first run as the
> genuine test. If it fails, the error is the useful output — send it over.

**Notes**

- The runner is `macos-15` because the project uses Xcode 16
  file-system-synchronized groups (`objectVersion = 77`), which Xcode 15 cannot
  open.
- CI **cannot install the app on a phone** — no code signing, no device. It
  proves the code compiles; running it still needs a Mac (Part 2b).
- macOS runner minutes are free for public repositories and metered for private
  ones.

---

## Running the backend and web UI on Linux (Ubuntu)

This is the part of the system that works on the machine you have. See Part 1
for the schema bootstrap, which is **required first**.

```bash
# 1. Get the code onto the VM (or clone from GitHub)
cd ~/Desktop

# 2. Install Docker if the VM does not have it
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2
sudo usermod -aG docker "$USER"    # then log out and back in

# 3. Start the database and broker
cd "AISSTV Camera Attendance-System"
cp .env.example .env               # then edit the secrets
docker compose up -d postgres mosquitto

# 4. Create the schema ONCE (see "Before you start" at the top)
docker compose run --rm backend python -c "
import asyncio
from app.db import Base, engine
from app import models

async def _init():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

asyncio.run(_init())
"

# 5. Start the rest
docker compose up -d
curl http://localhost:8000/health   # {"status":"ok","env":"dev","db":true}
```

Then the web admin UI:

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000  (sign in: admin / admin123)
```

**Inside a VirtualBox VM, two things to watch**

- **Ports are only reachable inside the VM** unless you add forwarding. To open
  the web UI from the host, add a NAT port-forward for guest port `3000` (and
  `8000` for the API) in *Settings ▸ Network ▸ Advanced ▸ Port Forwarding*.
  Use *Bridged Adapter* instead if you want the VM on your LAN with its own IP.
- **A phone cannot reach the VM's `localhost`.** If you ever point the iOS app at
  this backend, use the VM's LAN address and make the backend publish on the
  network (the compose ports already bind `0.0.0.0`).
