---
status: week
type: bug
rank: 23
severity: high
workstream: events
date_reported: 2026-10-06
created_date: 2026-10-06
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [events, email, dispatcher, race]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-bug, reproduce, fix, ship]
flow: fix
date_resolved: 2026-10-06
root_cause: every writer of event_rsvps.mailgun_message_ids rewrote the whole jsonb from a stale read, and feedback was attempted >72h ahead (Mailgun rejects), so each cron tick erased the reminder id
resolution: per-key compare-and-set RPC (set_rsvp_message_ids) with claim tokens for every claim, write-back and reset; per-kind 72h window; stuck claims repaired from the send log or taken over; RPC errors counted; guard test bans whole-object writes
---

# P1425: Event reminder email sent up to 13 times — dispatcher overwrites its own message ids from a stale snapshot

## Summary

`dispatch-event-emails` sent the 24h reminder for Clarity Night #2 (2026-10-06 11:30 UTC) **13 times** to
one attendee and to the founder's test profile, and **twice** to a second attendee. Every copy was
scheduled at Mailgun for the same delivery minute, so they landed in the inbox together. Founder's
report: *"something wrong with sending? i think it received so many emails??"*

Regression area: P947 (dispatcher + atomic claim), P1256 (cron revived), P1380 (starting-soon shares
the same JSONB).

## Root Cause

Confirmed by the prod send log timing (below), not just by reading the code.

`event_rsvps.mailgun_message_ids` is one JSONB object holding every email kind's id (`reminder`,
`feedback`, `starting_soon`, `starting_soon_for`). Every writer does read-modify-write of the
**whole object** from a snapshot taken when the row was selected:

1. `runDispatch` selects a row once, then calls `dispatchReminder` and `dispatchFeedback` in sequence
   with that same `rsvp` object.
2. `dispatchReminder` claims `reminder = PENDING`, sends, writes `{...snapshot, reminder: <id>}`.
3. `dispatchFeedback` builds `{...snapshot, feedback: PENDING}` from the **pre-reminder** snapshot and
   writes the whole object — erasing the reminder id just written. Its write-back does the same.
4. Next cron tick (every 30 min): `reminder` is null again → the reminder is re-claimed and re-sent.

Two things made it loop 13 times instead of once:

- **Feedback dispatched outside Mailgun's 72h window.** The query's OR matches the row on its
  *reminder* branch, but the JS `needsFeedback` check ignores the window, so feedback was sent with an
  `o:deliverytime` > 72h ahead. Mailgun rejected it (`Mailgun returned null message ID`), the key went
  back to null, and the cycle repeated every tick until the feedback time came within 72h.
- Even a *successful* feedback send erases the reminder id (attendee 2: feedback accepted at 08:30,
  reminder re-sent at 09:00).

**Prod evidence (read-only, `email_send_log`, 2026-10-03..05):**

| recipient (role) | reminder sends | distinct Mailgun ids | sent at (UTC) |
|---|---|---|---|
| attendee 1 | 13 | 13 | 10-03 10:00 → 16:00, every 30 min |
| founder test profile | 13 | 13 | 10-03 10:00 → 16:00, every 30 min |
| attendee 2 | 2 | 2 | 10-05 08:30, 09:00 |

Feedback: 22 `failed` rows 10-03 10:00–15:00 (11 ticks × 2 rows), first success 15:30 —
exactly 72h before `feedback_scheduled_at` (event 11:30 + 120 min + 2h = 10-06 15:30).

## Invariants

- **No writer replaces `mailgun_message_ids` wholesale from a snapshot — no exceptions.** Each send
  kind owns its key; every claim, write-back and reset changes only its own key(s), atomically in
  the database (`set_rsvp_message_ids`), conditional on the value the writer read. Enforced by
  `src/tests/p1425-message-ids-writers.test.ts`.
- **A write-back lands only on its own claim.** The claim stamps a token into the kind's
  `*_attempted_at`; the write-back requires PENDING **and** that token. A reset or takeover changes
  the token, so a late write-back cannot overwrite a newer claim.
- **A send is only attempted when its own scheduled time is inside the dispatch window**, never
  because the row matched on a sibling kind's condition.
- **A stuck claim is never re-sent on a guess:** the send log is checked first; a recorded send is
  repaired (id restored), and a failed log read is an error, not a takeover.
- **A database failure is an error, not a skip:** the cron's `errors` count includes claim RPC
  failures, so a missing migration cannot report `dispatched: 0, errors: 0`.

