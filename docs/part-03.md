# Part 3 — App shell, routes and the profile gate

**Question:** what does a signed-in user without a profile see?

## Scope

- One URL per screen, for all the screens the later parts build.
- Guards: signed out → `/sign-in`; signed in without a profile → `/welcome`;
  each sends the user back to the page they asked for afterwards.
- "Create your cloud profile" (`POST /users` with an `Idempotency-Key`).
- The app shell: a top bar, and navigation as a side bar or, under 640px, a
  bottom bar.
- TanStack Query as the server cache, and an error page that shows the
  request ID.

Out of scope: the screens themselves. Every route except Home shows a
placeholder that names the part it arrives in.

## Changes

| File | Change |
| --- | --- |
| `package.json` | `react-router` 8.4.0, `@tanstack/react-query` 5.104.1; dev: `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `jsdom`. All pinned exactly, all at least 14 days old |
| `src/routes.tsx` | The route tree; the guards are layout routes |
| `src/main.tsx` | `AuthProvider` → `QueryClientProvider` → `RouterProvider` |
| `src/app/Root.tsx` | Top route; clears the query cache when the session ends |
| `src/app/AppShell.tsx` | Top bar (name, Sign out) and the five destinations |
| `src/app/ErrorPage.tsx` | Route error page: status, code and request ID of an `ApiError`; `NotFound` |
| `src/app/Placeholder.tsx` | "Arrives in Part N" |
| `src/app/queryClient.ts` | Retry only network errors and 5xx, twice; no retries for writes |
| `src/auth/RequireAuth.tsx` | Guard; "Restoring your session…" while the status is `unknown` |
| `src/auth/redirect.ts` | `returnPath()`: where a guard sent the user from |
| `src/auth/SignInPage.tsx` | Redirects back once signed in |
| `src/auth/context.ts`, `AuthProvider.tsx` | `useAuth()` also returns `api`, the session's client |
| `src/api/concurrency.ts` | `useIdempotencyKey()` (Part 5 adds ETags here) |
| `src/api/errors.ts`, `src/auth/credentials.ts` | `describeWait()` moved to `errors.ts`, shared by both forms |
| `src/features/profile/api.ts` | `useMe()`, `useCreateProfile()`, `checkDisplayName()` |
| `src/features/profile/RequireProfile.tsx` | Guard on `GET /users/me` |
| `src/features/profile/WelcomePage.tsx` | Create the profile |
| `src/features/dashboard/HomePage.tsx` | "Hi, name", placeholder for Part 8 |
| `src/App.tsx` | Deleted: the probe page has done its job |
| `src/index.css` | Shell, navigation and error page styles |
| `src/routes.test.tsx` | 13 tests (below) |

## Design decisions

**An account is not a profile.** The API keeps the identity (email and
password, Part 2) apart from the user record that owns plans and sessions.
A fresh account gets `403 profile_required` from every data endpoint until
it calls `POST /users`. Mobile asks for a "cloud display name" at the same
point; the web asks on `/welcome`.

**Guards are layout routes.** `RequireAuth` and `RequireProfile` render an
`<Outlet />` or a `<Navigate />`, and wrap the routes they protect:

```text
Root (error page, clears cache on sign-out)
├── /sign-in
└── RequireAuth
    ├── /welcome
    └── RequireProfile
        └── AppShell
            └── (error page) /, /sessions, /sessions/:id, /session/active,
                /ideas, /plans, /plans/new, /plans/:id, /profile,
                /profile/measurements/new, *
