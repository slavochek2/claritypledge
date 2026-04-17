---
status: qa
type: task
rank: 1000680.0
created_date: '2026-04-10'
tags: [visibility, data-integrity, retrofit, letters]
delivery_stage: fix
pipeline_ran: [create-spec, challenge-prd]
---

# P681: Make Point & Story Visibility Structurally Reliable

## Problem

**Situation:** P586 added public/private visibility to points and stories. The DB column exists, RLS enforces it, and the story detail page renders it correctly.

**Complication:** Visibility was added as an optional field on `PointSummary` and `Point` types. Several data paths (docs service, letter snapshot mapper, live session) don't fetch or carry the field. Components default `undefined` to `'public'`. Result: private points silently display with a public globe icon in 4 confirmed views — doc drafts, letter preview, letter reading, and live sessions. This is a data integrity issue that erodes user trust in privacy controls.

**Question:** How do we make visibility structurally reliable — impossible to silently drop — across all existing and future data paths?

## Appetite

- **Blast radius:** High — touches type definitions, 3 services, 4 pages, 2 components, 1 SQL function. Every view that renders points is affected.
- **Reversibility:** Fully reversible — all changes are additive (adding a field). `git revert` restores previous behavior.
- **Decision density:** Zero — no product decisions. Pure data plumbing. The field exists in DB, we just need to carry it everywhere.

## Solution

**Strategy: enforce at the type layer, let the compiler find every gap.**

1. Make `visibility` **required** on `PointSummary` and `Point` types
2. Run `tsc --noEmit` — every compile error is a gap to fix
3. Fix each gap: add `visibility` to selects, mappers, and snapshot conversions
4. Update the seal RPC to store per-point visibility in `point_config`
5. Remove defensive `?? 'public'` defaults from components (except where backward compat genuinely requires it)

### Architectural insight

The root cause is **three compounding failures**:
- **Types lie:** `visibility?` means TypeScript can't catch missing data
- **Components mask:** `?? 'public'` defaults hide the problem instead of surfacing it
- **No shared contract:** Each service has its own point select string — some include `visibility`, some don't

The fix addresses all three: required types (compiler catches gaps), remove masking defaults (bugs surface as errors), and each mapper explicitly handles visibility (no silent drops).

### Backward compatibility

- **Live sessions:** Old `live_state` JSON in Realtime lacks point visibility. Keep `visibility?` optional on `LiveStoryData.points` and use `?? 'public'` fallback only in live session components.
- **Sealed letters:** Old `point_config` JSONB lacks per-point visibility. Fallback chain: `point.visibility ?? snapshot.visibility ?? 'public'`. No data backfill needed.

## Implementation Plan

**Dependency order:** Step 1 first (types), then 2-5 in parallel (data paths), then 6 (components), then 7 (SQL), then 8-9 (mocks + tests).

### Step 1: Make `visibility` required on point types

**File: `src/app/types/index.ts` line 1075:**
```typescript
// BEFORE:
visibility?: ContentVisibility; // P586: public/private visibility

// AFTER:
visibility: ContentVisibility; // P586: public/private visibility — REQUIRED
```

**File: `src/app/components/shared/prototype-types.ts` line 57:**
```typescript
// BEFORE:
visibility?: IdeaVisibility;

// AFTER:
visibility: IdeaVisibility;
```

**File: `src/app/types/index.ts` lines 536-544 (`LiveStoryData.points`):**
```typescript
// ADD visibility to the inline points type (keep optional — Realtime backward compat):
points: Array<{
  id: string;
  statement: string;
  context?: string;
  tags: string[];
  positionCounts?: Record<string, number>;
  userPosition?: string | null;
  profileSubjectPosition?: string | null;
  visibility?: string;  // ADD — optional because old live_state JSON lacks it
}>;
```

**Verify:** `npx tsc --noEmit 2>&1 | grep "visibility"` — catalog every error. Each error maps to one of the steps below.

### Step 2: Fix docs-service.ts — select + interface + mapper

**File: `src/app/data/docs-service.ts`**

