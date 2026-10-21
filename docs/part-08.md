# Part 8 — Dashboard and progress

**Question:** what does a user want to see first?

## Scope

Home becomes the dashboard, top to bottom:

- *Start a new session* / *Resume active session* (Part 6).
- **This week**: sessions, sets logged and minutes, and a seven-day strip
  marking the days with a session.
- **Recent sessions**: the three newest, and a link to all of them.
- **Planned work done, last 12 weeks**: a line chart of
  `volume_completion_pct` and `minutes_completion_pct`, with a table view.

## Changes

| File | Change |
| --- | --- |
| `src/features/dashboard/api.ts` | `weekStart()` (Monday 00:00 UTC), `addDays()`, `useProgress()` over `GET /stats/progress` |
| `src/features/dashboard/HomePage.tsx` | The dashboard |
| `src/features/dashboard/ThisWeek.tsx` | The week card and strip |
| `src/features/dashboard/CompletionChart.tsx` | The chart (inline SVG), tooltip, table view |
| `src/features/sessions/api.ts` | Saving, editing or deleting a session refreshes the stats |
| `src/features/sessions/format.ts` | `formatPercent()` |
| `src/index.css` | Week card, strip, chart; two series colours for light and dark; link rows no longer underlined |
| `src/test/app.tsx` | `GET /stats/progress` fake; `progressPoint()` |
| `src/features/dashboard/dashboard.test.tsx` | 7 tests |
| `src/features/dashboard/api.test.ts` | 4 tests |

## Design decisions

**The server adds up; the client places.** The plan for this part said
"server-side totals rather than recomputing on the client, unlike
mobile". The week card asks `GET /stats/progress?bucket=day` for this week
and adds up at most seven server totals; the same answer feeds the strip,
so the card and strip cost one request, not two. No session is counted on
the client.

**Missing buckets.** Probing the real API showed it leaves out buckets
with no sessions (a four-week range came back with one week). So the
client lays out the days and weeks itself and looks the server's points
up by date. A missing day is a day without a session: zero sessions, which
is a real count. A missing *week* in the chart has no completion
percentage, which is not zero: it is a gap.

