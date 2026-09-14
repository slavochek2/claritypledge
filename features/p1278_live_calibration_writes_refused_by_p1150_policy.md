---
status: week
type: bug
rank: 1000082
severity: high
workstream: live
date_reported: '2026-09-09'
created_date: '2026-09-09'
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [live, rls, calibration, p1150, regression]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1278: The P1150 INSERT policy refuses every `/live` calibration write

## Summary

`story_verifications` has exactly one INSERT policy, and since P1150 it admits only the
letter-screening shape. The `/live` client insert does not match it on four independent
predicates, so every `/live` calibration row is now refused by RLS. The client swallows the
error and the round completes as if the row had been written.

No row loss has been measured yet: the policy reached prod on **2026-09-07T06:19:57Z** and
the most recent `/live` session visible to `anon` on prod was created **2026-09-01**. The
defect is latent, not yet realised — it fires on the next `/live` round.

## Root Cause

`supabase/migrations/20260901220000_p1150_b_bind_delivery_and_caller.sql:67-80` recreates
`story_verifications_insert` with `WITH CHECK (… source = 'letter' AND verified = false AND
session_id IS NULL AND speaker_rating = 0 AND listener_rating IS NOT NULL AND delivery_id
IS NOT NULL AND p1150_letter_rating_admissible(...))`. The same migration's DO block asserts
there is exactly **one** INSERT policy on the table, so nothing else can admit a row.

`src/app/data/calibration-service-real.ts:246-259` (`recordVerification`) inserts
`story_id, version_id, session_id, speaker_id, listener_id, speaker_rating, listener_rating`
and nothing else. Against the policy that row fails on:

- `source` — not sent; column default is `'live'`
  (`20260403224331_p581_clarity_letters.sql:102`), policy requires `'letter'`
- `session_id` — set by the caller, policy requires NULL
- `speaker_rating` — the checker's real rating, policy requires the `0` placeholder
- `delivery_id` — not sent, policy requires NOT NULL