**2a. DB interface (lines 51-58) — add `visibility` to point shape in `DbDocStoryWithStory`:**
```typescript
// Inside the story_points array, the point object:
point: {
  id: string;
  statement: string;
  context: string | null;
  tags: string[];
  visibility: string | null;  // ADD THIS
} | null;
```

**2b. Select string (lines 235-242) — add `visibility` to `STORY_WITH_AUTHOR_AND_POINTS_SELECT`:**
```sql
story_points (
  point_id,
  point:points!story_points_point_id_fkey (
    id,
    statement,
    context,
    tags,
    system_tags,
    visibility
  )
)
```

**2c. Mapper (lines 135-147) — add `visibility` to `mapPointSummaries()` output:**
```typescript
// Follow the pattern from stories-service-real.ts:135
.map((sp) => ({
  id: sp.point.id,
  statement: sp.point.statement,
  context: sp.point.context ?? undefined,
  tags: [...(sp.point.tags || []), ...((sp.point as { system_tags?: string[] }).system_tags || [])],
  systemTags: (sp.point as { system_tags?: string[] }).system_tags || [],
  visibility: (sp.point.visibility ?? 'public') as ContentVisibility,  // ADD THIS
}));
```

**Reference pattern:** `stories-service-real.ts:135` (`mapPointSummaryFromDb`) and `stories-service-real.ts:260-268` (select string) — identical structure, already correct.

### Step 3: Fix letter-snapshot-mapper.ts — all 3 functions

**File: `src/app/utils/letter-snapshot-mapper.ts`**

**3a. PointConfigPoint interface (lines 14-19) — add `visibility`:**
```typescript
interface PointConfigPoint {
  id: string;
  text: string;
  authorPosition: string | null;
  hidden?: boolean;
  visibility?: string;  // ADD — optional because legacy sealed letters don't have it
}
```

**3b. `snapshotToStoryWithPoints` point mapping (lines 75-85) — add `visibility` in the `.map()`:**
```typescript
const visiblePoints: PointSummary[] = rawPoints
  .filter((p) => !p.hidden)
  .map((p) => ({
    id: p.id ?? '',
    statement: p.text ?? '',
    tags: [],
    systemTags: [],
    positionCounts: {},       // SECURITY: never expose community counts
    userPosition: null,
    profileSubjectPosition: (p.authorPosition as PointSummary['profileSubjectPosition']) ?? null,
    visibility: ((p.visibility ?? snapshot.visibility ?? 'public') as ContentVisibility),  // ADD THIS
  }));
```
Fallback chain: per-point (from Step 7 seal RPC) → snapshot-level story visibility → `'public'`. Handles legacy sealed letters gracefully.

**3c. `snapshotToStoryWithPoints` story visibility (line 92) — replace hardcoded `'public'`:**
```typescript
// BEFORE:
visibility: 'public',

// AFTER:
visibility: (snapshot.visibility === 'private' ? 'private' : 'public') as StoryVisibility,
```

**3d. `pointSummaryToProtoPoint` (lines 42-48) — add `visibility` to returned Point:**
```typescript
return {
  id: point.id,
  text: point.statement,
  createdAt: '',
  positions,
  linkedStoryIds: [],
  visibility: point.visibility,  // ADD THIS
};
```

### Step 4: Fix letter-preview-page.tsx — docStoryToSnapshot

**File: `src/app/pages/letter-preview-page.tsx`**

**4a. Point mapping (lines 50-55) — add `visibility`:**
```typescript
points: docStory.story.points.map((p) => ({
  id: p.id,
  text: p.statement,
  authorPosition: p.userPosition ?? null,
  visibility: p.visibility,  // ADD THIS
})),
```

**4b. Snapshot visibility (line 56) — use story visibility instead of hardcoded:**

The `visibility` column on `letter_story_snapshots` stores **story visibility** (copied from `stories.visibility::text` at seal time — see `20260403224331_p581_clarity_letters.sql:431`). The hardcoded `'published'` is simply wrong — it's not a valid story visibility value. Replace with the actual story visibility:

```typescript
// BEFORE:
visibility: 'published',

// AFTER:
visibility: docStory.story.visibility ?? 'public',
```

Note: fallback is `'public'` (a valid `ContentVisibility` value), not `'published'` (which was a bug).

