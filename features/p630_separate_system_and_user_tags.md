---
status: in-progress
type: task
rank: 6.0
workstream: C2
tags: [tags, refactor, data-model]
prepped_date: '2026-04-03'
delivery_stage: uat
flow: dev
uat_file: features/uat/p630.md
test_files:
  - src/tests/p630-system-tags.test.ts
  - e2e/integration/p630-system-tags-migration.spec.ts
reviews:
  ux: null
  architect: null
  alignment: null
---

# P630: Separate System Tags from User Tags

## Problem Statement

**Current state:** Stories and points use a single flat `tags[]` array for everything — structural linkage (`st1`–`st9`), content category (`understanding`, `misunderstanding`), lifecycle state (`v1`, `v2`, `deprecated`), and future user-created hashtags. The `extractHashtags()` function auto-persists any `#word` from content text with no whitelist or approval gate.

**Pain points:**
- Agents invented new system tags (`motivation`, `deprecated`) without founder approval — discovered after the fact on prod (4 affected points)
- No distinction between tags that drive feed logic (sorting, filtering, version collapsing) and tags users create for their own categorization
- `extractHashtags()` blindly persists any `#word` from content text — no review, no allowed-tags check
- System tags and user tags will conflict as users start creating their own hashtags (a user typing `#v2` or `#understanding` would collide with system semantics)

**Who's affected:**
- Founder (content governance — system tags modified without approval)
- Future users (their freeform hashtags will collide with system tag semantics)
- Feed logic (depends on tag patterns for sorting, version collapsing, category filtering)

---

## Intention (Why This Matters)

**Strategic importance:** Users need freeform hashtags for their own content categorization. The system needs controlled tags for feed logic. These are fundamentally different concerns sharing one field. Separating them now prevents collisions before users start creating content.

**Why now:** Rogue tags already leaked to prod. Users will create their own stories/points soon (Sifter, direct creation). Every day without separation increases the cleanup cost.

**Impact if not solved:** User-created `#v2` breaks version collapsing. User-created `#st5` breaks feed ordering. Agent-created tags keep polluting the system namespace without approval. The longer we wait, the more user data mixes with system data.

---

## Business Requirements

**Must-haves:**
- System tags (those that drive feed logic) are distinguishable from user tags in the data model
- `extractHashtags()` does not auto-persist system tags — only user tags flow through auto-extraction
- System tags can only be set programmatically (by code/migrations), never by `extractHashtags()` from content text
- Users can create any freeform hashtags they want without restriction
- Existing feed logic (`collapseToLatest`, `getStGroup`, `getVersion`, `filterByTags`, `isInternalTag`) continues working identically
- Feed tag cloud shows only user-created tags (already partially implemented — `isInternalTag` filters `st\d+` and `v\d+`)
- Clean up rogue tags on prod: remove `motivation` from 2 points, remove `deprecated` from 2 points

**Success conditions:**
- A user typing `#v2` or `#understanding` in their content creates a user tag, not a system tag
- Feed sorting/filtering/collapsing works identically before and after
- No new system tag values can be introduced without a code change

**Constraints:**
- `v1`/`v2` versioning will eventually be automated when child-point functionality ships — the solution must not make that harder
- Existing `st_number` ordering, version collapsing, and category filtering must not break
- Migration must be backwards-compatible (existing content keeps working)

---

## User Stories

**As the founder managing content:**
- I want system tags to be code-controlled only, so that agents and users cannot accidentally introduce new system tag values
- I want rogue tags (`motivation`, `deprecated`) cleaned from prod, so that the tag namespace is consistent

**As a future user creating content:**
- I want to add any `#hashtag` I like to my stories and points, so that I can organize my content my way
- I want my hashtags to never interfere with feed sorting or version logic, so that the feed works correctly regardless of what I tag

**As the feed system:**
- I want to read system tags from a controlled source (not mixed with user tags), so that `collapseToLatest` and `getStGroup` produce correct results even when users create arbitrary hashtags

---

## Jobs to Be Done

**When creating a story or point with `#hashtags` in the text:**
- I want my hashtags saved as user tags, so I can find and filter my content later (motivation: personal organization)

**When the feed renders stories and points:**
- I want system tags (st-group, version, category) reliably available, so sorting and collapsing work correctly (motivation: content integrity)

**When reviewing what's on prod:**
- I want to know that every system tag was deliberately set, so I can trust the data (motivation: governance)

