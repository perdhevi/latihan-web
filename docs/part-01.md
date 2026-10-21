# Part 1 — A typed client generated from the contract

**Question:** how do we keep the client honest when the API changes?

## Scope

- Generate TypeScript types from `latihanAPI/api/openapi.yaml`.
- Call the API through a client whose paths, parameters, bodies and
  responses are checked against those types.
- Turn every failure into one error type, `ApiError`, carrying the
  contract's error code.
- Fail the build when the committed types drift from the contract.
- Add the test runner (Vitest) and a fake API (MSW).

Out of scope: tokens (Part 2), caching and retries (TanStack Query, Part 3+).

## Changes

| File | Change |
| --- | --- |
| `package.json` | `openapi-fetch` (runtime); `openapi-typescript`, `vitest`, `msw` (dev), all pinned exactly; scripts `test`, `gen:api`, `check:api`; an `overrides` entry (see below) |
| `scripts/api-types.mjs` | `generate` writes `src/api/schema.d.ts`; `check` regenerates into a temp dir and fails if the result differs |
| `src/api/schema.d.ts` | Generated from the contract. Never edit by hand |
| `src/api/client.ts` | `createApiClient()`, the app's `api` instance, and `unwrap()` |
| `src/api/errors.ts` | `ApiError`, `ApiErrorCode`, `isApiError()`, `retryAfterSeconds()`, `errorFromResponse()` |
| `src/api/client.test.ts` | Behaviour tests with MSW, plus compile-time contract checks |
| `src/App.tsx` | The probe page now uses `api.GET` + `unwrap` and shows the `ApiError` fields |

## Design decisions

**The contract is the source of truth, not our own interfaces.** Mobile
writes its models by hand; here `openapi-typescript` generates them. A
misspelt path, query parameter or body field is a compile error:

```ts
api.GET('/api/v1/exercises', { params: { query: { limt: 5 } } })
//                                               ^^^^ type error
```

`client.test.ts` keeps four such mistakes behind `@ts-expect-error`; if the
contract ever stops rejecting one, `tsc -b` fails.

**Drift is a build failure.** `npm run check:api` regenerates the types from
the API checkout and compares them with the committed file. It will run in CI
(Part 11). The committed file means the web app builds without the API
checkout; the check makes sure it is not stale.

**One failure type.** `openapi-fetch` returns `{ data, error, response }`.
`unwrap()` turns that into "a value or a thrown `ApiError`", which is what
TanStack Query expects later. The cases:

| What happened | `status` | `code` |
| --- | --- | --- |
| API error body (`{"error":{"code","message"}}`) | HTTP status | the contract's code, e.g. `unauthenticated`, `plan_in_use` |
| A non-API error page (proxy 502 HTML) | HTTP status | `unexpected_response` |
| A 2xx body that is not JSON | 0 | `unexpected_response` |
| Server unreachable | 0 | `network_error` |
| Request aborted | — | the `AbortError` is rethrown unchanged |

`ApiErrorCode` is a union generated from the contract's enum, so
`isApiError(e, 'plan_in_use')` is checked against the codes the API really
sends. `requestId` (from `X-Request-ID`) and `retryAfter` (from `Retry-After`,
seconds or HTTP date) are kept for the UI.

**Same-origin base URL.** `baseUrl` is empty, so requests go to `/api/v1/...`
on the page's own origin (Part 0's proxy). Tests pass an absolute URL because
Node's `fetch` needs one.

**Dependencies are pinned and at least two weeks old.** Supply-chain hygiene
to match the API series: exact versions, and no release younger than 14 days
on the day of install. That is why Vitest is `5.0.3`, not `5.0.5`.

**`openapi-typescript` and TypeScript 6.** `openapi-typescript@7.13.0`
declares a peer of `typescript@^5.x`. Instead of `--legacy-peer-deps`, which
loosens peer checks for every package, `package.json` scopes the exception:

```json
"overrides": { "openapi-typescript": { "typescript": "$typescript" } }
```

It generates correctly with TypeScript 6.0.3 (validated below).

**MSW 2, not 3.** `msw@3.0.2` was installable, but `vitest`'s own mocker
declares an optional peer of `msw@^2.4.9`, which made `npm ls` report the tree
as invalid. `msw@2.15.0` satisfies both.

## Setup prerequisites

- Part 0's prerequisites.
- A `latihanAPI` checkout at `../latihanAPI` (or set `LATIHAN_API_SPEC`) for
  `gen:api` and `check:api`.

## Validation (run in order)

```sh
npm install
npm run check:api   # API types match the contract.
npx tsc -b          # no output, exit 0
npm run lint        # no output, exit 0
npm test            # Tests  9 passed (9)
npm run build       # built in …
npm run dev         # with the API running
```

Open http://localhost:5173. Expected: Status 401, Code `unauthenticated`,
Message "valid bearer token required" and a Request ID.

Safeguards that should fail (mutation checks):

1. Contract drift: copy `openapi.yaml`, add an error code to the `Error`
   enum, and run `LATIHAN_API_SPEC=<copy> npm run check:api`. Expected:
   "…schema.d.ts does not match…" and exit 1.
2. Error parsing: make `errorFromResponse` skip the contract branch. Expected:
   `npm test` fails 2 of 9 tests (the 401 and 429 cases).

## What was actually validated

On 2026-10-21 (Windows 11, Node 24.21.0, npm 11.19.0, API from Docker):

- `check:api`, `tsc -b`, `lint`, `test` (9/9), `build`: all passed.
- Both mutation checks failed as expected, then passed again once reverted.
- A throwaway type probe confirmed `unwrap()` returns the non-optional body
  for `GET`, and that a 204 `DELETE` is not typed `never` (which would make
  the code after it unreachable).
- The probe page in the browser showed the real API's 401 as an `ApiError`
  with code `unauthenticated` and a request ID.

## Automated tests

`src/api/client.test.ts`:

- success returns the typed body (and sends the query parameter);
- contract error → `ApiError` with status, code, message, request ID;
- 429 → `retryAfter` from `Retry-After`;
- HTML 502 → `unexpected_response` with status 502;
- non-JSON 200 → `unexpected_response`;
- network failure → `network_error`, status 0;
- abort → `AbortError` passes through;
- `retryAfterSeconds` with seconds, future and past HTTP dates, missing and
  malformed headers;
- compile-time: unknown path, misspelt query parameter, missing path
  parameter, missing required body field.

## Troubleshooting

- **MSW handlers are never hit; requests go to the network** (`ENOTFOUND`).
  `openapi-fetch` stores the `fetch` it was created with, and MSW replaces
  `globalThis.fetch` only in `server.listen()`. The tests create the client
  with `fetch: (request) => globalThis.fetch(request)` so it looks `fetch` up
  per call.
- **`ERESOLVE … peer typescript@"^5.x" from openapi-typescript`** — the
  `overrides` entry is missing from `package.json`.
- **`npm warn install-scripts`** for MSW — npm 11 does not run install scripts
  unless approved. MSW's script only copies the browser service worker, which
  Node tests do not use. Leave it unapproved.
- **`check:api` fails right after pulling the API** — expected when the API
  changed. Run `npm run gen:api`, then fix the type errors it reveals: those
  are the places the client must change.

## Limitations and deferred work

- No authentication yet: every `/api/v1` call is a 401 (Part 2).
- The contract's `oneOf` for exercises is generated as an intersection that
  still narrows on `kind`; Part 5 decides whether a hand-written union reads
  better in the editor.
- `jsdom` and Testing Library arrive with the first component tests (Part 3).
- `check:api` is not in CI yet (Part 11).
