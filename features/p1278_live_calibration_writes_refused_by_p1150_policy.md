---
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
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
status: qa
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

**Executed 2026-09-09 against an isolated local Postgres 17**, not against prod or test (the
task scoped this to LOCAL only). Container `cp-p1278-rls` on port 55433, image
`public.ecr.aws/supabase/postgres:17.6.1.134` (already present locally, nothing installed), a
fixture carrying the real column definitions of `story_verifications`, `clarity_sessions`,
`stories`, `story_versions` and the three letter tables, plus both counters triggers and an
`auth.uid()` reading the JWT claim as Supabase does. `20260901220000_p1150_b_*.sql` applied
verbatim from the repo. Result: the four legitimate `/live` shapes all fail with **42501**,
while the letter control is admitted in the same run.

## Fix

`supabase/migrations/20260909093000_p1278_admit_live_calibration_insert.sql` adds a second
OR-branch to the same single INSERT policy, admitting `source='live' AND verified = true AND
session_id IS NOT NULL AND delivery_id IS NULL` when
`p1278_live_verification_admissible(session_id, speaker_id, listener_id, story_id, version_id)`
holds. That `SECURITY DEFINER` helper requires the caller to be one of the named session's two
participants, both actor columns to be those same two participants and to differ, the story (when
present) to be authored by one of them, and the version (when present) to belong to that story.
The letter branch is carried over conjunct for conjunct and P1150's "exactly one INSERT policy"
assertion is re-asserted, not deleted. Client side, `clarity-live-page.tsx` binds the result of
`recordVerification`, stops emitting `live_story_verified` when nothing was written, and routes
the catch through `reportUnlessBlip` (P1177).

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

## P1278 B — the read side, found 2026-09-10 by running the canary

The INSERT fix (`20260909093000`) is **necessary but not sufficient**, and the spec's own canary
is what caught it: after applying A to test, `control (P1278): a storyless exchange is admitted`
still failed with 42501.

The remaining refusal is on the **read** path. `recordVerification` issues
`.insert({...}).select('*').single()` (`calibration-service-real.ts:250-262`), so PostgREST emits
`INSERT ... RETURNING`, and Postgres applies the SELECT policy to the returned row. That policy
(`20260403224331_p581:320-334`) routes every non-letter row through a story-visibility `EXISTS`:

```sql
EXISTS (SELECT 1 FROM stories
         WHERE stories.id = story_verifications.story_id
           AND (stories.visibility = 'public' OR stories.author_id = auth.uid()))
```

Two live consequences, neither previously recorded:

1. **A storyless round is unreadable by anyone.** `story_id IS NULL` makes the `EXISTS` false, so
   the RETURNING fails and the client sees an insert error for a row that was in fact admitted.
   P413 made `story_id` nullable exactly so loose paraphrase rounds could be recorded, and `/live`
   still produces them (`clarity-live-page.tsx:2183` looks a version up only `if (storyId)`).
2. **A round about a PRIVATE story is unreadable by the non-author participant** — and production's
   `stories.visibility` default is `private` (P424), while the `/live` picker offers only your own
   stories. So this is the ordinary case, not an edge case: the listener's own write would have
   kept failing after A, losing roughly half of every round's rows (both clients fire the write).

**Fix:** `20260910110000_p1278_b_live_verification_visible_to_its_participants.sql` adds one
OR-branch to the same single SELECT policy — the two actors named on the row may read it, guarded
by `auth.uid() IS NOT NULL` so `anon` evaluates exactly as before. The story-visibility rule and
the letter arm are carried over unchanged. This is the rule the letter arm has enforced since
P581; the live arm was the inconsistency.

**Evidence (epistemic gate 7 — the canary was watched FAIL first):**

| Probe | Result |
|---|---|
| Both new controls against the pre-B policy | FAIL (42501) — they detect the defect |
| `gap (P1278 B)` against the pre-B policy | PASS — not merely failing with everything else |
| `gap (P1278 B)` against a deliberately over-wide `ELSE true` policy | FAIL — the gap is not vacuous |
| Full spec against the shipped B policy | **27/27 passed** |

## Founder decisions — answered 2026-09-09

The founder's decision as relayed: *guests may record; recordings are accepted from signed-in
users AND guests; guest-origin rows must remain distinguishable so they can be filtered later;
"I don't want to overcomplicate it."*

**1. May a guest record? — DECIDED YES, and this fix does NOT deliver that half.** Stated plainly
rather than quietly dropped. Two independent blockers, both verified in this repo:

- **No RLS policy can serve an anonymous caller safely.** There is no identity to bind, and
  `clarity_sessions_select` (`20260414100001_p703:124-129`) exposes every row with
  `target_listener_id IS NULL` to `anon`, while P1057's column grant
  (`20260817140001:68-72`) hands `anon` `id`, `creator_profile_id` and `joiner_profile_id`. An
  anon-admitting branch therefore lets any unauthenticated caller enumerate real
  (session, speaker, listener) triples and insert `speaker_rating = 10` rows against
  strangers — the same counter-inflation P1150 closed, reachable without authenticating at
  all. Admitting anon here would restore P1150's defect in a new dress, which the task's own
  crux forbids.
- **A guest cannot be represented in the row at all.** `story_verifications.speaker_id` and
  `.listener_id` are `NOT NULL REFERENCES profiles(id)` (`20260204:120-121`; P413 relaxed only
  `story_id`/`version_id`), and a `/live` guest has no profile — `claim_joiner_seat` leaves
  `joiner_profile_id` NULL for a caller with no JWT (`20260812210000:134-136`). The client
  already returns early on a missing profile id (`clarity-live-page.tsx:2176`). So every
  admissible live row names two signed-in participants **regardless of what the policy says**.

  **The `source` column does not distinguish guest from signed-in** — it separates `live` from
  `letter` only. The already-present field that would mark a guest row is a NULL participant id,
  which is exactly what the NOT NULL constraint forbids today. No new column is needed; a
  nullability change is.

  **What guest recording would take:** (a) drop NOT NULL on `speaker_id`/`listener_id` and add a
  NULL guard to `update_profile_ears_count` (it currently updates `WHERE id = NEW.listener_id`
  unconditionally); and (b) a `SECURITY DEFINER` RPC taking the room **code** — the capability
  `anon` cannot read since P1057 — rather than an RLS predicate. Both are founder calls: (a)
  changes what an "ear" and a `verification_session_count` mean when a participant is anonymous,
  and (b) is a new write surface. Neither was taken unilaterally.

**2. Which shape — (b), corrected.** A second policy was rejected: permissive policies OR
together, and P1150's DO block asserts exactly one INSERT policy on the table. The live branch is
a second OR-branch **inside the same policy**, so P1150's invariant stays true and its guard is
re-asserted rather than rewritten or deleted.

**3. Should a failed write be visible to participants? — telemetry-only, unchanged.** A refused
insert already reports: `logDbError` captures every non-blip DB error to Sentry and suppresses
42501 only for the letter helper functions, never a table denial
(`db-error-logger.ts:74-76, 101-108`). What P1278 fixes is that the round no longer emits the
`live_story_verified` success event for a row that was never written. No user-facing surface was
added; interrupting a live round for a background write is not warranted.

## Residuals accepted, not hidden

Found by the Codex adversarial review and deliberately not fixed here — each needs a product
decision, and each was equally reachable before P1150 closed the path:

- **Duplicate live rows.** Nothing dedupes `source='live'`; P1067's unique index covers letter
  rows only. Both participants' clients call `writeVerification` for the same exchange, so a
  unique index would refuse the second one — the dedupe rule has to be decided before it can be
  enforced. Each row increments `verification_session_count` for both participants.
- **NULL `speaker_rating`.** `checkerRatingValue` (`clarity-live-page.tsx`) has no `?? 0`
  fallback where `responderRating` does, so a stale state can write a row recording no speaker
  rating. Requiring `speaker_rating IS NOT NULL` in the policy would turn that data-quality bug
  back into a silent refusal — the exact failure P1278 exists to end — and `?? 0` would fabricate
  a rating that feeds `accuracy_achieved`. Recorded, not patched.
- **A participant may name any of their own or their partner's stories**, not only the one the
  round used, and may attribute the pair in either order. Bounded by needing a real counterparty
  in a room both people actually shared.

## Acceptance Criteria