---

## Outcomes (Success Metrics)

- **Zero tag collisions:** User-created hashtags never interfere with feed logic
- **Zero unauthorized system tags:** No new system tag values appear without a code change
- **Feed parity:** Feed sorting, filtering, and version collapsing produce identical results before and after migration
- **Prod cleanup:** 4 rogue tag entries removed (2 `motivation`, 2 `deprecated`)

---

## Acceptance Criteria

- [ ] System tags and user tags are distinguishable in the data model
- [ ] `extractHashtags()` only produces user tags — never system tags
- [ ] A user typing `#v2` or `#st5` in content creates a user tag that does not affect feed logic
- [ ] Feed sorting by st-group number works identically
- [ ] Version collapsing (`collapseToLatest`) works identically
- [ ] Category filtering (`understanding`/`misunderstanding`) works identically
- [ ] Tag cloud on feed page shows only user-created tags (no system tags)
- [ ] Rogue tags cleaned from prod: `motivation` (2 points), `deprecated` (2 points)
- [ ] Existing tests pass (test data updates to use `systemTags` field are expected and justified)
- [ ] Migration is idempotent and backwards-compatible

---

## Scope Fence

**What NOT to build:**
- No new UI for tag management — auto-extraction continues for user tags
- No tag editing UI — out of scope
- No child-point versioning automation — that's a separate future feature (P630 just makes it not harder)

**What NOT to change:**
- Feed page layout and UX — identical before and after
- Story/point creation flow — users still type `#hashtags` in content
- `TagPills` component rendering — it shows tags the same way
- The `trg_sync_story_st_tags_to_points` trigger behavior — it must continue cascading st-tags

**Existing code to build on (not reinvent):**
- `isInternalTag()` in `feed-utils.ts` — already distinguishes `st\d+` and `v\d+` patterns
- `getStGroup()`, `getVersion()`, `collapseToLatest()` — feed logic that reads system tags
- `extractHashtags()` in `utils.ts` — auto-extraction from content text
- `filterByTags()` — tag-based filtering
- `trg_sync_story_st_tags_to_points` — DB trigger for st-tag cascade

---

## Technical Architecture

### Technical Analysis

#### Current Code State

**Database schema:** Both `stories` and `points` tables have a single `tags text[]` column that stores all tag types in a flat array. There is no schema-level distinction between system tags (`st1`, `v2`, `understanding`) and user tags (`leadership`, `trust`).

**DB triggers (authoritative tag source for stories):**

| Trigger | Table | Timing | Behavior |
|---------|-------|--------|----------|
| `trg_stories_extract_hashtags` | stories | BEFORE INSERT/UPDATE OF content | Overwrites `tags` with ALL `#word` matches from content text. No filtering. |
| `trg_sync_story_st_tags_to_points` | stories | AFTER INSERT/UPDATE OF tags,content | Extracts `st\d+` tags from story, cascades to linked points via `story_points`. |

The extract trigger is the root cause: it runs `regexp_matches(content, '#(\w+)')` and replaces the entire `tags` array. Any `#word` in content becomes a persisted tag — including system-semantic words like `v2`, `st5`, `understanding`.

**Client-side tag extraction:** `extractHashtags()` in `src/lib/utils.ts` does the same `#(\w+)` extraction. Called from:

| Call site | File | Context |
|-----------|------|---------|
| `createStory()` | `create-story-page.tsx:182` | Passes extracted tags to `storiesService.createStory()` |
| `createPoint()` | `story-detail-page.tsx:168` | Passes extracted tags to `pointsService.createPoint()` |
| Story edit save | `story-detail-page.tsx:797` | Passes extracted tags to `storiesService.updateStory()` |
| Profile inline create | `profile-page-v2.tsx:1174` | Passes extracted tags for new point |
| Profile story update | `profile-page-v2.tsx:1032` | Local state update with extracted tags |
| StoryGuideChat save | `StoryGuideChat.tsx:653-654` | Both create and update paths |

Note: For stories, client-side extraction is redundant — the DB trigger overwrites `tags` anyway. For points, client-side extraction is the only mechanism (no DB trigger on points).

**Feed logic (readers of system tags):**