### Step 5: Fix live session — carry visibility through Realtime state

**File: `src/app/pages/clarity-live-page.tsx` lines 1528-1536:**
```typescript
// In handleSelectStory, add visibility to the point mapping:
points: storyData.points.map(p => ({
  id: p.id,
  statement: p.statement,
  context: p.context,
  tags: p.tags,
  positionCounts: p.positionCounts,
  userPosition: p.userPosition,
  profileSubjectPosition: p.profileSubjectPosition,
  visibility: p.visibility,  // ADD THIS
})),
```

**File: `src/app/components/partners/round-summary-screen.tsx` line 41:**
```typescript
// BEFORE:
points: data.points as PointSummary[],

// AFTER:
points: data.points.map(p => ({
  ...p,
  visibility: ((p.visibility ?? 'public') as ContentVisibility),
})),
```
Import `ContentVisibility` from `@/app/types` if not already imported.

**File: `src/app/components/partners/live-story-card-expanded.tsx` line 267:**
No code change needed. Keep existing `?? 'public'` — justified because `LiveStoryData.points` visibility is optional (old sessions genuinely lack it).

### Step 6: Fix component defaults

**File: `src/app/components/shared/visibility-badge.tsx` line 79:**
```typescript
// BEFORE:
export function InlineVisibilityIcon({ visibility }: { visibility?: StoryVisibility }) {
  const v = visibility ?? 'public';

// AFTER:
export function InlineVisibilityIcon({ visibility }: { visibility: StoryVisibility }) {
  // visibility is now required — no fallback needed
```
Use `visibility` directly everywhere `v` was used in this function.

Note: `CardVisibilityCornerBadge` (line 57) keeps optional prop — used in creation contexts where visibility is genuinely unknown.

**File: `src/app/components/feed/feed-point-card.tsx` line 172:**
```typescript
// BEFORE:
<InlineVisibilityIcon visibility={point.visibility ?? 'public'} />

// AFTER:
<InlineVisibilityIcon visibility={point.visibility} />
```

**Justified exceptions — keep `?? 'public'`:**
- `live-story-card-expanded.tsx:267` — live session data genuinely optional (old sessions)
- `round-summary-screen.tsx` — same reason

### Step 7: SQL migration — per-point visibility in seal RPC

Create `supabase/migrations/YYYYMMDDHHMMSS_seal_rpc_add_point_visibility.sql`.

Copy the entire `seal_and_send_letter` function from `20260410090000_fix_seal_denormalize_regression.sql` and add ONE field to the point `jsonb_build_object` (around line 66-75 of that file):

```sql
-- In the jsonb_build_object for each point, add the visibility line:
jsonb_build_object(
  'id', pt.id::text,
  'text', pt.statement,
  'authorPosition', (
    SELECT pp.position::text
    FROM point_positions pp
    WHERE pp.point_id = pt.id AND pp.user_id = v_sender_id
    LIMIT 1
  ),
  'visibility', pt.visibility::text    -- ADD THIS LINE
) ORDER BY sp.created_at
```

The rest of the function body stays identical. Wrap with `CREATE OR REPLACE FUNCTION` and `GRANT EXECUTE`.

- No backfill migration needed — Step 3b's fallback chain handles legacy sealed letters at read time
- Run `./scripts/migrate.sh` after creating the file

### Step 8: Fix mock service + test fixtures

**File: `src/app/data/stories-service-mock.ts` lines 77-84:**
```typescript
// Add visibility: 'public' to each mock PointSummary in mockStoryPoints:
{
  id: 'point-2',
  statement: "Admitting confusion is a sign of strength, not weakness",
  context: 'From my journey learning to say "I don\'t understand"',
  tags: ['vulnerability', 'leadership'],
  systemTags: [],
  visibility: 'public',  // ADD
},
```

**Same file, lines 204-210 (newPoint in `linkPointToStory`):**
```typescript
const newPoint: PointSummary = {
  id: pointId,
  statement: `Mock point ${pointId}`,
  context: 'Mock context for testing',
  tags: ['mock'],
  systemTags: [],
  visibility: 'public',  // ADD
};
```

