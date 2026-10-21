# Part 6 — Recording a session

**Question:** where does a workout live before it is saved?

## Scope

- Start a session from a plan or train freely ("Start from a plan?"), from
  Home or `/session/active`; Resume while one is in progress.
- The session in progress: targets as a guide, logged activities, name,
  time and notes; kept in the browser on every change.
- Finish (`POST /sessions`) with an idempotency key stored with the draft;
  Discard.
- Correct a saved session later: `/sessions/:id/edit`, `PUT` with
  `If-Match`.

Out of scope: the session's own page (`/sessions/:id` keeps a placeholder
with an Edit link until Part 7) and the session list.

## Changes

| File | Change |
| --- | --- |
| `src/features/active-session/store.ts` | The draft: reducer, `keyFor()`, `parseDraft()`, a store mirrored to storage |
| `src/features/active-session/context.ts`, `ActiveSessionProvider.tsx` | The store per user; `useActiveSession()` (`useSyncExternalStore`) |
| `src/features/active-session/StartSession.tsx` | Start / Resume, and the "Start from a plan?" dialog |
| `src/features/active-session/ActiveSessionPage.tsx` | `/session/active` |
| `src/features/sessions/api.ts` | `useSession`, `useCreateSession`, `useUpdateSession` |
| `src/features/sessions/validate.ts` | `validateSession()`; `datetime-local` ↔ ISO |
| `src/features/sessions/SessionFields.tsx` | Name, When, Notes |
| `src/features/sessions/SessionEditPage.tsx` | `/sessions/:id/edit` |
| `src/features/sessions/SessionPage.tsx` | `/sessions/:id` placeholder with an Edit link |
| `src/features/dashboard/HomePage.tsx` | Start / Resume button |
| `src/app/AppShell.tsx` | Provides the draft store, keyed by the user id |
| `src/shared/ConfirmDialog.tsx` | `Modal` split out of `ConfirmDialog` |
| `src/shared/UnsavedChanges.tsx` | The Part 5 guard as a component, now shared |
| `src/shared/ChangedElsewhere.tsx` | The Part 5 `412` panel, now shared |
| `src/shared/ExerciseEditor.tsx` | Generic over the row type; `create` and `rowNote` |
| `src/features/plans/PlanForm.tsx`, `PlanPage.tsx` | Use the shared guard and panel |
| `src/routes.tsx` | `/session/active`, `/sessions/:id`, `/sessions/:id/edit` |
| `src/index.css` | Plan choices, targets |
| `src/test/app.tsx` | A sessions fake; `localStorage` cleared after each test; `findBy…` waits up to 5 s |
| `vite.config.ts` | Test timeout 15 s (committed separately, see below) |
| `src/features/active-session/session.test.tsx` | 12 tests |
| `src/features/active-session/store.test.ts` | 7 tests |

## Design decisions

**The draft is the one thing the client owns.** The API has no "session in
progress"; mobile keeps it in SQLite until Finish. Here it is a reducer
whose state is written to `localStorage` on every change. A reload, a
crash or a closed tab keeps it; Home then shows *Resume active session*.
Nothing reaches the server before Finish.

**A store outside React.** `createDraftStore()` holds the state, writes it,
and notifies; components read it with `useSyncExternalStore`. Another tab's
change arrives through the `storage` event, so two tabs never edit two
different copies for long. If the browser refuses storage (private
mode, a full quota) the draft lives in memory and the page says "Not saved
on this device… keep this tab open" instead of failing.

**One draft per account.** The storage key carries the user id
(`latihan.activeSession.v1.<id>`), and the provider sits inside the
profile gate, keyed by that id. Another account on the same browser never
sees it; the same account finds it again after signing back in.

**Targets are a snapshot.** Starting from a plan copies its exercises into
the draft. Logging a target adds a row that starts from the planned values
and keeps `plan_exercise_id`; the target then shows *Logged* and cannot be
logged again, because the server refuses a `plan_exercise_id` that repeats.
Removing the row frees the target. Extra activities have
`plan_exercise_id: null`, which the API counts as unplanned.

