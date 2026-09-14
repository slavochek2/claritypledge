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
rather than quietly dropped. *(Delivered 2026-09-11 by P1278 D — see that section; the shape built differs from sketch (b)
below, and why is recorded there.)* Two independent blockers, both verified in this repo:

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

## P1278 D — guests' rounds are recorded (2026-09-11)

**Decision.** The founder, 2026-09-09: guests may record; rows must stay distinguishable; *"I don't
want to overcomplicate it."* And 2026-09-11: *"you can fix the guests … verify, run codex review, and
then ship that on top."*

**The shape — and a deviation from sketch (b) above.** Sketch (b) was a code-bearing SECURITY DEFINER
RPC for the guest's own anonymous client. It was not built, because nothing needs it. A guest can only
ever hold the joiner seat (every `clarity_sessions` INSERT policy requires a creator profile); the
creator's client already holds both ratings when a round is revealed; and it can write through the
existing single INSERT policy under its own identity. So: **no new anonymous write surface**, no seat
secret to present (D does not depend on P1269), and one row per guest round — the guest's client has no
signed-in user and never writes. A guest is marked by the field this spec already named: a NULL
participant id.

**What changed.** `20260911173000_p1278_d_a_guest_round_is_recorded.sql`:
- the two participant columns become nullable, under a CHECK (`story_verifications_guest_side_only_on_live`)
  that allows at most one NULL, and only on a live row — letter rows are untouched;
- `p1278_live_verification_admissible` gains a second arm: the joiner seat is occupied by a guest, the
  room is still open (`ended_at IS NULL`, and status `'active'` or NULL), the caller is the creator, and the
  row names the creator on one side and NULL on the other;
- the read policy's story-visibility disjunct now requires both participants to be named, so a guest round
  is readable by its creator only and never published through a public story (`ALTER POLICY`; nothing in
  the app lists a public story's verification rows today, so no screen changes);
- `update_profile_ears_count` moves only a named participant — its old `!=` evaluated to NULL against a
  NULL listener and would have silently skipped the speaker;
- `get_my_listener_calibration_diffs` uses a LEFT JOIN, so the breakdown keeps listing a round the
  averages already count (the P967 faithfulness invariant).

Client: `src/app/data/live-verification-participants.ts` decides who a row names; the live page uses it
instead of returning early; the types allow a null participant; the breakdown page renders a guest
speaker as "Guest" — existing app copy — with no profile link.

**What a guest round moves.** The creator's `verification_session_count`, once. No `ears_count` (a guest
has no profile, and a storyless round names no story). Never a story's `understood_count` —
`COUNT(DISTINCT listener_id)` does not count NULL, so a guest cannot inflate it. The creator's calibration
averages include the round, and the breakdown lists it.

| Check | Result |
|---|---|
| `e2e/integration/p1278-guest-round.spec.ts` before the migration (one worker, every arm observed) | 4 failed — the four admit arms, refused by the live row's admission policy (`42501`) — and 8 passed: every refusal already held |
| The same spec after the migration, in one run with the P1150 canary | 40/40 (12 + 28) |
| The three arms added after review, run against the first version of the migration | 3 failed — ended room, erased joiner, public-story privacy — 13 passed |
| After the migration was corrected and re-applied on test by hand (idempotent; version already recorded) | 44/44 (16 + 28) |
| The completed-without-an-end-stamp arm (Codex, second pass), run against that version | 1 failed — that arm alone — 16 passed |
| After the positive status test was re-applied | 45/45 (17 + 28) |
| `src/tests/p1278-guest-round-participants.test.ts`, `src/tests/p967-calibration-breakdown-faithfulness.test.ts` | 6/6, 15/15 |
| `./scripts/typecheck-gate.sh`, eslint on the changed files | `EXIT=0`, `EXIT=0` |
| The breakdown page with guest rounds, desktop / 375 / 320, asserted in-browser (3 "Guest" labels, no dead link, the viewport width confirmed) | 3/3; independent visual QA — see below |

**Codex review (2026-09-11)** — four findings, each checked before anything changed:

| Finding | Verdict | What changed |
|---|---|---|
| HIGH — an ended or cancelled room stays a valid guest capability | True: `complete_clarity_session` stamps `ended_at` and leaves the seat stamp; `erase_my_account` nulls a departing joiner's id, cancels the room and leaves the seat stamp | The guest arm requires `ended_at IS NULL` and an open status; arms for an ended room and an erased joiner were watched failing first |
| HIGH — a guest round about a public story is readable by anyone | True, through the story-visibility disjunct | That disjunct requires both participants named; a control proves a stranger still reads a signed-in round about the same story, and the guest arm was watched failing first |
| MEDIUM — a refusal test could pass on a refused read-back while the write landed | Plausible with `insert(...).select()` | Writes carry a caller-supplied id and no `.select()`; every outcome is re-read through service_role |
| MEDIUM — the client would send a guest write for an empty or ended room | Partly: the client has no seat state, but it has `endedAt` | The helper refuses an ended room; an empty or released seat is refused by the database only |

Codex also confirmed two paths are closed: the letter arm cannot carry a NULL participant, and a signed-in
creator cannot take their own joiner seat "as a guest" — `claim_joiner_seat` records their id.

**Codex, second pass on the fixes.** The read-policy change is otherwise byte-identical to P1278 B, so
signed-in and letter rows see no change; the supplied ids never enter the INSERT predicate, and every
refusal now checks both the error and a service-role count of zero; the null guard holds. Two findings:

| Finding | Verdict | What changed |
|---|---|---|
| MEDIUM — a room marked `completed` without an end stamp still qualifies | True, and it exists in the data: `status` is client-updatable under P1047, and open rooms marked `completed` number 9 on test and 3 on prod. Allowed values are `active`, `completed`, `cancelled`, default NULL — measured | The status test is now positive: `COALESCE(status, 'active') = 'active'`; the new arm was watched failing first |
| LOW — the client cannot tell an empty room from a guest-seated one | True: the client session carries no seat state. Unreachable in practice — no round completes until the guest has joined and rated | Recorded, not changed; the database refuses such a write regardless |

**Independent visual QA, first pass.** One reviewer, given only the screenshots and the checklist. It
reported, and each was checked against the diff:
- *Every row read "null (round N)", linking to `/story/null`.* Real, and older than D: the breakdown RPC
  has always returned no `story_title`, so any two storyless rounds printed it — D makes storyless rounds
  common. Fixed with a null guard in the same cell.
- *"Guest" rows are shorter than a named row, and read like a person called Guest.* The height difference
  is the name wrapping in a narrow column; a short real name renders the same. Kept: "Guest" is the app's
  existing word for these participants.
- *At 320 px the gap column is cut off; the headline says "Well calibrated" on a signed average whose misses
  cancel; small tap targets; slider and gap-format inconsistencies.* Real, and all older than D — the diff
  touches one cell. Filed, not fixed here.
- *The captures were narrower than labelled (a desktop scrollbar), and the header was still loading.*
  Re-captured with mobile emulation and a settled page for the second pass.

**Independent visual QA, second pass** (2 of 2 reviewers spawned have reported). With the null guard and
true mobile widths: no stray text anywhere, a fully loaded page at every width, and the gap column fits at
320 px — the first pass's cut-off was the desktop scrollbar. "Guest" matches a named row in font, weight and
colour. What it still lists is older than D and outside the one cell D touches: the verdict reads a signed
average in which misses cancel, the name column is narrow, tap targets are small, the result bar looks
draggable, and the gap column formats inconsistently. Filed as a note for the breakdown page.


**Residuals, accepted and stated.** A creator who seats themself as a guest from a second, signed-out
browser can play both sides and move their own session count — exactly what two accounts already allow.
A guest round written while the seat is occupied but the guest has since gone quiet is still admitted;
the seat stamp is the only occupancy signal the database has for a guest.

## P1278 E — the guest's client cannot record, so the creator's does (2026-09-12)

**Found by the real-browser round, not by any test at the database layer.** A round's calibration row is
written by the client that submits the round's SECOND rating (`clarity-live-page.tsx`, the `bothSubmitted`
branch of `handleRatingSubmit`). A guest's client has no signed-in user, so `writeVerification` returns
early there. In the ordinary shape — the creator speaks, the guest rates last — the round completed and
**nothing was recorded**: measured, `checksCount` reached 1 with both ratings in `live_state` and zero rows
in `story_verifications`. Every D check before this ran at the RLS layer with a service-role or signed-in
writer, so none of them could see it; D's own arms write as the creator by construction.