Caller chain: `src/app/pages/clarity-live-page.tsx:2305` (`void writeVerification`, "P413:
Write calibration record on every completed paraphrase exchange") →
`:2193 calibrationService.recordVerification(...)`. `calibrationService` resolves to the real
service whenever `VITE_USE_REAL_API === 'true'` (`src/app/data/calibration-service.ts:11-14`).

**Why it was not caught.** P1150's own migration header states "Live sessions have no client
write path into this table today"
(`20260901210000_p1150_bind_story_verification_counterparty.sql:12`) and the spec repeats it.
That claim is false — the `/live` path above predates it. The canary
`e2e/integration/p1150-story-verification-counterparty.spec.ts` contains exactly one
`source: 'live'` case (`:162`), an attack that must be **rejected**; it has no control
asserting that a legitimate live row is **admitted**, so the false-positive rate of the new
predicate was never measured (`.claude/rules/epistemic.md` gate 7c).

## Reproduction Steps

1. Sign in on prod (or any environment carrying `20260901220000`) and run a `/live` round to
   the revealed phase with a second participant.
2. Watch the console / Sentry: `recordVerification` returns a 42501 and
   `calibration-service-real.ts:262-265` logs it and returns `null`;
   `clarity-live-page.tsx:2207-2209` catches nothing user-visible ("Non-blocking — round
   completes regardless").
3. `SELECT count(*) FROM story_verifications WHERE source='live' AND created_at > '2026-09-07'`
   → expect 0.

**Not yet executed.** This spec is a read-only investigation: prod is read-only for the
agent, no local Postgres is running (`docker ps` → command produced no container list), and
the failing-first test belongs to `/reproduce`.

## Evidence gathered (2026-09-09, read-only)

| Probe | Result |
|---|---|
| prod `story_verifications` rows visible to `anon` | 39, all `source='live'`, newest `2026-07-05` |
| prod rows visible to `anon` with `created_at >= 2026-08-20` | 0 |
| prod `clarity_sessions` visible to `anon`, newest | `2026-09-01T13:40:45Z` |
| `deploy-manifest.json` prod `migrations_deployed_at` at the commit that first lists `20260901220000` | `2026-09-07T06:19:57Z` |
| Sentry (22minds-llc, 14d, `is:unresolved`) | 9 issues, none mentioning `recordVerification` or `story_verifications` |

Both prod reads are **partial censuses**, and the gap matters: the `story_verifications`
SELECT policy exposes rows only for public stories
(`20260325120000_p586_visibility_privacy_foundation.sql:378-384`), and
`clarity_sessions_select` exposes only sessions with `target_listener_id IS NULL`
(`20260414100001_p703_letter_sourced_live.sql:124-129`). A letter-sourced `/live` session
after 2026-09-07 would be invisible to this measurement. The Sentry absence is the
independent check: a refused insert reports to Sentry
(`src/app/data/db-error-logger.ts:101-108`; the 42501 suppression at `:74-76` is scoped to
`permission denied for function _is_letter_` and does not cover a table denial), and no such
issue exists.

## Expected Behavior

A completed `/live` paraphrase exchange records a `story_verifications` row with
`source='live'`, and a write that fails is not silently discarded.

## Actual Behavior

The insert is refused by RLS, `recordVerification` returns `null`, the round continues, and
the `source='live'` population stops growing.

## Founder decisions required

1. **May a guest record?** The `/live` joiner can be anonymous. The P1150 policy requires
   `auth.uid() IS NOT NULL`, and so did P586 before it, so a guest has never had a client
   write path. If guest rounds must record, the only shape that serves them is a
   `SECURITY DEFINER` RPC that derives both participants from `clarity_sessions`; a second
   RLS policy cannot.
2. **Which shape:** (a) `record_live_verification(session_id, …)` definer RPC — works for
   guests, removes the client's ability to name the counterparty at all; or (b) a second
   INSERT policy scoped to `source='live'` binding `session_id` to a session where
   `auth.uid()` is creator or joiner — signed-in only. Note that (b) reintroduces a second
   permissive INSERT policy, which P1150's DO block explicitly forbids, so its guard must be
   rewritten rather than deleted.
3. **Should a failed calibration write be visible** to the participants, or stay silent?

## Acceptance Criteria

- [ ] A failing-first test proves a legitimate `/live` insert is refused by the current policy,
      observed failing before any fix.
- [ ] A `/live` round through the real client writes a `story_verifications` row with
      `source='live'` after the fix.
- [ ] The guest question (decision 1) is answered in this spec before any migration is written.
- [ ] The canary gains a permanently-passing control for the legitimate live shape, so the next
      predicate change cannot refuse it silently (gate 7c).
- [ ] Every P1150 gap test still fails-closed after the change: no forged counterparty, no
      third-party speaker, no cross-delivery letter rating.
- [ ] `recordVerification` no longer discards a write failure without a signal
      (decision 3 sets whether that signal is user-visible or telemetry-only).

## Done-When

- [ ] Migration applied to test, canary green including the new control, both gap suites green.
- [ ] Prod count of `source='live'` rows created after the fix is non-zero, measured after a
      real round.
- [ ] P1150's spec and migration headers are corrected — the "no client live-session write path"
      claim is false and will mislead the next author.
- [ ] `decisions.md` records why the live path needs its own admission shape.

## Risks / Non-Goals

- **Non-goal:** widening the letter predicate. The letter shape is correct and adversarially
  reviewed; the live path needs its own admission, not a looser shared one.
- **Risk:** a second permissive INSERT policy ORs with the first. Whichever shape wins, the
  "exactly one INSERT policy" assertion must be replaced by an assertion that enumerates the
  policies it expects, not deleted.
- **Risk:** backfill. Rows lost between the prod apply and the fix cannot be reconstructed —
  the exchange data lives only in the client. Measure the loss before deciding whether to care.