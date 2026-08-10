---
status: in-progress
type: bug
rank: 1000960.0
severity: high
date_reported: '2026-08-09'
created_date: '2026-08-09'
tags: [security, rls, authorship, content-integrity]
delivery_stage: reproduce
pipeline_ran: [reproduce]
reproduce_artifact:
  test_file: e2e/integration/p1034-reproduce.spec.ts
  root_cause: "story_points INSERT policy (p586 STEP 15) binds only the referenced story to auth.uid(), never the row's own author_id column"
  confidence: high
  surfaces_in_scope: [story-points-insert]
  surfaces_deferred: []
  reproduced_at: '2026-08-10'
---

# P1034: `story_points` INSERT policy does not bind its own `author_id` column to `auth.uid()`

## Summary

The `story_points` INSERT policy checks that the caller owns the *referenced story*, but never
that the row's own `author_id` column (a separate, denormalized column on `story_points` itself)
names the caller — a caller who owns any story can insert a `story_points` link row attributing
it to a different profile.

## Root Cause

`supabase/migrations/20260325120000_p586_visibility_privacy_foundation.sql:243-246`:

```sql
CREATE POLICY "Story authors can link points"
  ON story_points FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM stories WHERE id = story_id AND author_id = auth.uid())
  );
```

This only constrains `story_id` to reference a story the caller owns — it places no constraint
on the value being inserted into `story_points.author_id` itself. `story_points.author_id` is a
`NOT NULL` column added in `20260301120000_story_points_author_unique.sql` (P465) specifically to
enforce "1 story per user per point" via `UNIQUE(author_id, point_id)` — it is a real, independent
authorship fact, not derived from the story join.

Discovered during P1032's code review (`/finish code`), which fixed the identical bug class on
`stories.author_id` and `points.first_validator_id` — this is the same class on a third,
different table that P1032's spec did not cover (`surfaces_in_scope: [stories-insert,
points-insert]`).

## Reproduction Steps

1. Sign in as an ordinary verified user ("attacker"). Create a story `S` you own.
2. Obtain a second profile's UUID (the "victim") and an existing `point_id` (`P`) not already
   linked by the victim.
3. Issue a direct PostgREST insert into `story_points` with `story_id: S.id, point_id: P,
   author_id: <victim UUID>`.
4. Read the row back: it exists, with `author_id` naming the victim, even though the victim never
   linked their story to that point — the attacker's story `S` is what's actually linked.

**Reproduction rate:** 100% — confirmed live against the **test** DB on 2026-08-10 via
`e2e/integration/p1034-reproduce.spec.ts` (2/2, initial run + retry with fresh fixtures).

### Reproduction evidence (2026-08-10, test DB)

Canary run before any fix exists — `npx playwright test e2e/integration/p1034-reproduce.spec.ts`,
`EXIT=1`, `1 failed / 2 passed`:

```
✘ attacker cannot link a point attributing authorship to another profile
  Error: Expected RLS to reject a story_points INSERT naming another profile as author_id,
  but it succeeded. Row (story=3985c441…, point=452ffdfc…) was created with
  author_id=92973bf8… (victim), inserted by attacker=3827e1fd…
