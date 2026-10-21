# Part 5 — Plans: our first writes

**Question:** how do we write safely when the network can drop a response, or
when another device edits the same record?

## Scope

- Plans: list, create, edit, delete with confirmation.
- `ExerciseEditor`, shared with sessions (Part 6): one group of fields per
  exercise, shaped by its kind.
- The three write safeguards: `Idempotency-Key` on create, `If-Match` on
  `PUT` and `DELETE`, and the answers to `412`, `409 plan_in_use` and
  `409 resource_in_use`.
- "Discard this plan?" before leaving unsaved changes, as on mobile.

## Changes

| File | Change |
| --- | --- |
| `src/api/client.ts` | `unwrapVersioned()`: the body and its `ETag` |
| `src/api/concurrency.ts` | `Versioned<T>`, `ifMatch()`, `useIdempotencyKeys()` (one key per body) |
| `src/shared/exercise.ts` | Drafts, validation against the contract, `ExerciseValue` (the `oneOf` as a union on `kind`) |
| `src/shared/ExerciseEditor.tsx` | Rows of exercises, sets, minutes; `Field` (label, control, error) |
| `src/shared/ConfirmDialog.tsx` | A modal question on `<dialog>` and `showModal()` |
| `src/shared/ExercisePicker.tsx` | Name check and `PickedExercise` moved to `exercise.ts` |
| `src/features/plans/api.ts` | `usePlans`, `usePlan`, `useCreatePlan`, `useUpdatePlan`, `useDeletePlan` |
| `src/features/plans/PlanForm.tsx` | Name, notes, exercises; validation; the unsaved-changes guard |
| `src/features/plans/PlansPage.tsx` | `/plans` |
| `src/features/plans/NewPlanPage.tsx` | `/plans/new` |
| `src/features/plans/PlanPage.tsx` | `/plans/:id`: edit, conflicts, Save as new plan, delete |
| `src/routes.tsx` | The three plan routes |
| `src/index.css` | Form, sets, dialog, buttons |
| `src/test/app.tsx` | A fake of the plan endpoints with versions, replays and plans in use; a `<dialog>` shim for jsdom |
| `src/features/plans/plans.test.tsx` | 18 tests |
| `src/shared/exercise.test.ts` | 4 tests |

## Design decisions

**Two failures, two headers.** A write can fail in two ways the user cannot
see. The response is lost, so the client cannot tell whether the create
happened: `Idempotency-Key` makes the retry safe. Or another device saved
in between: `If-Match` makes the write fail instead of erasing that change.

**One key per body, for as long as the form is open.**
`useIdempotencyKeys()` returns `keyFor(body)`: the same body always gets the
same key. A retry after a lost response is replayed by the server, and a
test proves one plan results. An edited plan is a different request and gets
a new key (the server answers `422 idempotency_key_reused` to an old key
with a new body). Undoing the edit brings the first key back, which matters
if that first request was saved and only its answer lost. Part 3's
`useIdempotencyKey()` (one key, `renew()` on every change) is kept for the
profile, where a single field makes the difference moot.

**The ETag travels with the record.** `GET`, `POST` and `PUT` on one plan
carry an `ETag`; the client keeps it in the query cache as
`{ data, etag }` and treats it as opaque. List items carry none, so delete
lives on the plan's page, which has read it.

**Edit the version you saw.** The editor keeps its own `base` version,
taken when the page opens. The cache can move on underneath it (a refetch
on window focus, every 30 seconds of staleness), but `If-Match` still
names the version on screen. Using the cache's latest tag would let a
background refetch quietly approve overwriting a change the user never
saw; a test pins this.

**A 412 offers a choice.** "This plan changed on another device." *Reload*
takes the latest version into the form and drops the user's edits. *Keep my
copy* takes only the latest version tag, so the next save is a deliberate
overwrite. The editor remounts the form for Reload and leaves it alone
otherwise.

**A plan in use keeps its targets.** Sessions refer to plan exercises by
id, so the server refuses to change the exercises of a plan sessions use
(`409 plan_in_use`) and compares them as parsed values. A rename sends the
exercises back as they came and succeeds, which needs the editor to turn
a saved exercise back into exactly the same value: numbers are shown with
`String()` and parsed back, `null` stays `null`, and a unit test checks
the round trip. When the targets did change, *Save as new plan* posts the
form as a new plan (the same values, its own idempotency key) and leaves
the original alone. It is a second submit button inside the form
(`value="copy"`), so it goes through the same validation.