**The key lives with the draft.** Finish serialises the body, looks it up
in the draft's `attempts`, and uses its key, or makes one and **stores it
in the draft before sending**. If the response is lost and the user
reloads, the next Finish sends the same body with the same key, and the
server replays the session it already made. The draft is cleared only
after `201`. A body that changed gets a new key (the server refuses a key
with another body), and going back to an earlier body finds its old key.

**A plan can vanish under a draft.** A plan only becomes "in use" when a
saved session refers to it, so it can be deleted while a draft follows it.
Finish then gets `400 invalid_reference`; the page offers *Keep the
activities, without the plan*, which drops `plan_id` and every
`plan_exercise_id` and keeps the rest.

**Time is kept as an ISO string.** `performed_at` is when Start was
pressed. The *When* field is a `datetime-local` input, which shows local
time; the draft keeps the ISO value, so a field the user never touches
goes back with its seconds. The API buckets in UTC (Part 8).

**Editing a saved session is a Part 5 edit.** The editor opens a version,
saves with `If-Match` for that version, and answers `412` with the same
*Reload* / *Keep my copy* panel, now shared as `ChangedElsewhere`. Planned
rows keep their `plan_exercise_id`. The unsaved-changes guard is now a
component, `UnsavedChanges`, used by both forms. After Finish the session's
`ETag` is already in the cache, so editing it straight away costs no read.

**Shared pieces grew, not forked.** `ExerciseEditor` is generic over the
row type: a session row is a draft plus `plan_exercise_id`, edits keep
fields they do not know, `create` makes rows for picked exercises, and
`rowNote` shows "Target: …". `Modal` is the `<dialog>` under
`ConfirmDialog` and the plan chooser.

## The flaky tests (before Part 6)

Validating Part 5 again found one test that failed one run in six: Vitest's
5 s limit, hit by a plan form test that runs at 4–5 s (most of it in
`getByRole` over a large form) when the machine is busy. Removing
user-event's keystroke delay broke other tests, so it was reverted. The fix,
committed on its own before Part 6: a 15 s test timeout in
`vite.config.ts`. Part 6's first runs then showed the same thing one level
down: the first test in a file sometimes waited more than `findBy…`'s 1 s
for the app's cold first render. The harness now gives `findBy…` 5 s.
Six full runs in a row pass after each change.

## Setup prerequisites

- Part 5's prerequisites. No new packages.

## Validation (run in order)

```sh
npm run check:api   # API types match the contract.
npx tsc -b          # no output, exit 0
npm run lint        # no output, exit 0
npm test            # Tests  93 passed (93)
npm run build       # built in …
npm run dev         # with the API running
```

In the browser, signed in with a profile and at least one plan (`$TOKEN`:
an access token for the same account):

1. Home → *Start a new session*. Expected: "Start from a plan?" lists the
   plans and "No plan, train freely".
2. Choose a plan. Expected: `/session/active`, the plan's name, its targets
   with "1 set · 5 × 62.5 kg"-style summaries, "0 activities logged · Saved
   on this device".
3. *Log* each target, change a value, reload. Expected: both rows and the
   changed value are still there; the targets say *Logged*; `localStorage`
   has `latihan.activeSession.v1.<user id>`.
4. *Finish session*. Expected: `POST /sessions → 201`, `/sessions/<id>`, the
   key gone from `localStorage`; `curl` shows each activity's
   `plan_exercise_id` and the changed value.
5. *Edit this session*, rename, *Save session*. Expected: `PUT → 200`,
   with no `GET` before it.
6. `curl` a new plan, start a session from it, log a target, `curl` DELETE
   the plan, Finish. Expected: `POST → 400`, "The plan this session follows
   no longer exists…"; *Keep the activities, without the plan*, Finish →
   `201`; `curl` shows `plan_id: null`.
