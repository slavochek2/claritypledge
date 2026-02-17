---
status: today
type: bug
rank: 125234.0
workstream: C1
severity: high
date_reported: 2026-02-17
created_date: 2026-02-17
tags: [positions, counts, profile-page, story-expand, rendering]
delivery_stage: implementation
---

# BUG P155: Position Counts Show 0, Story Expand Crashes on Profile Page

## Problem

Three related defects in `profile-page-v2.tsx` introduced during P154 fix work:

1. **Position counts always show 0** — Clicking Agree/Disagree/Unsure on a point in the profile page appears to work (DB write succeeds) but the count labels don't update. After refresh, count still shows 0 even though a position exists in the DB.

2. **Story links disappear after position save** — After clicking a position button, the linked stories under a point vanish. They reappear only on full page reload.

3. **Story expand crashes (regression)** — Clicking "N points by..." on a story card in the Stories tab causes a JavaScript ReferenceError, crashing that section of the page.

**Severity:** HIGH — Counts are the core signal on position cards. Crash on story expand is a regression introduced during P154.

**Note:** P154 (`status: done`) fixed the DB persistence bug (positions save correctly). P155 is about the rendering/data-flow failures that remained.

---

## Root Cause

### Root Cause 1: `AdaptedPoint` discards `positionCounts`

**File:** `src/app/pages/profile-page-v2.tsx:219–294`

`PointWithUserPosition` (service layer) has `positionCounts: Record<PositionType, number>` — all 7 buckets with real DB aggregate counts. The adapter at line ~251 converts to `AdaptedPoint` but **discards `positionCounts` entirely**. It only stores the current user's position in `positions[userId]`.

The `getPointPositionCounts` callback at line ~749 then counts from `p.positions` — a map with **at most 1 entry** (current viewer only). Result: counts always show 0 or 1, never real totals.

`toSevenPointCounts()` already exists at line 1067 (currently dead code from `PointCardFull`). The fix uses it.

### Root Cause 2: Refetch adapter drops `linkedStories`

**File:** `src/app/pages/profile-page-v2.tsx:366–385`

`handleProfilePointPosition` (the position save handler) refetches points after saving. Its inline adapter at line 366 reconstructs `AdaptedPoint` objects but hardcodes `linkedStories: []`. After any position click, all linked stories disappear until the user does a full page reload.

Also: `key={point.id-${position}}` at line 737 forces React to remount the card on every position change, which breaks optimistic count delta calculations.

### Root Cause 3: `StoryCardFull` uses undefined identifiers

**File:** `src/app/pages/profile-page-v2.tsx:811–968`

`StoryCardFull` is defined at module level after `ProfilePageV2` closes at line 799. Lines 952–953 reference `currentUser` and `handleProfilePointPosition` as bare identifiers — but these names are **not in scope at all** at module level. This is not a stale closure; the identifiers are simply undefined. JavaScript throws a ReferenceError at first render when the expanded points section mounts.

The `StoryCardFullProps` interface has only `story`, `author`, `credibilityStats` — the missing dependencies are not declared anywhere, making the bug invisible until runtime.

---

## Fix

### Fix 1: Preserve `positionCounts` through the adapter

**File:** `src/app/pages/profile-page-v2.tsx`

Add `positionCounts: Record<string, number>` to the `AdaptedPoint` interface (line ~234).

In the **initial load adapter** (~line 251): populate from `point.positionCounts`.

In the **refetch adapter** (~line 366): populate from `point.positionCounts` AND restore `linkedStories` by looking up the existing adapted point from `realPoints` state: `realPoints.find(rp => rp.id === point.id)?.linkedStories ?? []`.

Fix the `getPointPositionCounts` callback (~line 749):
```typescript
// Before (wrong — counts sparse positions map):
getPointPositionCounts={(p: AdaptedPoint) => {
  const counts = { strongly_agree: 0, agree: 0, ... };
  Object.values(p.positions || {}).forEach(...);
  return counts;
}}

// After (correct — uses real DB counts):
getPointPositionCounts={(p: AdaptedPoint) => toSevenPointCounts(p.positionCounts || {})}
```

Fix the `key` prop (~line 737):
```typescript
// Before:
key={`${point.id}-${point.positions?.[currentUser?.id || '']?.position || 'none'}`}

// After:
key={point.id}
```

Move `toSevenPointCounts` function (line ~1067) to above `ProfilePageV2` so it's accessible at line 749.

