---
status: today
type: bug
rank: 5.0
workstream: C1
tags:
  - profile
  - points
  - positions
  - live
severity: high
date_reported: 2026-02-18
delivery_stage: implementation
created_date: 2026-02-18
---

# P279: Profile Subject's Position on Points Never Shown to Visitors

## Bug Description

When User B visits User A's profile, User A's position on their own points is invisible. User B only sees their own position (if they have one). If they haven't taken a position, the buttons render with nothing highlighted — as if the point has no context at all.

This affects both the **Points tab** (standalone points) and the **Stories tab** (linked points expanded within story cards).

Viewing your own profile works correctly because viewer = profile subject — positions happen to be the same person.

The LinkedIn prototype works correctly because mock data has the author's position pre-populated. Production never loads it.

---

## Conceptual Model

Points have no owner. Anyone can take a position. When a point appears on someone's profile, it's there **because that person took a position on it** — taking a position is what causes a point to appear on a profile, removing it is what causes it to disappear.

So when you view a point on someone's profile, their position is always guaranteed to exist. It should be shown as context: "this is their profile, this is where they stand." The viewer's own position (if any) is shown separately via the interactive position buttons.

The current variable names `authorPosition` and `profileOwnerPosition` are conceptually wrong per this model and should be renamed to `profileSubjectPosition` as part of this fix.

---

## Root Cause

The service layer only ever loads **one user's position** per point — the viewer's. The `positions` map built in `profile-page-v2.tsx` is only populated with `currentUser.id`:

```typescript
// profile-page-v2.tsx ~line 270 — only viewer, never profile subject
if (point.userPosition && currentUser?.id) {
  positions[currentUser.id] = { ... };
}
```

Display code already correctly reads `point.positions[profile.id]` for the profile subject's position — it's wired right, just starved of data.

**Second problem (live mode):** `live-mode-view.tsx` calls the deprecated `getPointsByValidator` which loads zero position data and no counts. This must be updated to `getPointsForProfileDisplay` with the current user ID passed through.

---

## Affected Locations

| File | Issue |
|------|-------|
| `src/app/data/points-service.interface.ts` | Extend signature to support loading profile subject's positions |
| `src/app/data/points-service-real.ts` | Load profile subject positions alongside viewer positions |
| `src/app/data/points-service-mock.ts` | Update mock implementation to match |
| `src/app/data/stories-service-real.ts` | Load story author positions in `getStoriesByAuthorWithPoints` |
| `src/app/pages/profile-page-v2.tsx` | Populate `positions` map with profile subject's position; rename `profileOwnerPosition` → `profileSubjectPosition` |
| `src/app/components/social/story-card-with-links.tsx` | Rename `authorPosition` → `profileSubjectPosition` |
| `src/app/components/partners/live-mode-view.tsx` | Replace deprecated `getPointsByValidator` with `getPointsForProfileDisplay(userId, currentUser?.id)` |

---

## Acceptance Criteria

- [ ] When User B visits User A's profile (Points tab), User A's position on each point is visible — the button reflecting their stance is highlighted
- [ ] When User B visits User A's profile (Stories tab, expanded linked points), User A's position on each linked point is visible
- [ ] Viewing your own profile still works correctly (no regression)
- [ ] User B's own position (if they have one) is also shown — the viewer's interactive buttons are unaffected
- [ ] `live-mode-view.tsx` no longer calls `getPointsByValidator` — replaced with `getPointsForProfileDisplay` including currentUser ID
- [ ] Variable names `authorPosition` / `profileOwnerPosition` renamed to `profileSubjectPosition` throughout
- [ ] All existing E2E tests for profile pass (no regression)

---

## Dependencies

None. This bug is a prerequisite for P272 (live story point verification), which explicitly requires showing the other person's position on linked points in `/live`.

---

## Technical Analysis

### Current State — Per Affected File

**`src/app/types/index.ts`**

`PointWithUserPosition` (lines 926-928) carries only `userPosition?: PointPosition` — one user's position. `PointSummary` (lines 902-909) has only `userPosition?: PositionType | null`. Neither type has a slot for a second user's position. Both need an additive optional field `profileSubjectPosition`. No schema migration needed; these are pure TypeScript interface additions.

**`src/app/data/points-service.interface.ts`**