| Function | File | Reads |
|----------|------|-------|
| `getStGroup(tags)` | `feed-utils.ts:35` | `st\d+` from tags array |
| `getVersion(tags)` | `feed-utils.ts:42` | `v\d+` from tags array |
| `collapseToLatest(items)` | `feed-utils.ts:49` | Both st-group and version |
| `filterByTags(items, tags)` | `feed-utils.ts:20` | Any tag (OR matching) |
| `isInternalTag(tag)` | `feed-utils.ts:30` | `st\d+` or `v\d+` patterns |
| `resolvePointSlug(slug)` | `points-service-real.ts:922` | `st\d+`, `v\d+`, `misunderstanding` via `.contains('tags', [...])` |

**Tag display:**

| Component | File | Behavior |
|-----------|------|----------|
| Tag cloud (feed) | `feed-page.tsx:88-103` | Counts all tags, filters out `isInternalTag()` |
| `TagPills` | `tag-pills.tsx` | Renders all tags passed to it (no filtering) |
| `stripHashtags()` | `utils.ts:141` | Removes `#tag` text from content to avoid double-display |

**Supabase queries using `.contains('tags', [...])`:**
- `getPublicPointsFeed()` — `points-service-real.ts:776`
- `resolvePointSlug()` — `points-service-real.ts:932`
- `getPublicStoriesFeed()` — `stories-service-real.ts:515`

#### Reuse Inventory

28 existing assets touch tags — see call site tables above and Files to Modify below. Key types to add `systemTags` to: `Story`, `Point`, `PointSummary`, `DbStory`, `DbPoint` (all in `src/app/types/index.ts`). Existing tests: `extractHashtags.test.ts` (15 tests), `p602-feed-filters.test.ts` (parseTags, filterByTags, collapse), `p491-hashtag-feed.test.tsx` (integration).

---

### Architecture Decisions

#### Decision 1: Separate `system_tags` column (Option B)

**Decision: Option B — separate `system_tags text[]` column.** Rejected: (A) prefix convention — breaks all data + queries, leaks into display; (C) code-only filtering — root cause untouched, DB trigger still overwrites.

Rationale:
1. **Root cause fix.** The DB trigger `trg_stories_extract_hashtags` overwrites `tags` on every content change. With separate columns, it can continue overwriting `tags` (now user-only) without touching `system_tags`.
2. **Feed logic isolation.** `getStGroup()`, `getVersion()`, `collapseToLatest()` read from `system_tags` only — immune to user hashtag choices.
3. **Future-proof.** When child-point versioning ships, it writes to `system_tags` — no interaction with user tags at all.
4. **`resolvePointSlug()` correctness.** Currently queries `.contains('tags', [stTag])` — with separation, this queries `system_tags` instead, preventing a user-typed `#st5` from confusing slug resolution.
5. **Clean migration.** Existing `tags` values that match system patterns (`st\d+`, `v\d+`, `understanding`, `misunderstanding`) move to `system_tags`; everything else stays in `tags`.

#### Decision 2: System tag allowlist is code-defined, not DB-stored

System tags are defined by pattern matching in code (already exists as `isInternalTag()`) plus an explicit values list for category tags (`understanding`, `misunderstanding`). No need for a separate `system_tag_definitions` table — the set is small, changes rarely, and must require a code change anyway.

Expand `isInternalTag()` to also recognize `understanding` and `misunderstanding`:

```typescript
const SYSTEM_TAG_PATTERNS = [/^st\d+$/i, /^v\d+$/i];
const SYSTEM_TAG_VALUES = new Set(['understanding', 'misunderstanding']);

export function isSystemTag(tag: string): boolean {
  const lower = tag.toLowerCase();
  return SYSTEM_TAG_PATTERNS.some(p => p.test(lower)) || SYSTEM_TAG_VALUES.has(lower);
}
```

Rename `isInternalTag` to `isSystemTag` across the codebase for clarity (with a re-export alias for backwards compatibility in tests).

#### Decision 3: DB trigger modification strategy

- **`trg_stories_extract_hashtags`**: Modify to write only non-system tags to `tags`, and preserve `system_tags` untouched. The trigger extracts all `#word` matches, filters through `isSystemTag` equivalent in PL/pgSQL, and writes user-only tags to `tags`.
- **`trg_sync_story_st_tags_to_points`**: Modify to read from `system_tags` instead of `tags`. Write to `system_tags` on points. Logic otherwise identical.

#### Decision 4: Client-side `extractHashtags()` filters out system tags