### Fix 2: Pass closure dependencies as explicit props to `StoryCardFull`

**File:** `src/app/pages/profile-page-v2.tsx`

Add to `StoryCardFullProps` interface (~line 805):
```typescript
currentUserId?: string;
onPointPositionSelect?: (pointId: string, pos: Position | null) => void;
```

Destructure in `StoryCardFull` function signature (~line 811).

Update lines 952–953 to use props instead of bare closure references.

Update the `StoryCardFull` call site in the Stories tab render to pass:
```typescript
currentUserId={currentUser?.id}
onPointPositionSelect={handleProfilePointPosition}
```

---

## Acceptance Criteria

### Functional
- [ ] Click Agree on a point → count label increments by 1 on screen immediately
- [ ] Refresh page → count still shows correct number, Agree button still highlighted
- [ ] Click Agree again (toggle) → count decrements, selection removed
- [ ] After position save → linked stories still visible under the point (not blank)
- [ ] Click "N points by..." on a story card → no crash, points expand correctly

### Technical
- [ ] `AdaptedPoint` interface includes `positionCounts`
- [ ] Both adapter paths (initial load + refetch) populate `positionCounts`
- [ ] `getPointPositionCounts` uses `toSevenPointCounts(p.positionCounts)` not `Object.values(p.positions)`
- [ ] `StoryCardFull` receives `currentUserId` and `onPointPositionSelect` as explicit props
- [ ] `key` prop on `PointCardWithLinks` is `point.id` only (no position suffix)

### Verification (required before marking done)
- [ ] **Visual gate:** Open `/p/:slug`, click Agree on a point, screenshot confirms count = 1 and button highlighted
- [ ] **Persistence:** Refresh page, confirm count and selection still visible
- [ ] **Story expand:** Navigate to Stories tab, click "N points by...", confirm no crash
- [ ] **Adjacent pages:** Open `/point/:id` (point detail page), confirm positions still work correctly

---

## Key Files

| File | Lines | Relevance |
|------|-------|-----------|
| `src/app/pages/profile-page-v2.tsx` | 219–294 | `AdaptedPoint` interface + initial adapter |
| `src/app/pages/profile-page-v2.tsx` | 337–392 | `handleProfilePointPosition` + refetch adapter |
| `src/app/pages/profile-page-v2.tsx` | 735–781 | `PointCardWithLinks` render + `getPointPositionCounts` callback |
| `src/app/pages/profile-page-v2.tsx` | 799–968 | `StoryCardFull` (module-level, closure bug) |
| `src/app/pages/profile-page-v2.tsx` | 1063–1212 | `toSevenPointCounts` + dead `PointCardFull` |
| `e2e/p154-position-persistence-profile.spec.ts` | multiple | Existing E2E — needs count assertions added |

## Reference Implementation

`src/app/pages/point-detail-page.tsx:119–151` — correct position persistence pattern (working).

`toSevenPointCounts()` at `profile-page-v2.tsx:1067` — correct count normalization utility (exists, not used by points tab).

---

## Related

- **P154:** Fixed DB persistence (positions save) — `status: done`
- **P151:** Fixed position loading batch queries — `status: done`
- **Root cause analysis:** Session d0c62c46, agents a5df969, af86ce3, afeec2b

---

## Technical Architecture

### Pre-flight Assessment

**Problem statement:** Complete, with one note. Accurate line references and impact described. One latent issue: `realPoints` state is typed `PointWithUserPosition[]` but set to `AdaptedPoint[]` at runtime (line 291). This pre-existing type mismatch doesn't crash, but the `positionCounts` addition to `AdaptedPoint` must not touch the fallback path at line 293 (`setRealPoints(validPoints)` still passes `PointWithUserPosition[]`). Type fix is deferred.

**Root causes:** RC1 and RC2 are accurate. RC3 requires a precision correction: the spec says "invisible closure dependency" but the mechanism is more severe. `currentUser` and `handleProfilePointPosition` at lines 952-953 are **undefined identifiers** — `StoryCardFull` is defined after `ProfilePageV2` closes at line 799, so these names are out of scope entirely. JavaScript throws a ReferenceError at first render of the expanded section. The fix is the same regardless.

**Fix approach:** Sound, with one refinement. The spec proposes a `useRef` cache for `linksByPoint` to restore `linkedStories` in the refetch path (RC2). This is unnecessary: `handleProfilePointPosition` already closes over `realPoints` state, which holds the adapted points with `linkedStories` from initial load. A `realPoints.find(rp => rp.id === point.id)` lookup inside the refetch adapter achieves the same result without the ref infrastructure.