`getPointsForProfileDisplay` (lines 150-153): signature is `(validatorId, viewerUserId?)`. No interface signature change needed — the fix is purely in the implementation layer. The `validatorId` IS the profile subject by definition; the service can unconditionally load the validator's own positions without a new parameter.

**`src/app/data/points-service-real.ts`**

`getPointsForProfileDisplay` (lines 594-627): `Promise.all` makes 2 batch queries — counts and viewer positions. The validator's own positions are never fetched. Fix: add third batch entry `getMyPositionsForPoints(pointIds, validatorId)`. Self-view optimization: when `viewerUserId === validatorId`, skip the viewer query and reuse the subject query result for both `userPosition` and `profileSubjectPosition`, avoiding a redundant DB round-trip.

**`src/app/data/points-service-mock.ts`**

`getPointsForProfileDisplay` (lines 279-310): same 2-batch pattern. Needs identical third batch. `mockPositions` already has entries for all fixture user IDs, so no new mock data is required.

**`src/app/data/stories-service-real.ts`**

`getStoriesByAuthorWithPoints` (lines 291-363): `Promise.all` at lines 340-347 fetches counts and viewer (`userId`) positions. The profile subject (`authorId`) positions are never fetched. Fix: add third batch `getMyPositionsForPoints(allPointIds, authorId)`. Enrich each `PointSummary` with the new `profileSubjectPosition` field.

**`src/app/data/stories-service-mock.ts`**

`getStoriesByAuthorWithPoints` (line 143): ignores `_userId`, returns bare `mockStoryPoints[story.id]` with no position data at all. Must be updated to map over each point and populate `profileSubjectPosition` from `mockPositions` and `userPosition` from viewer ID.

**`src/app/pages/profile-page-v2.tsx`**

Lines 268-278: the `AdaptedPoint.positions` map is only populated with `currentUser.id` (viewer). The display at line 766 already reads `point.positions?.[profile.id]?.position` — the wiring is correct; the map entry is missing. Fix: after the existing viewer entry, add `positions[profile.id]` from `point.profileSubjectPosition`. Apply same fix in the `handleProfilePointPosition` refetch loop (lines 385-405). `PointCardFull` local variable `profileOwnerPosition` (line 1093) — rename to `profileSubjectPosition`.

**`src/app/components/social/story-card-with-links.tsx`**

Prop `authorPosition?: PositionType` (line 52) on `StoryCardWithLinksProps` — rename to `profileSubjectPosition`. Internal uses at lines 83, 113-114, 141. The `QuotedPoint` sub-component (line 415) reads `point.positions[authorId]?.position` from `AdaptedPoint.positions` — this is populated correctly once the profile-page-v2.tsx fix lands; no additional change needed here.

**`src/app/components/partners/live-mode-view.tsx`**

Lines 651-667: `points` state typed as `PointWithCreator[]`, loaded via deprecated `getPointsByValidator(userId)`. Fix: type → `PointWithUserPosition[]`, call → `getPointsForProfileDisplay(userId, userId)`. `ContentPicker` at line 828 currently types `points: PointWithCreator[]` — since `PointWithUserPosition extends PointWithCounts extends PointWithCreator`, this is structurally compatible; no change needed in `live-content-cards.tsx`.

---

### Architecture Decisions

**No new service methods.** The existing `getMyPositionsForPoints` batch pattern is reused. One additional `Promise.all` entry in both `getPointsForProfileDisplay` and `getStoriesByAuthorWithPoints` is the minimal, pattern-consistent change.

**No interface signature change on `getPointsForProfileDisplay`.** The `validatorId` is the profile subject by definition — adding a redundant `profileSubjectId` parameter would be confusing and violate DRY. The service unconditionally loads the validator's positions.

**Additive type fields only.** `profileSubjectPosition?: PointPosition` on `PointWithUserPosition` and `profileSubjectPosition?: PositionType | null` on `PointSummary` are non-breaking optional additions. All existing code compiles without changes.

**Self-view optimization.** When `viewerUserId === validatorId`, one batch serves both purposes. Guard: `const viewerIsSubject = viewerUserId === validatorId`. Resolve the viewer `Promise.all` entry immediately with an empty map; use the subject map for `userPosition` instead. Avoids a duplicate DB round-trip on self-profile views.