✓ positive control: attacker can link a point to their own story as themselves
✓ attacker cannot link a point to a story they do not own
```

The forged row was not merely accepted — it read back through `.select()` with the victim's
`author_id`, so the write is durable and visible, not silently dropped.

**Two facts the original spec did not have:**

1. **Second-order impact — authorship denial.** Because of `UNIQUE(author_id, point_id)`, a forged
   row consumes the victim's only slot for that point. The attacker can permanently prevent the
   victim from ever linking their own story to it. This is an availability harm on top of the
   attribution harm.
2. **The p586 cross-visibility trigger does not mask this.**
   `enforce_story_point_visibility_constraint` (p586 STEP 8, `BEFORE INSERT`) rejects only
   (public story + private point). Both `stories.visibility` and `points.visibility` default to
   `'public'`, so the trigger cannot fire on the common path and provides no incidental protection.

### Scenario audit (Track B)

| # | Scenario | Guard result |
|---|----------|--------------|
| S1 | attacker owns story, `author_id` = victim | **UNGUARDED** — the bug |
| S2 | attacker owns story, `author_id` = self | passes — legitimate, must keep working |
| S3 | attacker does NOT own story, `author_id` = self | guarded by the existing `EXISTS` |
| S4 | anonymous (`auth.uid()` null) | guarded by the existing `EXISTS` |

All three testable scenarios are covered by the canary; nothing deferred. **S3 is a regression
guard, not redundancy** — a fix that *replaces* the story-ownership `EXISTS` with
`author_id = auth.uid()` rather than ANDing them would pass S1 and S2 while reopening S3.

## Expected Behavior

An insert whose `story_points.author_id` names a profile other than the caller is rejected by
RLS — matching the fix already applied to the sibling `stories`/`points` INSERT policies in
P1032.

## Actual Behavior

The insert succeeds, forging authorship attribution on the `story_points` junction row
independent of the actual story owner.

## Affected Files

- `supabase/migrations/20260325120000_p586_visibility_privacy_foundation.sql:243-246` —
  `story_points` INSERT policy, missing `author_id = auth.uid()` predicate
- Reference (correct pattern, do not change): `stories`/`points` INSERT policies as fixed by
  P1032 (`supabase/migrations/20260809150000_p1032_bind_insert_author_predicates.sql`)

## Severity

**High** — same impact class as P1032 (forged content attribution), trivially exploitable by any
verified user who owns at least one story. Not **critical** — no data exfiltration, no privilege
escalation, no access to another user's private data.

## Fix Approach

Add `AND author_id = auth.uid()` to the `story_points` INSERT policy's `WITH CHECK`, alongside
the existing story-ownership `EXISTS` check:

```sql
CREATE POLICY "Story authors can link points"
  ON story_points FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (SELECT 1 FROM stories WHERE id = story_id AND author_id = auth.uid())
  );
```

### Pre-fix verification — already run (2026-08-10)

Two checks the Fix Approach asks for are done. Recorded here so no session repeats them, and so
P1038's audit can treat `story_points` as a **pre-confirmed finding** — skip enumeration for this
table, go straight to fix + canary.

1. **The predicate is client-safe.** Exactly one insert path exists:
   `src/app/data/stories-service-real.ts:597 linkPointToStory(storyId, pointId, authorId)`.
   All four real callers pass the authenticated user — `StoryGuideChat.tsx:681`,
   `story-detail-page.tsx:124`, `story-detail-page.tsx:177`, `create-story-page.tsx:195`.
   No deployed client sends a foreign `author_id`, so the new predicate rejects only forged inserts.

2. **RLS is genuinely the boundary, not a bypassable layer.** Grepped all 119 `SECURITY DEFINER`
   functions in `supabase/migrations/` for `INSERT INTO stories|points|story_points` — zero hits.
   No definer-rights RPC inserts into these tables, so nothing routes around the `WITH CHECK`.

**Two corrections to this spec's own earlier text:**
- `letters-service.ts:1983` is a **read** path, not an insert — it is not a surface this fix touches.
- `src/app/data/letters-service.ts:1815` carries a stale comment asserting `story_points` has no
  `author_id`. False since P465 (`20260301120000_story_points_author_unique.sql`). Out of scope
  for this fix; noted so it is not mistaken for evidence.

## Acceptance Criteria

- [ ] An authenticated user attempting to insert a `story_points` row with another profile's
      `author_id` is rejected — observed as a failing request, with the pre-fix run recorded as
      succeeding
- [ ] A user linking their own story to a point through the product UI is unaffected
- [ ] Regression test passes: `e2e/integration/p1034-*.spec.ts`
- [ ] No console errors during story/point linking flows