---

### Architecture Decisions

**Decision 1: Restoring `linkedStories` in the refetch adapter**

- **Chosen:** Look up `linkedStories` from current `realPoints` state by point ID inside `handleProfilePointPosition`
- **Rationale:** `handleProfilePointPosition` closes over `realPoints`. At click time, `realPoints` contains the fully adapted points with `linkedStories` from initial load. Zero new infrastructure.
- **Trade-off:** Uses pre-refetch `linkedStories` value. If a story link is added between page load and position click, it won't appear until full reload. Acceptable — story links don't change from position saves.
- **Alternative rejected:** `useRef` cache for `linksByPoint` Map. The Map is computed inside a `Promise.all().then()` callback; hoisting it to a ref restructures the loading effect. State lookup solves the same problem directly.

**Decision 2: Placement of `toSevenPointCounts`**

- **Chosen:** Move to module level, immediately before `export function ProfilePageV2()`
- **Rationale:** Pure utility, no component dependencies. Required at line 749 inside `ProfilePageV2` JSX. Already semantically used by dead `PointCardFull` at module level — moving it restores consistency.
- **Trade-off:** None.
- **Alternative rejected:** Extract to `src/app/utils/position-counts.ts`. Out of scope for a bug fix; 9-line function used only in this file.

**Decision 3: `AdaptedPoint` interface placement**

- **Chosen:** Extract from inside the `then()` callback (~line 218) to module level, alongside `ProfileOwner`
- **Rationale:** `AdaptedPoint` is already referenced at lines 735, 749, and 760. Module-level placement removes invisible scoping and makes the data contract explicit. The inline placement contributed to RC3 going undetected.
- **Trade-off:** Interface becomes visible to the whole module — the desired outcome.
- **Alternative rejected:** Leave inline, rely on TypeScript inference. Harms readability, keeps coupling invisible.

**Decision 4: `PointCardFull` dead code**

- **Chosen:** Leave untouched
- **Rationale:** Implements correct `positionCounts` + optimistic delta pattern; serves as reference. Enabling it requires replacing the `PointCardWithLinks` render path — scope creep. The `eslint-disable` comment signals deliberate retention.
- **Alternative rejected:** Enable as active card. Different component, different layout, not a drop-in replacement.

**Decision 5: Optimistic count update**

- **Chosen:** No optimistic delta in the refetch path — use real DB counts from refetch
- **Rationale:** `handleProfilePointPosition` already refetches `getPointsForProfileDisplay` which returns fresh `positionCounts`. Once `positionCounts` flows through the adapter correctly (RC1 fix), counts are accurate after save. Optimistic deltas add reconciliation complexity.
- **Trade-off:** Brief stale count between click and refetch. Acceptable for a bug fix.
- **Alternative rejected:** Local optimistic delta (`PointCardFull` pattern). Only warranted if refetch latency becomes a UX complaint.

---

### Security Review

**RLS Policies:**
- ✅ `point_positions` has RLS enabled. INSERT enforces `auth.uid() = user_id AND is_verified = true`. UPDATE/DELETE enforce `auth.uid() = user_id`. The fix introduces no new DB calls — `setPosition` and `removePosition` go through the Supabase client with the user's JWT; ownership is enforced server-side regardless of client-supplied `userId`.
- ✅ SELECT policy is `USING (true)` — position counts are publicly readable. `positionCounts` is aggregate data with no PII. Surfacing it in the UI is consistent with existing policy intent.

**Authentication:**
- ✅ Guard at line 343 (`if (!currentUser?.id || !profile?.id) return`) is sufficient for UI. Even if bypassed client-side, RLS INSERT policy enforces `is_verified = true` at DB layer.
- ℹ️ Pre-existing gap (not introduced by this fix): UPDATE RLS doesn't re-check `is_verified` — a user who loses verification status can still update an existing position row. Out of scope for P155.

**Authorization:**
- ✅ `currentUser.id` comes from `useAuth()` → Supabase JWT. RLS evaluates `auth.uid()` server-side from the signed JWT, not from any client-supplied value. Cannot be spoofed.

**Input Validation:**
- ✅ `positionCounts` values are `number` aggregates from a DB trigger. Rendered as numeric labels, not HTML. No XSS vector. `toSevenPointCounts()` applies `?? 0` fallbacks — malformed keys produce 0.
- ✅ `position` string reaches `setPosition` as a parameterized Supabase query. No SQL injection risk.

