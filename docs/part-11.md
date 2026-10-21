# Part 11 — Hardening and shipping

**Question:** what protects the tokens we chose to keep in the browser?

## Scope

- A production image: the app built by Node, served by Caddy, which is
  also the edge for the API: one origin, a Content-Security-Policy for the
  app and the API's own policy for the API.
- An end-to-end test in a real browser against that image and the real
  API: sign up to erase.
- CI: the checks every part ran by hand, then the end-to-end test.
- The threat recap that closes Part 0's decision to keep tokens in the
  browser.

## Changes

| File | Change |
| --- | --- |
| `deploy/Caddyfile` | The edge: `/api/*` and `/.well-known/*` to the API with its headers; the app with its CSP and caching |
| `Dockerfile` | `node:24.21.0-alpine` builds, `caddy:2.11.4-alpine` serves; both pinned by digest |
| `.dockerignore` | Keeps `node_modules`, `.git` and local folders out of the build |
| `docker-compose.yml` | The image on the API's network, at `http://localhost:8088`, locked down |
| `playwright.config.ts`, `e2e/journey.e2e.ts` | The end-to-end test |
| `tsconfig.e2e.json`, `tsconfig.json` | Types for the e2e files (Node and DOM) |
| `package.json` | `@playwright/test` 1.63.0 (pinned, released 4 September); `npm run e2e` |
| `eslint.config.js`, `.gitignore` | Ignore Playwright's reports |
| `.github/workflows/ci.yml` | CI |

## The edge

Part 0 chose one origin: the browser talks only to the host it loaded the
app from, so the API needs no CORS. In development Vite proxies `/api`; in
production Caddy does, and also serves the app.

```text
browser ──HTTPS──▶ Caddy (this image)
                    ├─ /api/*, /.well-known/*  ──▶ latihan-api:8080
                    │     CSP default-src 'none'; frame-ancestors 'none'
                    └─ everything else  ──▶ /srv/web (try_files … /index.html)
                          CSP default-src 'self'; script-src 'self'; …
```

**Two policies, each on its own paths.** The API's own edge
(`latihanAPI/deploy/Caddyfile`) sends `default-src 'none'` on *every*
response. Served through it, the app could load nothing, not even its own
script. Here the API's policy is scoped to `/api/*` and
`/.well-known/*`, and the app gets:

```text
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;
connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none';
form-action 'self'
```

No `'unsafe-inline'`, no `'unsafe-eval'`. The build has no inline script
or style. React sets the chart tooltip's position through the DOM
(`element.style`), which a CSP does not block, unlike a `style="…"`
attribute in HTML.

**Shared headers.** Strict-Transport-Security, `nosniff`, no referrer,
`X-Frame-Options: DENY`, and no `Server` header, on both. Request bodies
are capped at 2 MB before they reach the API, as the API's edge did.

**Caching.** Files under `/assets/` carry a content hash in their name and
are cached for a year (`immutable`); everything else, `index.html` above
all, is `no-cache`, so a release is picked up on the next visit.

**Deep links.** `try_files {path} /index.html`: `/plans/123` is the app's
route, not a file. Unknown `/api/…` paths still reach the API and get its
JSON 404.

