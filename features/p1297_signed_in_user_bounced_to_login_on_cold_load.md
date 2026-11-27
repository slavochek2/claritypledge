---
status: in-progress
type: bug
rank: 5
severity: high
workstream: infrastructure
date_reported: '2026-09-10'
created_date: '2026-09-10'
drafted_by: opus
exec_model: opus
exec_effort: high
tags:
  - auth
  - session
  - routing
  - regression-risk
disclosure: public
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: e2e/p1297-reproduce.spec.ts
  unit_test_file: src/tests/p1297-reproduce.test.tsx
  root_cause: "AuthProvider reports 'checked, not loading, no user' whenever the profile fetch fails (3 tries, 1 s apart) or getSession() returns a retryable refresh error, although a usable stored session is held; every auth gate redirects on exactly that state, nothing retries, and the token stays in storage"
  confidence: high
  surfaces_in_scope: [auth-provider-profile-fetch-failure, auth-provider-retryable-refresh-failure, auth-provider-jwt-rejected-by-server]
  surfaces_deferred: []
  reproduced_at: 2026-11-26
  fix_shape: open
  fix_shape_why: "hold isLoading and retry (offline-readable pages that wait on isLoading would never settle, since the profile never loads offline) vs settle with the last-known profile cached for the stored session's user vs a new derived signed-out flag every gate reads"
spec_review_hash: 08878b657208e65bf18b8847cce7f5728df74c84100b3975069370b68328b946
spec_review_vendors: [codex, gemini]
---

# P1297: A signed-in user is bounced to /login on a cold page load, with a valid session in storage

## Summary

On a full page load of an auth-gated route, the app renders the login screen for a user who
is signed in — deterministically, while an unexpired Supabase session sits in `localStorage`.

## Root Cause

**Confirmed for now (2026-11-26, /reproduce; confidence high on the mechanism, the trigger on the
2026-09-10 device is not re-observed).** The provider, `src/auth/AuthContext.tsx`, turns "could
not confirm the session" into "nobody is signed in".

On a cold load auth-js returns the stored session from `localStorage` **without a network call**
when it is more than 90 s from expiry (`GoTrueClient.__loadSession`, `EXPIRY_MARGIN_MS`); nearer
expiry it refreshes first. The provider then has two ways to settle on `user: null,
isLoading: false, sessionChecked: true`, the exact state every auth gate redirects on:

- **A. Profile fetch fails.** `fetchProfileForUser` tries `get_profile_by_id` 3 times, 1 s apart.
  If all fail (network drop, 5xx, a token the server rejects) and there is no earlier profile in
  memory (a cold load never has one), it sets `user` to null and `isLoading` to false. Nothing
  retries later, so the login form stays up after the network recovers, and the session stays in
  storage. Any condition that lasts through 3 reloads (a phone's flaky radio, a VPN that drops
  requests, an unreachable server) gives the deterministic 3/3 of the original report.
- **B. Refresh fails on the network.** With the stored access token within 90 s of expiry (any
  phone reopened after an hour idle), auth-js refreshes on load. On a retryable failure it **keeps**
  the stored session but returns `{ session: null, error }` from `getSession()` and fires
  `INITIAL_SESSION` with `null` (`_emitInitialSession`). `initSession` treats the error as
  "checked, no session". P1441 already handles this case for writes (`session-guard.ts`,
  `'unreachable'`), but not for the provider. Timing, from the auth-js source (not measured on a
  device): one refresh retries with backoff for up to ~25 s (`_refreshAccessToken`, bounded by
  `AUTO_REFRESH_TICK_DURATION_MS` = 30 s), and a cold load runs it twice before `getSession()`
  returns (`_recoverAndRefresh` in `_initialize`, then `__loadSession`), so B settles ~50 s in.
  auth-js keeps retrying afterwards on its own (a 30 s ticker while visible, and on every
  hidden-to-visible change) and reports success as `TOKEN_REFRESHED`.

