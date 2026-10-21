# latihan-web

The browser client of the latihan fitness platform. It talks to the Go
`latihanAPI` server and gives a signed-in user the same features as the
Flutter `latihan_mobile` app: plans, workout sessions, planned-versus-done
comparison, body measurements, the exercise catalog and data export.

Unlike the mobile app, the web client is **online-only**: the API is the
source of truth and an account is required. See
[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for why, and for
the whole build, part by part.

## Requirements

- Node.js 24 and npm 11
- A running `latihanAPI` (Docker), by default on `http://localhost:8080`
- A checkout of `latihanAPI` next to this one (`../latihanAPI`) when you
  regenerate the API types

## Run it

Start the API (in the `latihanAPI` checkout):

```sh
cp .env.example .env
docker compose up --build
```

Then, here:

```sh
npm install
npm run dev
```

Open http://localhost:5173. Vite forwards every `/api` request to the API, so
the browser only ever talks to one origin and the API needs no CORS headers.
Point it at another server with `LATIHAN_API_URL`:

```sh
LATIHAN_API_URL=http://localhost:9090 npm run dev
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server with the `/api` proxy |
| `npm run build` | Type-check and build to `dist/` |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest, with MSW as a fake API) |
| `npm run gen:api` | Regenerate `src/api/schema.d.ts` from `../latihanAPI/api/openapi.yaml` (or `LATIHAN_API_SPEC`) |
| `npm run check:api` | Fail if `schema.d.ts` no longer matches the contract |

## Build log

Each part of the build has its own document with what changed, why, how to
validate it, and what was actually validated.

| Part | Document | Question |
| --- | --- | --- |
| 0 | [Baseline](docs/part-00.md) | What does the client talk to, and how does the browser reach it? |
| 1 | [A typed client from the contract](docs/part-01.md) | How do we keep the client honest when the API changes? |
| 2 | [Signing in and staying signed in](docs/part-02.md) | How does a browser hold a session without leaking it? |
| 3 | [App shell, routes and the profile gate](docs/part-03.md) | What does a signed-in user without a profile see? |
| 4 | [The exercise catalog](docs/part-04.md) | How do we read a paginated, read-only list? |
| 5 | [Plans: our first writes](docs/part-05.md) | How do we write safely when the network can drop a response, or another device edits the same record? |
| 6 | [Recording a session](docs/part-06.md) | Where does a workout live before it is saved? |
| 7 | [History and planned-versus-done](docs/part-07.md) | How do we show what was planned next to what was done? |