**File: `src/tests/quoted-point-dropdown.test.tsx` lines 32-36:**
```typescript
const mockPoint: PointSummary = {
  id: 'point-1',
  statement: 'Remote work is more productive than office work',
  tags: [],
  systemTags: [],         // ADD if missing
  visibility: 'public',   // ADD
};
```

**File: `src/tests/p451-story-cta.test.tsx` lines 123-127:**
```typescript
const mockPointSummary: PointSummary = {
  id: POINT_ID,
  statement: 'Remote work is more productive',
  tags: [],
  systemTags: [],         // ADD if missing
  visibility: 'public',   // ADD
};
```

**File: `src/tests/letter-snapshot-mapper.test.ts` lines 193-203:**
```typescript
function makePointSummary(overrides: Partial<PointSummary> = {}): PointSummary {
  return {
    id: 'point-1',
    statement: 'Test statement',
    tags: [],
    systemTags: [],
    positionCounts: {},
    userPosition: null,
    profileSubjectPosition: null,
    visibility: 'public',  // ADD — now required
    ...overrides,
  };
}
```

### Step 9: Add visibility propagation tests

**File: `src/tests/letter-snapshot-mapper.test.ts`**

Add inside `describe('snapshotToStoryWithPoints')`:
```typescript
describe('visibility propagation', () => {
  it('uses snapshot.visibility for story visibility (not hardcoded public)', () => {
    const result = snapshotToStoryWithPoints(makeSnapshot({ visibility: 'private' }), 'Alice');
    expect(result.visibility).toBe('private');
  });

  it('maps per-point visibility from point_config when present', () => {
    const snapshot = makeSnapshot({
      point_config: {
        storyText: 'Story',
        points: [
          { id: 'p1', text: 'Private point', authorPosition: null, visibility: 'private' },
          { id: 'p2', text: 'Public point', authorPosition: null, visibility: 'public' },
        ],
      },
    });
    const result = snapshotToStoryWithPoints(snapshot, 'Alice');
    expect(result.points[0].visibility).toBe('private');
    expect(result.points[1].visibility).toBe('public');
  });

  it('falls back to snapshot.visibility when point has no visibility (legacy data)', () => {
    const snapshot = makeSnapshot({
      visibility: 'private',
      point_config: {
        storyText: 'Story',
        points: [{ id: 'p1', text: 'Legacy point', authorPosition: null }],
      },
    });
    const result = snapshotToStoryWithPoints(snapshot, 'Alice');
    expect(result.points[0].visibility).toBe('private');
  });

  it('defaults to public when neither point nor snapshot has visibility', () => {
    const snapshot: LetterStorySnapshot = {
      letter_id: '', story_id: 'story-1', version_id: '', position: 0,
      point_config: { storyText: 'S', points: [{ id: 'p1', text: 'P', authorPosition: null }] },
      visibility: '',  // empty string = falsy
    };
    const result = snapshotToStoryWithPoints(snapshot, 'Alice');
    expect(result.points[0].visibility).toBe('public');
  });
});
```

Add inside `describe('pointSummaryToProtoPoint')`:
```typescript
it('carries visibility from PointSummary to Point', () => {
  const result = pointSummaryToProtoPoint(makePointSummary({ visibility: 'private' }));
  expect(result.visibility).toBe('private');
});
```

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [WARN] Incomplete `?? 'public'` inventory — spec lists 10 files but 6+ more have the pattern | Added grep-based Done-When criterion + justified exceptions table | Compiler catches type gaps; grep catches defensive defaults. Both together guarantee coverage. |
| 2 | /challenge-prd | [WARN] `visibility: 'published'` in letter-preview-page conflates letter status with story visibility | Fixed Step 4b: fallback changed to `'public'` (valid ContentVisibility); added migration-sourced explanation | DB column stores `stories.visibility::text` at seal time. `'published'` was never a valid value — it was a bug, not a semantic choice. |

## Risks / Non-Goals

### Risks
- **Compile error cascade:** Making visibility required will produce many TS errors. Mitigation: the plan identifies every location — fix mechanically. Run `tsc --noEmit` after each step to verify progress.
- **Live session backward compat:** Old `live_state` JSON in active Realtime channels lacks visibility. Mitigation: keep `visibility?` optional on `LiveStoryData.points`, use `?? 'public'` only in live-session components.
- **Sealed letter backward compat:** Old `point_config` lacks per-point visibility. Mitigation: fallback chain `point.visibility ?? snapshot.visibility ?? 'public'` — no migration needed.