**Falsified: the revocation hypothesis** (that the server rejects the stored token). Probe on TEST
(self-hosted, active): sign a test account in, revoke every session with a global sign-out from a
second session, then replay the first session's still-unexpired access token.
`get_profile_by_id` → **200 with the profile**; `/auth/v1/user` → 403. So revocation does not make
the profile request fail. That is weak evidence about the token itself — `get_profile_by_id` is
callable by the anonymous role too, so a 200 does not prove the JWT was accepted — but it rules
revocation out as the trigger for A. At the next refresh auth-js fails non-retryably and
**removes** the stored session: a clean sign-out, not this bug. The probe the original report
suggested (`/auth/v1/user`) would have returned 403 and confirmed the wrong cause.

**Not P1236's defect** — verified: `git diff --name-only main...feature/p1236-...` returns
nothing under any auth, provider or context path. P1236 is where it was *observed*, and its
per-slice `getSession()` is a plausible amplifier, but the branch does not touch auth.

**Also ruled out: a held auth lock.** auth-js waits on its lock with no timeout (`-1`), so a hung
lock shows an endless loader, never the login page.

**Evidence.**
- `e2e/p1297-reproduce.spec.ts` against the dev server and TEST: the control (healthy network) stays
  on `/transcribe`. With `get_profile_by_id` unreachable for the first 4 s of a cold load, the test
  user lands on `/login?redirect=%2Ftranscribe`, still there 12 s after the network is back, token
  still in `localStorage`. **2/2 failures** (first run + retry).
- `src/tests/p1297-reproduce.test.tsx` (provider): both controls pass. A, with the profile failing 5 times
  and then recovering, still has `user === null` after 20 s. B, with a retryable refresh error,
  passes through the redirect state. (The B mock resolves `getSession()` at once; the real ~50 s
  is above. The fix does not depend on that timing.)

**Scenario audit (Track B).**

| Scenario on a cold load with a stored session | Today | Scope |
|---|---|---|
| Profile request fails briefly (network) | redirect to /login, token kept | in scope (A) |
| Profile RPC 5xx for a while | redirect to /login, token kept | in scope (A) |
| Server rejects the access token (401, e.g. expiry by the server clock, rotated signing key) | redirect to /login, token kept until its local expiry | in scope: refresh once, then a clean sign-out with the expired message |
| Refresh fails on the network (token near expiry) | redirect to /login, token kept | in scope (B) |
| Session revoked server-side, token unexpired | user shown (PostgREST accepts), clean sign-out at expiry | not affected, verified by probe |
| Offline cold load | redirect to /login | in scope: must not regress P1369 offline reading |
| Auth lock held by another tab | endless loader | not this bug |
| Profile genuinely absent (`not_found`) | user null | unchanged: no profile is not a signed-up user |

**All gates share the provider.** The redirect condition (`sessionChecked && !isLoading && !user`)
appears in about 30 pages, so the fix belongs in the provider, not per page.

## Invariants

- A page may only redirect to `/login` after the auth provider reports it has finished
  restoring, AND has been given a real chance to restore from storage. "Finished" must not be
  reachable while a stored credential has neither been accepted nor explicitly rejected.
- A revoked or unusable stored session must be **cleared** when it is discovered, not left in
  place. Leaving a dead token in `localStorage` makes every subsequent load look identical to
  a genuine sign-out and hides the real cause from anyone debugging it.

## Reproduction Steps

1. Sign in normally on a device.
2. Confirm `localStorage['sb-<project-ref>-auth-token']` exists and its `expires_at` is in the
   future.
3. Perform a **full page load** (not in-app navigation) of an auth-gated route — measured on
   `/transcribe`.
4. Observe: the login screen renders.
5. Reload twice more — same result each time.

**Reproduction rate:** 100% once it starts (3/3 loads). The transition into the state was not
captured; a session begins working and later enters it.

