# Part 4 — First vertical slice: the exercise catalog ("Ideas")

**Question:** how do we read a paginated, read-only list?

## Scope

- The Ideas page: the shared exercise catalog, 20 entries at a time, with a
  category filter and a detail drawer.
- `ExercisePicker`, the component plans (Part 5) and sessions (Part 6) use
  to add an exercise: a catalog entry, or one the user names.
- Carried over from Part 3: a `profile_required` from any query, not only
  `GET /users/me`, now sends the user to `/welcome`.

Out of scope: mobile's video ideas feed. It comes from `EXERCISE_IDEAS_URL`,
which is not part of the API, so it stays on the deferred list until the
server has an endpoint for it.

## Changes

| File | Change |
| --- | --- |
| `src/features/catalog/api.ts` | `useCatalog(category)` (infinite query over `GET /exercises`), `useCatalogExercise(id)`, category list and labels |
| `src/features/catalog/CatalogList.tsx` | Filter chips, the list, Load more, empty and error states; shared by the page and the picker |
| `src/features/catalog/IdeasPage.tsx` | `/ideas`: filter and open exercise in the URL; the detail drawer |
| `src/shared/ExercisePicker.tsx` | Catalog entry or free-form exercise → `{ exercise_id, name, kind }` |
| `src/app/queryClient.ts` | A query cache hook: `profile_required` from any query refetches `me` |
| `src/features/profile/WelcomePage.tsx` | Stays put when the cached profile sits next to a `profile_required` |
| `src/api/errors.ts`, `src/features/profile/api.ts` | `describeProfileError()` became the shared `describeError()` |
| `src/routes.tsx` | `/ideas` renders `IdeasPage` |
| `src/index.css` | Chips, list, drawer, picker |
| `src/test/app.tsx` | The fake API and app renderer, moved out of `routes.test.tsx`; now also serves the catalog |
| `src/features/catalog/catalog.test.tsx` | 15 tests (below) |

## Design decisions

**The cursor is the server's.** `GET /exercises` answers
`{ items, limit, next_cursor }`, alphabetical. `useInfiniteQuery` keeps the
pages; `getNextPageParam` returns `next_cursor`, and when it is `null` the
query has no next page and Load more disappears. The client never builds a
cursor, counts items, or guesses that a short page is the last one.

**A button, not infinite scroll.** "Load more" is explicit, keyboard
reachable, and testable without faking an intersection observer. 36
catalog entries do not need more.

**The filter is a different list.** The query key is
`['exercises', 'list', category]`, so each category is its own cached
list with its own cursor. Switching back to a category already seen costs
no request. The server filters (`?category=cardio`), so a filtered list
pages correctly; filtering loaded pages on the client would show a
category as empty when its entries sit on page 3.

**The URL holds the screen's state.** `/ideas?category=cardio&exercise=<id>`
survives a reload and can be shared. The category comes from
`parseCategory()`, so `?category=yoga` falls back to All instead of
sending the server a value the contract rejects. Changing the filter
*replaces* the history entry (a filter is not a place to go back to);
opening an exercise *pushes* one, so Back closes it, as on a phone. Close
goes back when it was opened from the list and replaces the URL when the
page was opened straight on an exercise, so it never leaves the app.

**The detail costs no request when the list has it.** List items carry
every field the drawer shows. `useCatalogExercise()` takes its
`initialData` from any cached list, dated with that list's
`dataUpdatedAt`, so an entry is refetched only when the list it came from
is stale. A link straight to an exercise has no list, so it asks
`GET /exercises/{id}`. `exercise_not_found` (404) and `invalid_id` (400,
not a UUID) both read "This exercise is not in the catalog."

**Reference data is cached longer.** The catalog is the same for every user
and changes with a server release, so its queries are fresh for ten
minutes instead of the default thirty seconds.

**Failures stay on the page.** Part 3 threw query errors to the route's
error page. A list the user is reading is better served in place: a first
page that fails shows the message and *Try again*; a next page that fails
keeps the entries already loaded and leaves Load more to retry. `429`
shows the wait from `Retry-After` through the shared `describeError()`.

**One gate for `profile_required`.** Part 3 only noticed a deleted profile
when `GET /users/me` ran again. Now the `QueryCache`'s `onError` refetches
`me` whenever another query fails with `profile_required`; the profile
gate then redirects as before. `me` itself is excluded, or its own
failure would refetch it forever. The cached profile stays next to the new
error, so `/welcome` checks the error before the data; otherwise it would
send the user straight back.

**The picker has no `<form>`.** It will sit inside the plan and session
forms, and forms cannot nest. Enter in the name field adds the exercise and
calls `preventDefault()`, so it does not submit the surrounding form. A
catalog entry gives `{ exercise_id, name, kind: category }`; a free-form
one `{ exercise_id: null, name, kind }`, with the name trimmed and checked
against the contract's 1–200 characters. The server takes name and kind
from the catalog when `exercise_id` is set, but sending them keeps the row
readable before it is saved.