After the migration, `extractHashtags()` returns only user tags (filters out anything matching `isSystemTag()`). This is defense-in-depth — the DB trigger is authoritative for stories, but client filtering protects point creation (which has no DB trigger).

---

### Security Review

**RLS Policies:**
- ✅ Stories: SELECT scoped by visibility, INSERT requires `auth.uid()` + `is_verified`, UPDATE restricted to `auth.uid() = author_id`, DELETE restricted to author.
- ✅ Points: SELECT scoped by visibility, INSERT requires `auth.uid()` + `is_verified`. No UPDATE policy (points are immutable by design).
- ⚠️ **Story authors can currently set any `tags` value via API.** `updateStory()` accepts `tags?: string[]` — RLS permits this since `auth.uid() = author_id`. A user embedding `#st5` or `#v2` in story content gets those as system-semantic tags. **Mitigation:** With the `system_tags` column (Decision 1), the extract trigger writes only user tags to `tags`. `system_tags` is never writable via the client — only set by migration or DB trigger.
- ⚠️ **Sync trigger propagates story tags to linked points (privilege escalation path).** User modifies story `tags` → `trg_sync_story_st_tags_to_points` (SECURITY DEFINER) updates linked points. **Mitigation:** After Decision 3, the sync trigger reads/writes `system_tags` only — user tag changes don't propagate.

**Authentication:**
- ✅ Only verified authenticated users can create stories and points.
- ✅ Only story authors can update their own stories.
- ⚠️ **No distinction between who can set system tags vs. user tags.** **Mitigation:** The architecture (separate column + trigger isolation) enforces this at the DB level. `system_tags` is never in the client write path — only DB triggers and migrations write to it.

**Input Validation:**
- ⚠️ **`extractHashtags()` has no allowlist.** Uses `/#(\w+)/g` — any word after `#` becomes a tag. **Mitigation:** Decision 4 adds `isSystemTag()` filtering in the client. Decision 3 adds equivalent filtering in the DB trigger.
- ⚠️ **DB trigger `extract_hashtags_from_content()` has the same flaw.** **Mitigation:** Decision 3 modifies the trigger to exclude system patterns from `tags` column.
- ✅ Tag values limited to `\w+` characters — no SQL injection or XSS risk via tags.
- ⚠️ **No length limit on tags array.** Low severity — a user could embed many hashtags. Not addressed in this feature (existing constraint).

**Data Protection:**
- ✅ No PII concerns. Tags are content-category metadata.
- ✅ Visibility model (P586) correctly scopes SELECT access.

---

### Implementation Approach

#### Build Sequence

1. **Migration: add `system_tags` column + backfill + trigger updates + write protection** — Single migration file, single transaction. Add `system_tags text[] NOT NULL DEFAULT '{}'` to both `stories` and `points`. Backfill: for each row, move tags matching system patterns from `tags` to `system_tags`. Update `trg_stories_extract_hashtags` to write only non-system tags to `tags` (preserving `system_tags` untouched). Update `trg_sync_story_st_tags_to_points` to read/write `system_tags` instead of `tags`. Add `trg_protect_system_tags` — BEFORE UPDATE trigger on both tables that rejects direct `system_tags` modifications (only allows changes from SECURITY DEFINER triggers and migrations). All in one transaction to prevent the old extract trigger from re-writing system tags to `tags` between steps. PL/pgSQL system tag detection: `tag ~ '^st\d+$' OR tag ~ '^v\d+$' OR tag = 'understanding' OR tag = 'misunderstanding'` (case-insensitive via `lower()`).

4. **Code: add `isSystemTag()` function** — Expand `isInternalTag()` to cover `understanding`/`misunderstanding`. Rename to `isSystemTag()` with backwards-compatible alias.

5. **Code: update `extractHashtags()`** — Filter out system tags from return value.

6. **Code: update feed-utils readers** — `getStGroup()`, `getVersion()`, `collapseToLatest()` read from a `systemTags` field on items instead of `tags`.

7. **Code: update TypeScript types** — Add `systemTags: string[]` to `Story`, `Point`, `PointSummary`, `DbStory`, `DbPoint` types.

8. **Code: update data services** — `stories-service-real.ts` and `points-service-real.ts` map `system_tags` from DB rows. `createPoint()` separates system vs user tags when inserting. `resolvePointSlug()` queries `system_tags` instead of `tags`.

9. **Code: update all `extractHashtags()` call sites** — Remove system tags from what gets passed as `tags` param. For stories this is belt-and-suspenders (trigger is authoritative); for points it is essential.