## Expected Behavior

A signed-in user with a usable stored session lands on the requested route. If the stored
session is genuinely unusable, the user is signed out cleanly — the dead credential is removed
and, ideally, the login screen explains that the session expired rather than appearing as if
the user had never signed in.

## Actual Behavior

The login screen renders, repeatedly, while a syntactically valid unexpired token remains in
storage. Signing in again works, and the state recurs later in the same working session —
observed **three times during one afternoon of device testing**, each requiring a manual
re-login before testing could continue.

## Affected Files

- `src/auth/AuthContext.tsx` — the defect: the restore path (Effect 1, `initSession`) and the
  profile fetch (Effect 2).
- `src/auth/stored-session.ts` (new) — stored-token checks, token-refused and transient-failure
  detection, the expired notice, the retry schedule and wait.
- `src/auth/session-end.ts` (new) — the session-end bookkeeping moved out of the auth listener
  unchanged (P1240's `session_lost_unexplained`, the P1369/P1421/P1545/P1515 clears), plus the
  "ended without being chosen" test. Moved so the listener stays under the quality ratchet's
  complexity limit; the P1240 and P1515 suites cover it.
- `src/lib/supabase.ts` — passes the derived `storageKey` explicitly (the same value supabase-js
  derives), so the provider checks the exact key the client uses.
- `src/app/data/api.ts` — `getProfileResult` reports `status`/`code` on `server_error`.
- `src/app/pages/login-page.tsx` — shows the expired notice once.
- `src/app/contexts/offline-status-context.tsx`, `src/app/pages/letter-reading-page.tsx` — the
  offline escape for the one offline reader that waited on auth without one.
- `src/app/pages/transcribe-room-page.tsx:120-123` — the redirect. **Verified correct, unchanged**;
  listed so the next investigator does not re-audit it.
- `src/app/data/transcribe-service.ts` — `postSlicePayload` calls `supabase.auth.getSession()` per
  slice. A plausible trigger, not the defect; unchanged.

## Severity

**High** — a signed-in user is told to sign in again, repeatedly, on a route they have access
to. Not a data-loss or security issue (it fails closed), but it breaks the entry point to any
gated feature and is invisible to anyone who does not think to inspect storage.

## Solution

Chosen at /fix (the reproduce artifact left the shape `open`), after a four-model spec review
rejected the first design (below). The fix is in the provider; no auth gate changes.

**The rule.** The provider reports "finished, nobody signed in" (`sessionChecked && !isLoading
&& !user`) only when that is true. While a stored session has been neither accepted nor refused,
it keeps reporting "still restoring", for as long as that takes, online or offline. Gates keep
showing their loader on the page the person asked for; nobody is sent to `/login`.

**A — the profile request fails** (`src/auth/profile-restore.ts`, called from `AuthContext.tsx`'s
Effect 2, which keeps the setup and the commit). A failed round is
"cannot tell", not "signed out": `isLoading` stays true and the provider keeps trying — 3 attempts
1 s apart, then single attempts after 1, 2, 4, 8, 16, 32 s and 60 s, each spread by ±20 % so tabs
that lost the server together do not return on the same second. After those 12 fast retries
(about 7 minutes) it slows to one every 5 minutes while the tab is visible: a server-side outage
ending fires no browser event, so without that timer a visible tab would wait for a reload. It
also retries at once when the network comes back or the tab is shown. A hidden tab makes no requests:
every restore request (the profile read, `refreshSession()`, `getUser()`, the session check
before an email-less read, and the local sign-out, which calls the logout endpoint while a token is
stored) waits for the tab to be visible, including a tab hidden at load and a follow-up to an answer that landed while hidden;
hiding the tab cancels the timer, and showing it retries at once
([metered-services.md](../docs/technical/metered-services.md) rules 3 and 4; decisions.md
2026-11-24, P1718). It stops when the profile loads, the profile is `not_found` (unchanged), the
session's user changes, the person signs out, or the provider unmounts.
- **Only failures that can clear by themselves keep it waiting:** no HTTP answer (the network), 408,
  429, or a 5xx. Any other answer comes back the same on every attempt (403 when the function is not
  granted, 404 when it is missing, a 401 without PostgREST's JWT code, and a read that threw in our
  own code — postgrest-js returns network failures and never throws). For those the provider stops
  after one attempt, settles as before P1297, and sends one Sentry warning: an endless loader
  would hide a server fault that a bounce to `/login` at least shows.
- **A read made as nobody is not the person.** With no usable token (its refresh failed on the
  network) supabase-js sends the anon key, and the profile function answers that too, without the
  owner's email. A profile with no email is taken only after `getSession()` confirms a session and
  one more read (an owner row can lack an email); the confirmation covers that one read only. If
  `getSession()` could not tell (an error), the restore stays unconfirmed; if it says plainly that
  no session is stored, the provider ends it with a local sign-out and settles signed out. A
  `refreshProfile()` read without an email never replaces a profile that has one; otherwise it is
  taken only while `getSession()` holds a session, after one more read. `refreshProfile()` waits on
  plain timers, so an awaited refresh in a hidden tab still ends.
- **A step that throws** (an auth call failing on its lock or storage) is "cannot tell": the
  restore waits and tries again instead of stopping with the loader up.
- A profile is committed only if it belongs to the session's *current* user id at that moment,
  not merely the id it was fetched for (a request in flight across an account switch is sent
  under the new token). That id is set inside the auth event itself, not later in the effect, so
  an answer for the previous account that lands between the event and the next render is
  already stale. Every step of the loop re-checks it after each wait. On a switch, the previous account's profile is dropped in the same render
  as the new session, with loading set, so no frame shows account A under B's session and no
  frame reads as signed out (P1560). The "keep the earlier profile on a transient failure"
  behaviour is kept, but only for the same user id.
- **A token the server refuses** (PostgREST's JWT codes `PGRST301`/`PGRST303` only; a bare 401 or
  `42501` is not a token problem): `refreshSession()` once per restore, whatever its outcome (a
  refresh holds the auth lock, so one that failed on the network is left to auth-js), with no
  argument so auth-js reads the current stored token, not one another tab may have rotated. Refresh works → retry the profile.
  Refresh refused by the server (any error auth-js does not class as retryable; a refused refresh
  token is a 400) → auth-js removes the session and emits `SIGNED_OUT`, and the listener sets the
  expired notice. If no `SIGNED_OUT` follows (the stored session was already gone), the
  provider clears the session itself, as below, rather than leave the loader up for good. Refresh fails on the network → still unconfirmed, keep retrying. Refused
  again with a freshly issued token → ask the auth server once (`getUser()`). If it accepts the
  token, the fault is the data server's (its signing key out of step with the auth server's), and
  signing out would sign out everyone who loads the app: the session is kept and the restore stays
  unconfirmed. Only a definite refusal (401/403/404, or auth-js holding no session to send) counts;
  a 429, a 5xx or no answer is no verdict, and the auth server is asked again next round. On a
  refusal the stored session is unusable: call `supabase.auth.signOut({ scope: 'local' })` and
  check its error. If it fails, auth-js keeps the session and the sign-out is tried again on the
  next refusal. The expired notice is written only once the sign-out succeeded, and never inside a
  sign-out the person chose. Marked as an explained loss, so it does not count as P1240's
  `session_lost_unexplained`.

