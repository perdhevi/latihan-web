# Part 2 — Signing in and staying signed in

**Question:** how does a browser hold a session without leaking it?

## Scope

- Create an account, sign in, sign out.
- Send the access token with every API call and renew it when it expires,
  without ever presenting a refresh token twice.
- Survive a reload, not the closing of the tab.
- Keep "the server rejected the session" apart from "the server could not be
  reached".

Out of scope: the profile (`403 profile_required` is still shown raw on the
probe page; Part 3), routes and the app shell (Part 3).

## Changes

| File | Change |
| --- | --- |
| `src/auth/tokens.ts` | `TokenStore`: access token in memory, refresh token in a `KeyValueStorage` (sessionStorage in the browser, a fake in tests); storage errors fall back to memory |
| `src/auth/session.ts` | `createSession()`: `signIn`, `register`, `signOut`, single-flight `refresh`, and `api`, the client with the auth middleware |
| `src/auth/appSession.ts` | The app's one session and its `api` |
| `src/auth/context.ts`, `src/auth/AuthProvider.tsx` | `useAuth()` with `status: 'unknown' \| 'signedOut' \| 'signedIn'`; resumes a stored session on load |
| `src/auth/credentials.ts` | Client-side checks from the contract, and the message for each auth error |
| `src/auth/SignInPage.tsx` | Sign in / create account form |
| `src/api/client.ts` | `unwrap()` passes an `ApiError` thrown by middleware through unchanged; the unauthenticated `api` export is gone |
| `src/App.tsx`, `src/main.tsx` | Sign-in page when signed out, the probe page (with Sign out) when signed in |
| `src/index.css` | Form, button and error styles |
| `src/auth/session.test.ts` | 15 tests (below) |

## Design decisions

**Where the tokens live.** The access token (15 minutes by default) stays in
a module variable: a reload drops it and the next request gets a new one. The
refresh token is written to `sessionStorage` under `latihan.refresh_token`, so
a reload keeps the session and closing the tab ends it. Part 0's decision 3
explains why this, and not memory only or a backend-for-frontend.

**One refresh at a time.** The server rotates refresh tokens and treats a
reused one as theft: presenting `refresh-1` twice revokes the whole session.
So `refresh()` keeps the running request in a promise and every caller awaits
that one. A second guard covers requests that were already in flight: each
request remembers the access token it was sent with, and a `401` only triggers
a refresh if the current token is still that one. Otherwise another request
has already refreshed and this one just replays.

**Refresh before, not after.** After a reload there is a refresh token but no
access token. The middleware refreshes *before* sending, instead of sending
without a token and waiting for the `401`.

**Replaying a request with a body.** A `Request` body can be read only once,
and `fetch` reads it. The middleware clones each request before it is sent and
replays the clone, once. The replay bypasses the middleware, so a second `401`
is returned as it is, never looped.

**Rejected versus unreachable.** A `401` from `/auth/refresh` ends the
session: tokens and storage are cleared, and the caller gets
`invalid_refresh_token`. A network error keeps the refresh token so the next
request can try again, and the caller gets `network_error`. For that,
`unwrap()` now rethrows an `ApiError` raised by middleware; before, anything
thrown out of `openapi-fetch` was relabelled `network_error`.

**Signing out forgets first.** `signOut()` clears the tokens, then calls
`POST /auth/logout`. The app is signed out even if the server cannot be
reached; logout failures are ignored (the token expires on its own). A refresh
still in flight when the user signs out has its new tokens revoked instead of
stored.

**The auth endpoints skip the middleware.** They take no bearer token, and a
`401` from `/auth/login` means wrong credentials, not an expired token.

**Client checks mirror the contract.** Email at most 254 characters; a new
password 12 to 128 characters. The server counts code points
(`utf8.RuneCountInString`), so the client does too (`[...s].length`, not
`s.length`). Sign-in does not check password length: an older, shorter
password should still reach the server. The server stays authoritative.

**Messages.** `invalid_credentials`, `email_taken` and `rate_limited` get
plain-language messages; the rate limit names the wait from `Retry-After`.
Other `ApiError`s show the API's own message.

**`status: 'unknown'`.** With a stored refresh token and no access token, the
provider refreshes once on load and shows "Restoring your session…" until it
answers. Under React's StrictMode the effect runs twice; the single-flight
refresh makes that one request.

**No jsdom yet.** The logic lives in plain modules (`session.ts`, `tokens.ts`,
`credentials.ts`) that take their storage as a parameter, so Node tests cover
it without a DOM. Node 24 has no `sessionStorage` global.

## Setup prerequisites

- Part 1's prerequisites.
- The API running with `AUTH_PROVIDER=jwt` (the default in `.env.example`).

