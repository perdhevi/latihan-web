# Part 10 — Your data: export and erase

**Question:** can users take their data with them, and leave?

## Scope

On `/profile`, a *Your data* section:

- **Export my data**: `GET /account/export`, saved as a file under the
  server's name.
- **Erase my account** (web only; mobile has no erase): a typed
  confirmation, `DELETE /account`, then this browser forgets everything it
  held for the account and shows the sign-in page with a notice.

## Changes

| File | Change |
| --- | --- |
| `src/features/account/api.ts` | `useExport()`, `useErase()`, `filenameFrom()`, `saveFile()` |
| `src/features/account/YourData.tsx` | The section and the erase dialog |
| `src/features/profile/ProfilePage.tsx` | Shows *Your data* |
| `src/api/client.ts` | `unwrapWithResponse()`: the body and the whole response, for headers |
| `src/auth/session.ts` | `forget()`: clear the tokens without asking the server |
| `src/auth/context.ts`, `AuthProvider.tsx` | `forget(notice)` and `notice` |
| `src/auth/SignInPage.tsx` | Shows the notice |
| `src/index.css` | The notice |
| `src/test/app.tsx` | Export and erase fakes; logout calls counted; `renderApp` returns the token store; the `console.error` guard keeps its own spy |
| `src/features/account/account.test.tsx` | 7 tests |

## Design decisions

**The export is the server's file.** The response is read as a `Blob`
(`parseAs: 'blob'`) and handed to the browser as a download, never parsed
and re-serialised, so the user keeps exactly the document the server wrote
(`"format": "latihan-export/1"`). It goes through the authenticated client,
so an expired access token is refreshed as for any other request. A plain
link to the URL could not send the bearer token.

**The server names the file.** The name comes from `Content-Disposition`
(`filename*=UTF-8''…` or `filename="…"`), reduced to a name, never a path:
`../../etc/passwd` becomes `passwd`, and nothing usable becomes
`latihan-export.json`. The object URL is released ten seconds later, once
the download has read it.

**Its failures say what happened.** The server allows 4 exports an hour; a
`429` shows the wait ("Try again in 15 minutes."). If a read fails part-way
the server aborts the connection rather than send half a document; the
client then sees a network error and adds "Nothing was saved; try again."

**Erasing asks for a word.** A plain Yes is one click from losing
everything; the dialog asks the user to type `ERASE` (exactly), and says
what is deleted (profile, measurements, plans, sessions, the login), that
it cannot be undone, to export first, and what the server keeps: backups
until they expire, and an audit entry under an ID that no longer
identifies anyone. The dialog is mounted only while open, so the typed
word starts empty each time.

**After the erase, forget; do not log out.** There is no login left to log
out of, so the client does not call `/auth/logout`; `forget()` just clears
the tokens. It also clears this user's session in progress
(`localStorage`); the cached data goes with the sign-out, as in Part 3.
A test checks that the tokens, the draft and the cache are gone and that
no logout was sent.

**The notice lives in the auth state.** The first version passed "Your
account and its data were erased." as navigation state to `/sign-in`. In
the tests the page arrived without it: clearing the tokens makes the
sign-in guard navigate to `/sign-in` on its own, with its own state, and
which navigation lands last depends on render timing. The notice is now
held by the auth provider (`forget(notice)`), shown by the sign-in page
however the user got there, and cleared by the next sign-in.

**A failed erase can be repeated.** The server erases in one transaction
and repeating it is harmless, so a failure keeps the user signed in and
says "erasing again finishes the job"; the dialog stays open for that.

## Setup prerequisites

- Part 9's prerequisites. No new packages.

## Validation (run in order)

```sh
npm run check:api   # API types match the contract.
npx tsc -b          # no output, exit 0
npm run lint        # no output, exit 0
npm test            # Tests  143 passed (143)
npm run build       # built in …
npm run dev         # with the API running
```

In the browser:

1. Signed in, `/profile` → *Export my data*. Expected: `GET
   /account/export → 200`, a file `latihan-export.json` starting with
   `{"format":"latihan-export/1"`, and "Downloaded latihan-export.json.".
2. Create a throwaway account and profile, add a measurement, start a
   session. `localStorage` holds `latihan.activeSession.v1.<id>`,
   `sessionStorage` the refresh token.
3. *Erase my account*: the *Erase* button stays disabled until `ERASE` is
   typed. Confirm. Expected: `DELETE /account → 204`, no
   `POST /auth/logout` after it, `/sign-in` with "Your account and its data
   were erased.", both storages empty.
4. `curl` a sign-in with that account. Expected: `401 invalid_credentials`.

Safeguards that should fail (mutation checks), one at a time:

1. The server's file name ignored: "downloads the server's document under
   the server's file name" fails.
2. A path kept in the file name: "comes from Content-Disposition, as a name
   and never a path" fails.
3. The session draft survives an erase: "erases, then forgets everything…"
   fails.
4. Erase signs out (sending a logout) instead of forgetting: both erase
   tests that complete fail.
5. No typed confirmation: "asks for the word first, and Cancel sends
   nothing" fails.
6. No notice on the sign-in page: both erase tests that complete fail.

## What was actually validated

On 2026-10-21 (Windows 11, Node 24, API from Docker):

- `check:api`, `tsc -b`, `lint`, `build`: passed; `test` 143/143 in four
  runs in a row (two of them slow, 41–43 s).
- Mutation checks 1 to 6 each failed the named tests and passed again once
  reverted.
- Part 9 validated again first: five full runs, including one at 55 s
  that passed under the Part 9 timeouts.
- Browser steps 1 to 4 against the real API (dev server on port 5176).
  Step 1 with the page's link click replaced by a recorder, so no file was
  actually downloaded: the recorder got `latihan-export.json`, 2787 bytes,
  `"format":"latihan-export/1"`. Steps 2 to 4 with a new throwaway account;
  the account used by earlier parts was not erased and still signs in.
- **Not** validated in the browser: the `429` after four exports (not worth
  burning the hourly limit; a test covers it) and an interrupted export
  (a test covers it).

## Automated tests

`src/features/account/account.test.tsx` (object URLs and the link click
are recorded; jsdom does not download):

- the export saves the server's document under the server's file name;
- a `429` shows the wait and saves nothing;
- a broken download says nothing was saved;
- the file name comes from `Content-Disposition` (quoted, encoded), never a
  path, with a default;
- erase needs exactly `ERASE`, and Cancel sends nothing;
- erase clears the tokens, the session draft and the cached profile, sends
  no logout, and shows the notice on `/sign-in`;
- a failed erase keeps the user signed in, says to erase again, and a
  second try finishes.

## Troubleshooting

- **"Too many requests. Try again in … minutes." on export.** The server's
  per-user limit (`RATE_LIMIT_EXPORT`, 4 an hour by default).
- **The erase failed.** Nothing, or only part, was erased; erasing again
  finishes it, and the account is still usable until then.

## Limitations and deferred work

- Erase is offered only on `/profile`, so an account that never created a
  profile has to make one first (the API itself does not need it).
- Other tabs signed in to the erased account find out at their next
  request (their refresh is refused, and they sign out); they do not show
  the notice.
- Drafts of *other* accounts in this browser are kept; only this user's is
  removed.