**The drawer is light on purpose.** A side panel (380px) on wide screens,
the whole screen on a phone, `role="dialog"` named by the exercise, focus
on Close when it opens, Escape to close. It does not trap focus or hide
the page behind it from screen readers; on a wide screen the list stays
usable beside it.

## Setup prerequisites

- Part 3's prerequisites. No new packages.

## Validation (run in order)

```sh
npm run check:api   # API types match the contract.
npx tsc -b          # no output, exit 0
npm run lint        # no output, exit 0
npm test            # Tests  52 passed (52)
npm run build       # built in …
npm run dev         # with the API running
```

In the browser, signed out:

1. Open `http://localhost:5173/ideas?category=cardio`, create an account
   and a profile. Expected: back on `/ideas?category=cardio`, Cardio
   pressed, six cardio exercises; one
   `GET /exercises?limit=20&category=cardio`.
2. Press All. Expected: `/ideas`, 20 entries and Load more.
3. Press Load more. Expected: 36 entries, no Load more; the request carries
   `cursor=…`.
4. Open Barbell Back Squat. Expected: the drawer (Strength, Quadriceps,
   Barbell, "No description yet.") and **no** `GET /exercises/{id}`.
5. Reload. Expected: the drawer again, now from
   `GET /exercises/1686b204-… → 200`.
6. Open `/ideas?exercise=not-a-uuid` and
   `/ideas?exercise=0190c6a8-0000-7000-8000-999999999999`. Expected: "This
   exercise is not in the catalog." (`400` and `404`).
7. At 375px wide, in dark mode: the chips wrap, no horizontal scroll; an
   opened exercise fills the screen with Close focused.

Safeguards that should fail (mutation checks), one at a time:

1. Delete `initialData` in `useCatalogExercise()`: "opens an exercise from
   the list without asking again…" fails.
2. Delete the `invalidateQueries` in `queryClient.ts`: "sends the user to
   /welcome when the profile disappears…" fails.
3. `me.data !== undefined && !noProfile` → `me.data !== undefined` in
   `WelcomePage.tsx`: the same test fails.
4. Delete `event.preventDefault()` in the picker's Enter handler: "picks a
   free-form exercise without an id, on Enter…" fails.
5. Make `close()` always replace the URL: "closes the drawer with Escape…"
   fails.
6. Stop sending `category` to the server: three filter tests fail.

## What was actually validated

On 2026-10-21 (Windows 11, Node 24, API from Docker, seeded catalog of 36
exercises):

- `check:api`, `tsc -b`, `lint`, `test` (52/52), `build`: all passed.
- Mutation checks 1 to 6 each failed the named tests, and passed again once
  reverted.
- Browser steps 1 to 7 against the real API with a throwaway account, in
  the built-in browser of the Claude desktop app (dev server on port 5175,
  as 5173 was taken). The network log showed exactly the requests listed.
  Step 7 was checked by measurement (page width 375, drawer 375×812, Close
  focused) and a screenshot in dark mode.
- **Not** validated in the browser: a failing first page or next page, and
  the `profile_required` redirect from the catalog (the profile would have
  to be deleted on the server mid-session). Tests cover all three.
- `ExercisePicker` is covered by tests only; no page mounts it until Part 5.

## Automated tests

`src/features/catalog/catalog.test.tsx`, over the fake API in
`src/test/app.tsx`, which pages and filters the catalog as the server does:

- 45 entries load as 20, 40, 45, then no Load more; the requests are
  `limit=20`, `…&cursor=20`, `…&cursor=40`;
- a filter asks the server for that category, shows only its entries,
  is pressed, and is in the URL; going back to All costs no request;
- a category in the URL is used; an unknown one means All;
- an empty category says so;
- opening an exercise from the list makes no request; Back closes it;
- Escape closes it by going back, focus starts on Close;
- a linked exercise is fetched; Close removes it from the URL;
- an unknown exercise is "not in the catalog";
- a failed first page shows the `429` wait and Try again works;
- a failed next page keeps the loaded entries, and Load more retries;
- a profile deleted while on Ideas leads to `/welcome`, and back to the
  filtered list once recreated;
- the picker gives a catalog entry's id, name and kind;
- the picker gives a free-form exercise with `exercise_id: null` on Enter,
  without submitting the form around it;
- the picker rejects a blank name.

`routes.test.tsx` keeps its 13 tests, now on the shared harness.

## Troubleshooting

- **"No exercises in this category." for every category.** The catalog
  seed migration has not run; check the API's migrations
  (`000008_seed_exercises`).
- **Every entry says "No description yet."** Expected: the seed has none.

## Limitations and deferred work

- No search by name: the API has none, and filtering only the loaded pages
  would mislead. The catalog is small enough to scroll; a `q` parameter on
  the server would be the fix.
- The drawer is not modal: no focus trap, the page behind is not inert.
  Enough for a read-only panel; Part 5's confirmation dialogs need more.
- On wide screens the drawer covers the top bar's Sign out while open.
- Video ideas from mobile stay deferred (no endpoint).