10. **Code: update tag display and filtering** — `TagPills` and tag cloud already filter via `isInternalTag()` — rename calls. Feed page tag cloud reads from `tags` only (user tags). `filterByTags()` for user-created tags operates on `tags`. Category filtering (`understanding`/`misunderstanding`) and st-group/version filtering operate on `systemTags`. The feed page filter UI must route category tag selections to `systemTags` queries, not `tags`.

11. **Prod cleanup** — SQL to remove `motivation` from 2 points, `deprecated` from 2 points (from both `tags` and `system_tags` since neither is a valid system tag).

#### Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/YYYYMMDDHHMMSS_p630_system_tags.sql` | Single migration: add column + backfill + trigger updates + write protection (all in one transaction) |

#### Files to Modify

| File | Change |
|------|--------|
| `src/lib/feed-utils.ts` | Rename `isInternalTag` to `isSystemTag`; update `getStGroup()`, `getVersion()`, `collapseToLatest()` to read `systemTags` |
| `src/lib/utils.ts` | `extractHashtags()` filters out system tags via `isSystemTag()` |
| `src/app/types/index.ts` | Add `systemTags: string[]` to `Story`, `Point`, `PointSummary`, `DbStory`, `DbPoint` |
| `src/app/data/points-service-real.ts` | Map `system_tags` in all DB row transforms; `createPoint()` splits tags; `resolvePointSlug()` queries `system_tags` |
| `src/app/data/stories-service-real.ts` | Map `system_tags` in all DB row transforms; `createStory()` and `updateStory()` handle `systemTags` |
| `src/app/pages/feed-page.tsx` | Tag cloud reads `tags` only; `collapseToLatest` type compatible with `systemTags` |
| `src/app/pages/create-story-page.tsx`, `story-detail-page.tsx`, `profile-page-v2.tsx`, `StoryGuideChat.tsx` | No code change — `extractHashtags()` auto-filters after step 5. Verify during /dev. |
| `src/app/components/social/StoryCardDetail.tsx` | Pass `systemTags` where needed for display logic |
| `src/app/components/feed/feed-point-card.tsx` | Type update for `systemTags` field |
| `src/app/components/feed/feed-story-card.tsx` | Type update for `systemTags` field |
| `src/tests/extractHashtags.test.ts` | Add tests for system tag filtering |
| `src/tests/p602-feed-filters.test.ts` | Update test data to use `systemTags` for st/v tags |
| `docs/technical/database.md` | Document `system_tags` column on stories and points |

---

## Test Coverage Strategy

**What's Tested:**
- ✅ `isSystemTag()` — 14 unit tests covering st-patterns, v-patterns, category values, user tags, edge cases (src/tests/p630-system-tags.test.ts)
- ✅ `extractHashtags()` with system tag filtering — 6 unit tests: mixed tags, all-system, all-user, case-insensitive, dedup (src/tests/p630-system-tags.test.ts)
- ✅ Feed utils reading from `systemTags` field — 5 unit tests: getStGroup, getVersion, collapseToLatest isolation from user tags (src/tests/p630-system-tags.test.ts)
- ✅ Migration: `system_tags` column exists on both tables (e2e/integration/p630-system-tags-migration.spec.ts)
- ✅ Migration: backfill separation verified — system tags in system_tags, user tags in tags (e2e/integration/p630-system-tags-migration.spec.ts)
- ✅ Cleanup: motivation and deprecated tags removed from prod (e2e/integration/p630-system-tags-migration.spec.ts)
- ✅ UAT: 8 manual scenarios covering feed parity, user hashtag creation, slug resolution, category filtering (features/uat/p630.md)

**What's NOT Tested (rationale):**
- ❌ E2E tests — no visual change; feed looks identical before and after. Feed parity verified via UAT
- ❌ Accessibility tests — no UI change
- ❌ Smoke tests — no new routes or pages
- ❌ DB trigger behavior in test env — triggers require actual Supabase DB; verified via integration tests post-migration

**Test Pyramid:**
```
     /\
    /  \   0 E2E
   /____\
  / 5 INT  \
 /__________\
/ 25 UNIT    \
```

Total: 30 automated tests + 8 UAT scenarios
Files: `src/tests/p630-system-tags.test.ts`, `e2e/integration/p630-system-tags-migration.spec.ts`, `features/uat/p630.md`
