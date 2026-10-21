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

## Build log

Each part of the build has its own document with what changed, why, how to
validate it, and what was actually validated.

| Part | Document | Question |
| --- | --- | --- |
| 0 | [Baseline](docs/part-00.md) | What does the client talk to, and how does the browser reach it? |