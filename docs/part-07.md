# Part 7 — History and planned-versus-done

**Question:** how do we show what was planned next to what was done?

## Scope

- Previous sessions: `/sessions`, newest first, 20 at a time.
- A session's page, `/sessions/:id`: its activities; with a plan, the
  server's comparison (`GET /plans/{plan_id}/comparison?session_id=…`) as
  totals and one card per exercise, matched, planned but not logged, or
  not in the plan, with per-set differences.
- Delete a session, with confirmation and `If-Match`.

Edit was built in Part 6 (`/sessions/:id/edit`); this page links to it.

## Changes

| File | Change |
| --- | --- |
| `src/features/sessions/api.ts` | `useSessions` (infinite), `useComparison`, `useDeleteSession`; `useSession` takes `enabled`; an edit drops the session's comparison |
| `src/features/sessions/format.ts` | Numbers, signed differences, sets, dates; `—` for whatever was not recorded |
| `src/features/sessions/SessionsPage.tsx` | `/sessions` |
| `src/features/sessions/SessionPage.tsx` | `/sessions/:id`: details, planned versus done, Delete (replaces the Part 6 placeholder) |
| `src/routes.tsx` | `/sessions` renders `SessionsPage` |
| `src/index.css` | Comparison cards and tables, tightened under 640px |
| `src/test/app.tsx` | The sessions fake lists, deletes (and frees the plan), serves comparisons a test sets, counts reads |
| `src/features/active-session/session.test.tsx` | A request body is now optional (`DELETE` has none) |
| `src/features/sessions/sessions.test.tsx` | 11 tests |
| `src/features/sessions/format.test.ts` | 2 tests |

## Design decisions

**The server compares; the client shows.** The comparison is computed by
the API from the plan as it was (a plan's exercises never change once a
session uses it), so the web client does no arithmetic of its own: totals,
per-set differences and BPM differences are the server's numbers. The
fake API in the tests does not compute comparisons either; each test sets
the one the server would send. The client cannot drift from the server's
rules, at the cost of one more request per session page.

**Missing is not zero.** The contract says missing records are `null`, not
invented measurements, and the page keeps that promise: `formatDelta(null)`
and `formatNumber(null)` are "—". A real zero stays "0" ("0 kg": the same
weight as planned). The cases the tests pin down:

- an extra set has no planned set, so its planned value and both
  differences are "—";
- a run logged without BPM shows "—" for done BPM and its difference,
  even though planned was 140;
- a skipped exercise shows "—" for done and for the difference. The server
  sends a total difference of −5 minutes for it, which is true as
  arithmetic, but "−5 min of stretching done" would misread a skip as a
  short stretch. The totals table at the top still counts it, since there
  it is part of a sum.

Differences carry their sign, with a true minus (`−`), and say they are
"what you did minus what was planned".

**Matched means linked.** The contract is explicit that `matched` does not
mean the target was met, so the cards read *Planned and logged*,
*Planned but not logged* and *Not in the plan*, and the summary counts
"2 of 3 planned exercises logged", not "completed".

**Server order.** Planned entries come in plan order, unplanned ones
after, as the API sends them. Grouping by status would move a skipped
exercise away from its neighbours in the plan; a coloured edge and a label
per card show the status instead.

**Without a comparison, the activities.** A session without a plan shows
its activities, and the comparison is never requested (the component that
asks for it only mounts for a session with a plan; `enabled` in
`useComparison` guards later callers). If the comparison is missing
(`comparison_not_found`, `plan_not_found`) the page says so quietly and
shows the activities; any other failure gets *Try again*.

**The comparison lives under the session's key.**
`['sessions', 'detail', id, 'comparison']`. Saving an edit drops it, so
the session page asks again and the differences match what was saved.

**Delete what is on screen.** The page has no form, so the version it
sends with `If-Match` is the one it last read and shows. A `412` means it
changed after the click; the page reloads it and says to delete again if
still wanted. `404` counts as done.

**A deleted session is not read again.** Deleting removes the session from
the cache while its page is still mounted, and the page's query then
fetched it again (seen in the browser: a `GET` cancelled by the
navigation; on a slow connection it could have shown "Session not found").
The page now turns its query off once the delete succeeded. A test counts
the reads.

**Tables that fit a phone.** Five columns (set, planned, done, two
differences) at 375px: under 640px the tables use less padding and a
smaller font and let "5 × 62.5 kg" wrap. Each card still scrolls on its
own if a long value needs it, never the page.

