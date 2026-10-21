# Part 9 — Profile and body measurements

**Question:** how do we edit records whose fields are all optional?

## Scope

- `/profile`: rename the profile (`PUT /users/me` with `If-Match`); body
  measurements as a card per metric (latest value, change since the first
  entry) and a history.
- `/profile/measurements/new` and `/profile/measurements/:id`: add, edit
  and delete a measurement. Six metrics, all optional, at least one.

## Changes

| File | Change |
| --- | --- |
| `src/features/profile/api.ts` | The profile is cached with its ETag; `useMe()` selects the user; `useMeVersioned()`, `useRenameProfile()` |
| `src/features/profile/ProfilePage.tsx` | `/profile` |
| `src/features/measurements/api.ts` | `useMeasurements()` (every page), `useMeasurement`, create, update, delete |
| `src/features/measurements/model.ts` | Metrics and their limits, the form draft, `validateMeasurement()`, `progress()` |
| `src/features/measurements/MeasurementForm.tsx` | The form |
| `src/features/measurements/MeasurementPages.tsx` | New and edit pages |
| `src/routes.tsx` | Profile routes; the last placeholders gone |
| `src/app/Placeholder.tsx` | Deleted: every screen exists |
| `src/index.css` | Name form, metric fields and cards |
| `src/test/app.tsx` | Versioned profile and a measurements fake; test waits raised (below) |
| `vite.config.ts` | Test timeout 30 s (below) |
| `src/features/measurements/measurements.test.tsx` | 13 tests |
| `src/features/measurements/model.test.ts` | 5 tests |

## Design decisions

**Empty means null, and null is sent.** Each metric field is a string in
the form; empty is "not recorded". The request always carries all six
metrics, an empty one as `null`. `PUT` replaces the whole record, so leaving
a metric out would clear it too, but saying `null` makes the request mean
what the form shows. Clearing the waist and saving sends `"waist_cm":
null`, and the server stores `null`.

**At least one, each within its limit.** The contract: weight more than 0
and at most 1000 kg, height more than 0 and at most 300 cm, body fat 0 to
100 % (0 included), waist, chest and hip more than 0 and at most 500 cm.
The messages say exactly that ("Body fat: 0 to 100 %."). An empty form
gets "Enter at least one measurement." and no request. A decimal comma
is read as a point, as in the exercise editor.

**Change since first, per metric.** As on mobile: each metric has its own
first and latest entry, because a measurement may record only some of them.
Weight measured three times shows "−1.6 kg since first entry"; a waist
measured once shows "First measurement"; a metric never measured has no
card. Differences are rounded to two decimals (72.4 − 74 is not
−1.5999999999999943) and use the true minus from Part 7.

**All pages, so "first" is the first.** The list is paged, newest first.
Mobile has everything locally; here the oldest entry may be on the last
page. `useMeasurements()` reads every page, 100 at a time (up to 2000
entries). A personal measurement log is small, and a test with 120 entries
checks that the second page is read and used.

**One cache entry for the profile.** Renaming needs the profile's `ETag`.
`useMe()` already cached `GET /users/me` for the top bar, Home and the
profile gate; the entry now holds `{ data, etag }` and `useMe()` selects the
user, so none of its readers changed and the profile page costs no extra
request. Creating (Part 3) and renaming put the server's answer, with its
ETag, straight into that entry, so the top bar shows the new name at once.

**The same concurrency rules as plans and sessions.** The forms edit the
version they opened with; `412` offers *Reload* or *Keep my copy*; a create
sends an idempotency key per body; a deleted measurement is not read again.
No new mechanism.

**One heading changed.** The name section was titled "Display name", the
same as its field, and the section is labelled by its heading, so a screen
reader (and the tests) found two things called "Display name". It is
"Your name" now.

## The test timeouts, again

Validating this part, one full run in five failed: the first test of four
files, each waiting more than 11 seconds for the app's first render. Alone,
that render takes 0.5 to 1.3 seconds. Four workers instead of the default
failed just as often, and the failing runs were slow throughout (33–36 s
against 20 s), so the cause is load on the machine, not the suite. These
waits exist to catch a hang, not to measure speed, so they were given room:
`findBy…` waits up to 10 s (was 5) and a test may take 30 s (was 15).
Automatic retries were not used; they would also hide a real flaky test.
Eight runs in a row then passed, including slow ones (35–37 s).