## Reproduction Steps

1. Event with a feedback-gated host, preparation on, starting > 72h + 4h from now (so the reminder is
   inside the 72h window but feedback is outside it).
2. RSVP → `reminder_scheduled_at`, `feedback_scheduled_at` set, `mailgun_message_ids` null.
3. Cron tick: reminder sent, feedback attempted and rejected by Mailgun.
4. Observe: `mailgun_message_ids` has no `reminder` key. Next tick sends the reminder again.

**Reproduction rate:** 100% for any RSVP where both kinds are dispatched in one tick, or feedback is
attempted beyond 72h.

## Expected Behavior

One reminder per RSVP, one feedback per RSVP. Feedback is not attempted before it is inside the 72h
window.

## Actual Behavior

Reminder re-sent every 30 minutes until feedback is accepted; then once more.

## Affected Files

- `supabase/functions/dispatch-event-emails/index.ts` — `dispatchReminder`, `dispatchFeedback`
  (claim + write-back from snapshot), `runDispatch` (`needsReminder`/`needsFeedback` ignore window)
- `supabase/functions/_shared/starting-soon.ts` — `dispatchStartingSoon` claim + write-back (same
  pattern; latent)
- `supabase/functions/send-event-emails/index.ts` — `handleUncancel` writes `rest` from snapshot
  (same pattern; latent)

## Severity

**High** — real attendees received the same email 13 times; recurs on every event with a
feedback-gated host.

## Fix Approach

1. `set_rsvp_message_ids()` (migration `20261006120000`): per-key compare-and-set in one UPDATE;
   service_role only. `_shared/rsvp-message-ids.ts` wraps it: `setMessageIds` (ok / conflict /
   error), `claimMessage` (claim token, stuck takeover with send-log repair), `writeBackMessage`
   (token-matched, one retry), `clearMessageIds` (fresh-read per-key reset, cancels ids it had not
   seen, keeps a same-start starting-soon).
2. `dueKinds()` dispatches a kind only when its own `*_scheduled_at` is in `(now, now+72h]`.
3. Reminder, feedback, starting-soon, `handleUpdate` and `handleUncancel` all go through (1). The old
   "sanctioned" whole-object reset in `handleUpdate` is gone.
4. Guard test bans every JS/TS whole-object write form and SQL assignment of the column.

## Adversarial Review (Codex gpt-6.1-sol high · Gemini 3.8 Flash · Opus — 3 of 3 reported)

Round 1 verdict: **Codex REJECT**. Every finding was re-checked against the code and fixed in this spec:

| Finding (source) | Fix |
|---|---|
| Old write-back clears a newer claim after a reset → duplicate (Codex HIGH) | claim token in `*_attempted_at`; write-back matches it |
| Starting-soon write-back RPC error → takeover re-sends (Codex) | takeover first consults `email_send_log`; repair, don't re-send; write-back retries once |
| `handleUpdate` reset erases a concurrently stored id → duplicate (Codex, Opus) | `clearMessageIds`: fresh read + per-key CAS, cancels newly seen ids |
| Stuck reminder/feedback claims never recover (Gemini HIGH, Codex, Opus) — pre-existing since P947 | `claimMessage` takeover (after send-log check) |
| RPC error reads as "already claimed", cron reports `errors: 0` (all three) | `CasResult` 'error' → `error:db`, counted |
| Feedback throw hides the reminder's outcome from counts (Codex) | `dispatchRsvp` catches per kind |
| Guard misses quoted / computed / shorthand / assignment / multi-line / SQL (all three) | guard rewritten; each form has a control injected into the real file |
| Cancel → uncancel leaves reminder/feedback ids, so they are never re-sent (Opus sweep) — pre-existing | `handleUncancel` clears all kinds via `clearMessageIds` |

Round 2 (Codex only — the reviewer that rejected): findings 2, 3, 6 CLOSED; 1, 4, 5, 7 partly OPEN
plus new edge races. All re-checked and fixed:

| Finding | Fix |
|---|---|
| F1 claim tokens are ms timestamps; two overlapping runs can share one | `claimToken()`: random µs tail (timestamptz holds µs) |
| F2 a title-only edit clears an IN-FLIGHT starting-soon claim → second send | the claim records `starting_soon_for` up front; a same-start reset keeps it, PENDING or sent |
| F3 7 h stuck threshold outlasts a late RSVP's dispatch window → never sent | threshold 20 min (cron is every 30 min; a live claim lasts one invocation) |
| F4 write-back RPC failure still reported as a clean `sent` | `error:writeback` outcome, counted as an error |
| F5 a failed reset is ignored → cancelled id blocks the replacement | reset retries an RPC error once; a remaining failure is logged loudly |
| F6 log repair (60 s skew) could restore a PREVIOUS schedule's cancelled id | repair counts only sends logged strictly after this claim |
| F7 guard misses a constant-fed computed key, code inside `${}`, quoted SQL identifier | scanner keeps template interpolations, flags the bare column-name literal, matches `"col" =` |

Round 3 (Codex): F1–F5, F7 CLOSED (F1, F5 within the accepted residuals). Three new MEDIUMs, fixed in
a second migration `20261006130000` (the first is already applied on test, so it is not edited):

| Finding | Fix |
|---|---|
| Repair matched by time: a late old-schedule send logged after a replacement claim was taken as its own | `email_send_log.claim_token`; repair requires an exact token match |
| A delayed reset (two overlapping update handlers) cleared a NEWER claim | `clearMessageIds` CAS also requires the `*_attempted_at` it read |
| A tick's claim from a read taken before a reschedule/cancel succeeded → wrong-time send blocks the right one | `p_scheduled_for`: a claim requires its `*_scheduled_at` (starting-soon: the event start) unchanged and the event not cancelled |
| LOW: guard read `{ [kind]: id }` as a type | only `{ [k: …` counts as a type |

Round 4 (Codex): R3-1, R3-3 and the guard LOW CLOSED. Fixed:

| Finding | Fix |
|---|---|
| R3-2 (rest): a reset's retry re-read the row but judged it with its own, possibly stale, event start → cleared a newer claim | a reset only clears claims made BEFORE it (`since` = when the schedule change returned); later claims passed the schedule check, so they are valid by construction |
| R4-1: repair wrote the caller's CURRENT start onto an old send → kept as if for the new start | repair restores the id only; `starting_soon_for` stays what the claim recorded |
| LOW: `null \|\| {…}` read as a type | type match is `null \|` not followed by `\|` |

Round 5 (Codex, blocking bar: HIGH, or MEDIUM with at most one concurrent actor or one failure):
R4-1 and the LOW CLOSED. Fixed:

| Finding | Fix |
|---|---|
| R3-2 (rest): the claim token was the tick's start time, so a claim made AFTER an edit could look older than the reset's cutoff | the token is taken at the moment of the claim |
| `handleUpdate` ignored a failed schedule write and reset anyway → the dispatcher's drift check skips that row forever | schedule write checked, retried once; on failure the ids are left (same end state as the old combined write failing) and it is logged loudly — UNTESTED by an automated test (the handler is not importable: `index.ts` calls `serve()`) |
| A failed Mailgun cancel still let the id be cleared → old and new both queued | one retry on 5xx/network. Not adopted: Codex's "keep the id until the cancel succeeds" — a 404 also means *already delivered*, and holding the id would then block every replacement; a duplicate carrying the correct details beats only the stale one |

Round 6 (Codex): every round-5 item CLOSED. One new MEDIUM (pre-existing on main, fixed here):
an older update handler overwrote a newer edit's schedule → both kinds then skipped forever on the
drift check. `handleUpdate` re-reads the event just before its schedule write and stops if the start
or duration moved since its own read — UNTESTED by an automated test (same reason as above).

Round 7 (Codex, scope rule: only BRANCH-introduced findings block; PRE-EXISTING ones listed): R6-1
CLOSED. One BRANCH MEDIUM fixed: the two new reads (event re-read before the schedule write, the reset's
fresh read) gave up on a single failure, stranding cancelled ids. Both now retry once; a still-failing
event re-read falls back to main's unconditional write. PRE-EXISTING (same on main, recorded, not
blocking): the ms-wide window between that re-read and the write; a Mailgun cancel that keeps failing
still lets the replacement queue beside the old email (deliberate, see round 5).

Accepted, not changed (R4-2): a tick that read an RSVP **before** a same-time content edit (title,
location) and claims **after** it sends the old details — the window is the milliseconds between a
tick's read and its claim of that row. Same class as P947 decision 5 (a send in flight at the moment
of an edit), only shorter; closing it needs an event-content revision column, a schema change to
`events` outside this fix.

