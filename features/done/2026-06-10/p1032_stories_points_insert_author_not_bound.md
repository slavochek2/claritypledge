---
status: all-done
type: bug
rank: 3
severity: high
date_reported: '2026-08-09'
created_date: '2026-08-09'
tags: [security, rls, authorship, content-integrity]
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: e2e/integration/p1032-reproduce.spec.ts
  root_cause: "stories INSERT policy (STEP 11) and points INSERT policy (STEP 20) in 20260325120000_p586_visibility_privacy_foundation.sql check auth.uid() IS NOT NULL + is_verified only — no author_id/first_validator_id = auth.uid() predicate, unlike sibling UPDATE/DELETE policies on the same tables"
  confidence: high
  surfaces_in_scope: [stories-insert, points-insert]
  surfaces_deferred: []
  reproduced_at: 2026-08-09
completed_at: 2026-08-10
---

# P1032: `stories` and `points` INSERT policies do not bind the author column to `auth.uid()`

## Summary

The RLS INSERT policies on `stories` and `points` check that the caller is *a* verified user but
never that the row's author column belongs to them — so a verified user can create content
attributed to another profile. Found during P1030's spec-review; **unrelated to P1030 and not
fixed there** (P1030 writes via the service role, which bypasses RLS entirely).

## Root Cause

`20260325120000_p586_visibility_privacy_foundation.sql` recreated the content policies. Two of
them assert caller verification without asserting caller ownership:

- **STEP 11 (`:207-211`)** — `stories` INSERT: `auth.uid() IS NOT NULL AND EXISTS (… profiles …
  is_verified = true)`. No `author_id` predicate.