### Non-Goals
- Do NOT refactor point select strings into a shared constant (tempting but separate concern)
- Do NOT change how visibility is set (creation UX, toggle behavior) — only how it's carried and displayed
- Do NOT add visibility to any new surfaces beyond what already exists
- Do NOT backfill old sealed letter `point_config` in DB — read-time fallback is sufficient
- Do NOT touch RLS policies — they already enforce visibility correctly at the data layer

### Rollback Strategy
All changes are additive. To rollback: revert the type changes back to optional, revert each mapper/select addition. `git revert` of the commit(s) restores previous behavior completely. The SQL migration is `CREATE OR REPLACE` — revert by re-running the previous migration's version of the function.

## Done-When

- [ ] `npx tsc --noEmit` produces zero visibility-related errors
- [ ] `npm test -- --run` passes (all existing + new visibility tests)
- [ ] Private point in a doc draft (`/letters/drafts/:id`) shows lock icon (not globe)
- [ ] Private point in letter preview (`/letter/:id/preview`) shows lock icon
- [ ] Private story in sealed letter reading page shows correct visibility
- [ ] Private point in live session shows lock icon
- [ ] New unit tests verify: snapshot visibility propagation, per-point visibility, legacy fallback chain
- [ ] `grep -rn '?? .public.' src/ --include='*.ts' --include='*.tsx'` returns only documented exceptions (see below)

### Justified `?? 'public'` exceptions

The compiler makes `visibility` required on `PointSummary` and `Point`, but some `?? 'public'` defaults serve a different role (story-level defaults, DB-nullable fields, or backward-compat for serialized JSON). These survive and are justified:

| File | Why kept |
|------|----------|
| `live-story-card-expanded.tsx` | `LiveStoryData.points` is optional (old Realtime JSON) |
| `round-summary-screen.tsx` | Same — maps from `LiveStoryData.points` |
| `stories-service-real.ts:135` | DB column is nullable (`visibility: string | null`); `?? 'public'` is the DB→app boundary default |
| `profile-page-v2.tsx` | Story/point objects from various sources; `?? 'public'` guards at the rendering boundary |
| `point-detail-page.tsx` | Point loaded from single-row fetch; guards nullable DB field |
| `story-detail-page.tsx` | Doc visibility prop from parent; guards nullable source |
| `create-story-page.tsx` | Derives visibility from doc context; guards nullable prop |
| `feed-story-card.tsx` | Story visibility from feed query; guards nullable DB field |
| `visibility-badge.tsx:58` (`CardVisibilityCornerBadge`) | Used in creation contexts where visibility is genuinely unknown |

After making types required, the implementing agent should run the grep and confirm each remaining `?? 'public'` matches this table. Any NOT in this table must be removed or justified.

## Files Modified

**Source (10 files):**
`src/app/types/index.ts` · `src/app/components/shared/prototype-types.ts` · `src/app/data/docs-service.ts` · `src/app/utils/letter-snapshot-mapper.ts` · `src/app/pages/letter-preview-page.tsx` · `src/app/pages/clarity-live-page.tsx` · `src/app/components/partners/round-summary-screen.tsx` · `src/app/components/shared/visibility-badge.tsx` · `src/app/components/feed/feed-point-card.tsx` · `src/app/data/stories-service-mock.ts`

**New (1 file):** `supabase/migrations/YYYYMMDDHHMMSS_seal_rpc_add_point_visibility.sql`

**Test fixtures (3 files):** `src/tests/letter-snapshot-mapper.test.ts` · `src/tests/quoted-point-dropdown.test.tsx` · `src/tests/p451-story-cta.test.tsx`

## Implementation Notes

This spec is self-contained — all code snippets are inline above. No external plan file dependency.

**Working branch:** `feature/letters-ship` (worktree w2 at `.claude/worktrees/w2`). This fix should be implemented on that branch since it directly affects the letters feature being shipped.