```

A new route is protected by where it sits in the tree, not by remembering
to wrap it. Each guard puts the current location in the navigation state
(`{ from }`), and the page that lets the user through (`/sign-in`,
`/welcome`) navigates back to it, query string included.

**The profile gate is a query.** `RequireProfile` reads `useMe()`
(`GET /users/me`, cached under `['users', 'me']`), in this order:

1. `profile_required` → `/welcome`. Checked first, so a profile deleted
   elsewhere is noticed on the next refetch even though the old one is
   still cached.
2. Cached profile → the app. A background refetch that fails (offline on
   window focus) keeps the cached profile instead of tearing the page down.
3. Any other error → thrown to the error page.
4. Otherwise "Loading your profile…".

The shell and Home read the same query, so the name in the top bar costs no
extra request.

**The create is idempotent.** `/welcome` sends `POST /users` with an
`Idempotency-Key` from `useIdempotencyKey()`: a UUID made when the form
opens and reused by every retry. If the first request was saved but its
response lost, the retry gets the saved response replayed instead of
`409 profile_exists`. The server refuses a key reused with a *different*
body (`422 idempotency_key_reused`), so editing the name renews the key.
After `201` the new profile goes straight into the query cache, and the
welcome page re-renders into a redirect.

`409 profile_exists` (created meanwhile in another tab) is not shown as an
error: the page refetches the profile and moves on.

**Nothing asks twice.** TanStack Query refetches an errored query when a new
component subscribes to it, so `/welcome` would repeat the gate's
`GET /users/me`. It passes `retryOnMount: false` and takes the cached
`403` as it is. Found in the browser, now covered by a test.

**Retry what can change.** Queries retry twice, and only for
`network_error` or a 5xx. A 4xx is an answer, and a `429` asks for a wait
longer than a quick retry. Writes are never retried automatically; the user
retries with the same idempotency key.

**Errors carry the request ID.** A query error a page cannot handle is
thrown during render and caught by the route's `errorElement`. For an
`ApiError` it shows status, code and the server's `X-Request-ID`, so a bug
report can be matched to the server log. There are two error routes: one
inside the shell, so the navigation survives a failed page, and one at the
top for failures above it (the profile gate).

**Sign-out empties the cache.** `Root` calls `queryClient.clear()` when the
status becomes `signedOut`, whether from Sign out or a rejected refresh.
The next account to sign in in this tab never sees the last one's data.

**The client comes from context.** Features get `api` from `useAuth()`
instead of importing the app's singleton. The tests render the whole app
against an MSW fake with a session built for them, and nothing else
changes.

**Layout in CSS only.** One grid: top bar across, side bar and content
below. Under 640px (`@media (width < 640px)`) the side bar becomes a fixed
bottom bar with the five destinations, padded for the iPhone home
indicator (`env(safe-area-inset-bottom)`). The labels and their order match
mobile's `NavigationBar`, except "Plan", which is "Plans" here.

## Setup prerequisites

- Part 2's prerequisites.
- `npm install` (new packages).

## Validation (run in order)

```sh
npm run check:api   # API types match the contract.
npx tsc -b          # no output, exit 0
npm run lint        # no output, exit 0
npm test            # Tests  37 passed (37)
npm run build       # built in …
npm run dev         # with the API running
```

In the browser, signed out:

1. Open `http://localhost:5173/plans`. Expected: `/sign-in`.
2. Create an account. Expected: `/welcome`, "Create your cloud profile";
   the network tab shows `POST /auth/register → 201` and **one**
   `GET /users/me → 403`.
3. Submit a blank name. Expected: "Enter a display name." and no request.
4. Enter a name. Expected: `POST /users → 201` with an `Idempotency-Key`
   header, then `/plans` (the page from step 1) inside the shell, the name
   in the top bar, and no further `GET /users/me`.
5. Open `/sessions/abc` and reload. Expected: still there, Sessions
   highlighted; one `POST /auth/refresh` and one `GET /users/me → 200`.
6. Narrow the window below 640px. Expected: the navigation moves to a
   bottom bar; no horizontal scroll.
7. Open `/nope`. Expected: "Page not found" inside the shell.
8. Sign out. Expected: `/sign-in`, sessionStorage empty.

Safeguards that should fail (mutation checks), one at a time:

