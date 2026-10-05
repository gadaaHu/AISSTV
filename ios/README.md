# AISSTV — native iOS app (SwiftUI)

A native SwiftUI client for the AI SSTV Camera Attendance System backend, at
feature parity with the existing Flutter app (`../mobile`). Written in Swift 5
language mode against **iOS 18** and **Xcode 16**, with **no third-party
dependencies** — `URLSession` + async/await for networking, the Keychain for the
token, `LocalAuthentication` for Face ID, and SwiftUI for everything else.

---

## Requirements

| | |
|---|---|
| Mac | macOS 14 Sonoma or later (Xcode 16 requires it) |
| Xcode | 16.0 or later |
| iOS deployment target | 18.0 |
| Backend | The FastAPI service in `../backend`, reachable over the network |

> **Note on provenance:** this project was authored on Windows, where no Swift
> toolchain exists, so it has **never been compiled**. It is written
> conservatively (Swift 5 language mode, minimal strict concurrency, no macros)
> and checked with `tools/verify_project.py`, but the first real build may still
> surface something. See [Verification](#verification) for exactly what was and
> was not checked.

---

## Quick start (Simulator)

```bash
open AISSTV.xcodeproj      # then press ⌘R
```

The default server address is `http://localhost:8000`, which works in the
Simulator when the backend runs on the same Mac. If you need a different address,
change it in the app — tap **Server** at the bottom of the sign-in screen.

A shared `AISSTV` scheme is included, so the command line works too:

```bash
xcodebuild -project AISSTV.xcodeproj -scheme AISSTV \
           -destination 'platform=iOS Simulator,name=iPhone 16' build
```

---

## Running on a physical iPhone

This is the part that trips people up, because a phone cannot reach the Mac's
`localhost`. Four steps.

### 1. Signing

Open the project, select the **AISSTV** target ▸ *Signing & Capabilities*:

- Tick **Automatically manage signing**.
- Choose your **Team** (a free Apple ID works — *Xcode ▸ Settings ▸ Accounts*).
- If Xcode complains that the bundle identifier is unavailable, change
  `com.aisstv.attendance` to something unique, e.g. `com.yourname.aisstv`.

`CODE_SIGN_STYLE` is already `Automatic`; `DEVELOPMENT_TEAM` is intentionally
left empty so you pick your own.

With free provisioning the app expires after 7 days and must be reinstalled, and
on iOS 16+ you must enable **Developer Mode** on the device
(*Settings ▸ Privacy & Security ▸ Developer Mode*, then reboot).

### 2. Find the Mac's address on your network

```bash
ipconfig getifaddr en0        # Wi-Fi; use en1 for some Macs
```

or *System Settings ▸ Wi-Fi ▸ Details ▸ TCP/IP*. You get something like
`192.168.1.20`. The phone must be on the **same Wi-Fi network**.

### 3. Make the backend listen on the network

By default `uvicorn` binds `127.0.0.1`, which is unreachable from the phone. Bind
all interfaces instead:

```bash
cd ../backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

If you run the Docker stack, the published ports already bind `0.0.0.0`. Check
the Mac's firewall allows incoming connections for Python/uvicorn.

### 4. Point the app at it

Launch the app on the phone, then on the **sign-in screen tap “Server”** and enter:

```
192.168.1.20:8000
```

The scheme is optional — plain `host:port` is accepted and `http://` is assumed.
Press **Test connection** to confirm before saving; it reports whether the server
answered *and* whether its database is reachable. Saving takes effect
immediately, no rebuild and no app restart.

> The address can be set before signing in **on purpose**: if it were only
> reachable behind the login screen, a wrong address would make the app
> impossible to fix.

You can still set the built-in default at build time (see
[Configuring the backend URL](#configuring-the-backend-url)) if you would rather
not type it on the phone.

---

## Configuring the backend URL

Resolved per request, highest priority first:

1. **In-app override** — set on the Server screen, kept in `UserDefaults`.
   *(Recommended for device testing.)*
2. **Scheme environment variable** `AISSTV_API_BASE_URL` — *Product ▸ Scheme ▸
   Edit Scheme ▸ Run ▸ Arguments*. Handy for switching without touching settings.
3. **Build setting** `AISSTV_API_BASE_URL` — *Target ▸ Build Settings ▸
   User-Defined*. Injected into `Info.plist` as `AISSTVAPIBaseURL`; set Debug to
   your dev server and Release to your production HTTPS host.
4. **Fallback** — `http://localhost:8000` hardcoded in `Core/Support/ServerSettings.swift`.

No trailing slash, and no `/api` suffix — the FastAPI app serves its routes at the
root. (The web frontend only sees `/api` because nginx rewrites it.)

### Cleartext HTTP and App Transport Security

`Supporting/AISSTV-Info.plist` sets `NSAppTransportSecurity.NSAllowsLocalNetworking`,
which permits plain HTTP to `localhost`, `*.local` and private LAN ranges — enough
for a device talking to `http://192.168.x.x:8000`.

If you need cleartext to a **public** hostname, add an `NSExceptionDomains` entry
for it. Better: serve the backend over HTTPS, which needs no exception at all.
`NSAllowsArbitraryLoads` is deliberately **not** set, so iOS keeps protecting the
rest of the app's traffic.

### Device permissions

Already declared in `Info.plist`, with reasons App Review accepts:

- `NSFaceIDUsageDescription` — unlocking a saved session.
- `NSCameraUsageDescription` — capturing an employee face photo for enrolment.
- `NSPhotoLibraryUsageDescription` — choosing an existing face photo.

---

## Troubleshooting on a device

| Symptom | Cause and fix |
|---|---|
| “Cannot reach the server at http://…” | Wrong address, backend bound to `127.0.0.1`, phone on a different network, or the Mac firewall. Use **Test connection** on the Server screen. |
| “iOS blocked this cleartext HTTP request (App Transport Security)” | The host is not a private/LAN address, so `NSAllowsLocalNetworking` does not cover it. Use `https://`, or add the host to `NSExceptionDomains`. |
| “Server answered, but its database is not reachable” | The API is up but Postgres is not. `/health` always answers HTTP 200, so the `db` flag is the real signal. |
| Signed in, then immediately returned to sign-in | The stored token was rejected (401) — usually because the app now points at a *different* backend than the one that issued it. Sign in again. |
| Nothing loads, and Xcode’s console shows a decode error | The response shape differs from the model. Compare against `GET /docs` on the backend (it is live and unauthenticated). |
| Face ID button never appears | The simulator has no biometry; enrol *Features ▸ Face ID ▸ Enrolled* to test it. Without biometry the app skips the prompt by design. |
| Camera button in face enrolment is disabled | Simulators have no camera; the photo-library picker still works. |

---

## Project layout

```
ios/
├── AISSTV.xcodeproj/          Xcode 16 project (objectVersion 77) + shared scheme
├── Supporting/
│   └── AISSTV-Info.plist      real plist (needed for the ATS dictionary)
├── project.yml                XcodeGen fallback if the .xcodeproj misbehaves
├── tools/
│   ├── verify_project.py      static checks; see Verification
│   └── make_app_icon.py       regenerates the 1024pt app icon
└── AISSTV/
    ├── App/                   entry point and root routing
    ├── Core/
    │   ├── Networking/        APIClient, typed endpoints, error mapping, JSON coding
    │   ├── Auth/              AuthStore, Keychain, LocalAuthentication
    │   ├── Models/            Codable models mirroring the backend schemas
    │   └── Support/           config, server settings, logging, AsyncLoader
    ├── DesignSystem/          Theme (status colours) and shared components
    ├── Features/
    │   ├── Auth/              splash + login
    │   ├── Shell/             role-aware tab bar
    │   ├── Dashboard/         KPIs, recent events, open incidents
    │   ├── Cameras/           list, form, still preview
    │   ├── Employees/         list, detail, face enrolment
    │   ├── Events/            event feed with filters
    │   ├── Leaves/            requests and the approve/reject workflow
    │   ├── Incidents/         fraud / safety / panic
    │   ├── Users/             account administration (admin only)
    │   ├── Profile/           session, change password, diagnostics
    │   └── Settings/          on-device server address + connection test
    └── Resources/
        └── Assets.xcassets    AppIcon + AccentColor
```

The Xcode project uses a **file-system-synchronized group** pointed at `AISSTV/`,
so new `.swift` files and asset catalogs are picked up automatically — you never
have to touch `project.pbxproj` to add a file.

*(The one exception is `Supporting/AISSTV-Info.plist`, which deliberately lives
outside the synchronized folder: a plist inside it would also be treated as a
bundle resource, and being both `INFOPLIST_FILE` and a copied resource is a
recipe for a confusing build error.)*

---

## Architecture

### Networking

`APIClient` is a small `URLSession` wrapper; `APIEndpoints.swift` adds one typed
method per backend route. There is no third-party HTTP library.

```swift
let page = try await APIClient.shared.employees(query: "abe", active: true)
```

Behaviour worth knowing:

- **Auth header injection** happens per request from the Keychain, so a token
  written at login is used immediately by every subsequent call.
- **The base URL is resolved per request**, so changing the server address in the
  app takes effect on the very next call — no restart.
- **401 handling is centralised.** Any 401 clears the stored token and drops the
  app to the sign-in screen, so no screen has to check for expiry itself.
- **Login is form-encoded**, not JSON — FastAPI's `OAuth2PasswordRequestForm`.
  The encoder percent-encodes `+` correctly (a naive `URLComponents` encoder
  turns it into a space and breaks passwords containing `+`).
- **Error mapping** mirrors the Flutter client: 400/401/403/404/409/422 map to
  distinct `APIError` cases, and the FastAPI `{"error":…,"detail":…}` envelope is
  decoded into readable text. App Transport Security failures get their own
  message, because on a device that is the usual reason a dev server is
  unreachable.
- **`X-Request-ID`** is sent on every request and echoed by the backend, so a
  client-side log line can be correlated with the server's.

### Dates

Two separate concerns, deliberately not unified:

- **Timestamp fields** decode with a custom strategy that accepts every shape the
  backend emits: `…Z`, `…+00:00`, with or without fractional seconds, and the
  **naive** datetimes written by the fraud/safety/panic `resolve` endpoints. A
  single `ISO8601` strategy cannot parse all of those, which is a common source
  of "decoding failed" bugs against this backend.
- **Calendar-day fields** (`day`, `start_date`, `end_date`) stay as `String`. A
  calendar day is not an instant, and converting one to `Date` is exactly how
  attendance rows end up on the wrong day. Attendance days are formatted in
  **UTC** (the clock the backend files by); leave days the user picks in a
  `DatePicker` are formatted in the **device** timezone, so the day shown is the
  day sent.

### Auth and session lifecycle

`AuthStore` is a `@MainActor` `ObservableObject` with three states — `unknown`,
`unauthenticated`, `authenticated` — that `RootView` switches on. On launch:

1. No token in the Keychain → sign-in screen.
2. Token present and biometrics possible → Face ID prompt.
   - cancelled or failed → sign-in screen **with a Face ID retry button** (the
     session is *not* discarded, matching the Flutter client).
3. Prompt passed (or unavailable, e.g. simulator) → `GET /auth/me` → dashboard.
4. `GET /auth/me` fails → token cleared → sign-in screen.

The token lives in the Keychain (`kSecAttrAccessibleAfterFirstUnlock`), never in
`UserDefaults`. Signing out is client-side only: the backend issues an 8-hour JWT
with **no revocation endpoint**, which the profile screen states plainly.

### State and refresh

`AsyncLoader<Value>` holds one screen's remote value plus its loading and error
state, and keeps the previous value visible when a background refresh fails
rather than blanking the screen. `LoadedContent` observes it with
`@ObservedObject`, without which a completed request would never invalidate the
view.

The backend has no push channel for list data — its SSE route is defined but
never mounted, so `GET /alerts/stream` returns 404 — therefore screens poll via
the `.polling(every:perform:)` modifier at the same 15-second cadence as the
Flutter client, and all lists also support pull-to-refresh.

---

## Backend contract details this client handles

These are real behaviours of the backend that a naive client gets wrong:

| Behaviour | Handling |
|---|---|
| `POST /auth/login` is `application/x-www-form-urlencoded`, not JSON | dedicated `postForm` encoder |
| Five endpoints return **204 with no body** (change-password, all four `DELETE`s) | decoded into `APIClient.EmptyResponse`, never fed to `JSONDecoder` |
| `GET /cameras`, `GET /events/cameras/list`, `GET /attendance/employee/{code}` return **bare arrays**, everything else returns `{items,total,limit,offset}` | typed as `[T]` vs `Page<T>` respectively |
| Pagination is `limit`/`offset` only — no `page`, no `has_more` | `Page.hasMore` derived from `total` |
| `GET /cameras` and `GET /events/cameras/list` return **two different camera schemas** (19 fields vs 6) | separate `Camera` and `CameraListItem` types |
| `/attendance` silently drops the date filter if only `start` **or** only `end` is sent | the API exposes `attendance(day:)` and `attendanceRange(start:end:)`, either of which always sends a complete filter |
| Probe endpoints return **HTTP 200 even when the stream fails** | callers check `CameraTestResult.ok` |
| `GET /cameras/{id}/snapshot` returns raw JPEG | fetched via `data(_:)`, not the JSON pipeline |
| `/health` returns HTTP 200 even when the database is down | the `db` flag is what is shown, not the status code |
| Users are addressed by **`username`**, not `id` | paths use `AppUser.username` |
| `Camera.id` is client-chosen `[a-zA-Z0-9_-]{2,64}`, not a UUID | no id is typed as `UUID` anywhere |
| `role` is a free string compared **case-sensitively** | UI pickers restrict it to `viewer`/`manager`/`admin` |
| 422 returns a generic `{"detail":"Invalid request"}` with no field info | forms validate client-side instead of relying on the server's message |
| `PATCH` on employees/users uses `exclude_none`, so `null` cannot clear a field | the UI does not pretend otherwise |
| Camera `url` may embed `user:pass@` and is returned to **every** authenticated user | the UI renders `Camera.redactedURL`, never the raw value (the edit form is the one deliberate exception, since the admin must be able to edit it) |

---

## Verification

Because there is no Swift compiler on the authoring machine, this project ships a
static checker:

```bash
python tools/verify_project.py
```

It verifies:

- **`project.pbxproj` integrity** — every referenced 24-hex object id is defined,
  the root object exists, braces and parentheses balance, the synchronized group
  and `INFOPLIST_FILE` point at paths that exist.
- **Plists and asset catalogs** parse, and the Face ID / camera / photo-library /
  ATS keys are present.
- **No duplicate top-level type declarations** across files (a redefinition is a
  hard compile error). Nested types such as the per-model `CodingKeys` are
  correctly ignored.
- **Every `APIClient.shared.<method>()` call exists** — this is the check that
  catches a screen calling an endpoint that was never implemented.
- **Every `Theme.*`, `Format.*`, `EventType.*`, `LeaveType.*`, `DateParsing.*`,
  `DateDisplay.*`, `AppConfig.*`, `IncidentDomain.*` member exists.**
- **Every view the shell navigates to exists** (`DashboardView`, `CamerasView`,
  … `ProfileView`, `ServerSettingsView`).
- **Only first-party Apple modules are imported** (no accidental dependency).
- **Every file with a `#Preview` that reads `AuthStore` also injects one**, so
  previews do not crash at runtime.
- **`AuthStore.preview` is available in every build configuration** — a preview
  helper hidden behind `#if DEBUG` would break a Release build, since `#Preview`
  bodies are compiled in Release too.
- Sources are non-empty with balanced braces.

`tools/make_app_icon.py` regenerates the 1024×1024 app icon with Pillow, so the
icon can be restyled without a design tool.

**What the checker cannot do:** type-check expressions, verify SwiftUI API
availability, or catch a wrong argument type. It is a safety net, not a
substitute for ⌘B.

---

## Known limitations

- **The backend does not create its own schema.** There is no `alembic upgrade`
  and no `create_all` anywhere in it, and its only migration is missing four
  tables (`holidays`, `leave_requests`, `work_schedules`, `incidents`) plus
  thirteen `cameras` columns. Until that is fixed, a fresh deployment fails at
  startup and the Leaves / Incidents screens would return errors. See
  `../PROJECT-REVIEW.md`.
- **No live alert stream.** `routers/alerts.py` exists but is never registered,
  so `GET /alerts/stream` is a 404. The incident screens poll instead.
- **No incident creation.** Incidents only arrive over MQTT; there is no HTTP
  endpoint that creates one, so the app offers no "new incident" action.
- **Offline behaviour is minimal.** There is no cache or offline queue: screens
  show an error state with a retry action when the backend is unreachable.
- **The app has not been compiled.** See the note at the top.