## Setup prerequisites

- Part 6's prerequisites. No new packages.

## Validation (run in order)

```sh
npm run check:api   # API types match the contract.
npx tsc -b          # no output, exit 0
npm run lint        # no output, exit 0
npm test            # Tests  106 passed (106)
npm run build       # built in …
npm run dev         # with the API running
```

In the browser, signed in, with a few sessions from Part 6 (`$TOKEN`: an
access token for the same account):

1. `/sessions`. Expected: newest first, with local date and time, "n
   activities", "free" or "from a plan"; one `GET /sessions?limit=20`.
2. Open a session recorded from a plan. Expected: "Planned versus done",
   the totals table, a card per exercise; one
   `GET /plans/<plan>/comparison?session_id=… → 200`.
3. With `curl`, `POST /sessions` against the same plan with an extra set,
   one target left out, and an unplanned exercise. Open it. Expected:
   *Planned and logged* with "—" in the extra set's planned and difference
   cells; *Planned but not logged* with "—" for done; *Not in the plan*
   with "—" for planned; negative differences with "−".
4. At 375px wide: no horizontal scroll, and no card needs to scroll.
5. *Delete* → *Delete*. Expected: `DELETE → 204`, `/sessions` without it,
   and no `GET` of that session after the delete.

Safeguards that should fail (mutation checks), one at a time:

1. `formatDelta(null)` returns `'0'`: three tests fail.
2. A skipped exercise shows the server's minutes difference: "shows what
   was not recorded as "—", never as 0" fails.
3. An edit keeps the old comparison: "asks for the comparison again after
   the session is edited" fails.
4. Delete without `If-Match` (`etag: null`): both delete tests fail.
5. The deleted session's query stays enabled: "asks first, then deletes
   with If-Match…" fails (two reads instead of one).
6. No activities when the comparison is missing: "falls back to the
   activities…" fails.

Dropping `enabled` from `useComparison` fails no test, because no page
calls it for a session without a plan; it stays as a guard.

## What was actually validated

On 2026-10-21 (Windows 11, Node 24, API from Docker):

- `check:api`, `tsc -b`, `lint`, `test` (106/106, three runs in a row),
  `build`: all passed.
- Mutation checks 1 to 6 each failed the named tests and passed again once
  reverted.
- Browser steps 1 to 5 against the real API, with the throwaway account
  from Part 4 (dev server on port 5176), and `curl` for the session in
  step 3. The real comparison rendered as described: an extra set with
  "—", a skipped run with "—" for done, Plank as not in the plan,
  "−2.5 kg", "−17 min" in the totals.
- Step 4 found the tables 20–40px wider than their cards at 375px (each
  card scrolled sideways). Fixed with the narrow-screen rules above and
  re-measured: no card overflows.
- Step 5 found the `GET` of the deleted session; fixed as above. The re-run
  in the browser was not repeated; the test that counts reads covers it.

## Automated tests

`src/features/sessions/sessions.test.tsx`, over the fake API:

- the list is newest first, with the activity count and "free";
- no sessions: "No completed sessions yet." and a Start button;
- Load more until there is no next cursor (25 sessions);
- a session against its plan: summary, totals with signed differences,
  per-set rows including an extra set with "—";
- "—" never "0": a run without BPM, a skipped stretch, an unplanned plank;
- no comparison: the activities instead;
- after an edit, the comparison is asked for again;
- a session without a plan lists its activities and asks for no
  comparison;
- an unknown session: "Session not found";
- delete asks (Cancel sends nothing), sends `If-Match`, returns to the
  list, and reads the session only once;
- a `412` on delete shows the latest version and keeps the session.

`src/features/sessions/format.test.ts`: "—" for missing and "0" for zero;
signs and the true minus.

## Troubleshooting

- **"The comparison with its plan is not available."** The server has no
  comparison for this session and plan (`404`). The activities are shown
  instead.
- **A difference shows "—" where you expected a number.** One side was not
  recorded (no BPM, no planned set, nothing logged). That is the point.

## Limitations and deferred work

- The list does not show the plan's name, only "from a plan": the list
  items carry `plan_id`, and fetching every plan for the list would be a
  request per row.
- No filter or search in the history; the API has only paging.
- The comparison is one more request on every session page with a plan;
  it is cached for the page's life and dropped after an edit.