## Validation (run in order)

```sh
npm run check:api   # API types match the contract.
npx tsc -b          # no output, exit 0
npm run lint        # no output, exit 0
npm test            # Tests  24 passed (24)
npm run build       # built in …
npm run dev         # with the API running
```

In the browser:

1. **Create an account** with a 5-character password. Expected: "Choose a
   password of 12 to 128 characters." and no request in the network tab.
2. Use a 12+ character password. Expected: the probe page, now showing
   `403 profile_required` instead of `401`: the token is accepted (Part 3
   creates the profile).
3. Reload. Expected: still signed in; the network tab shows one
   `POST /auth/refresh → 200`, then the probe request.
4. Before signing out, copy `latihan.refresh_token` from sessionStorage
   (DevTools → Application). Click **Sign out**. Expected: the sign-in page,
   sessionStorage empty, `POST /auth/logout → 204`. Then:
   ```sh
   curl -i -X POST http://localhost:8080/api/v1/auth/refresh \
     -H 'Content-Type: application/json' \
     -d '{"refresh_token":"<copied token>"}'
   ```
   Expected: `401` with `invalid_refresh_token`.
5. Sign in with a wrong password. Expected: "Wrong email or password…".

Safeguards that should fail (mutation checks), one at a time:

1. `refreshing ??=` → `refreshing =` in `session.ts`: "is renewed by one
   refresh for any number of concurrent 401s" fails.
2. `replay: request.clone()` → `replay: request`: "replays a request body
   after a refresh" fails.
3. Delete `if (cause instanceof ApiError) throw cause` in `client.ts`: "a
   rejected refresh ends the session and clears storage" fails.

## What was actually validated

On 2026-10-21 (Windows 11, Node 24.21.0, API from Docker):

- `check:api`, `tsc -b`, `lint`, `test` (24/24), `build`: all passed.
- All three mutation checks failed as expected (1 of 24 each), then passed
  again once reverted.
- Browser steps 1 to 5 against the real API, with a throwaway account. Step 4
  replayed the old refresh token from the page with `fetch` instead of `curl`
  (same request); the API answered `401 invalid_refresh_token`. The reload
  made exactly one refresh, despite StrictMode.
- Chrome's network panel marks the `204` logout as `net::ERR_ABORTED` (cause not
  investigated). The server did revoke the token,
  as step 4 shows.
- **Not** validated in the browser: an access token expiring mid-session. It
  takes 15 minutes; the tests cover renewal, concurrency and replay instead.

## Automated tests

`src/auth/session.test.ts`, against an MSW fake that rotates tokens
(`refresh-n` → `access-(n+1)`, `refresh-(n+1)`):

- the bearer token is sent; no refresh while it is valid;
- a `401` refreshes once, replays, and stores the new refresh token;
- three concurrent `401`s cause one refresh;
- a request still `401` after renewal is not renewed again;
- a `POST` body is replayed intact;
- a reload (new store over the same storage) refreshes **before** the request;
- a rejected refresh clears memory and storage and surfaces
  `invalid_refresh_token`;
- a network error during refresh keeps the session and surfaces `network_error`;
- login sends trimmed credentials and no bearer token, and stores the tokens;
- sign-out clears storage before the logout request, revokes the token, and
  succeeds offline;
- tokens from a refresh that finishes after sign-out are revoked;
- the token store works in memory when storage throws;
- credential checks count code points; rate-limit messages name the wait.

## Troubleshooting

- **Signed out after duplicating the tab.** "Duplicate tab" copies
  sessionStorage, so both tabs hold the same refresh token. Whichever
  refreshes second presents a used token and the server revokes the session
  in both. Open a new tab and sign in instead (see Limitations).
- **Every request is `401` and no refresh happens.** The API is not running
  with `AUTH_PROVIDER=jwt`, or the access token was issued by another API
  instance (a different signing key).
- **`403 profile_required` after signing in.** Expected until Part 3.

## Limitations and deferred work

- Duplicated tabs share a refresh token and end each other's session. A
  `BroadcastChannel` that hands one tab's refresh to the others would fix it;
  deferred.
- A refresh whose response is lost (reload or network drop at that moment)
  leaves the client with a used token, and the next refresh ends the session.
  This is the price of reuse detection; the user signs in again.
- The access token is not renewed ahead of expiry: the first request after it
  expires pays one extra round trip.
- A stored session that cannot be confirmed because the API is unreachable
  shows as signed in; requests then fail with `network_error` until it is back.
- The refresh token is readable by any script on the page. Part 11's CSP is
  the mitigation; a backend-for-frontend with an httpOnly cookie remains the
  hardening path.