**B — the refresh fails on the network** (Effect 1). `getSession()` returns a retryable error
while the token is in storage. The provider does **not** poll `getSession()`: each call holds the
auth lock through a full refresh cycle (~25 s), and every database request waits on that lock.
auth-js already retries on its own and reports the verdict as an event, so the provider marks the
restore pending, leaves `sessionChecked` false, and settles on the next event that carries a
session (`TOKEN_REFRESHED`, `SIGNED_IN`) or a definite end (`SIGNED_OUT`). A late `getSession()`
result never overwrites a newer auth event, and a boot read that fails (or throws) after an event
delivered a session leaves loading to that session's profile restore. The stored token is read
under this client's own storage key only, never another backend's (a device that has used two).
P1240's `stored_token_present` measurement keeps its any-key read (see Known limits).

**The person is told when a session really ended.** A one-shot notice in `sessionStorage`
("Your session expired. Please sign in again.") is set when a session the person did not end is
dropped: a refresh refused at boot (token stored at module load, gone once auth settles,
including when that `getSession()` returns an error), a
`SIGNED_OUT` while a session was held or pending, or the cleared-after-second-refusal case above.
It is not written while the person is already on `/login`, where it would surface on a later,
unrelated visit.
A sign-out the person chose writes a one-minute marker to `localStorage`, so other tabs, which
receive it as a plain `SIGNED_OUT`, do not call it an expiry; a new sign-in clears the marker (a
real one, from no session — not the `SIGNED_IN` auth-js replays to every tab when one is shown). The
login page shows one toast at most: P1441's seat notice when it is set, otherwise the expiry
notice. Both are consumed on that visit.

