---
status: all-done
type: bug
rank: 1
tags:
  - epic-story-first
  - stories
  - points
  - database
flow: dev
delivery_stage: 3-arch-review
created_date: 2026-03-23T00:00:00.000Z
---

# P576: Keep Stories Linked When Position Is Removed

**Epic:** story-first (P523 vision)
**Depends on:** P560, P574

## Problem

A DB trigger (`trg_cascade_position_removal` from P401) automatically deletes `story_points` rows when a position is removed. This made sense pre-P560 when stories required positions. Now that P560 decouples stories from positions and P574 renders positionless stories, the cascade destroys valuable story-point links.

When a user removes their position on a point where they've filed a story:
- The story disappears from the point detail page
- The `story_points` link is deleted by trigger
- History row is written to `story_point_history` with `unlink_reason = 'position_removed'`

## Solution

1. Drop the cascade trigger — stories survive position removal
2. Update dialog copy to reflect new behavior ("story will remain without a position")
3. Keep `story_point_history` table and link-creation trigger (still useful for audit)

## Acceptance Criteria

- [ ] Removing a position does NOT unlink stories from the point
- [ ] Story moves to "Perspectives without position" section (P574) after position removal
- [ ] Dialog text updates: "Your N stories will remain linked without a position" (replaces "unlink N stories")
- [ ] `story_point_history` table preserved (no schema drop)
- [ ] Link-creation trigger (`trg_story_point_link_history`) preserved
- [ ] Only the cascade trigger (`trg_cascade_position_removal`) is dropped

## Technical Details

**Migration:** Drop trigger + function
```sql
DROP TRIGGER IF EXISTS trg_cascade_position_removal ON point_positions;
DROP FUNCTION IF EXISTS cascade_position_removal_to_story_points();
```

**UI:** Update `remove-position-dialog.tsx` copy (line 54)

## Out of Scope
- Re-linking previously unlinked stories (historical data stays as-is)
- Changes to story_point_history schema

---

## Technical Analysis

### Current Code State

**Database layer — the cascade trigger (source of the bug):**
- Migration `20260220120000_story_point_history_cascade.sql` defines two triggers on different tables:
  1. `trg_story_point_link_history` (AFTER INSERT on `story_points`) — writes audit rows when story-point links are created. **Keep.**
  2. `trg_cascade_position_removal` (AFTER DELETE on `point_positions`) — finds all `story_points` for the removed user+point, writes history with `unlink_reason = 'position_removed'`, then DELETEs the `story_points` rows. **Drop.**
- The cascade function `cascade_position_removal_to_story_points()` is SECURITY DEFINER — it bypasses RLS. Dropping it has no RLS side effects.

**UI layer — dialog and guard hook:**
- `src/app/components/shared/remove-position-dialog.tsx` contains both the `RemovePositionDialog` component and the `useRemovePositionGuard` hook.
- The dialog shows a warning when `linkedStoryCount > 0`: *"It will also unlink N stories from this point."* — this copy becomes incorrect once the trigger is dropped.
- The hook calls `checkLinkedStories` (on `points-service-real.ts`) to count linked stories before showing the dialog. This pre-flight check remains useful for showing informational copy (stories will remain, not be unlinked).
- The hook is consumed by 5 surfaces: `point-detail-page`, `profile-page-v2`, `story-detail-page`, `clarity-live-page`, and `feed-point-card`.

**Post-removal rendering (already solved by P574):**
- `point-detail-page.tsx` already computes `positionlessStories` — stories whose authors have no active position. After the trigger is dropped, a user who removes their position will have their story automatically appear in the "Perspectives without position" section. No rendering changes needed.

**`onAfterRemove` callbacks:**
- `point-detail-page`: re-fetches point + positions. Does NOT re-fetch stories. After trigger drop, stories stay in `story_points`, so `linkedStories` state (loaded at page mount) already contains them. The `positionlessStories` memo recomputes from `positions` (which gets refreshed) + `storyByAuthorId` (unchanged) — so the story correctly moves to the positionless section without a full reload.
- `profile-page-v2`: re-fetches points for display. Stories are loaded separately and unaffected.
- `feed-point-card`: local optimistic update only (adjusts position counts). No story logic.
- `story-detail-page` and `clarity-live-page`: similar re-fetch patterns, no story unlinking logic.

**Test coverage:**
- `src/tests/remove-position-guard.test.ts` tests the hook's dialog behavior (open/close, confirm/cancel, count display). Tests mock `pointsService` — they don't depend on trigger behavior. The dialog copy change requires updating the test description comments but not the test assertions (tests check `linkedStoryCount` number, not rendered text).

### Dependencies

- **P560** (story filing without position) — must be merged. Enables stories to exist without a position.
- **P574** (render positionless stories) — must be merged. Provides the "Perspectives without position" section that catches stories after position removal.
- Both are listed as dependencies in the spec. No additional dependencies discovered.

---

## Architecture Decisions

### Decision 1: Drop trigger via new migration (not modify existing)

**Chosen:** Create a new migration file that DROPs the trigger and function.

**Rationale:** Modifying the original migration (`20260220120000`) would require all environments to re-run it, which Supabase CLI doesn't support (migrations are tracked by timestamp — re-running causes "already applied" errors). A new migration is the standard forward-only pattern.

**Trade-off:** The original migration file still contains the CREATE statements for dropped objects — could confuse future readers. Mitigated by adding a comment to the DROP migration referencing the original.

**Alternative rejected:** Editing the original migration to comment out the trigger — violates forward-only migration discipline and breaks any environment that already applied it.