**The image.** Two stages, both pinned by digest as in the API: Node
24.21.0 (the version used to build every part here) runs `npm ci
--ignore-scripts` and `npm run build`; Caddy 2.11.4 (the API's own pin)
serves `dist`. `src/api/schema.d.ts` is committed, so the build does not
need the API's repository.

## Production: what changes in latihanAPI

This repository does not change `latihanAPI`. To serve the app in
production, its `docker-compose.prod.yml` would run this image in place of
its `caddy` service, keeping what that service has:

- `SITE_ADDRESS` set to the domain (Caddy then obtains the certificate);
- ports 80 and 443, and the volumes for `/data` and `/config`;
- the fixed address `172.30.0.10` on the network, which the API trusts for
  `X-Forwarded-For` (`TRUSTED_PROXIES`);
- `read_only`, the dropped capabilities, the memory and process limits.

The API's `deploy/Caddyfile` then has nothing left to do. Its global
`email` for the certificate authority can be added to this Caddyfile.
This is a deployment change to the other repository, left as a decision
for its owner.

## End-to-end

`e2e/journey.e2e.ts`, one test, one new account per run:

sign up from a deep link → create the profile (back on `/plans`) → a plan
with a catalog exercise → start a session from it, log the target with one
more rep, reload (the draft survives) → finish → planned versus done shows
Reps 5 / 6 / +1 → Home counts the session and draws the chart → export
(Playwright's download: `latihan-export.json`, one plan, one session) →
erase → the notice, both storages empty → signing in again is refused.

It runs against the production image by default (`E2E_BASE_URL` to point
elsewhere), so it covers Caddy, the routes and the CSP as well as the app.
Any console error, page error or `securitypolicyviolation` fails it. The
browser's own "Failed to load resource" lines for the API's expected 4xx
answers are not counted.

Locally it drives the installed Chrome (`channel: 'chrome'`), so no
browser is downloaded; CI installs Playwright's Chromium.

## CI

`.github/workflows/ci.yml`, on every push and pull request:

- **check**: `npm ci --ignore-scripts`, `lint`, `tsc -b`, `check:api`
  against `perdhevi/latihanAPI`'s contract (checked out next to this
  repository), `npm test`, `npm audit --omit=dev`, `build`.
- **e2e** (after check): the API started as its own CI starts it
  (`cp .env.example .env`, `docker compose up --build --wait`: development
  secrets, a fresh database), this image on its network, Playwright's
  Chromium, `npm run e2e`; container logs and the Playwright report on
  failure; everything stopped at the end.

Actions are pinned by commit SHA (checkout v7.0.1 as in the API's CI;
setup-node v7.0.0, upload-artifact v7.0.1, the releases before the
ones younger than 14 days). The workflow only reads the repository. If
`latihanAPI` is private, a read-only token goes in the `LATIHAN_API_TOKEN`
secret.

## Threat recap

The question of this part: Part 0 kept the access token in memory and the
refresh token in `sessionStorage`, where any script on the page can read
it. What stands between that token and an attacker?

| Threat | What it needs | What stops it |
| --- | --- | --- |
| **XSS: injected script steals the refresh token** | Script running on this origin | The CSP allows scripts only from this origin's files: no inline script, no `eval`, no other host. React escapes everything it renders, and the code has no `dangerouslySetInnerHTML`, `innerHTML` or `eval` (checked with a search, below). No third-party script, font, analytics or CDN is loaded. |
| **A stolen refresh token is used** | The token, before it is used here | It lives only as long as the tab (`sessionStorage`); each use rotates it, and the server treats a reused token as theft and revokes the whole session (Part 2's single-flight refresh exists so the app never trips that itself). Sign-out revokes it on the server. |
| **A stolen access token is used** | The token from memory | Short lifetime (15 minutes by default); it is never written to storage. |
| **CSRF** | The browser sending credentials on its own | Not applicable: the API authenticates with a bearer header the app adds, never with cookies, so another site's form or request carries no credentials. |
| **Clickjacking** | The app in someone else's frame | `frame-ancestors 'none'` and `X-Frame-Options: DENY`. |
| **Downgrade, sniffing** | Plain HTTP, MIME confusion | HSTS on the HTTPS host; `nosniff`. |
| **Tampered dependencies** | A changed package or image | `npm ci` from the lockfile with install scripts off; images and actions pinned by digest or SHA; `npm audit --omit=dev` in CI (0 vulnerabilities today). |
| **Leaving data behind on a shared computer** | Access to the browser after use | The refresh token dies with the tab; sign-out clears it. The session draft stays in `localStorage` for its owner (Part 6); erasing the account removes it (Part 10). |

The hardening path Part 0 named stays open: a backend-for-frontend that
keeps tokens in an `httpOnly` cookie would take them out of reach of
script altogether, at the cost of a new server and CSRF protection.

## Setup prerequisites

- The API running (`latihanAPI`: `cp .env.example .env && docker compose up --build`).
- Docker, for the image.
- Chrome installed, for the local end-to-end run.

## Validation (run in order)

```sh
npm run check:api
npx tsc -b
npm run lint
npm test                           # Tests  143 passed (143)
npm run build
npm audit --omit=dev               # found 0 vulnerabilities
docker compose up --build -d --wait
npm run e2e                        # 1 passed
```

Then by hand:

1. `curl -I http://localhost:8088/`: the app's CSP, `no-cache`,
   `X-Frame-Options: DENY`, no `Server`.
2. `curl -I http://localhost:8088/assets/<file>.js`:
   `max-age=31536000, immutable`.
3. `curl http://localhost:8088/plans/123`: the app's HTML (deep link).
4. `curl -i http://localhost:8088/api/v1/exercises`: the API's `401`
   JSON, `default-src 'none'`, an `X-Request-Id`.
5. In a browser, sign in on `http://localhost:8088` and use every page:
   no CSP violation in the console.

Safeguard that should fail: change the app's `style-src 'self'` to
`'none'` in `deploy/Caddyfile`, rebuild, `npm run e2e`: it fails, naming
the blocked stylesheet.

## What was actually validated

On 2026-10-21 (Windows 11, Node 24, Docker Desktop, API from Docker):

- Part 10 validated again first: five full runs, all passed.
- `check:api`, `tsc -b`, `lint`, `test` (143/143), `build`,
  `npm audit --omit=dev` (0 vulnerabilities): passed.
- `caddy validate` with the pinned Caddy: valid. The first version failed
  on an empty `email`; the global option was removed.
- The image built and ran healthy; steps 1 to 4 by `curl`, with the headers
  shown above.
- `npm run e2e` against the image: passed (3.8 s, then 14 s after a
  rebuild). The safeguard: with `style-src 'none'` it failed on
  `style-src-elem http://localhost:8088/assets/index-….css`; restored, it
  passed.
- Step 5 in the Claude desktop app's built-in browser: Home (chart and
  tooltip), Ideas (drawer), a plan opened by URL after a full load; no CSP
  violation recorded by a `securitypolicyviolation` listener and no
  console errors.
- The workflow: `actionlint` 1.7.7 reports nothing, and every step was run
  here by hand, except `npx playwright install` (local runs use the
  installed Chrome) and the GitHub-specific steps (checkout, cache,
  artifacts).
- A search of `src/` for `dangerouslySetInnerHTML`, `innerHTML` and `eval(`
  finds none.
- **Not** validated: the workflow on GitHub (this repository has no
  remote yet), and the production switch in `latihanAPI` (not made).

## Limitations and deferred work

- The production change in `latihanAPI` (this image in place of its Caddy)
  is described, not made.
- One end-to-end journey, one browser (Chromium). Firefox and WebKit could
  join the Playwright projects.
- CI builds the image but does not publish or sign it; the API's
  `release.yml` (cosign) is the model if it should.
- Deferred, as in the plan: an offline PWA, a backend-for-frontend with
  `httpOnly` cookies, external identity providers, the exercise video feed,
  and translations.