**Offline reading is unchanged.** Offline the profile never loads (P1369), so an unconfirmed
session can hold "still restoring" indefinitely there. Readers that use `session` already do not
wait on it (feed, stake, point-detail), and story-detail opens its gate on `offline`. letter-reading
was the one offline reader that waited on auth without that escape; it now uses
`useConnectivityAndAuthSettled()` (offline-status-context), the same rule as story-detail.

**Rejected, with reasons.**
1. *A 10 s hold, then settle "signed out" and bounce back from `/login` when the profile arrives*
   (the first design). All four reviewers found it breaks Invariant 1 by construction: any outage
   longer than the hold redirects, and the original report persisted across three reloads. For B
   it held nothing at all — the hold expired at 10 s, `getSession()` returns at ~50 s.
2. *Gate on `session` instead of `user` in all ~30 gates* (GLM). Fixes A without retries, but
   pages that read `user` would render with no profile, the change touches every gate and the
   next new page can get it wrong, and it does nothing for B (no session there). The provider
   rule meets the invariant in one place.
3. *Cache the last profile in storage.* A new persistent copy of the person's email, and
   decisions.md 2026-10-24 (P1560) rejected the same move for the same provider tree: "Keying on
   the cached profile (leaks across accounts)".
4. *A new "unconfirmed" flag that gates or the login page read.* Not needed once nobody is
   redirected while unconfirmed; it would add a state every gate must handle.

**Not changed.** `not_found`. Per-page gates. The P1441 write guard. auth-js's own retry timing.

**Known limits (pre-existing, not fixed here).** In B offline, auth-js reports no session, so an
offline reader that keys its cache on `session` reads as the anonymous reader until the network
returns. Filed to the task inbox. Relatedly, a receiver opening a letter offline with an
unconfirmed restore is treated as anonymous by letter-reading; before this fix the provider
settled as signed out offline after ~3 s, which gave the same result. If that reader's page
then loads live before the profile arrives, it keeps the anonymous view until a reload.

**Known limits of this fix (from the second code review; accepted, not fixed).**
- *The self-read confirmation is checked just before a read, not bound to it.* If the token's
  refresh fails on the network between the confirming `getSession()` and the read itself,
  supabase-js sends that one read with the anon key and an email-less answer is taken. Closing it
  needs an ownership signal from the server on the row itself (a schema change). Narrowed here to
  one read per confirmation.
- *Each round in the read-as-nobody state takes the auth lock twice* (the read's own token lookup,
  then the confirming `getSession()`). Bounded by the retry schedule.
