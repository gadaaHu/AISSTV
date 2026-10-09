# AISSTV — web admin console

The browser-based console for the AI SSTV Camera Attendance System: dashboard,
cameras, employees, leave requests and the event feed. It talks to the FastAPI
backend in `../backend` over `/api`, which is proxied to the API with the prefix
stripped (Vite in development, nginx in production).

---

## Stack

| Concern | Choice |
|---|---|
| UI | React 19.3 |
| Build | Vite 8 (Rolldown/Oxc) |
| Styling | Tailwind CSS 4 — CSS-first config in `src/styles.css`, no `tailwind.config.js` |
| Language | TypeScript 5.9, `strict`, `noUnusedLocals`, `verbatimModuleSyntax`, `erasableSyntaxOnly` |
| Routing | React Router 8 (declarative routes) |
| Server state | TanStack Query 5 |
| Forms | react-hook-form 7 + zod 4 via `@hookform/resolvers` |
| Lint | ESLint 10 flat config + typescript-eslint (type-aware) |
| Tests | Vitest 5 + Testing Library |

### Two deliberate version decisions

- **TypeScript is pinned to `~5.9`, not 7.** `typescript-eslint@8` declares
  `typescript: >=4.8.4 <6.1.0`, so TypeScript 7 would break type-aware linting.
  Revisit when typescript-eslint widens that range.
- **Node 22 LTS or 24 LTS — not 25.** Vite accepts `^20.19 || >=22.12`, but
  `vitest@5` and `jsdom@30` exclude odd-numbered (non-LTS) Node releases. On Node
  25 `npm install` succeeds but emits `EBADENGINE` warnings, and the test runner
  is unsupported. `engines.node` states the supported range; the Dockerfile uses
  `node:24-alpine`.