1. Delete `renew()` from the name's `onChange` in `WelcomePage.tsx`:
   "uses a new idempotency key once the name changes" fails.
2. `idempotencyKey: key` → `idempotencyKey: crypto.randomUUID()`:
   "retries a failed create with the same idempotency key" fails.
3. Delete `queryClient.clear()` in `Root.tsx`: "forgets cached data on
   sign-out" fails.
4. Drop `state={…}` from the `Navigate` in `RequireAuth.tsx`: "sends a
   signed-out visitor to sign in, then back…" fails.
5. `failureCount < 2 && isTransient(error)` → `failureCount < 2`: "does
   not retry an answer such as 404" fails.
6. `useMe({ retryOnMount: false })` → `useMe()` in `WelcomePage.tsx`:
   "sends an account without a profile to /welcome…" fails.

## What was actually validated

On 2026-10-21 (Windows 11, Node 24, API from Docker):

- `check:api`, `tsc -b`, `lint`, `test` (37/37), `build`: all passed.
- Mutation checks 1 to 6 each failed the named test, and passed again once
  reverted. Disabling the profile gate altogether fails five tests.
- Browser steps 1, 2, 4, 5, 6, 7 and 8 against the real API, with a
  throwaway account, in the built-in browser of the Claude desktop app (dev
  server on port 5174, since 5173 was taken). Step 2 first showed **two**
  `GET /users/me → 403`; that led to the `retryOnMount` fix, after which
  the test pins one request. Step 6 was checked at 375×812 by measurement
  (page width 375, nav fixed to the bottom edge), light and dark. Screenshots
  in that emulated viewport timed out in the tool.
- Step 3 is covered by a test, not repeated in the browser. The
  `Idempotency-Key` header in step 4 is checked by the tests (the browser
  tool lists requests without headers).
- **Not** validated in the browser: the error page with a real request ID
  (the API would have to fail); a test covers it with a fake `500`.

## Automated tests

`src/routes.test.tsx` renders the whole app (`createMemoryRouter` over the
real route tree) in jsdom against an MSW fake of one account:

- a signed-out visit to `/plans?view=all` goes to sign-in, then back to
  `/plans?view=all`;
- a signed-in visit to `/sign-in` goes Home;
- an account without a profile goes to `/welcome`, with one `GET /users/me`;
  the create sends the trimmed name and a UUID key, then returns to the
  requested page without refetching;
- a create that fails on the network is retried with the same key;
- a create retried after editing the name gets a new key;
- a blank name is rejected without a request;
- `409 profile_exists` moves on to the app;
- `/welcome` with a profile goes Home;
- display names are counted in code points after trimming;
- a `500` is retried twice, then shows the request ID and code;
- a `404` is not retried;
- an unknown path shows "Page not found" inside the shell;
- sign-out empties the query cache.

The test files that need a DOM declare `// @vitest-environment jsdom`; the
Node tests from Parts 1 and 2 still run without one.

## Troubleshooting

- **Stuck on "Loading your profile…".** The API is down and the first
  `GET /users/me` is being retried (twice, with back-off); the error page
  follows after a few seconds.
- **`/welcome` keeps coming back.** The profile was created under another
  account: check the email you signed in with. "Wrong account? Sign out" is
  on the page.
- **The error page says `user_not_found`.** The profile was deleted on the
  server between requests; reload.

## Limitations and deferred work

- Only `GET /users/me` sends the user to `/welcome`. A `profile_required`
  from another endpoint (profile deleted while the app is open) surfaces as
  that page's error until `me` is refetched. Part 4, which adds the first
  other query, should invalidate `me` on that code.
- Signing out on one page and in as another account returns to that page.
  Harmless, as the cache is gone, but it is the previous user's location.
- The Reload button on the error page reloads the whole document. Per-query
  retry buttons arrive with the screens that own the queries.
- The placeholder routes accept any `:id`; validation comes with each
  screen.