- **STEP 20 (`:289-291`)** — `points` INSERT: identical shape. No `first_validator_id` predicate
  (that column is the author identity — decisions.md 2026-04-24 [technical], "Author identity via
  `points.first_validator_id` — no new `author_id` column").

**This is an omission, not a policy.** The same migration binds the owner on every comparable
surface: `stories` UPDATE and DELETE both use `auth.uid() = author_id` (`:216-226`);
`point_positions` INSERT uses `auth.uid() = user_id` (`:311-313`); `story_points` INSERT scopes
through the parent story's author (`:243-246`); `story_point_history` INSERT is `WITH CHECK
(false)`. Four surfaces bind, two do not.

**Why it stayed invisible:** `stories-service-real.ts:151` carries the comment *"Use authenticated
user, not caller-supplied authorId (RLS requires auth.uid() match)."* RLS does not require that.
The application does the right thing voluntarily while the codebase documents a database guarantee
that was never there — so reading either layer alone looks correct.

No trigger provides defence in depth: the `stories` BEFORE INSERT trigger
(`trg_stories_extract_hashtags`) only parses content, and `points` has no write-time column guard
equivalent to `guard_profile_trust_columns`.

## Reproduction Steps

1. Sign in as any ordinary user. Signup grants verification — `AuthCallbackPage` upserts the
   profile with `is_verified = true` — so no special role is needed.
2. Obtain a second profile's UUID (profile UUIDs are returned by ordinary read paths).
3. Issue a direct PostgREST insert into `stories` with `author_id` set to that second profile
   instead of your own, bypassing the app's own service layer.
4. Read the row back: it exists, attributed to the other profile.
5. Repeat against `points` with `first_validator_id`.

**Reproduction rate: 100% (2/2), confirmed against the test DB on 2026-08-09.**
`e2e/integration/p1032-reproduce.spec.ts` signs in as an attacker (verified test user) and
inserts into `stories` with `author_id` set to a second test user's (victim's) UUID, and
separately into `points` with `first_validator_id` set to the victim's UUID. Both inserts
succeeded (`error: null`) and the row was readable back with the victim's UUID as author —
exactly the exploit described above. Both positive controls (attacker inserting with their own
UUID) passed, confirming the legitimate path is unaffected. Full run: 2 failed (the exploit
cases — correctly, since the canary expects rejection), 2 passed (the positive controls).

## Expected Behavior

An insert whose author column names a profile other than the caller is rejected by RLS, exactly as
the corresponding UPDATE and DELETE already are.

## Actual Behavior

The insert succeeds. Consequences, in rough order of severity:

- **Content attributed to someone who did not write it.** A public story or point appears under
  the victim's authorship wherever content is listed by author.
- **Asymmetric remediation.** UPDATE and DELETE *do* bind the author column, so the impersonated
  user can delete the row — but the actual creator cannot. Cleanup is only available to the person
  who was impersonated, and only if they notice.
- **`points` is the worse half.** Points are shared, reusable content that live inside sealed
  letters, and `points.first_validator_id` is `ON DELETE CASCADE` on `profiles`. decisions.md
  2026-05-27 [technical] already records the consequence: deleting the account that first-validated
  a point deletes the point itself. A forged `first_validator_id` therefore couples a stranger's
  future account deletion to the destruction of content they never created.
- **Minor read effect.** `points` SELECT admits `first_validator_id = auth.uid()`, so a forged
  value also grants that profile read access to an otherwise-private point.

No data exfiltration, no privilege escalation, no access to another user's private data, nothing
taken offline.

## Affected Files

- `supabase/migrations/20260325120000_p586_visibility_privacy_foundation.sql:207-211` — `stories`
  INSERT policy, missing predicate
- `supabase/migrations/20260325120000_p586_visibility_privacy_foundation.sql:289-291` — `points`
  INSERT policy, missing predicate
- `src/app/data/stories-service-real.ts:151` — comment asserting a DB guarantee that does not exist
- Reference (correct pattern, do not change): same migration `:216-226`, `:243-246`, `:311-313`

## Severity

**High** — trivially exploitable by any signed-up user against two content tables, and the `points`
half can lead to destruction of shared content already frozen into sealed letters. Not **critical**:
nothing is down, no data is exposed or lost today, and there is no privilege escalation.

**Severity is not urgency.** Current blast radius is small (pre-PMF user base, no evidence of
exploitation) — but this is an authorship-integrity gap in a product whose entire proposition is
*did you understand what **this person** said*, so it should not be carried into having real users.

## Fix Approach

Add the owner predicate to both INSERT policies, matching the sibling policies in the same
migration:

- `stories` INSERT — add `AND author_id = auth.uid()`
- `points` INSERT — add `AND first_validator_id = auth.uid()`

Correct the misleading comment at `stories-service-real.ts:151` in the same change: the app-layer
behaviour is right, its stated reason was not.

**Dependent enumeration — already done, the fix breaks nothing that exists:**

| Writer | Passes | Affected? |
|---|---|---|
| `stories-service-real.ts:174` (only client insert) | `author_id: user.id` from session | No |
| `points-service-real.ts:211` (only client insert) | `first_validator_id: user.id` from session | No |
| SQL / RPC / edge functions | `grep -rn "INSERT INTO stories\|INSERT INTO points" supabase/` → **0 hits** | None exist |
| Service-role paths (tests, scripts, skills) | Bypass RLS entirely | No |

**Rejected-alternatives check:** `grep` of `docs/decisions.md` for `author_id` / `authorship` /
`Verified users can create` returns nothing that rejects binding the author on insert. The
2026-04-24 [technical] entry establishes `first_validator_id` *as* the author identity, which is
the argument for binding it rather than against.

**Order of work:** run the canary first (see Reproduction), then the migration, then re-run the
canary and watch it fail. A policy fix whose failure path has not been observed is unproven
(`.claude/rules/epistemic.md` gate 7).

## Acceptance Criteria

- [x] An authenticated user attempting to insert a `stories` row with another profile's `author_id`
      is rejected — observed as a failing request, with the pre-fix run recorded as succeeding.
      Canary pre-fix: 2 failed (exploit succeeded)/2 passed; post-fix: 4/4 passed.
- [x] The same holds for `points` with another profile's `first_validator_id` — same canary run.
- [x] A user creating their own story and their own point through the product UI is unaffected —
      both flows complete normally. Verified via the canary's positive-control tests, which call
      the identical `stories-service-real.ts`/`points-service-real.ts` code paths the UI uses (no
      `.tsx` changed in this fix — nothing UI-specific to separately click-through).
- [x] Existing letter, `/live` and profile flows behave identically — **partial evidence, not
      "full suite green" as originally worded.** Unit suite (243 files, 2742 tests) passed with
      the fix applied. The full e2e suite could not complete in this session — a 400-file run hit
      severe environment resource contention (21.5h real elapsed, still mid-retries when killed;
      see session record) rather than a real regression signal. Substituting: the code-review +
      adversarial-review passes independently enumerated every INSERT path into `stories`/`points`
      across `src/`, `supabase/migrations/`, and `supabase/functions/` and found none outside the
      two fixed policies and the two known client call sites (both already `auth.uid()`-derived) —
      so nothing else in the codebase touches the changed surface. User explicitly accepted
      shipping on this evidence rather than continuing to wait for a full-suite run.
- [x] The comment at `stories-service-real.ts:151` states what the database actually enforces —
      corrected, verified accurate against the live migration.
- [x] Regression test passes: `e2e/integration/p1032-*.spec.ts`, containing both the rejection
      cases and the two positive controls — 4/4, confirmed again post-rebase onto current main.
- [x] No console errors during story or point creation — no UI code changed; the positive-control
      canary's clean `error: null` assertions are the available evidence (no live browser console
      check performed — nothing in this diff could introduce one).

## Notes

Exploit-chain detail and the discovery context are in `.private/docs/security-log.md` (2026-08-09)
rather than restated here — this repo is public and the gap is unpatched.