---

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000
```

The dev server proxies `/api/*` to `http://localhost:8000`, so start the backend
first (see `../RUNBOOK.md`). Sign in with the seeded `admin` / `admin123`.

### Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server on port 3000 with the API proxy and HMR |
| `npm run build` | Type-checks both projects, then builds to `dist/` |
| `npm run preview` | Serves the built bundle on port 4173 |
| `npm run typecheck` | `tsc --noEmit` over the app and the config files |
| `npm run lint` | ESLint over the whole project |
| `npm run test` | Vitest, single run |
| `npm run test:watch` | Vitest in watch mode |
| `npm run verify` | typecheck + lint + tests — what CI should run |

There is **no `.env`** and no build-time configuration: the API is always
same-origin under `/api`. That removes the class of bug where a stale
`VITE_API_URL` points a production build at a developer's machine.

---

## Project layout

```
src/
├── api/
│   ├── client.ts        the only fetch wrapper: token, timeout, abort, 204, errors
│   ├── endpoints.ts     one typed function per backend route
│   ├── errors.ts        ApiError + the server's error envelope
│   └── types.ts         types mirroring the backend schemas
├── auth/
│   ├── context.ts       the context object (separate file so fast refresh works)
│   ├── AuthProvider.tsx the session state machine
│   └── useAuth.ts       the hook
├── components/
│   ├── ui/              the design system: Button, Card, Table, Modal, Toast, …
│   ├── Layout.tsx       sidebar shell, responsive drawer, theme toggle
│   ├── PageHeader.tsx   the title block every page starts with
│   └── ErrorBoundary.tsx stops a render error from blanking the page
├── hooks/
│   ├── queries/         TanStack Query hooks, one file per domain, plus keys.ts
│   ├── useDebounce.ts   useDebouncedValue for search boxes
│   ├── useMediaQuery.ts useSyncExternalStore over matchMedia
│   └── useTheme.ts      light / dark / system
├── lib/
│   ├── constants.ts     tones, status maps, page sizes, role helpers
│   ├── dates.ts         timestamp and calendar-day helpers
│   ├── format.ts        numbers, durations, camera-URL redaction
│   ├── queryClient.ts   the Query client and its retry policy
│   └── utils.ts         cn(), errorMessage(), sleep()
├── pages/               Dashboard, Cameras, Employees, Leaves, Events, Login
├── test/setup.ts        jest-dom matchers
└── styles.css           Tailwind entry, theme tokens, base layer
```

---

## Architecture

### Server state lives in TanStack Query

Screens do not call `fetch` and do not hold server data in `useState`. Each
domain exposes hooks that wrap `useQuery`/`useMutation`:

```ts
export function useCameras(enabledOnly: boolean) {
  return useQuery({
    queryKey: queryKeys.cameras.list(enabledOnly),
    queryFn: ({ signal }) => fetchCameras(enabledOnly, signal),
    refetchInterval: POLL_INTERVAL_MS,
  });
}
```

This replaced a hand-rolled pattern where every page had its own `useEffect`,
`setInterval`, `loading` boolean and `catch` block — which is how the pages
drifted apart, and why one of them showed "no results" before its first response.

Consequences worth knowing:

- **Query keys come from `hooks/queries/keys.ts`** and nowhere else, so an
  invalidation always matches what it means to refresh.
- **Caching, deduplication and background refetch are free.** Two components
  asking for the same data issue one request.
- **The retry policy is deliberate** (`lib/queryClient.ts`): a request the server
  refused — 400/401/403/404/409/422 — is never retried, because retrying an
  expired session or a validation failure just multiplies the failure. Transport
  errors and 5xx are retried twice with a short backoff.
- **`DELETE` is not treated as idempotent.** The backend answers 404 on a repeat,
  so callers check `ApiError.isGone` and treat it as "already gone".

### One HTTP entry point

`api/client.ts` owns the token header, a 15-second timeout, `AbortSignal`
propagation, `204` handling and error normalisation. In particular it maps:

- a `TypeError` from `fetch` → `ApiError.network` ("cannot reach the server"),
- an abort caused by the timeout → `ApiError.timeout`,
- an abort caused by the caller → `ApiError.aborted` (never shown as an error),
- the server's `{"error", "detail"}` envelope → a typed `ApiError.code`.

A `401` clears the token and notifies the auth layer through a single registered
handler, so no screen inspects status codes.

### Dates: instants versus calendar days

Two kinds of value come back from the API and they are kept apart on purpose:

- **Timestamps** (`ts`, `check_in`, `created_at`) are ISO-8601 instants, parsed
  into `Date` and rendered in the viewer's timezone. `parseTimestamp` also
  tolerates the **naive** datetimes the incident `resolve` endpoints write.
- **Calendar days** (`day`, `start_date`, `end_date`) stay `YYYY-MM-DD` strings
  and are never round-tripped through a `Date`. An `<input type="date">` already
  yields exactly that format, and converting it is how a leave request lands on
  the wrong day.

### Forms validate on the client because the server cannot help

A FastAPI `422` from this backend carries **no field-level information** — every
validation failure returns the same `{"error":"validation_error","detail":"Invalid
request"}`. So each form declares a zod schema and reports errors per field;
the server's response is only used for conflicts (409) and business rules.

### Theming

Dark mode is class-based: `index.html` applies the stored preference before first
paint (no flash of the wrong theme), and `useTheme` keeps `<html class="dark">`
in sync afterwards, following the OS setting while the preference is `system`.

### Styling

Tailwind 4 with the theme defined in `src/styles.css`:

- `brand-50…brand-950` for chrome, so status colours stay distinguishable.
- `cn()` (tailwind-merge) is used everywhere instead of string concatenation, so
  a caller's `className` actually overrides a component default.
- Status colours come from `lib/constants.ts`, not from ad-hoc classes, so
  "late" is the same amber in the table, the badge and the chart.

---

## Testing

```bash
npm run test
```

The suite targets logic that is easy to get subtly wrong and hard to notice:

- `lib/dates.test.ts` — naive timestamps treated as UTC, calendar days not
  shifting, month-boundary arithmetic.
- `lib/format.test.ts` — durations, percentages, and camera-URL credential
  redaction.
- `api/errors.test.ts` — status-to-code mapping and error-body parsing.
- `api/client.test.ts` — query-string construction, the bearer header, the
  form encoder (including a `+` in a password), 204 handling, multipart without a
  `Content-Type`, 401 session clearing, timeouts, caller aborts and the plain-text
  proxy-error path.

---

## Production build and deployment

```bash
npm run build      # type-checks, then emits dist/
```

`Dockerfile` is a two-stage build: `node:24-alpine` runs `npm ci && npm run build`,
then the bundle is served by **`nginxinc/nginx-unprivileged`**, which listens on
**8080** and runs without root. `docker-compose.yml` maps host `3000` →
container `8080`.

`nginx.conf` serves the SPA and proxies `/api/` to `backend:8000`. Two details
that were wrong before:

- The API location is `location ^~ /api/`. Without `^~`, nginx evaluates *regex*
  locations first, so a request like `/api/report.js` was served from disk and
  404ed instead of being proxied.
- `index.html` is served with `expires -1` (revalidate) while `/assets/*` is
  cached for a year, because Vite's asset filenames are content-hashed. Without
  that split, a deploy leaves users on the previous bundle.

---

## Known limitations

- **The token is in `sessionStorage`.** That is better than `localStorage` — it
  dies with the tab — but it is still readable by any injected script. Moving to
  an httpOnly cookie requires backend changes (the login response would have to
  set a cookie), so it is deliberately out of scope here; an XSS on this origin
  would expose the session for up to the 8-hour token lifetime.
- **Signing out is client-side only.** The backend issues an 8-hour JWT with no
  revocation endpoint, so `signOut()` discards the token but cannot invalidate it.
- **No offline support.** When the API is unreachable the screens show an error
  state with a retry; nothing is queued or cached for later.
- **No Incidents or Users page.** The native clients have them; this console
  covers Dashboard, Cameras, Employees, Leaves and Events. The API for both
  already exists (`/fraud`, `/safety`, `/panic`, `/users`).
- **Tables are paginated, not virtualised.** Fine at the current page sizes;
  a very large `PAGE_SIZE.events` would want a virtual list.
- **The backend must be running and migrated** before any of this works — see
  `../RUNBOOK.md`, which includes the one-time schema bootstrap.