7. At 375px wide: no horizontal scroll. *Discard session* → *Discard*.
   Expected: "No session in progress.", the key gone from `localStorage`.

Safeguards that should fail (mutation checks), one at a time:

1. The store never writes (`saved = true` instead of `write(…)`): eight
   tests fail, among them "survives a reload…".
2. The draft is cleared when Finish is pressed rather than after `201`:
   "keeps the draft and its key when Finish fails…" and two more fail.
3. `keyFor()` always makes a new key: "keeps the draft and its key…" and
   "gives a body the key it was first sent with" fail.
4. The attempt is not stored before sending: "keeps the draft and its
   key…" and "sends a new key once the session changed…" fail.
5. `logTarget` no longer refuses a repeat: "logs a target once…" fails.
6. One storage key for every account: four tests fail.
7. `validateSession()` drops `plan_exercise_id`: "logs each target once,
   … and finishes with its links" fails.

## What was actually validated

On 2026-10-21 (Windows 11, Node 24, API from Docker):

- `check:api`, `tsc -b`, `lint`, `test` (93/93, six runs in a row), `build`:
  all passed.
- Mutation checks 1 to 7 each failed the named tests, and passed again once
  reverted.
- Browser steps 1 to 7 against the real API, with the throwaway account
  from Part 4, in the Claude desktop app's built-in browser (dev server on
  port 5175); `curl` as the same account for the reads and for the plan in
  step 6. Statuses as listed. Step 3's reload first looked empty because
  the page was read before the session was restored; read again, both rows
  were there.
- **Not** validated in the browser: a lost response on Finish (the tests
  simulate one: saved by the server, then a network error, then a remount),
  two tabs editing one draft, and storage refused (a test makes `setItem`
  throw).

## Automated tests

`src/features/active-session/session.test.tsx`, the whole app over the fake
API, whose sessions check `plan_id` and `plan_exercise_id` like the server
and replay creates per key:

- Start asks which plan; the targets show as a guide and the draft is
  stored;
- training freely is "Workout", with no plan;
- a target is logged once from its planned values; Finish sends `plan_id`,
  `performed_at` from Start, `plan_exercise_id` per row (null for extras)
  and a UUID key, then clears the draft;
- the draft survives a remount, and Home offers *Resume*;
- a Finish that fails keeps the draft and its key; after a remount the
  retry sends the same key and one session exists;
- a changed body after a failed Finish gets a new key;
- a plan deleted meanwhile: *Keep the activities, without the plan*, then
  Finish without `plan_id`;
- no activity, no request;
- Discard asks, then clears;
- another account's draft is not shown;
- refused storage says "Not saved on this device";
- editing a saved session sends `If-Match`, offers Reload after a change
  elsewhere, and sends an untouched time back with its seconds.

`src/features/active-session/store.test.ts` (Node): Start runs once; a
target is logged once; detaching the plan unlinks every row; a body keeps
its key; the store writes and a new store reads it back; refused storage
keeps working in memory; foreign or broken values are ignored.

## Troubleshooting

- **"Resume active session" after finishing on another tab.** The other
  tab's Finish cleared the draft; this tab hears about it from the
  `storage` event. If it does not, reload.
- **Finish says the plan no longer exists.** It was deleted while you
  trained; keep the activities without it.
- **"Not saved on this device".** Private browsing or full storage: the
  draft is in this tab only.

## Limitations and deferred work

- Signing out keeps the draft in `localStorage` under the user's id, so the
  same account can resume it. On a shared computer that is data left
  behind; Part 10's *Erase my account* removes it, and a sign-out option to
  discard it could follow.
- No navigation item is highlighted on `/session/active` (it is not under
  `/sessions`).
- A logged target can change kind (a planned run logged as strength); the
  server accepts it, and Part 7's comparison will show it.
- Two tabs editing the same draft at once: the last write wins, field by
  field as the `storage` events arrive.