## Setup prerequisites

- Part 8's prerequisites. No new packages.

## Validation (run in order)

```sh
npm run check:api   # API types match the contract.
npx tsc -b          # no output, exit 0
npm run lint        # no output, exit 0
npm test            # Tests  136 passed (136)
npm run build       # built in …
npm run dev         # with the API running
```

In the browser, signed in (`$TOKEN`: an access token for the same
account):

1. `/profile`, change the name, *Save name*. Expected: `PUT /users/me →
   200`, "Saved.", the new name in the top bar.
2. *Add measurement*, set *When* to a past date, weight 74 and waist 84,
   save. Then another, now, weight `72,4`. Expected: Weight card "72.4 kg",
   "−1.6 kg since first entry"; Waist card "First measurement"; the
   history newest first.
3. Open the older entry. With `curl`, `PUT` it with its `ETag` and a hip
   of 95. In the browser clear the waist and save. Expected: `412`, "This
   measurement changed on another device."; *Reload* shows hip 95; clear
   the waist again and save; `curl` shows `waist_cm: null`, `hip_cm: 95`.
4. Open the newer entry, *Delete* → *Delete*. Expected: `DELETE → 204`, no
   `GET` of it afterwards, the cards recomputed.
5. At 375px: no horizontal scroll; the metric fields two to a row.

Safeguards that should fail (mutation checks), one at a time:

1. A cleared field left out instead of sent as `null`: five tests fail.
2. An empty form sent: two tests fail.
3. "First" taken in API order (newest first): three tests fail.
4. Only the first page read: "reads every page…" fails.
5. Rename without `If-Match`: both rename conflict tests fail.
6. A deleted measurement read again: "deletes after asking, and does not
   read it again" fails.
7. The difference not rounded: "compares each metric with its own first
   entry…" fails.

## What was actually validated

On 2026-10-21 (Windows 11, Node 24, API from Docker):

- `check:api`, `tsc -b`, `lint`, `build`: passed; `test` 136/136 in eight
  runs in a row after the timeout change, and three more at the end.
- Mutation checks 1 to 7 each failed the named tests and passed again once
  reverted.
- Browser steps 1 to 5 against the real API with the throwaway account
  (dev server on port 5176), `curl` as the same account for the second
  device and the reads. Everything as listed, including "−1.6 kg since first
  entry" from the server's numbers and the `null` waist on the server.
- Step 5 by measurement (page 375px wide, fields in two 163px columns); the
  screenshot of that step came out cropped by the tool and is not evidence.
- Part 8's gap closed first: a test that finishing a session refreshes the
  dashboard (committed on its own).

## Automated tests

`src/features/measurements/measurements.test.tsx`:

- rename sends the trimmed name with `If-Match`; the top bar follows;
- a rename after a change elsewhere offers Reload, which shows it;
- a blank name is refused without a request;
- an empty measurement is refused without a request;
- out-of-range values are marked, with the contract's limits;
- a new measurement sends every metric, `null` for empty, `0` body fat
  as 0, a decimal comma as a point, and a UUID key;
- editing sends `null` for a cleared field, with `If-Match`;
- an untouched time goes back as it came;
- a measurement changed elsewhere offers Reload;
- delete asks, sends `If-Match`, and does not read it again;
- change since first per metric, "First measurement", no card for a metric
  never measured, history newest first;
- 120 entries: both pages read, "first" is the oldest;
- no measurements: "No measurements yet. Add your starting point."

`src/features/measurements/model.test.ts`: a saved measurement round-trips
to the same value; at least one metric and a time; each limit (inclusive
only for body fat); change since first in time order, rounded; one entry
has nothing to compare.

## Troubleshooting

- **"Enter at least one measurement."** Every field is empty; the API
  refuses that too.
- **A metric disappeared after an edit.** It was cleared: `PUT` replaces the
  whole record.

## Limitations and deferred work

- More than 2000 measurements: "since first" would be since the oldest of
  those loaded.
- No chart of a metric over time; the history list and the "since first"
  cards are what mobile shows.
- Deleting the profile itself (`DELETE /users/me`) is not offered; Part 10
  erases the whole account instead.