**Rename scope is narrow.** Only two production files need renames: `story-card-with-links.tsx` (prop name) and `profile-page-v2.tsx` (local variable in `PointCardFull`). Prototype components are untouched.

---

### Security Review

**RLS Policies:**
- ✅ `point_positions` has `USING (true)` — positions are publicly readable by design. The fix does not change this policy or introduce new exposure. Fetching the profile subject's positions is no different from fetching anyone else's positions.
- ✅ `point_position_history` is similarly public with `USING (true)`. The fix doesn't touch history queries.
- ✅ No new RLS risk. The existing "positions are public" policy is a deliberate product decision; the fix operates within those boundaries.

**Authentication:**
- ✅ `viewerUserId` in `getPointsForProfileDisplay` comes from `useAuth()` / Supabase session — not caller-supplied from untrusted input. Unauthenticated visitors pass `undefined`; the service correctly handles this by returning an empty positions map.
- ✅ `profile.id` (profile subject) comes from a database-validated profile lookup (`getProfileBySlug` / `getProfile`), not raw URL string. An invalid slug returns no profile; the component renders "Profile Not Found".

**Input Validation:**
- ✅ Profile URL param goes through `getProfileBySlug(id)` / `getProfile(id)` using parameterized Supabase client calls. PostgREST handles parameter escaping — no SQL injection risk.
- ✅ Malformed UUID strings are safely rejected by Postgres with a type error caught by existing `if (error || !data)` guards. No explicit UUID format validation before the DB hit, but this is a pre-existing codebase pattern not introduced by this fix.

**Data Protection:**
- ✅ Positions (agree/disagree/etc.) are not PII — no names, emails, addresses, or financial data. Public by policy, consistent with the product's transparency-oriented design.
- ✅ The optional `reasoning` field on positions is already exposed via the public RLS policy in existing callers. The fix does not add new reasoning-field exposure.
- ✅ No sensitive data leakage risks introduced.

---

### Implementation Approach

#### Files to Create

None.

#### Files to Modify

**1. `src/app/types/index.ts`**
- Lines 902-909: Add `profileSubjectPosition?: PositionType | null` to `PointSummary`
- Lines 926-928: Add `profileSubjectPosition?: PointPosition` to `PointWithUserPosition`

**2. `src/app/data/points-service-real.ts`**
- Lines 594-627: In `getPointsForProfileDisplay`, add `viewerIsSubject` guard and third `Promise.all` entry for `getMyPositionsForPoints(pointIds, validatorId)`; return `profileSubjectPosition` on each point

**3. `src/app/data/points-service-mock.ts`**
- Lines 279-310: Mirror change from File 2

**4. `src/app/data/stories-service-real.ts`**
- Lines 340-356 inside `getStoriesByAuthorWithPoints`: Add third `Promise.all` entry for author positions; populate `profileSubjectPosition` on each enriched `PointSummary`

**5. `src/app/data/stories-service-mock.ts`**
- Line 143: Update `getStoriesByAuthorWithPoints` to populate `profileSubjectPosition` and `userPosition` per point from `mockPositions`

**6. `src/app/pages/profile-page-v2.tsx`**
- Lines 273-278 (initial load adaptation loop): Add `positions[profile.id]` from `point.profileSubjectPosition`
- Lines 385-405 (`handleProfilePointPosition` refetch loop): Same addition
- Lines 1093, 1140, 1155 (`PointCardFull`): Rename `profileOwnerPosition` → `profileSubjectPosition`

**7. `src/app/components/social/story-card-with-links.tsx`**
- Line 52: Rename prop `authorPosition` → `profileSubjectPosition` in `StoryCardWithLinksProps`
- Lines 83, 113, 114, 141: Update all internal references

**8. `src/app/components/partners/live-mode-view.tsx`**
- Line 36: Add `PointWithUserPosition` to type imports
- Line 651: Change state type `PointWithCreator[]` → `PointWithUserPosition[]`
- Line 666: Replace `pointsService.getPointsByValidator(userId)` with `pointsService.getPointsForProfileDisplay(userId, userId)`

#### Build Sequence

