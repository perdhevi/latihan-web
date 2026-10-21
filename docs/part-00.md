# Part 0 — Baseline: what the client talks to

**Question:** what does the web client talk to, and how does the browser reach it?

## Scope

- Turn the Vite React template into an empty latihan app.
- Reach the Go API from the browser **without CORS**, through a dev proxy.
- Prove the wiring with one unauthenticated request.

Out of scope: typed requests (Part 1), signing in (Part 2).

## Changes

| File | Change |
| --- | --- |
| `vite.config.ts` | `server.proxy` and `preview.proxy` forward `/api` to `LATIHAN_API_URL` (default `http://localhost:8080`) |
| `src/App.tsx` | Template demo replaced by a probe: `GET /api/v1/exercises`, shows status and body |
| `src/index.css` | Template styles replaced by a small set of colour tokens, light and dark |
| `src/App.css`, `src/assets/*`, `public/icons.svg` | Deleted (template demo) |
| `index.html` | Title `latihan` |
| `.gitattributes` | LF line endings in the repo |
| `README.md` | What the project is, how to run it, build log |

The first commit is the untouched template, so `git diff HEAD~1` (or
`git diff <template>..web-00`) shows exactly what Part 0 changed.

## Design decisions

**Same origin instead of CORS.** `latihanAPI` sends no
`Access-Control-Allow-*` headers. We could add them, but every allowed origin
is something to get wrong, and the API would then have to care about browsers.
Instead the browser only ever calls its own origin (`/api/...`):

```text
browser ──► http://localhost:5173/api/v1/... ──(Vite proxy)──► http://localhost:8080/api/v1/...
```

In production a reverse proxy (Caddy, Part 11) serves the built app and the
API on one host, so the same relative URLs work unchanged.

**The API target is an environment variable**, not a constant in the code, so
the same build works against a local Docker stack or another server.

**Online-only.** The API is the source of truth; see the implementation plan.

## Setup prerequisites

- Node.js 24, npm 11 (validated with Node 24.21.0, npm 11.19.0)
- Docker, and a `latihanAPI` checkout

## Validation (run in order)

1. Start the API, in `latihanAPI`:
   ```sh
   cp .env.example .env
   docker compose up --build -d
   curl http://localhost:8080/ready
   ```
   Expected: `{"status":"ok"}`.
2. In `latihan-web`:
   ```sh
   npm install
   npm run build
   npm run lint
   ```
   Expected: build succeeds, lint prints no problems.
3. `npm run dev`, then in another terminal:
   ```sh
   curl -i http://localhost:5173/api/v1/exercises
   ```
   Expected: `401 Unauthorized`, `content-type: application/json`, an
   `x-request-id` header and
   `{"error":{"code":"unauthenticated","message":"valid bearer token required"}}`.
4. Open http://localhost:5173. Expected: "Status 401" and the same JSON body.
   The browser console shows the 401 and **no CORS error**.

## What was actually validated

All four steps were run on 2026-10-21 (Windows 11, Node 24.21.0) and gave
the expected results. Note for step 1: on that machine port 5432 was
already in use, so the API stack was started with a compose override that
removed Postgres's host port (see Troubleshooting). Nothing else was changed.

## Automated tests

None in this part. The test runner arrives in Part 1.

## Troubleshooting

- **`Bind for 127.0.0.1:5432 failed: port is already allocated`** — another
  Postgres is running. The API reaches its database over the Compose network,
  so the host port is only for your tools. Start with an override file:
  ```yaml
  # no-db-port.yml
  services:
    postgres:
      ports: !reset []
  ```
  ```sh
  docker compose -f docker-compose.yml -f no-db-port.yml up --build -d
  ```
- **`504` or `ECONNREFUSED` from `/api`** — the API is not running or listens
  elsewhere; check `curl http://localhost:8080/ready` or set `LATIHAN_API_URL`.
- **A CORS error in the console** — the page is calling the API's own origin
  (`http://localhost:8080/...`) instead of the relative `/api/...`.

## Limitations and deferred work

- Only `/api` is proxied; `/health`, `/ready` and `/.well-known/jwks.json` are
  not needed by the browser.
- The probe page is temporary; Part 3 replaces it with the app shell.