**Data Protection:**
- ✅ `positionCounts` is aggregate per-point (e.g., `agree: 3`). No user identity revealed. Individual user position stored client-side only for button highlight state, not exposed in HTML or sent to third parties.

---

### Refactoring Assessment

**Required for this fix (prerequisites):**

1. Extract `AdaptedPoint`, `AdaptedPosition`, `AdaptedStory` interfaces from inside the `then()` callback (~line 218) to module level — prerequisite for clean type annotations on the `positionCounts` addition
2. Move `toSevenPointCounts` from line 1067 to module level above `ProfilePageV2` — prerequisite to call it at line 749
3. Add `positionCounts: Record<string, number>` to `AdaptedPoint` — core RC1 fix
4. Add `currentUserId?: string` and `onPointPositionSelect?` to `StoryCardFullProps` — core RC3 fix

**Deferred (out of scope for this bug fix):**

- Extract shared `adaptPoint(point, linkedStories)` function to eliminate duplicated adapter logic between initial load (line 251) and refetch (line 366). The duplication is the structural cause that allowed RC2 to occur — but extraction is a refactor. The state-lookup approach stops the bleeding without changing the structure.
- Fix `realPoints` state type from `PointWithUserPosition[]` to `AdaptedPoint[]` — pre-existing mismatch, no runtime errors, risky to touch the fallback path at line 293
- Delete `PointCardFull` dead code — pending decision on whether to eventually enable it
- Fix `QuotedPointCard` position counts inside story expand — that component has a separate zero-count issue (local `useState` + zeroed `baseCounts`). A different bug, out of scope here.

---

### Implementation Approach

**Files to modify:** `src/app/pages/profile-page-v2.tsx` only. No other files need changes. No database migrations.

**Build sequence:**

- [ ] **Step 1 — Extract interfaces to module level.** Move `AdaptedPoint`, `AdaptedPosition`, `AdaptedStory` out of the `then()` callback (~line 218) to module level after `ProfileOwner` interface (~line 57). Remove the now-duplicate inline definitions.

- [ ] **Step 2 — Move `toSevenPointCounts`.** Cut from line 1067, paste at module level immediately before `export function ProfilePageV2()`. Verify it's pure (no closure dependencies).

- [ ] **Step 3 — Fix RC1: Preserve `positionCounts` through the adapter.**
  - Add `positionCounts: Record<string, number>` to `AdaptedPoint` interface
  - In initial load adapter return (~line 281): add `positionCounts: point.positionCounts ?? {}`
  - In refetch adapter return (~line 377): add `positionCounts: point.positionCounts ?? {}`
  - Replace `getPointPositionCounts` callback body at line 749-766 with: `return toSevenPointCounts(p.positionCounts ?? {})`

- [ ] **Step 4 — Fix RC2a: Restore `linkedStories` in refetch adapter.** Inside `handleProfilePointPosition`, before the `updatedPoints.map()` call, extract `const existingPoints = realPoints as AdaptedPoint[]`. In the map return object, replace `linkedStoryIds: []` and `linkedStories: []` with lookup: `const existing = existingPoints.find(rp => rp.id === point.id)` then `linkedStoryIds: existing?.linkedStoryIds ?? []` and `linkedStories: existing?.linkedStories ?? []`.

- [ ] **Step 5 — Fix RC2b: Fix `key` prop.** Change line 737 from `key={\`${point.id}-${point.positions?.[currentUser?.id || '']?.position || 'none'}\`}` to `key={point.id}`.

- [ ] **Step 6 — Fix RC3: Explicit props for `StoryCardFull`.**
  - Add to `StoryCardFullProps` (~line 805): `currentUserId?: string` and `onPointPositionSelect?: (pointId: string, pos: Position | null) => void`
  - Destructure both in function signature (~line 811)
  - Replace `currentUser?.id` at line 952 with `currentUserId`
  - Replace `handleProfilePointPosition` at line 953 with `onPointPositionSelect`
  - At the `StoryCardFull` call site in the Stories tab render, add `currentUserId={currentUser?.id}` and `onPointPositionSelect={handleProfilePointPosition}`

- [ ] **Step 7 — Type check.** Run `npm run build` or `tsc --noEmit`. Confirm no new errors in modified sections.

- [ ] **Step 8 — Visual verification (required before marking done).** See Acceptance Criteria → Verification section above.