- [x] Phase 1 — `src/app/types/index.ts`: Add `profileSubjectPosition` to `PointSummary` and `PointWithUserPosition`
- [x] Phase 2 — `src/app/data/points-service-real.ts`: Extend `getPointsForProfileDisplay` with subject positions batch + self-view optimization
- [x] Phase 3 — `src/app/data/points-service-mock.ts`: Mirror Phase 2
- [x] Phase 4 — `src/app/data/stories-service-real.ts`: Extend `getStoriesByAuthorWithPoints` with author positions batch
- [x] Phase 5 — `src/app/data/stories-service-mock.ts`: Populate positions in mock implementation
- [x] Phase 6 — `src/app/pages/profile-page-v2.tsx`: Populate `positions[profile.id]` in both adaptation loops; rename `profileOwnerPosition` in `PointCardFull`
- [x] Phase 7 — `src/app/components/social/story-card-with-links.tsx`: Rename `authorPosition` → `profileSubjectPosition`
- [x] Phase 8 — `src/app/components/partners/live-mode-view.tsx`: Replace `getPointsByValidator`; update state type
- [x] Phase 9 — Verify: `npm run build` (zero TS errors), manual cross-profile test (User B views User A), `npm test`, `npm run test:e2e -- --grep "P279"`

> **Pre-generated tests** (read before implementing): `e2e/p279-profile-subject-position.spec.ts` (4 E2E), `e2e/p279-smoke.spec.ts` (2 smoke). These are the acceptance tests for Phases 2–6. Run `npm run test:e2e -- --grep "P279"` after each phase to verify progress.

---

## Test Coverage Strategy

**Generated by:** /generate-tests

### What's Tested

- ✅ **E2E — Cross-user position visibility (Points tab)** — Core bug surface. Asserts that `PositionBadge` ("Agrees"/"Disagrees") renders above the quoted point box when a visitor views another user's profile. Before fix: absent. After fix: visible.
- ✅ **E2E — Self-view regression (Points tab)** — Verifies the self-view optimization (viewerIsSubject) doesn't break existing behavior.
- ✅ **E2E — Both positions visible** — Visitor has a position too. Asserts both the subject's badge AND the visitor's interactive button highlight are present simultaneously.
- ✅ **E2E — Stories tab linked points** — Second affected surface. Asserts `QuotedPoint` renders the author's position badge after `getStoriesByAuthorWithPoints` is fixed.
- ✅ **Smoke — Cross-user profile loads without errors** — Fast regression: no console errors, page loads, profile heading visible.
- ✅ **Smoke — Position badge renders without errors** — Verifies `Disagrees` badge visible + no console errors.
- ✅ **UAT — Manual checklist** (`features/uat/p279.md`) — 6 scenarios covering all acceptance criteria including the live-mode-view fix and variable renames.

### What's NOT Tested (rationale)

- ❌ **Unit tests** — No new utility functions or business logic algorithms. The fix is data plumbing: add a batch DB query, populate a map entry. No complex transformation to isolate.
- ❌ **Integration tests** — No DB schema changes (no migration). `point_positions` table and its public RLS policy are unchanged. Not a migration fix (P270 rule not triggered).
- ❌ **Accessibility tests** — Position buttons already have `aria-pressed` from existing implementation. Fix adds no new interactive elements or ARIA concerns.
- ❌ **live-mode-view E2E** — Requires a two-party meeting setup (P272 territory). Covered by UAT-5 (grep check) and TypeScript build (zero errors).

### Test Pyramid

```
      /\
     /  \   4 E2E tests (main + stories tab)
    /____\
   /  2   \  2 Smoke tests
  /__________\
  0 Unit / 0 Integration
```

### Files Generated

- ✅ `e2e/p279-profile-subject-position.spec.ts` — 4 E2E tests (C1, C2, C3, C4)
- ✅ `e2e/p279-smoke.spec.ts` — 2 smoke tests
- ✅ `features/uat/p279.md` — 6 UAT scenarios

**Total:** 6 automated tests + 6 UAT scenarios

### Run Tests

```bash
npm run test:e2e -- --grep "P279"
```

---

## Implementation Tasks

> Generated by /decompose. Each task is scoped to 1–3 files and independently verifiable.
> Run /dev to execute — it will dispatch one subagent per task.