- *Another tab's sign-out marker can be erased in a three-tab race:* a tab still restoring (case B)
  that receives auth-js's `SIGNED_IN` replay from a third tab after a second tab marked a chosen
  sign-out clears the marker, then calls that sign-out an expiry. The cost is a wrong "session
  expired" toast.
- *Opening `/login` directly while auth-js is still refreshing shows no expiry toast:* the page
  has mounted before the session is found gone, and the notice is not written while on `/login`
  (so it cannot surface on a later visit instead).
- *P1240's `stored_token_present` can see another backend's token* on a device that has used two
  (its read matches any `*-auth-token` key, and its test pins that). Narrowing it to this client's
  key is a change to P1240's test fixture and is left to that decision. Separately, the key is
  derived from the first hostname label, so two backends whose hosts share it (`localhost` on two
  ports) share one key; supabase-js derives its default the same way.
- *A wake event (back online, tab shown) ends any wait early,* so each one can add one request
  beyond the timed schedule; counted in the Cost Budget, not capped by it.
- *(Third review.) When the auth server answers the check with `session_not_found`, auth-js itself
  removes the session and emits `SIGNED_OUT` before `getUser()` returns,* so P1240 counts that loss
  as `session_lost_unexplained`. The person still gets the expiry notice (the listener writes it);
  only that measurement is off. Deferring P1240's classification until the check answers is a
  change to P1240 and is left to it.
- *(Final review, Gemini; accepted.)* A session renewed by another tab while this one was hidden is
  read again with the restore's earlier marks kept: if that renewed session is refused too, the
  restore can sign it out without asking the auth server again. A local sign-out of a missing
  session that throws (the auth lock) waits a retry round instead of settling at once; it still
  settles. Where storage cannot be read at all, a sign-out that errors is treated as kept, so the
  notice can be missing; the person still lands on the login page.

**Third review round (fixed).** Calls that throw no longer stick: the "already refreshed" and
"already asked the auth server" marks are set only after the call answers, and a local sign-out
that throws is treated like one that failed (retried on the next refusal, the chosen-sign-out flag
reset). `refreshProfile()`'s confirmed follow-up is a single read. A sign-out that waited for the
tab to be shown first checks the stored session: if another tab signed in again or refreshed it
meanwhile, the restore reads again with that session instead of clearing it. A sign-out that
errors or throws after auth-js already removed the session counts as done, so the notice is
still written.

**No feedback while waiting.** During an outage the gate's loader can stay up for as long as the
outage lasts; nothing says why. All four code reviewers flagged it. Whether to add a line such as
a "reconnecting" strip, and its copy, is a [FOUNDER DECISION]; this fix adds none.