Accepted, not changed: a reminder whose time already passed before any tick ran is not sent late
(LOW, Opus). Before, it went out late only incidentally, for feedback-gated events via the feedback
clause; the query never selected past reminders for other events. Residual: a stuck claim whose
Mailgun send succeeded but whose send-log insert **also** failed can repeat once after 20 min (10 min
for starting-soon). A reminder/feedback claim in flight at the moment of an event edit is still
P947's accepted race (the old-details email is not cancellable; the replacement goes out).

Same-class bugs found elsewhere by the sweep, filed separately (different subsystems):
[P1426](p1426_demo_flow_state_lost_update.md) (`/demo` state lost update, plus dead
`endClaritySession`) and [P1427](p1427_letter_seal_writes_stale_point_config.md) (letter seal
restores a stale `point_config`). No other instance of "query matches on any kind, code acts on
all kinds" exists: the only `.or()` in functions/scripts is this dispatcher.

## Evidence

- **Reproduced on the real test DB** (Mailgun stubbed at `fetch`, rejects >72h like prod): HEAD's
  dispatch code, incident shape, 4 ticks → **4 reminders**, 4 feedback rejections, stored
  `{"feedback":null}`. Fixed code → **1 reminder**, 0 feedback attempts.
- `deno test supabase/functions/_shared/p1425-dispatch.test.ts p1380-event-emails.test.ts` →
  **31 passed, 0 failed** (live: incident shape, same-tick both kinds, CAS semantics, anon refused,
  claim token vs reset, stuck→repaired, stuck→taken over once, fresh claim left alone, reset
  helper, cancel→uncancel re-schedules; pure: dueKinds, RPC error → `error:db`).
- After review round 5: **43 passed, 0 failed** (adds: claim token is claim-time, cancel retries
  5xx once and never 4xx).
- After review round 4: **41 passed, 0 failed** (adds: a reset never clears a claim newer than
  itself; repair never relabels an old send's start).
- After review round 3: **39 passed, 0 failed** (adds: stale-read claim after reschedule/cancel
  claims nothing, delayed reset cannot clear a newer claim, the send log records the claim token).
- After review round 2: **36 passed, 0 failed** (adds: claim tokens distinct within one ms,
  same-start edit keeps an in-flight starting-soon claim, repair ignores a pre-claim send,
  write-back failure → `error:writeback`).
- After review round 1 (+ overlapping-takeover test): **32 passed, 0 failed**. One earlier run had a
  single unexplained failure — the CAS test's feedback write-back returned `conflict` in an 18 s run
  (normally 2 s); 3 isolated reruns and the full rerun passed. No test-DB cron exists and no other
  sends were logged, so neither is the cause. UNVERIFIED hypothesis: an HTTP-level retry of a CAS
  that had already applied. The test now prints the row state on a conflict so a recurrence names
  its cause.
- Guard `src/tests/p1425-message-ids-writers.test.ts` → 7 passed (after round-2 hardening); run against
  main's pre-fix files → **fails with all 8 whole-object writes listed** (exit 1), re-checked after
  each hardening.

## Deploy Sequence (after merge — nothing here is needed before it)

Merging changes no running system: the edge functions and the prod schema only change through the
steps below, in this order, each with the founder's explicit OK.

1. `/push` — applies `20261006120000_p1425_set_rsvp_message_ids.sql` and
   `20261006130000_p1425_claim_schedule_check_and_log_token.sql` to prod (P1211: `/push` owns prod
   migrations). **Must precede step 2:** new function code against a database without
   `set_rsvp_message_ids` claims nothing and reports `error:db` — fails safe, sends nothing.
2. `./scripts/deploy-functions.sh dispatch-event-emails --env prod` and
   `./scripts/deploy-functions.sh send-event-emails --env prod`.
3. Verify: the next cron tick returns `errors: 0` with no `set_rsvp_message_ids` errors in the
   function logs, and at the next event `email_send_log` holds at most one `reminder` per
   (event, profile).

## Acceptance Criteria

- [x] An RSVP with both reminder and feedback due in one tick ends with both ids stored; a second tick sends nothing
- [x] An RSVP whose feedback is > 72h out: reminder sent once, feedback not attempted, no `failed` feedback row
- [x] A failed feedback send does not erase the stored reminder id
- [x] Starting-soon, update and uncancel paths no longer write the whole object
- [x] Guard test fails on a reintroduced whole-object write, passes on the fixed code
- [x] Regression test (live test DB) reproduces the repeated send before the fix and passes after
- [x] Every round-1 review finding above is fixed or explicitly accepted with a reason