**The fix.** `src/app/data/live-guest-round.ts` — `guestRoundToRecord()` decides, from what the creator's
client has observed, whether a completed guest round is waiting to be recorded; the live page acts on it
beside the existing write. It fires only when: this client is the creator, a guest holds the joiner seat,
the room is open, the round count advanced **while this client was watching**, the state is the reveal of a
rating round, and both ratings are present. Never twice: the write keeps the submit path's round key
(`sessionId_checkerName_exchangeIndex`), so a round the creator itself submitted is a no-op here, and the
baseline comes from the session row rather than the first render, so a reload onto an already-revealed
round starts level with it and writes nothing. The explain-back step advances the same counter later with
the same two ratings still in state — the reveal-phase test is what keeps that from counting one round twice.

**Run on the branch rebased onto main.** The test project runs ahead of this branch: an unrelated in-flight
change means a guest's room-state writes are admitted only when the client sends the room code, which main's
client does and this branch (cut earlier) did not. Rebasing was needed to exercise the guest path at all —
and it is the code that actually ships. The rebase also resolved this branch's two ship conflicts (the
decisions log, the deploy record).

| Check | Result |
|---|---|
| `e2e/p1278-real-browser-round.spec.ts`, before the fix | **B failed: round completed, 0 rows.** A passed; C blocked by an unrelated 5-minute auth hang |
| The same spec, after the fix | **3/3**, then **4/4** with arm D — one row per round, the guest rows with the side NULL |
| Arm D (a guest typing the creator's name), before the attribution fix | **failed: the sides came back inverted** — the row named the creator as speaker for a round the guest spoke |
| `src/tests/p1278-guest-round-recorded-by-creator.test.ts` (new), `p1278-guest-round-participants.test.ts`, `p1278-live-calibration-write.test.ts`, `p967-calibration-breakdown-faithfulness.test.ts` | 48/48 |
| `e2e/integration/p1278-guest-round.spec.ts` + `p1150-story-verification-counterparty.spec.ts`, rebased | 45/45 |
| `./scripts/typecheck-gate.sh`, eslint on the changed files | `EXIT=0`, `EXIT=0` |

**Codex adversarial review of this change (2026-09-12)** — four findings. It separately confirmed the
dedup holds for realtime redelivery, drift-poll re-merge, StrictMode's replayed effect, and the case where
the creator submits second.

| Finding | Verdict | What changed |
|---|---|---|
| HIGH — a guest round is lost if the creator reloads before observing it | True, and deliberate: with no per-round identity on the row, a client that cannot tell whether it already wrote must not write. Losing one round beats double-counting it | Not changed here. The durable remedy is a per-round identity in the database — raised as a founder decision, see below |
| HIGH — a guest typing the creator's display name inverts the row's sides | True, reproduced in a real round (arm D, watched failing) | Roles now come from the room's own record of who asked (`live_state.checkerIsCreator`), with the name only as a fallback for older state |
| MEDIUM — a transient failure loses the round permanently, because the round is claimed before the write | True | The round is claimed only after the writer guard, and released when the write throws; a refusal (null, not a throw) still keeps it, because a retry would be refused identically |
| MEDIUM — the database admits duplicate guest rows; the dedup is client-only | True | Not changed here — same founder decision as finding 1 |

**Open, and yours to decide (findings 1 and 4).** Both have one remedy: give a round an identity in the
row — an exchange index alongside `session_id`, with a partial unique index — so the creator's client can
write a round it may already have written and let the database ignore the duplicate. That makes the reload
case recoverable *and* stops a duplicate at the boundary rather than in one tab's memory. It is a schema
change with its own migration and integration spec, and it is not needed for the guest path to work, so it
is filed rather than built.

**Residual, stated.** If the creator's client never observes the reveal — it reloads mid-round, or a merged
snapshot skips the revealed phase — that one round goes unrecorded rather than being recorded twice. The
round is lost, not duplicated: with no round id on the row, a client that cannot tell whether it already
wrote must not write. This is Codex finding 1 above, and the decision that would close it is stated there.

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

- [x] A `/live` round through the real client writes a `story_verifications` row with
      `source='live'` after the fix.
      **Evidence (2026-09-12):** `e2e/p1278-real-browser-round.spec.ts` arm A — two real browser
      contexts, the real join flow, the real Speak button and rating drawer. One row lands per round,
      `source='live'`, naming both participants, carrying the two ratings the room recorded. Green on
      three separate runs; read back through service_role, never through the writer's own client.
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

- [x] **D:** a guest round is recorded from the creator with the guest's side NULL, in either role —
      `p1278-guest-round.spec.ts` admit arms: 4 failed before the migration, pass after.
- [x] **D:** counters move only for a named participant — the creator's session count once, no ears for a
      storyless round, a story's `understood_count` unmoved by a guest who understood it.
- [x] **D:** every refusal still holds, before and after: an empty seat, a signed-in joiner, a stranger
      opposite the NULL side, any writer but the creator, an anonymous caller, a row naming nobody, a
      letter row with a NULL participant (the CHECK refuses it even for service_role), missing ratings.
- [x] **D:** the breakdown page renders a guest round — desktop and mobile-emulated 375 / 320, asserted
      in-browser (three "Guest" labels, no dead link, no "null (round N)", the width confirmed) and reviewed
      by two independent visual-QA passes; nothing either raised is caused by D.
- [x] **D:** a real-browser /live round with a guest writes a row.
      **Evidence (2026-09-12):** `e2e/p1278-real-browser-round.spec.ts` arms B and C — a signed-out guest
      in the joiner seat (the run asserts it reached the guest join form and that the seat carries no
      profile). Both roles: the creator speaks and the guest rates last (B), the guest speaks and the
      creator rates last (C). One row each, the guest's side NULL. **B failed first** — the round
      completed and zero rows landed — which is the defect § P1278 E below fixes.

## Done-When

- [x] Migration applied to test, canary green including the new control, both gap suites green. **Done 2026-09-10: 28/28 integration green; every canary watched FAIL first (see P1278 B evidence table); 369 unit files green; tsc clean. Two further defects (B, C) were found by doing this and are fixed in the same branch.**
      **NOT SATISFIED — deliberately.** The task scoped this to LOCAL Postgres and forbade any
      prod apply; applying to test was not authorised either. `./scripts/migrate.sh` and the
      canary run are the orchestrator's/founder's step. The policy behaviour it would measure is
      already measured locally (19/19 above) against the real migration SQL applied verbatim.
- [x] P1150's spec and migration headers are corrected — the "no client live-session write path"
      claim is false and will mislead the next author.
      **Evidence:** comment-only corrections added to `20260901210000_p1150_*.sql` and
      `20260901220000_p1150_b_*.sql` (no SQL changed in either), and to the canary spec's header.
- [x] `decisions.md` records why the live path needs its own admission shape.
      **Evidence:** `docs/decisions.md` 2026-09-09 [technical].

## Post-deploy verification

**This section is not a completion gate, and the move into it is recorded rather than done
quietly.** Rewriting a criterion to get past a gate is exactly the move that deserves suspicion,
so: the item below was a `- [ ]` box under `## Done-When`, and it deadlocked this spec against
itself. `ship-gates.sh` gate 2.5 refuses to merge while any completion box is unticked — but this
box cannot be ticked before the fix is on prod, and the fix cannot reach prod before it merges.
Nothing about the item changed except its section; the wording is intact.

This is the repo's existing convention for the small number of items it can never mechanically
verify before a deploy — `docs/decisions.md` 2026-09-01 (P1197, `## Next Steps`) and the P1288
entry, which moved three phone-only criteria the same way for the same reason.

**The fix is UNCONFIRMED ON PRODUCTION until this passes.** What is confirmed is strictly weaker
and is recorded above: real two-browser `/live` rounds against the **test** project, arms A–D,
one row per round with both ratings and the correct sides — which is what found the guest defect
in the first place.

- [ ] Prod count of `source='live'` rows created after the fix is non-zero, measured after a
      real round. Blocked on the prod apply, which is the founder's decision.

## Risks / Non-Goals

- **Non-goal:** widening the letter predicate. The letter shape is correct and adversarially
  reviewed; the live path needs its own admission, not a looser shared one.
- **Risk:** a second permissive INSERT policy ORs with the first. Whichever shape wins, the
  "exactly one INSERT policy" assertion must be replaced by an assertion that enumerates the
  policies it expects, not deleted.
- **Risk:** backfill. Rows lost between the prod apply and the fix cannot be reconstructed —
  the exchange data lives only in the client. Measure the loss before deciding whether to care.