- [x] A failing-first test proves a legitimate `/live` insert is refused by the current policy,
      observed failing before any fix.
      **Evidence:** isolated Postgres 17 (container `cp-p1278-rls`, port 55433), real fixture
      column definitions + both counters triggers, `20260901220000_p1150_b_*.sql` applied
      verbatim → the four legitimate live shapes (creator write, joiner write with actors
      swapped, storyless P413 round, partner's story) all return **SQLSTATE 42501**, "new row
      violates row-level security policy for table story_verifications". The letter control C1
      is ADMITTED in the same run, so the probe discriminates rather than refusing everything.
> **Status 2026-09-10 — why the two remaining boxes are NOT ticked.** Both are honest blockers,
> not oversights. The first needs a two-participant `/live` round driven through the real browser
> client; everything verified so far is at the RLS layer (integration tests against the test
> database), which is strictly weaker evidence. The second cannot be true before a prod deploy.
> So this spec cannot close on test evidence alone — it is built, reviewed (two adversarial Codex
> passes) and committed on its branch, awaiting a real-client round and a prod apply.

- [ ] A `/live` round through the real client writes a `story_verifications` row with
      `source='live'` after the fix.
      **NOT SATISFIED — requires the migration to be applied.** Run against LOCAL Postgres only
      (task constraint); no migration was applied to test or prod. The DB half is proven at the
      policy level (next item); the real-client round belongs to `/verify` after the apply.
- [x] The guest question (decision 1) is answered in this spec before any migration is written.
      **Evidence:** § "Founder decisions — answered 2026-09-09". Answer: guests are NOT served by
      this fix, for two independently verified reasons (no bindable anon identity; participant
      columns are NOT NULL), with the concrete shape guest support would need.
- [x] The canary gains a permanently-passing control for the legitimate live shape, so the next
      predicate change cannot refuse it silently (gate 7c).
      **Evidence:** `e2e/integration/p1150-story-verification-counterparty.spec.ts` gains three
      controls that must be ADMITTED (creator write, joiner write actors swapped, storyless
      round) alongside eight live gap tests. Its header's false "no live-session client write
      path" claim is corrected in place.
- [x] Every P1150 gap test still fails-closed after the change: no forged counterparty, no
      third-party speaker, no cross-delivery letter rating.
      **Evidence:** local harness, 19/19 after applying `20260909093000`: 4 live controls
      ADMITTED, letter control ADMITTED, 14 attack shapes REFUSED (42501) — including P1150's
      original forged-speaker insert, the letter shape with a non-listener caller, the
      NULL-delivery wildcard, the non-placeholder speaker_rating, an anonymous caller, a
      non-participant caller, a guest-joiner session, `delivery_id` set on a live row,
      speaker = listener, and no `session_id`. Victim counters unchanged
      (`ears_count=0`, `verification_session_count=1`, the 1 being the legitimate letter
      control where the victim is the speaker).
- [x] `recordVerification` no longer discards a write failure without a signal
      (decision 3 sets whether that signal is user-visible or telemetry-only).
      **Evidence:** `clarity-live-page.tsx` binds the result (`const written = await …`), returns
      early on null so `live_story_verified` is no longer emitted for a row that does not exist,
      and routes the catch through `reportUnlessBlip` (P1177) instead of `console.error`. The
      refusal itself reports through the existing `logDbError` channel. All three assertions
      verified FAILING against `git show HEAD:src/app/pages/clarity-live-page.tsx` and passing
      after — `src/tests/p1278-live-calibration-write.test.ts`, 8/8.

## Done-When

- [x] Migration applied to test, canary green including the new control, both gap suites green. **Done 2026-09-10: 28/28 integration green; every canary watched FAIL first (see P1278 B evidence table); 369 unit files green; tsc clean. Two further defects (B, C) were found by doing this and are fixed in the same branch.**
      **NOT SATISFIED — deliberately.** The task scoped this to LOCAL Postgres and forbade any
      prod apply; applying to test was not authorised either. `./scripts/migrate.sh` and the
      canary run are the orchestrator's/founder's step. The policy behaviour it would measure is
      already measured locally (19/19 above) against the real migration SQL applied verbatim.
- [ ] Prod count of `source='live'` rows created after the fix is non-zero, measured after a
      real round.
      **NOT SATISFIED — blocked on the prod apply**, which is the founder's decision.
- [x] P1150's spec and migration headers are corrected — the "no client live-session write path"
      claim is false and will mislead the next author.
      **Evidence:** comment-only corrections added to `20260901210000_p1150_*.sql` and
      `20260901220000_p1150_b_*.sql` (no SQL changed in either), and to the canary spec's header.
- [x] `decisions.md` records why the live path needs its own admission shape.
      **Evidence:** `docs/decisions.md` 2026-09-09 [technical].

## Risks / Non-Goals

- **Non-goal:** widening the letter predicate. The letter shape is correct and adversarially
  reviewed; the live path needs its own admission, not a looser shared one.
- **Risk:** a second permissive INSERT policy ORs with the first. Whichever shape wins, the
  "exactly one INSERT policy" assertion must be replaced by an assertion that enumerates the
  policies it expects, not deleted.
- **Risk:** backfill. Rows lost between the prod apply and the fix cannot be reconstructed —
  the exchange data lives only in the client. Measure the loss before deciding whether to care.
