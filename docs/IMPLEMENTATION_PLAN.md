# latihan-web: implementation plan

The browser client of the latihan fitness platform. It sits next to
`latihanAPI` (Go, the server) and `latihan_mobile` (Flutter, the phone app) and gives a signed-in user the same features as the mobile app,
in a browser.

This plan is written as an article series outline, in the same style as
`latihanAPI/docs/blog`: every part answers one question, ends in a working app,
and is proven by a test. Each part should become a git tag (`web-00`,
`web-01`, ...) so a reader can `git diff web-03..web-04`.

---

## 0. What we are building

### Feature parity map

| Mobile feature (latihan_mobile) | Web part | API endpoints |
| --- | --- | --- |
| Cloud account: register, sign in, sign out, stay signed in | 2 | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` |
| Create cloud display name | 3 | `POST /users`, `GET /users/me` |
| Exercise ideas / library | 4 | `GET /exercises`, `GET /exercises/{id}` |
| Coach / Plan: create, edit, delete plans | 5 | `GET/POST /plans`, `GET/PUT/DELETE /plans/{id}` |
| Start session (free or from a plan), add/edit/remove activities, finish | 6 | `POST /sessions` |
| Previous sessions, session details, planned vs logged | 7 | `GET /sessions`, `GET /sessions/{id}`, `GET /plans/{id}/comparison` |
| Dashboard: weekly sessions/sets/cardio totals, recent sessions | 8 | `GET /sessions`, `GET /stats/progress` |
| Profile: name, measurements with history and change from first | 9 | `PUT /users/me`, `/users/me/measurements[/{id}]` |
| Export my data | 10 | `GET /account/export` |
| *(web only)* Erase my account | 10 | `DELETE /account` |

All paths are under `/api/v1`. The API accepts `me` as `{userID}`.

### The decisions the series is built on

These are the "why" sections of Part 0. Each is a real fork in the road;
the article should argue for the choice and name what it costs.

1. **Online client, not offline-first.** The mobile app keeps SQLite as the
   source of truth and runs a 600-line sync engine (`sync_service.dart`)
   because phones lose signal mid-workout. A browser tab is a different
   environment: it is usually online, its storage can be cleared by the
   browser, and a second offline copy would mean porting `sync_links`,
   `pending_deletes` and conflict resolution. The web client therefore treats
   **the API as the source of truth** and requires an account.
   *Exception, same as mobile:* the session in progress lives only on the
   client (the API has no "active session" concept) and is kept in
   `localStorage` until it is finished.
   *Cost:* no standalone/no-account mode on the web. An offline PWA is listed
   as deferred work.

2. **Same origin, no CORS.** The API sends no CORS headers, and it should not
   need to. In development Vite proxies `/api` to `localhost:8080`; in
   production Caddy serves the built SPA and reverse-proxies `/api` on the
   same host. The browser only ever talks to one origin.
   *Watch out:* the current `deploy/Caddyfile` sets
   `Content-Security-Policy "default-src 'none'"` on **every** response, which
   would blank the SPA. Part 11 scopes that header to `/api/*` and gives the
   SPA its own CSP.

3. **Tokens: access token in memory, refresh token in `sessionStorage`.** The
   built-in provider returns both tokens in JSON; there is no httpOnly cookie
   option. Mobile keeps the refresh token in the platform keystore — the
   browser has no equivalent. Choices:
   - memory only: safest, but every reload signs you out;
   - `sessionStorage`: survives reloads, dies with the tab, readable by any
     script on the page → mitigated by a strict CSP (Part 11), no third-party
     scripts, and the server's refresh-token **reuse detection** (presenting a
     used token revokes the whole session);
   - a backend-for-frontend that holds tokens in an httpOnly cookie: the most
     robust, but it is a new server.
   We take the second and document the BFF as the hardening path.

4. **Types come from the contract.** `latihanAPI/api/openapi.yaml` is the
   source of truth; `openapi-typescript` generates `src/api/schema.d.ts` and
   `openapi-fetch` gives a typed client. Mobile hand-writes its models; the
   web client shows the alternative and a CI check that fails when the
   contract and the types drift.

5. **Respect the API's safety features rather than work around them.**
   - every creating `POST` sends an `Idempotency-Key`, generated once per
     form submission and reused on retry;
   - every `PUT`/`DELETE` sends `If-Match` with the `ETag` it read; a `412`
     shows "changed elsewhere, reload" instead of overwriting;
   - `409 plan_in_use` on a plan edit offers "save as a new plan", the same
     behaviour as mobile;
   - `429` honours `Retry-After`;
   - `403 profile_required` sends the user to create a profile.

### Stack

Already in the scaffold: React 19, TypeScript 6, Vite 8, ESLint.
To add (pin exact versions, none younger than 14 days at install time):

| Package | Why |
| --- | --- |
| `react-router` | URL routes for each screen, protected routes |
| `@tanstack/react-query` | server cache, pagination, invalidation after writes |
| `openapi-fetch`, `openapi-typescript` (dev) | typed client generated from the contract |
| `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom` (dev) | unit and component tests |
| `msw` 2.x (dev) | fake API in tests, modelled on the contract (2.x matches Vitest's peer range) |
| `@playwright/test` (dev) | end-to-end against the real API in Docker |

No UI kit: plain CSS with custom properties keeps the article about the
client, not a component library.

### Target layout

```text
src/
├── api/
│   ├── schema.d.ts        # generated, never edited
│   ├── client.ts          # openapi-fetch + auth middleware
│   ├── errors.ts          # ApiError, error-code helpers
│   └── concurrency.ts     # idempotency keys, ETag store
├── auth/
│   ├── tokens.ts          # in-memory access, sessionStorage refresh
│   ├── AuthProvider.tsx
│   └── RequireAuth.tsx
├── features/
│   ├── catalog/  plans/  sessions/  active-session/
│   ├── dashboard/  profile/  measurements/  account/
│   └── <feature>/{api.ts, *.tsx, *.test.tsx}
├── shared/                # ExerciseEditor, SetRow, ConfirmDialog, Pager
├── routes.tsx
└── main.tsx
```

---

## Part 0 — Baseline: run the API, clean the scaffold

**Question:** what does the client talk to, and how does the browser reach it?

1. Start the API: `cd latihanAPI && cp .env.example .env && docker compose up --build`
   (`AUTH_PROVIDER=jwt`, listens on `127.0.0.1:8080`). Check
   `curl http://localhost:8080/ready`.
2. In `latihan-web`: `git init`, delete the Vite demo (`App.css` hero,
   `assets/*`, `public/icons.svg`), replace `App.tsx` with a placeholder.
3. `vite.config.ts`: add
   ```ts
   server: { proxy: { '/api': 'http://localhost:8080' } }
   ```
4. A throwaway `fetch('/api/v1/exercises')` shows `401` with the API's JSON
   error body — proof the proxy works and that every `/api/v1` route needs a token.
5. Write `README.md` (replace the Vite template text) and this plan's Part 0
   decisions.

**Validate:** `npm run dev`, open the page, network tab shows `/api/v1/exercises → 401`
from the same origin with no CORS error.
*Done — see [part-00.md](part-00.md).*
**Tag:** `web-00`.

## Part 1 — A typed client generated from the contract

**Question:** how do we keep the client honest when the API changes?

1. `npm i openapi-fetch` and `npm i -D openapi-typescript`.
2. Script: `"gen:api": "openapi-typescript ../latihanAPI/api/openapi.yaml -o src/api/schema.d.ts"`,
   and `"check:api"` that regenerates into a temp file and diffs it (for CI).
3. `src/api/client.ts`: `createClient<paths>({ baseUrl: '/' })`.
4. `src/api/errors.ts`: `ApiError { status, code, message, requestId }`
   built from the `Error` schema and the `X-Request-ID` header. Helpers:
   `isCode(e, 'plan_in_use')`, `retryAfterSeconds(response)`.
5. Set up Vitest + MSW (jsdom and Testing Library arrive with the first
   component tests in Part 3). First test: an MSW `401` becomes an `ApiError`
   with `code: 'unauthenticated'`.

*Done — see [part-01.md](part-01.md).*

**Validate:** `npm run gen:api && npx tsc -b && npx vitest run`.
**Tag:** `web-01`.

## Part 2 — Signing in and staying signed in

**Question:** how does a browser hold a session without leaking it?

1. `auth/tokens.ts`: `access` in a module variable; `refresh` in
   `sessionStorage` under one key; `clear()` removes both.
2. Auth middleware on the client (`client.use(...)`):
   - adds `Authorization: Bearer <access>`;
   - if there is no access token but a refresh token, refresh first;
   - on `401`, refresh **once** and replay the request;
   - **single-flight refresh**: concurrent callers await one shared promise,
     because the server rotates refresh tokens and treats reuse as theft
     (mirror of `FitnessApi._refreshSession` in mobile);
   - a `401` from `/auth/refresh` ends the session; a network error does not.
3. `AuthProvider`: `signIn(email, password)`, `register(...)`, `signOut()`
   (forget locally first, then `POST /auth/logout`), `status: 'unknown' | 'signedOut' | 'signedIn'`.
4. Sign-in / create-account page. Client-side checks mirror the contract
   (password 12–128 chars, email ≤ 254) but the server stays authoritative;
   show the API's message for `invalid_credentials`, `409` (email exists)
   and `429` (with the wait time).

**Tests:** two parallel requests with an expired token cause exactly one
`/auth/refresh` call; a rejected refresh clears storage and returns to sign-in;
reload keeps the session (refresh token in `sessionStorage`).
*Done — see [part-02.md](part-02.md).*

**Validate:** register in the browser, reload, still signed in; sign out, the old
refresh token now gets `401` (`curl` it).
**Tag:** `web-02`.

## Part 3 — App shell, routes and the profile gate

**Question:** what does a signed-in user without a profile see?

1. Routes (mirrors mobile's five destinations): `/` Home, `/sessions`,
   `/sessions/:id`, `/session/active`, `/ideas`, `/plans`, `/plans/new`,
   `/plans/:id`, `/profile`, `/profile/measurements/new`, `/sign-in`, `/welcome`.
2. `RequireAuth` redirects to `/sign-in`; after sign-in, `GET /users/me`:
   `403 profile_required` → `/welcome` ("Create cloud profile", `POST /users`
   with an `Idempotency-Key`).
3. Layout: top bar + responsive nav (bottom bar under 640px, side bar above).
4. TanStack Query provider; a global error boundary that shows the request ID.

**Tests:** route guard redirects; `profile_required` lands on `/welcome`.
*Done — see [part-03.md](part-03.md).*
**Tag:** `web-03`.

## Part 4 — First vertical slice: the exercise catalog ("Ideas")

**Question:** how do we read a paginated, read-only list?

1. `features/catalog/api.ts`: `useInfiniteQuery` over `GET /exercises?limit=20&cursor=…`
   with the `category` filter; `next_cursor` drives "Load more".
2. Ideas page: list, category chips, detail drawer (`GET /exercises/{id}`:
   description, muscle group, equipment).
3. An `ExercisePicker` component reused by plans and sessions; picking a
   catalog entry fills `name`, `kind` and sets `exercise_id`. Free-text
   exercises stay allowed (`exercise_id: null`).
4. Mobile's video ideas feed (`EXERCISE_IDEAS_URL`) is **not** part of the API;
   note it as deferred.

**Tests:** pagination stops when `next_cursor` is absent; filter changes the query.
*Done — see [part-04.md](part-04.md).*
**Tag:** `web-04`.

## Part 5 — Plans: our first writes

**Question:** how do we write safely when the network can drop a response, or
when another device edits the same record?

1. `shared/ExerciseEditor`: one row per exercise; `kind` = strength → sets of
   `repetitions` (1–1000) and `weight_kg` (0–2000, "0 kg for bodyweight");
   cardio / mobility / stretching → `minutes` (>0, ≤1440) and optional `avg_bpm`
   (1–300). The shape is the contract's `oneOf`, so the TS type is a
   discriminated union on `kind`.
2. `api/concurrency.ts`:
   - `useIdempotencyKey()`: `crypto.randomUUID()` created when the form opens,
     kept across retries, renewed after success;
   - ETag kept next to each fetched record (read the `ETag` response header);
     `PUT`/`DELETE` send `If-Match`.
3. Plans list, create, edit, delete with confirmation.
4. Error handling:
   - `412` → "This plan changed on another device." Reload / keep my copy;
   - `409 plan_in_use` on edit → "Sessions already use this plan's targets."
     Offer **Save as new plan** (POST a copy) — renames alone still succeed;
   - `409` on delete of a plan in use → explain and keep it.
5. Unsaved-changes guard ("Discard this plan?") as on mobile.

**Tests:** retrying a create after a simulated lost response reuses the same
`Idempotency-Key`; `412` shows the conflict UI; `plan_in_use` offers Save as new.
**Validate (real API):** edit the same plan in two tabs; the second save gets 412.
*Done — see [part-05.md](part-05.md).*
**Tag:** `web-05`.

## Part 6 — Recording a session

**Question:** where does a workout live before it is saved?

1. Start: "Start from a plan?" dialog (plans list + "No plan, train freely").
   Choosing a plan snapshots its exercises as **targets**; each logged entry
   keeps `plan_exercise_id` pointing at its target.
2. `features/active-session/store.ts`: the in-progress session is a reducer
   whose state is mirrored to `localStorage` on every change (add/edit/remove
   activity, rename, date). Resume button on Home when one exists. This is the
   only client-owned state, exactly like mobile.
3. Active session page: targets shown as a guide ("Targets are a guide. Log
   your actual results below."), activities edited with the shared
   `ExerciseEditor`.
4. Finish → `POST /sessions` with `plan_id`, `performed_at` (RFC 3339),
   exercises, and an `Idempotency-Key` **stored with the draft**, so a reload
   during a failed finish still cannot create a duplicate. Clear the draft only
   after `201`.
5. Edit a saved session later: `PUT /sessions/{id}` with `If-Match`.

**Tests:** draft survives a remount; finish failure keeps the draft and key;
`plan_exercise_id` never repeats (the server rejects that).
*Done — see [part-06.md](part-06.md).*
**Tag:** `web-06`.

## Part 7 — History and planned-versus-done

**Question:** how do we show what was planned next to what was done?

1. Previous sessions: infinite list of `GET /sessions`, newest first.
2. Session details: exercises with sets, cardio minutes and BPM.
3. If the session has a `plan_id`: `GET /plans/{plan_id}/comparison?session_id=…`
   and render matched / skipped ("Planned but not logged") / unplanned, totals
   and per-set deltas (actual minus planned).
4. Delete session with confirmation.

**Tests:** comparison rendering for matched, skipped and unplanned entries;
null deltas render as "—", never as 0.
*Done — see [part-07.md](part-07.md).*
**Tag:** `web-07`.

## Part 8 — Dashboard and progress

**Question:** what does a user want to see first?

1. "This week" card: sessions, sets logged, cardio minutes — computed from
   `GET /stats/progress?bucket=week&from=<monday>&to=<next monday>`
   (server-side totals rather than recomputing on the client, unlike mobile).
2. Seven-day strip, recent completed sessions, Start / Resume button.
3. Optional chart: 12 weeks of `volume_completion_pct` and
   `minutes_completion_pct` (null = plans asked for none; do not plot as 0).
   Use an inline SVG; no chart library needed.

**Tests:** week boundaries in UTC (the API buckets in UTC); empty state.
*Done — see [part-08.md](part-08.md).*
**Tag:** `web-08`.

## Part 9 — Profile and body measurements

**Question:** how do we edit records whose fields are all optional?

1. Display name: `PUT /users/me` with `If-Match`.
2. Measurements: list (`GET /users/me/measurements`), add, edit, delete.
   Fields: weight kg, height cm, body fat %, waist/chest/hip cm; at least one
   required; `PUT` replaces the whole record (an empty field clears it).
3. "Change since first measurement" per metric, as on mobile.

**Tests:** empty form is rejected client-side; clearing a field sends `null`.
*Done — see [part-09.md](part-09.md).*
**Tag:** `web-09`.

## Part 10 — Your data: export and erase

**Question:** can users take their data with them, and leave?

1. **Export my data**: `GET /account/export` with the bearer token, read as a
   `Blob`, download with the server's `Content-Disposition` file name. Rate
   limit is 4/hour → show the `429` wait time.
2. **Erase my account** (web addition): typed confirmation, `DELETE /account`,
   then clear tokens and the local draft and return to sign-in. Explain what
   the server keeps (backups until expiry, an anonymised audit entry).

**Tests:** download uses the header file name; erase clears all client storage.
**Tag:** `web-10`.

## Part 11 — Hardening and shipping

**Question:** what protects the tokens we chose to keep in the browser?

1. Production build served by Caddy on the **same host** as the API:
   ```caddy
   handle /api/* { reverse_proxy latihan-api:8080 }
   handle /.well-known/* { reverse_proxy latihan-api:8080 }
   handle {
       root * /srv/web
       try_files {path} /index.html
       file_server
   }
   ```
   with the API's strict CSP moved inside `handle /api/*`, and an SPA CSP:
   `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;
   connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`.
2. A `Dockerfile` (node build stage → Caddy stage) and a compose service.
3. Playwright E2E against `docker compose up` of the API: register → create
   profile → create plan → record a session from it → see comparison →
   export → erase.
4. CI (GitHub Actions): `npm ci`, `lint`, `tsc -b`, `check:api`, `vitest run`,
   Playwright, `npm audit --omit=dev`.
5. Threat recap for the article: XSS (CSP, no `dangerouslySetInnerHTML`,
   no third-party scripts), token theft (short access TTL, refresh rotation +
   reuse detection), CSRF (not applicable: bearer tokens, no cookies),
   clickjacking (`frame-ancestors 'none'`).

**Tag:** `web-11`.

---

## Deferred work

- Offline PWA (service worker + IndexedDB + a port of mobile's sync engine).
- Backend-for-frontend with httpOnly cookies.
- External identity providers (Firebase / Cognito / OIDC with PKCE) — the API
  supports them; mobile does not yet either.
- Exercise video ideas feed (needs a server endpoint that does not exist yet).
- Internationalisation.

## Checklist per part (for each article)

- [ ] Question the part answers, and the failure it prevents
- [ ] Code changes by file
- [ ] Commands to run, in order, with the expected result
- [ ] Test that fails when the fix is removed
- [ ] What was actually validated vs. only described
- [ ] Limitations carried to later parts