**UTC weeks.** The API buckets by ISO week in UTC, so `weekStart()` is
Monday 00:00 UTC and the strip's days are UTC days. In Jakarta (UTC+7) a
session on Monday at 06:00 belongs to Sunday's UTC day, and Monday before
07:00 is still last week. The card says so ("Weeks run Monday to Sunday
in UTC, as the server counts them") rather than disagree with the server.
The page takes "now" once when it mounts, so the week does not change
under the user at midnight.

**Null is a gap, not 0.** `*_completion_pct` is `null` when the plans of
that week asked for none of that metric, and a week without sessions has
no value at all. The chart breaks the line there: each run of weeks with a
value is its own path, a lone week is a marker without a line, and the
table view shows "—". Percentages arrive as floats
(`110.00000000000001`) and are rounded for display. The scale always
shows 100% (what the plan asked for) as a darker gridline and grows past it
in steps of 50 when the data does. If no week in the range has a value,
the page says "No planned sessions in the last 12 weeks." instead of
drawing an empty frame.

**One axis, two series that share it.** Both series are percentages of a
plan, so they share one 0–100+ axis; no second scale. Identity is never
colour alone: a legend, different marker shapes (circle for volume,
square for minutes), and direct labels at each line's last value, kept
14px apart when they would collide. The colours are the reference
palette's first two slots, validated against this app's own surfaces
(`#ffffff` light, `#1d1c21` dark) with the dataviz validator: all checks
pass in both modes (CVD ΔE 24.7 / 26.8, contrast ≥ 3:1). Text stays in the
text colours, never the series colour.

**Hover, and a table for everything else.** Hovering a week shows a
crosshair and a tooltip with both values; the hit area is the whole week's
column, wider than any marker. The tooltip is for mice. For screen readers
the SVG has a one-sentence summary (`role="img"`), and *Show as a table*
lists every week with "—" for missing values.

**Drawn at its real size.** The first version scaled a 640-wide SVG down to
the screen, which on a phone shrank 11px labels to about 5px. The chart now
measures its container (`ResizeObserver`) and draws at that width, so text
stays 11px; week labels thin out to about one per 56px (every third week
on a phone), and the tooltip is kept inside the chart's edges. In tests
(no `ResizeObserver`) it draws at 640.

**Fresh after a write.** Saving, editing or deleting a session invalidates
every stats query, so Home shows the new totals even inside the 30 seconds
they would otherwise stay fresh.

**Recent sessions share the list's cache.** They are the first three of the
Sessions list's first page, so Home and `/sessions` make one request
between them.

## Also fixed

- Rows that are links (the Plans and Sessions lists, Recent sessions) were
  underlined: their style was written for buttons. Found on the dashboard
  screenshot; `.catalog-item` now has `text-decoration: none`.
- The Part 7 fix (no `GET` of a session after deleting it) was checked in
  the browser this time: `GET → 200`, `DELETE → 204`, nothing after.

## Setup prerequisites

- Part 7's prerequisites. No new packages.

## Validation (run in order)

```sh
npm run check:api   # API types match the contract.
npx tsc -b          # no output, exit 0
npm run lint        # no output, exit 0
npm test            # Tests  118 passed (118)
npm run build       # built in …
npm run dev         # with the API running
```

In the browser, signed in, with sessions this week (some from a plan):

1. Home. Expected: two `GET /stats/progress` requests, `bucket=day` from
   this Monday to next Monday (UTC) and `bucket=week` for twelve weeks;
   the card's numbers equal the sums of the `day` answer; the strip marks
   today and the days with sessions.
2. The chart: a point per week with a value, gaps elsewhere; percentages
   whole numbers; hovering a week shows the crosshair and tooltip; *Show as
   a table* lists twelve weeks with "—" where there is no value.
3. At 375px wide, in dark mode: no horizontal scroll; chart text the same
   size as on a desktop; the tooltip inside the chart.
4. Delete a session, go Home. Expected: the totals drop, from new
   `GET /stats/progress` requests.

Safeguards that should fail (mutation checks), one at a time:

1. `weekStart()` in local time instead of UTC: seven tests fail.
2. A missing week plotted as 0 (`?? 0`): three tests fail.
3. The line bridges a gap (`drawing` not reset on null): "asks for twelve
   weeks and leaves a gap…" fails.
4. Deleting a session leaves the stats cached: "asks for the totals again
   after a session is deleted" fails.
5. Percentages not rounded: "asks for twelve weeks…" fails.
6. The week card asks for two weeks: "adds up the server's days…" fails.

## What was actually validated

On 2026-10-21 (Windows 11, Node 24, API from Docker):

- `check:api`, `tsc -b`, `lint`, `test` (117/117, three runs in a row),
  `build`: all passed.
- Mutation checks 1 to 6 each failed the named tests and passed again once
  reverted.
- Before writing the chart, `curl` against the real API: buckets without
  sessions are left out, weeks start on Monday in UTC, percentages are
  unrounded floats. The design follows from these.
- Browser steps 1 to 4 against the real API with the throwaway account
  (dev server on port 5176): card 4 sessions / 3 sets / 22 minutes,
  matching the `curl` answer; chart one week, Volume 110% and Minutes 50%;
  tooltip "Week of Oct 19"; after deleting a session, 3 / 2 / 22. No
  console errors.
- Step 3 found the unreadable labels (above); fixed and re-measured: SVG
  343px wide at 375, text 11px, four week labels, tooltip 218–338px inside
  a chart spanning 16–359px.
- Added on the second check: a test that *finishing* a session refreshes
  the stats (it fails with the refresh in `useStoreSession()` removed).
  Editing uses the same call and has no test of its own. The chart with
  many weeks of real data was only seen in tests; the account has one
  week.

## Automated tests

`src/features/dashboard/dashboard.test.tsx`, with the clock fixed to
Wednesday 21 October 2026, 10:00 UTC (only `Date` is faked):

- the week card sums the server's days for Monday 19 to Monday 26 UTC,
  ignores a day outside it, and the strip labels each day and marks today;
- an empty week shows zeros and "No sessions yet this week.";
- the chart asks for twelve weeks (3 August to 26 October), has twelve
  table rows, "110%" for `110.00000000000001`, "—" for null and for a
  missing week, two separate line pieces around a gap, and a summary;
- two consecutive weeks are one line;
- no planned work: a sentence instead of a chart;
- recent sessions are the three newest;
- finishing or deleting a session makes Home ask for the totals again.

`src/features/dashboard/api.test.ts`: the UTC week starts on Monday,
Sunday 23:59 is still the old week, Monday 05:00 in Jakarta is last
week's, and it crosses a year end.

## Troubleshooting

- **A session from this morning is on yesterday in the strip.** Days are
  UTC days; before 07:00 in UTC+7 it is still yesterday in UTC.
- **The chart is a few dots without lines.** Each dot is a week with a
  value; lines only join consecutive weeks.

## Limitations and deferred work

- UTC weeks and days, as the server counts them. Local weeks would need
  the API to bucket in the user's time zone.
- The tooltip is mouse-only; keyboard and screen-reader users have the
  summary and the table.
- No per-exercise progress yet (`exercise_id` on `/stats/progress`); it
  would fit on an exercise's page in the catalog.
- "Minutes" counts every timed kind (cardio, mobility, stretching), as the
  API does; mobile's card says "cardio".