**Tests.** `src/tests/p1297-reproduce.test.tsx`, 52 cases. The original 7 canary failures were
shown red on the pre-fix provider; every later case was shown red by undoing its own fix in a copy
(15 such mutations, two of them against the P1515 and P1240 suites for the code moved to `session-end.ts`; each turned the cases written for it red). After the second review round, 22 more: one per new guard, plus the restore-path controls re-run against the code moved to `profile-restore.ts`. After the third, 6 more, one per fix, and 4 after its check. Each turned its named case red, and the same harness on the unchanged code reports 0 failures. Covered: A recovers; B waits without polling
and recovers on `TOKEN_REFRESHED`; B refused settles signed out with the notice; a refused token is
refreshed once with no argument, and not again after a network failure; a refused refresh with
and without auth-js's `SIGNED_OUT`; a second refusal is cleared locally only when the auth server
refuses too, and is not counted as unexplained; a bare 401 is not a refusal; a repeating answer
settles and is reported once; a read as nobody is not taken; a chosen sign-out leaves no notice;
the marker survives a `SIGNED_IN` replay and is cleared by a new sign-in; the boot notice and its
control; `not_found` unchanged; an account switch, and an answer for the previous account landing
mid-switch, never show the earlier account; a hidden tab makes no requests, including a wait that starts while hidden; at most 28
requests in an hour-long outage at the shortest jitter, then 15 an hour; the schedule, jitter and classification helpers; unmount stops
retries; two controls. Second review round: a tab hidden at load and a refusal landing while
hidden send nothing until shown; a 429 from the auth check keeps the session; a failed local
sign-out is retried and the notice waits for it; a thrown read is reported once; a confirmation
covers one read; a throwing auth call does not stop the restore; no stored session settles signed
out; a failed boot read leaves loading to an event's session; `refreshProfile()` ends in a hidden
tab and takes an email-less read only as described; the exact storage key; the refusal classifier.
Third review round: an email-less read or a definite refusal landing while hidden sends no session
check or logout until shown; an auth check or refresh that throws is tried again; a local sign-out
that throws is retried and the notice waits for it; `refreshProfile()`'s follow-up is one read; a
session another tab renewed or restored while this one was hidden is read again, never signed out;
a sign-out that throws after ending the session still leaves the notice.
`src/tests/p1297-notices.test.tsx`, 7 cases: the login notice once, none written while on
`/login`, none on a bare visit, the P1441 notice winning; `useConnectivityAndAuthSettled`
online/offline. `e2e/p1297-reproduce.spec.ts`
asserts the whole first round hit the outage and that the consent screen is shown, so an endless
loader cannot pass. Beyond these files: the full vitest suite (the first fix broke 29 tests in 6
files through an import path and a null profile; both fixed and re-run).

**Copy, [FOUNDER DECISION]** (placeholder until approved): "Your session expired. Please sign in
again." The earlier "You're still signed in…" line is gone with the rejected design.

## Cost Budget

Applies: the retry loop calls Supabase (metered-services, "When this applies"). Units below are
per user-tab **during an outage**; outside one, the loop makes the same single profile request as
before. A request that fails at the network reaches no server and costs no egress or server log.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | first round 3 + 12 fast retries over 6 to 7 min = 15, then 1 per 4 to 6 min (5 min ±20 %) while visible, + 1 per wake event (back online, tab shown); on a refused token 1 refresh per restore, then at most 1 `getUser` per round until it answers either way (a 429 or 5xx is asked again), and 1 local sign-out (it calls the logout endpoint while a token is stored); on a read as nobody 1 `getSession` per round (local unless the token is near expiry) | profile reads, first hour at the shortest jitter: 3 + 12 by about 340 s, then floor((3600 - 340.4) / 240) = 13, so at most 28; each later hour at most 3600 / 240 = 15 while the tab stays visible. Worst case, a refused token: each round sends the read plus at most one auth call (a refresh, a `getUser` or a logout, each repeated while it answers 429/5xx, throws or fails on the network), so at most 56 the first hour and 30 each later hour. auth-js's own retries of a refresh that fails on the network reach no server. Plus 1 per wake event (2 on the worst-case path); hidden: 0 | unit: 0 (mocked). e2e: 2 tests x one normal cold load (fault test: the first-round requests are aborted in the browser and never sent) + 2 users created and deleted |
| Egress (bytes) | ~1 KB (estimate, not measured) per answered request: a 5xx body or the profile row; 0 for a request that fails at the network | first hour ≤ 28 KB (worst case 56 KB); later ≤ 15 KB an hour (worst case 30 KB) | 2 x one cold load of /transcribe |
| Log lines | client: 3 `console.warn` (first round only) + 1 existing `console.error` per failed request; 1 Sentry warning per load on a repeating answer; server: 1 API log line per answered failure | first hour ≤ 3 + 28 client, ≤ 28 server (worst case 56 each); later ≤ 15 each an hour (worst case 30) | 2 cold loads' worth |
| Service unit | none (no tokens, audio or instances) | none | none |