**Delete asks, and the server may still say no.** "Delete this plan?" is a
modal `<dialog>`; the browser traps focus, makes the page inert, and treats
Escape as Cancel. `409 resource_in_use` (sessions use it) keeps the plan
and says why. `404` on delete counts as done: the plan is gone either way.

**The form speaks the contract.** `ExerciseValue` is the contract's
`oneOf` as a TypeScript union on `kind`: strength carries `sets`; cardio,
mobility and stretching carry `minutes` and `avg_bpm`. The draft keeps
numbers as typed strings and both sets of fields, so switching kind and
back loses nothing, and only the current kind's fields are sent. Limits
come from the contract: 1–200 characters for names (in code points),
1–100 sets, reps 1–1000, weight 0–2000 kg ("0 for bodyweight"), minutes
over 0 and at most 1440, BPM 1–300 or empty. A decimal comma ("62,5") is
read as a point. A catalog exercise keeps its kind; the server would
refuse another.

**Errors show on submit, next to the field.** Nothing is red before the
first save. Then each wrong field has `aria-invalid` and its message
(`aria-describedby`), and an alert says that some fields need fixing.

**Leaving asks, saving does not.** `useBlocker` stops in-app navigation
while the form differs from what it opened with, and `beforeunload` covers
closing the tab. The guard lives in `PlanForm`. A page that has saved
renders `<Navigate>` instead of the form, which removes the guard in the
same commit, so no "are you sure" follows a save. Navigation to
`/sign-in` and `/welcome` is never blocked: there the app is moving the
user (session ended, profile gone), and blocking would leave them on a
page that no longer works.

**The picker is a panel, not a dialog.** "Add exercise" opens the picker
under the rows; each pick adds a row and the panel stays open until Done,
so a plan of five exercises is five clicks, not ten.

## Setup prerequisites

- Part 4's prerequisites. No new packages.

## Validation (run in order)

```sh
npm run check:api   # API types match the contract.
npx tsc -b          # no output, exit 0
npm run lint        # no output, exit 0
npm test            # Tests  74 passed (74)
npm run build       # built in …
npm run dev         # with the API running
```

In the browser, signed in with a profile (`$TOKEN` below is an access token
for the same account, from `POST /api/v1/auth/login`):

1. `/plans`: "No plans yet. Create your first training plan."
2. New plan: name "Leg day"; Add exercise → Front Squat, 5 reps, `62,5` kg;
   a free-form "Easy run", Cardio, 20 minutes. Save plan. Expected:
   `POST /plans → 201`, back on `/plans` with the plan listed;
   `curl` shows `weight_kg: 62.5` and the catalog `exercise_id`.
3. Open it. With `curl`, `PUT` the plan with the `ETag` from a `GET` (a
   second device). In the browser change the name and save. Expected:
   `PUT → 412`, "This plan changed on another device."
4. Keep my copy, then Save plan. Expected: `GET → 200`, `PUT → 200`, the
   browser's name wins.
5. With `curl`, `POST /sessions` with `plan_id` and a `plan_exercise_id`.
   Rename the plan only. Expected: `PUT → 200`.
6. Change a set's reps and save. Expected: `PUT → 409`, "Sessions already
   use this plan's targets…". Save as new plan. Expected: `POST → 201`, two
   plans listed, the original's targets unchanged.
7. On the original, Delete plan → Delete. Expected: the dialog is modal with
   focus on Cancel; `DELETE → 409`, "Sessions use this plan, so it was not
   deleted…".
8. On the copy, change the name, click Home. Expected: "Discard this
   plan?"; Escape keeps editing. Then Delete plan → Delete. Expected:
   `DELETE → 204`, back on `/plans` without another question.
9. At 375px wide: no horizontal scroll; Reps and Weight side by side.

Safeguards that should fail (mutation checks), one at a time:

1. `etag: base.etag` → `etag: opened.etag` in `PlanPage.tsx` (save with the
   cache's latest version): "does not let a background refetch move the
   version it edits" fails.
2. `idempotencyKey: keyFor(plan)` → `crypto.randomUUID()` in
   `NewPlanPage.tsx`: "retries a create whose response was lost…" and
   "uses a new key once the plan is edited…" fail.
3. `useIdempotencyKeys()` remembers only the last body
   (`keys.current.clear()` before a new key): "…and the old one again if the
   edit is undone" fails.
4. `ifMatch()` returns `{}`: five tests fail.
5. The blocker returns `false`: "asks before leaving a changed plan" fails.
6. Keep my copy also remounts the form: "can keep its own copy…" fails.
7. The submitter's intent is ignored: "offers Save as new plan…" fails.

## What was actually validated

On 2026-10-21 (Windows 11, Node 24, API from Docker):

- `check:api`, `tsc -b`, `lint`, `test` (74/74), `build`: all passed.
- Mutation checks 1 to 7 each failed the named tests, and passed again once
  reverted.
- Browser steps 2 to 9 against the real API, with the throwaway account from
  Part 4, in the Claude desktop app's built-in browser (dev server on port
  5175); the second device and the session in steps 3 and 5 were `curl`
  calls against the API, signed in as the same account. The network log
  showed exactly the statuses listed. Step 1 was seen in tests only (the
  account had no plans, but the page was not opened before step 2).
- Step 9 found a bug: inputs kept their default width of about 20
  characters, so the page was 403px wide in a 375px viewport. Fields now
  fill and shrink with their column (`.field input { width: 100%;
  min-width: 0 }`); re-measured at 375.
- The browser tool lists the `204` of the delete as `ERR_ABORTED`: openapi-fetch
  never reads a `204` body, and the page had moved on. The status arrived
  and was handled.
- The `Idempotency-Key` and `If-Match` header values are checked by the
  tests; the browser tool shows statuses, not headers.
- **Not** validated in the browser: a lost response (the tests simulate it
  by saving and then failing the request), and `beforeunload` on closing
  the tab.

## Automated tests

`src/features/plans/plans.test.tsx`, over the fake in `src/test/app.tsx`,
which versions each plan, replays creates per key (422 for another body),
and keeps the exercises of a plan in use:

- the list shows plans newest first with their exercises, or the empty
  message;
- a create sends the contract's shape (catalog and free-form, two sets, a
  decimal comma, a timed exercise with `avg_bpm: null`) with a UUID key,
  then lists the plan;
- an empty or wrong form marks each field and sends nothing;
- a create whose response is lost is retried with the same key and makes
  one plan;
- an edited plan gets a new key, and undoing the edit brings back the
  first;
- an edit sends `If-Match` with the version read;
- a `412` offers Reload, which shows the other change and then saves with
  the new version;
- Keep my copy saves the user's version over the other change;
- a background refetch does not move the version being edited;
- renaming a plan in use sends its exercises back unchanged and succeeds;
- changing a used plan's targets offers Save as new plan, which leaves the
  original alone;
- moved exercises are saved in their new order;
- an unknown plan shows "Plan not found";
- delete asks first (Cancel sends nothing), then sends `If-Match`;
- a plan in use is not deleted, and the page says why;
- leaving a changed plan asks (Keep editing stays, Discard leaves);
- leaving an unchanged plan does not ask.

`src/shared/exercise.test.ts`: saved exercises round-trip to the same value;
decimal commas and trimming; only the current kind's fields are sent and the
others are kept; the contract's limits.

`<dialog>` in jsdom has no `showModal()`. The harness adds one that only
sets `open`; focus trapping and Escape were checked in the browser.

## Troubleshooting

- **Every save of an old tab gets "changed on another device".** Expected
  when the plan was saved elsewhere since the page opened. Keep my copy if
  this tab's version should win.
- **"Sessions already use this plan's targets" after only renaming.** The
  exercises sent back differ from the saved ones; check that nothing in a
  row was touched (an edited and restored number is still the same value).
- **`428 precondition_required`.** The API runs with
  `REQUIRE_IF_MATCH=true` and a write went out without a version; every
  plan write here sends one.

## Limitations and deferred work

- Save as new plan keeps the name, so the list shows two plans with the
  same name; renaming is left to the user. The list could show the
  creation date.
- No way to delete from the list: a delete needs the plan's ETag, which
  only a read of the plan provides.
- `ExerciseEditor` has no drag and drop; Move up and Move down are buttons.
- The dialog shim in tests does not trap focus or handle Escape; those
  rest on the browser and were checked by hand.