### Decision 2: Keep `checkLinkedStories` pre-flight and dialog for all cases

**Chosen:** Keep the `checkLinkedStories` call and always show the dialog. Change dialog copy from "will unlink" to "will remain linked without a position."

**Rationale:** The dialog still serves a purpose: (1) confirms the user wants to remove their position from their profile, (2) informs them their stories will remain visible without a position. Removing the dialog entirely would lose the confirmation step. The `checkLinkedStories` count drives the informational message — without it, we can't tell the user how many stories will be affected.

**Trade-off:** One extra query (`checkLinkedStories`) on every position removal, even though it no longer gates a destructive action. Acceptable — the query is lightweight (two small SELECTs) and the UX benefit of informing the user outweighs the cost.

**Alternative rejected:** Removing the dialog when stories exist (since no destructive action happens) — loses the "your stories will show without a position" information, which is valuable for user awareness.

### Decision 3: No changes to `onAfterRemove` callbacks

**Chosen:** Leave all `onAfterRemove` callbacks unchanged.

**Rationale:** On `point-detail-page`, the callback re-fetches `positions` but not `linkedStories`. After the trigger drop, `story_points` rows survive, so `linkedStories` (loaded at mount) is still accurate. The `positionlessStories` memo depends on `positions` (refreshed) and `storyByAuthorId` (unchanged) — the removed user's story moves from a position group to the positionless section automatically via the memo recomputation. On other pages, stories aren't displayed inline with positions, so no change needed.

**Trade-off:** If the user removes their position and immediately looks at the story list, the story appears in "Perspectives without position" without a page reload — correct behavior. No stale state risk identified.

**Alternative rejected:** Adding a stories re-fetch to `onAfterRemove` — unnecessary since `story_points` rows are no longer deleted, so the existing story data remains valid.

### Decision 4: Keep `story_point_history` and its link-creation trigger

**Chosen:** Preserve the `story_point_history` table, its RLS policies, its indexes, and `trg_story_point_link_history` (AFTER INSERT on `story_points`).

**Rationale:** The audit trail of when story-point links were created is still valuable. The table also contains historical unlink records (from before this fix) which are legitimate audit data. Only the cascade trigger (which writes unlink records AND deletes links) is removed.

**Trade-off:** The `unlink_reason` column and unlinked-related indexes become less useful going forward (no new 'position_removed' entries will be written). This is acceptable — manual unlinking may still write to this table in the future.

---

## Security Review

**RLS Policies:**
- ✅ `story_points` RLS unchanged. INSERT restricted to story authors, DELETE restricted to story authors, SELECT public.
- ✅ `story_point_history` RLS preserved (public read, trigger-only insert).
- ✅ `point_positions` RLS unaffected — users can only delete own positions.
- ✅ Dropping the `SECURITY DEFINER` cascade trigger is a security improvement — no more elevated-privilege deletions of `story_points`.

**Authentication:**
- ✅ `removePosition` enforced by RLS (`auth.uid() = user_id`). Only authenticated users remove own positions.

**Authorization:**
- ✅ No cross-user impact. Pre-P576 cascade only targeted own stories. Post-P576, no `story_points` touched at all.

**Input Validation:**
- ✅ No new inputs. Migration is `DROP TRIGGER` + `DROP FUNCTION`. Dialog copy is static string.

**Data Protection:**
- ✅ No PII concerns. Change preserves data rather than deleting it.
- ✅ Audit trail (`story_point_history`) preserved. Historical entries remain intact.

**Summary:** No security concerns. Strictly a removal of a `SECURITY DEFINER` cascade trigger — reduces attack surface.

---

## Implementation Approach

### Files to Create

1. **`supabase/migrations/20260323120000_p576_drop_cascade_trigger.sql`** — Migration to DROP the cascade trigger and its function. Two statements:
   - `DROP TRIGGER IF EXISTS trg_cascade_position_removal ON point_positions;`
   - `DROP FUNCTION IF EXISTS cascade_position_removal_to_story_points();`

### Files to Modify

1. **`src/app/components/shared/remove-position-dialog.tsx`** (lines 52-56) — Change dialog copy:
   - Current: `"It will also unlink N stories from this point."`
   - New: `"Your N stories will remain linked without a position."` (when `linkedStoryCount > 0`)

2. **`src/tests/remove-position-guard.test.ts`** — Update test description comments to reflect new behavior (stories remain linked, not unlinked). No assertion changes needed — tests verify count propagation and dialog open/close, not rendered text.

### Files Unchanged (verified no changes needed)

- `src/app/pages/point-detail-page.tsx` — `positionlessStories` memo already handles the transition correctly.
- `src/app/pages/profile-page-v2.tsx` — `onAfterRemove` re-fetches points only; stories unaffected.
- `src/app/components/feed/feed-point-card.tsx` — local optimistic update only.
- `src/app/data/points-service-real.ts` — `removePosition` and `checkLinkedStories` unchanged.
- `supabase/migrations/20260220120000_story_point_history_cascade.sql` — original migration untouched.

### Build Sequence

1. **Create migration** — `20260323120000_p576_drop_cascade_trigger.sql`
2. **Run migration** — `./scripts/migrate.sh`
3. **Update dialog copy** — `remove-position-dialog.tsx`
4. **Update test comments** — `remove-position-guard.test.ts`
5. **Run tests** — `npm test` (verify no regressions)
6. **Run pre-commit checks** — `./scripts/pre-commit-checks.sh`