1. **Fits the plan limit today?** Fits. Supabase Free plan row: egress 5 GB per month. Added egress
   per month ≤ (visible tab-hours spent stuck in an outage per month) x 28 KB (56 KB on the
   worst-case path), and a request that fails at the network costs nothing. Even 10,000 such
   tab-hours a month would add 280 MB (560 MB worst case). Before
   the fix the same loads made 3 requests and stopped; the added retries are bounded per hour and
   stop in a hidden tab.
2. **Fits at 10x?** Fits on the common path: 10x the stuck tab-hours adds 2.8 GB at the extreme
   figure above, and the load exists only while the server is failing. The worst-case path (the
   data server refusing tokens and the auth server rate limiting at once, for 100,000 visible
   tab-hours in a month) would reach 5.6 GB, over the 5 GB row; that needs two simultaneous faults
   lasting the whole month.
3. **If either answer is no:** not needed. The upgrade would be Supabase Pro (from $25/month).

## Acceptance Criteria

- [ ] A signed-in user performing a full page load of an auth-gated route lands on that route,
      not on `/login` — verified on a physical device, not only in a test.
- [x] A stored session that the server rejects is cleared from storage, and the user is told the
      session expired rather than being shown a bare sign-in screen. Evidence: the three refusal
      cases in `src/tests/p1297-reproduce.test.tsx`; the notice cases in `src/tests/p1297-notices.test.tsx`.
- [ ] The state does not recur across a 30-minute session of ordinary use with a `/transcribe`
      room open (the cadence that surfaced it).
- [x] A regression test covers the provider settling with a valid stored session: once loading
      clears, `user` is non-null. Evidence: cases A and B in `src/tests/p1297-reproduce.test.tsx`
      (red before the fix), and `e2e/p1297-reproduce.spec.ts` (red before, green after).
- [ ] No console errors during the affected flow.
- [x] While the profile request fails on a cold load, the requested route shows its loader, never
      `/login`, and the page appears once the network is back. Evidence: `e2e/p1297-reproduce.spec.ts`.
- [x] The expiry notice is shown once, at most one toast with P1441's, and never after a sign-out
      the person chose (in this tab or another). Evidence: `src/tests/p1297-notices.test.tsx`; the
      chosen-sign-out case in `src/tests/p1297-reproduce.test.tsx`.
- [x] Offline, letter-reading does not wait on a restore that needs the network. Evidence: the
      `useConnectivityAndAuthSettled` cases (hook level; the page itself is not rendered offline).
- [x] Retries follow metered-services rules 3 and 4: no request from a hidden tab, bounded, with
      backoff and jitter, and a request-volume assertion. Evidence: the hidden-tab, bound and
      helper cases in `src/tests/p1297-reproduce.test.tsx`, each shown red with its fix undone.
- [x] A server fault neither signs people out nor holds the loader for good: a token the auth server
      still accepts is kept; a bare 401 is not a refused token; an answer that repeats (403, 404)
      settles as before P1297 and is reported once; a read made with no usable token is not taken
      as the person; a visible tab keeps retrying every 5 minutes after the fast retries. Evidence:
      the matching cases in `src/tests/p1297-reproduce.test.tsx`, each shown red with its fix undone.

**[FOUNDER DECISION] on three criteria — flagged by the spec review, not changed here:**
- AC1 (physical device) and AC3 (30 minutes without recurrence) pass on the unfixed code too: the
  trigger on the original device was never re-observed. Proposed replacement: a fault-injected
  run on the phone (remote-debugged browser, `get_profile_by_id` blocked for a few seconds on a
  cold load; for B, a stored token with `expires_at` in the past and auth blocked), failing before
  the fix and passing after.
- AC5 cannot be met as worded: auth-js itself logs `console.error` on a failed refresh, and the
  browser logs every aborted request. Proposed: "no uncaught exceptions; the only `console.error`
  lines are auth-js's own and `getProfileResult`'s existing 'Error fetching profile' diagnostic"
  (the provider's own after-retries line is now a `warn`).