### Task 1: Add `profileSubjectPosition` to shared types
- **Files:** `src/app/types/index.ts` (modify)
- **Spec refs:** "Technical Analysis > Implementation Approach > Files to Modify (lines ~176-180)"
- **Depends on:** None
- **Verify:** `npm run build` passes with zero TS errors; `PointSummary` and `PointWithUserPosition` both have `profileSubjectPosition` optional field
- [x] Complete

### Task 2: Extend points service with profile subject positions
- **Files:** `src/app/data/points-service-real.ts` (modify), `src/app/data/points-service-mock.ts` (modify)
- **Spec refs:** "Technical Analysis > Current State — Per Affected File (lines ~102-116)", "Technical Analysis > Architecture Decisions (lines ~132-142)"
- **Depends on:** Task 1
- **Verify:** `npm run build` passes; real service adds third `Promise.all` entry for `getMyPositionsForPoints(pointIds, validatorId)`; self-view optimization (`viewerIsSubject`) present; mock mirrors same pattern
- [x] Complete

### Task 3: Extend stories service with author positions
- **Files:** `src/app/data/stories-service-real.ts` (modify), `src/app/data/stories-service-mock.ts` (modify)
- **Spec refs:** "Technical Analysis > Current State — Per Affected File (lines ~110-116)"
- **Depends on:** Task 1
- **Verify:** `npm run build` passes; `getStoriesByAuthorWithPoints` adds third `Promise.all` entry for `getMyPositionsForPoints(allPointIds, authorId)`; mock populates `profileSubjectPosition` and `userPosition` per point
- [x] Complete

### Task 4: Wire profile page positions map + rename local variable
- **Files:** `src/app/pages/profile-page-v2.tsx` (modify)
- **Spec refs:** "Technical Analysis > Current State — Per Affected File (lines ~118-124)", "Technical Analysis > Implementation Approach > Files to Modify (lines ~192-196)"
- **Depends on:** Task 2, Task 3
- **Verify:** `npm run build` passes; both adaptation loops (initial load ~line 273 and refetch ~line 385) populate `positions[profile.id]` from `point.profileSubjectPosition`; local variable `profileOwnerPosition` replaced with `profileSubjectPosition` at lines 1093, 1140, 1155; call site to `StoryCardWithLinks` passes `profileSubjectPosition` prop
- [x] Complete

### Task 5: Rename `authorPosition` prop in story card component
- **Files:** `src/app/components/social/story-card-with-links.tsx` (modify)
- **Spec refs:** "Technical Analysis > Current State — Per Affected File (lines ~122-124)", "Technical Analysis > Implementation Approach > Files to Modify (lines ~197-200)"
- **Depends on:** Task 4
- **Verify:** `npm run build` passes; `StoryCardWithLinksProps.authorPosition` renamed to `profileSubjectPosition` at line 52; all internal references updated (lines 83, 113, 114, 141)
- [x] Complete

### Task 6: Replace deprecated `getPointsByValidator` in live-mode-view
- **Files:** `src/app/components/partners/live-mode-view.tsx` (modify)
- **Spec refs:** "Technical Analysis > Current State — Per Affected File (lines ~126-128)", "Technical Analysis > Implementation Approach > Files to Modify (lines ~201-204)"
- **Depends on:** Task 2
- **Verify:** `npm run build` passes; `points` state typed as `PointWithUserPosition[]`; call to `getPointsByValidator` replaced with `getPointsForProfileDisplay(userId, userId)`; no references to `getPointsByValidator` remain in this file
- [x] Complete

### Task 7: Verify full test suite passes
- **Files:** `e2e/p279-profile-subject-position.spec.ts` (pre-generated), `e2e/p279-smoke.spec.ts` (pre-generated)
- **Spec refs:** "Test Coverage Strategy (lines ~222-258)"
- **Depends on:** Task 4, Task 5, Task 6
- **Verify:** `npm run build` zero TS errors; `npm run test:e2e -- --grep "P279"` all 6 tests pass; no regressions in existing profile E2E tests
- [x] Complete

**Total tasks:** 7 | **Can parallelize:** Task 2, Task 3 (both depend only on Task 1) | **Must be sequential:** Task 1 → Task 2 → Task 4 → Task 5 → Task 7, Task 1 → Task 3 → Task 4, Task 2 → Task 6 → Task 7
