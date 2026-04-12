---
status: all-done
completed_at: "2026-03-25"
type: story
rank: 0.312
tags:
  - privacy
  - rls
  - visibility
  - foundation
delivery_stage: shipped
reviews:
  ux: null
  architect: null
  alignment: null
created_date: 2026-03-25T00:00:00.000Z
related:
  - p424
  - p551
  - p581
uat_file: features/uat/p586.md
test_files:
  - e2e/integration/p586-visibility-privacy.spec.ts
---

# P586: Visibility & Privacy Foundation

## Problem Statement

**Current state:** P424 (Visibility Model Rethink) shipped a three-tier visibility system (public/shared/private) for stories, with RLS enforcement at the story level. However, several gaps remain that block P551 (Clarity Docs) and P581 (Clarity Letters) from delivering their privacy promises.

**Pain points:**
- **Points are unconditionally public.** Points RLS is `USING(true)` — every point is visible to everyone, regardless of the stories they're linked to. A point like "I feel unheard when we discuss finances" created in a therapy context is immediately public. This directly contradicts P551's promise that "content created inside a private doc stays invisible."
- **`story_points` junction leaks private story associations.** The junction table RLS is `USING(true)` — even when a story is private, the fact that it links to specific points is publicly discoverable. An attacker can enumerate which points a private story references.
- **Story visibility is mutable.** Users can change a story's visibility after creation via dropdowns on the story detail page, profile page, and story guide chat. P551 requires immutability (D13) — "want to unpublish? Delete and recreate." Current mutability creates cascading edge cases when stories are linked to docs with fixed visibility.
- **`shared` visibility is underused and confusing.** P551 cuts `shared` (D16) — two modes only: public and private. The `shared` enum value, RLS branch, and UI options remain in the codebase, adding complexity for a value that no downstream feature uses.
- **No visual privacy indicators on point cards.** Story cards show a `VisibilityBadge`, but point cards have no indicator. Users can't tell at a glance whether a point is accessible to others or scoped to their private context. P551 requires clear private/public badges on both story and point cards.
- **No display boundary for private content.** Private stories and their linked points could theoretically appear in profile pages and public feeds. Private content must be confined to its context (docs/letters) and never surface in public-facing views.
- **Border color inconsistency across card types.** Story cards on the story detail page use a blue left border, but point cards, profile tab cards, and feed cards do not. This inconsistency makes it harder to layer meaningful visual privacy treatment (e.g., amber border for private) on top of a system that isn't consistent to begin with.

**Who's affected:**
- P551 (Clarity Docs) — blocked. Cannot deliver private docs without private points.
- P581 (Clarity Letters) — blocked. Letters inherit doc privacy; if points leak, letters leak.
- Therapy/couples users — the primary use case for private content. Trust requires zero leaks.
- Slava (founder) — won't use private docs for therapy if points are globally visible.

## Intention (Why This Matters)

**Strategic importance:** This spec is the privacy infrastructure that P551 and P581 depend on. Without it, "private docs" are a UX illusion — stories are hidden, but their linked points and junction records are visible to anyone. The therapy/couples market requires architectural privacy, not cosmetic privacy.

**Why now:**
- P551 (Clarity Docs) is next in the build sequence. It depends on private points existing.
- P581 (Clarity Letters) depends on P551. The chain is: P586 → P551 → P581.
- The `shared` visibility value adds complexity with zero consumers. Removing it now prevents P551 and P581 from having to work around a dead code path.

**Impact if not solved:**
- P551 ships with a false privacy promise — private docs hide stories but not points
- P581 letters inherit leaky privacy from P551
- Therapy use case remains blocked (founder won't dog-food private docs with visible points)
- `shared` persists as dead code, adding RLS complexity to every future migration

## Business Requirements

**Must-haves:**
- Points have their own `visibility` column (`public` or `private`), set at creation, immutable after
- Point visibility is determined by creation context: points created in a private doc are private, points created in /live or standalone are public
- Public stories cannot link to private points (DB constraint on `story_points` INSERT) — prevents third-party privacy leaks
- The `story_points` junction table follows story visibility (no public enumeration of private story links)
- Story visibility cannot be changed after creation — edit controls are removed from all surfaces
- The `shared` visibility value is removed — only `public` and `private` remain
- Story cards and point cards both show clear privacy indicators (lock for private, globe for public)
- Private stories and points never appear in profile pages or public feeds — only inside their doc/letter context
- Private story creation is only available from within Clarity Docs (P551) — existing creation flows (/live, create-story-page) remain public-only
- All changes are backward-compatible — existing public stories and points continue working

**Success conditions:** *(UAT validation checklist — detailed criteria in Acceptance Criteria section)*
- Zero privacy leaks: private points invisible to non-authors, public stories cannot link to private points (verified via direct API query)
- Zero `shared` references anywhere in codebase
- Privacy indicators on 100% of story and point cards
- Private content excluded from profile/feed
- Public creation flows (/live, create-story-page) have no private option

**Constraints:**
- Must not break existing public content (public stories, public points, public positions)
- Must not break existing /live session flows (which create stories with points)
- Point positions (user stances) follow the same visibility as the point itself
- The `story_point_history` audit table must also respect visibility
- Migration must handle existing `shared` stories (convert to `public` — preserves current visibility, consistent with definitions.md)
- Migration must add `visibility` column to `points` table — all existing points default to `public`

## User Stories

**As a user creating a private story:**
- I want the points linked to my private story to be invisible to others, so my private context doesn't leak through the point layer

**As a user viewing point cards:**
- I want to see a clear lock/globe indicator on each point card, so I know at a glance whether others can see it
- I want visual treatment (not just an icon) that makes private vs public feel distinct — e.g., border color, background tint — so the privacy state is ambient, not something I have to read

**As a user creating a story linked to a private point (inside a doc):** *(delivered by P551 — listed here because P586 enables it)*
- I want it to be clear that my story will also be private, so I don't accidentally create public content about a sensitive topic

**As a story author:**
- I want visibility to be set once at creation and never change, so I don't accidentally make a private story public (or vice versa)

**As a user creating a new story:**
- I want only "public" and "private" as visibility options, so I'm not confused by a "shared" option that doesn't clearly explain who can see my content

**As a developer working on P551:**
- I want a clean two-mode visibility model with point-level privacy, so I can build private docs without workarounds

## Jobs to Be Done

**When I create a private story with sensitive claims:**
- I want to know that the linked points are also private, so my therapy or relationship content doesn't appear in anyone else's feed (motivation: trust requires zero leaks, not "most things are hidden")

**When I look at my content across the app:**
- I want instant visual confirmation of what's private and what's public, so I don't have to remember or check each item (motivation: ambient trust — the UI should reassure without requiring action)

**When I'm filing a story from a /live session:**
- I want the process to stay simple — public only, no privacy decision needed, so the live flow stays fast (motivation: /live is a public practice tool; privacy belongs in docs)

**When I'm creating a story inside a private doc:**
- I want it to be obvious that my story and its points will be private, so I don't second-guess whether my sensitive content might leak (motivation: trust by construction — the context I'm in determines privacy, not a selector I might forget)

## Outcomes (Success Metrics)

**Security:**
- Zero point-level privacy leaks — non-authors cannot see private points (absolute, any leak is a critical bug)
- Zero cross-visibility linking — public stories cannot link to private points (DB constraint enforced)
- Zero junction-level leaks — `story_points` SELECT returns no rows for private story links to non-authors

**Simplification:**
- `shared` enum value fully removed from database, RLS, and UI — zero references remain
- Visibility edit controls removed from all 3 surfaces (story detail, profile, story guide chat)

**Visual clarity:**
- Privacy indicator visible on 100% of story cards and point cards across all app surfaces

**Compatibility:**
- Zero regressions in existing public content behavior (stories, points, positions, /live flows)

## Acceptance Criteria

### Point Visibility (Column-Based Model)
- [ ] `points` table has a `visibility` column (`public` | `private`), set at creation, immutable after INSERT
- [ ] Database: UPDATE policy prevents changing the `visibility` column on `points` after INSERT
- [ ] Migration: all existing points get `visibility = 'public'` (backward-compatible default)
- [ ] Points created in public flows (/live, create-story-page) get `visibility = 'public'`
- [ ] Points created in private context (P551 docs) get `visibility = 'private'` — P551 passes the context; P586 provides the column and RLS
- [ ] RLS: public points visible to everyone; private points visible only to the point creator
- [ ] Point positions follow the same visibility as the point (via point's `visibility` column)
- [ ] Badge reads directly from `point.visibility` — no JOIN needed

### Cross-Visibility Linking Constraint
- [ ] `story_points` INSERT: public story cannot link to a private point (DB constraint or RLS policy on INSERT)
- [ ] Private story CAN link to a public point (story is hidden; point was already public — no leak)
- [ ] Private story CAN link to a private point (same privacy level — allowed)
- [ ] Error message when constraint blocks: clear explanation that the point is private and cannot be referenced from a public story
- [ ] If someone wants to publicly discuss a topic from a private point, they must create a new public point

### Junction Table RLS
- [ ] `story_points` SELECT returns rows only when the viewer can see the linked story
- [ ] `story_point_history` SELECT follows the same visibility rules
- [ ] `story_point_history` INSERT restricted to `WITH CHECK(false)` (block direct API inserts; triggers use SECURITY DEFINER and bypass RLS)
- [ ] `point_position_history` SELECT follows point visibility (same pattern as `point_positions`)
- [ ] `story_verifications` SELECT follows story visibility (prevents leaking private story existence + participants)
- [ ] INSERT/DELETE permissions unchanged (story author can still link/unlink)

### Story Visibility Immutability
- [ ] Visibility dropdown removed from story detail page (`AuthorActionRow`)
- [ ] Visibility dropdown removed from profile page (inline story actions)
- [ ] Visibility selector removed from story guide chat edit mode (`VisibilityAndSave` shows current visibility as read-only badge)
- [ ] StoryGuideChat line 646: `updateStory()` call must drop `visibility` from payload (currently passes `{ content, visibility }` — must become `{ content }` only)
- [ ] `updateStory()` service method no longer accepts `visibility` in the update payload (content edits still work)
- [ ] All `updateStory()` call sites audited — grep for callers that pass `visibility` and remove or guard them
- [ ] Database: UPDATE policy prevents changing the `visibility` column after INSERT
- [ ] Visibility is still selectable at creation time (create-story-page, story guide new story flow)

### Remove `shared` Visibility
- [ ] Run `grep -r 'shared' src/ supabase/ e2e/` to enumerate all removal targets before writing migration (TypeScript types, service layer, chat prompts, test fixtures, edge functions)
- [ ] Existing stories with `visibility = 'shared'` migrated to `public` (preserves current visibility — shared was closer to public than private)
- [ ] `shared` removed from `story_visibility` PostgreSQL enum (note: requires new type → migrate → drop old type — not a simple ALTER)
- [ ] RLS policy simplified to two branches: `public` (anyone) and `private` (author only)
- [ ] UI `VISIBILITY_OPTIONS` array reduced to two options: public and private
- [ ] `VisibilityBadge` component no longer renders the "shared" variant (Users icon)

### Visual Privacy Indicators
- [ ] Story cards show lock (private) or globe (public) indicator in all contexts (profile, feed, doc, letter)
- [ ] Point cards show lock (private) or globe (public) indicator in all contexts (story detail, doc, letter)
- [ ] Indicators use existing `VisibilityBadge` component (extended to points)
- [ ] Private indicator: lock icon, muted/amber styling
- [ ] Public indicator: globe icon, default styling
- [ ] `/ui` agent audits current border color usage (blue left border on story detail, absent elsewhere) and proposes consistent system — border color may reinforce privacy state (e.g., amber border for private cards)
- [ ] Visual privacy treatment is ambient (visible without reading text) — not just a small icon badge

### Private Content Display Boundaries
- [ ] Private stories are excluded from profile page story lists (all tabs)
- [ ] Private stories are excluded from public feed
- [ ] Private points (`visibility = 'private'`) are excluded from profile point lists
- [ ] Private points are excluded from public feed / explore surfaces
- [ ] Private content is only displayed within its doc/letter context (P551/P581 responsibility to render — this spec ensures the query-level exclusion)
- [ ] Display boundary exclusions verified via RLS-level queries and DB-seeded integration tests (no P586 UI flow produces private stories — tests must seed data directly)

### Creation Flow Constraints
- [ ] `/live` session flow remains public-only — no private option in story filing
- [ ] `create-story-page` remains public-only — no private option
- [ ] Story guide chat (new story flow) remains public-only — no private option
- [ ] P586 delivers RLS + data model support for private stories; creation UI that produces them is P551 scope

**P551 dependencies (not P586 ACs — tracked here for traceability):**
- P551 must implement private story creation UI within doc context
- P551 creation flow must communicate that stories inside a private doc are private, and points created within are private
- P551 must pass `visibility: 'private'` when creating points inside a private doc (P586 provides the column)
- The cross-visibility constraint (public story cannot link to private point) is enforced at DB level by P586 — P551 should surface a helpful error in the UI rather than letting the DB reject silently

## Out of Scope

- Encrypted storage for private content (separate future spec)
- Doc-level visibility (P551 scope — builds on this foundation)
- Letter-level privacy (P581 scope)
- Private story creation UI (P551 scope — this spec only ensures RLS and data model support it)
- Private content rendering inside docs/letters (P551/P581 scope). Query-level exclusion from profile/feed is P586 scope (defense in depth)
- Ordering of stories or points (P551 scope)
- Grant-based sharing ("share with specific person") — removed with `shared`; future spec if needed
- Grid component for story/point display (P581 scope — may be extracted as shared component)

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Private badge — icon | Lock icon (existing) | Story cards, point cards |
| Private badge — style | Muted amber background | Consistent with P551 privacy banner |
| Private card — border | `/ui` agent to propose (e.g., amber left border) | Must be consistent across all card types |
| Public badge — icon | Globe icon (existing) | Story cards, point cards |
| Public badge — style | Default/subtle | Doesn't compete for attention |
| Card border audit | `/ui` agent audits current inconsistency | Blue left border on story detail only — normalize across all card types before layering privacy |
| Visibility selector — options | "Private" (lock), "Public" (globe) | Story creation only (deferred to P551 for private) |
| Visibility selector — default | Public | Public creation flows only — private is docs-only |
| Removed UI element | Visibility dropdown | Story detail page, profile page, story guide chat |
| Removed UI element | Private option in /live, create-story-page | Public flows have no private selector |
| Point privacy indicator | Lock/globe from `point.visibility` column | No JOIN needed — direct column read. `/ui` agent to decide if/how to communicate that visibility was set at creation and is immutable |

## Open Questions for `/challenge-prd`

### Visibility Model — RESOLVED: Column-based (Model B)
Points get their own `visibility` column, set at creation, immutable. Private points cannot be linked from public stories (DB constraint). This prevents the therapy scenario: therapist can't create a public story linking to your private point — they must create their own public point.

**Why Model B over Model A (dynamic):** Under dynamic derivation, a third party creating a public story linking to your private point would make it public — unacceptable for therapy/couples use case. Model B is "private by construction." Trade-off: adds a column + a constraint, but eliminates an entire class of privacy leaks. Badge derivation is also simpler (direct column read, no JOIN).

### `shared` Removal — Codebase Scope — RESOLVED (promoted to AC)
The grep-all step is now an AC under "Remove `shared` Visibility." The `/architect` phase must still plan the migration sequence (new type → migrate → drop old type).

### Orphan Points — RESOLVED
Points created in /live with no linked stories remain **public** (backward compatibility). This is codified in Point Visibility RLS AC: "Points with no linked stories remain visible." The timing gap (public until linked to a private story) is accepted as a known constraint — `/live` is a public flow anyway.

### Private Content Display Boundary — RESOLVED
P586 owns the query-level exclusion from profile/feed (defense in depth). Codified in Display Boundaries ACs. Tests use DB-seeded private stories since no P586 UI creates them.

### Border Color Consistency Audit
The screenshot shows a blue left border on the story card (story detail page), but point cards below have no border. Profile tab cards and feed cards also lack it. Before layering privacy-aware border colors, the `/ui` agent needs to:
1. Audit all card types across all surfaces for current border treatment
2. Propose a consistent base border system
3. Layer privacy treatment on top (e.g., amber for private, neutral for public)

This is a `/ui` concern but must be flagged at PRD level so `/ui` knows to address it.

### Privacy Communication on Point Cards — deferred to `/ui`
Under Model B, point visibility is a static column (set once, never changes). The badge is straightforward: lock = private, globe = public. However, the `/ui` agent should consider whether additional context helps users understand:
- Why is this point private? (Created inside a private doc — the context determined it)
- Can I make it public? (No — immutable. Create a new public point if needed.)
- What happens if I try to link a public story to it? (Blocked — the UI should explain before the DB rejects)

Options for the `/ui` agent to evaluate: (a) tooltip explaining immutability + creation context, (b) just the badge — no explanation, (c) badge + subtle "Private point" label text. The `/ui` agent should decide based on what feels natural for the card layout.

## Technical Architecture

### Technical Analysis

#### Current Database State

**`stories` table** (migration `20260204_stories_points_calibration.sql` + `20260209_add_story_visibility_enum.sql` + `20260224120000_p424_visibility_model.sql`):
- Has `visibility` column of type `story_visibility` enum (`'public' | 'shared' | 'private'`).
- Default is `'private'` (set by P424 migration).
- RLS SELECT policy `"Stories readable by visibility"` (P424) implements three branches: public (anyone), author (own), shared (event co-registrants via `event_rsvps` JOIN). The original `"Stories are publicly readable" USING(true)` was dropped by P424.
- UPDATE policy: `"Authors can update own stories" USING (auth.uid() = author_id)` — no column restriction. Authors can change any column including `visibility`.

**`points` table** (migration `20260204_stories_points_calibration.sql`):
- No `visibility` column. Columns: `id, statement, context, first_validator_id, created_at, updated_at, tags`.
- SELECT RLS: `"Points are publicly readable" USING(true)` — every point visible to everyone.
- No UPDATE policy exists (points are immutable by design — statement cannot be edited).

**`story_points` junction** (migration `20260204_stories_points_calibration.sql` + `20260301120000_story_points_author_unique.sql`):
- Columns: `story_id, point_id, created_at, author_id` (author_id added by P301 for 1-story-per-user-per-point constraint).
- SELECT RLS: `"Story points are publicly readable" USING(true)` — anyone can see all links, including links from private stories.
- INSERT RLS: checks story author (`EXISTS (SELECT 1 FROM stories WHERE id = story_id AND author_id = auth.uid())`). No cross-visibility check.

**`story_point_history` audit table** (migration `20260220120000_story_point_history_cascade.sql`):
- Columns: `id, story_id, point_id, user_id, linked_at, unlinked_at, unlink_reason`.
- SELECT RLS: `USING(true)` — publicly readable.
- INSERT RLS: `WITH CHECK(true)` — designed for trigger inserts only (SECURITY DEFINER).
- Populated by two triggers: `record_story_point_link` (on story_points INSERT) and `cascade_position_removal_to_story_points` (on point_positions DELETE).

**`point_positions` table**:
- SELECT RLS: `USING(true)` — all positions publicly visible. No visibility column; positions inherit visibility from the point they're on.

**`story_visibility` enum**: `CREATE TYPE story_visibility AS ENUM ('public', 'shared', 'private')`.

#### Current TypeScript State

**Type definition** (`src/app/types/index.ts:930`): `export type StoryVisibility = 'public' | 'shared' | 'private';`

**Visibility options** (`src/app/data/story-visibility-options.ts`): Array of 3 options (public, shared, private) with icons (Globe, Users, Lock) and tooltips. Used by:
- `VisibilityAndSave.tsx` — story guide chat save flow (renders all 3 as selectable buttons)
- `create-story-page.tsx` — standalone story creation form (renders all 3)
- `story-detail-page.tsx` AuthorActionRow — dropdown to change visibility post-creation
- `profile-page-v2.tsx` — inline visibility dropdown on story cards (author view)

**`VisibilityBadge`** (`src/app/components/shared/visibility-badge.tsx`): Renders icon + optional label for all 3 visibility states. Used on story cards. Not used on point cards (points have no visibility concept yet).

**`SavedStoryChatCard.tsx`**: Has its own inline `VISIBILITY_BADGE` record with emoji icons for all 3 states (private/shared/public).

**`updateStory()`** (`stories-service-real.ts:494`): Accepts `{ content?, tags?, visibility?, bannerUrl? }`. Passes `visibility` to Supabase `.update()` — no guard preventing visibility mutation.

**StoryGuideChat line 646**: `await storiesService.updateStory(existingStory.id, { content: contentToSave, visibility: selectedVisibility })` — passes visibility on every edit-mode save.

**`stories-service.interface.ts:96`**: `updateStory` signature accepts `visibility?: StoryVisibility` in the updates object.

**Profile page queries** (`profile-page-v2.tsx:275`): Calls `storiesService.getStoriesByAuthorWithPoints(profile.id, currentUser?.id)` — no visibility filter. RLS handles filtering (author sees all own stories; visitors see public + shared). After P586, private stories should be excluded from profile display entirely (defense in depth at query level, not just RLS).

**Feed queries**: `getPublicStoriesFeed` already filters `.eq('visibility', 'public')` — correctly excludes non-public. `getStoriesFeed` also filters `.eq('visibility', 'public')`.

**Points on profile** (`points-service-real.ts:636`): `getPointsForProfileDisplay` queries `point_positions` by user, then fetches matching points. No visibility filter (points have no visibility column). After P586, private points must be excluded from profile/feed.

**`shared` references in src** (exhaustive):
1. `src/app/types/index.ts:930` — type union
2. `src/app/data/story-visibility-options.ts:12` — options array entry
3. `src/app/data/mock-profile-data.ts:66` — mock story with `visibility: 'shared'`
4. `src/app/components/shared/prototype-types.ts:28` — `IdeaVisibility` type
5. `src/app/components/shared/visibility-badge.tsx:20` — config entry
6. `src/app/components/story-guide/SavedStoryChatCard.tsx:13` — inline badge

**`shared` references in supabase**: Only in `story_visibility` enum definition and P424 RLS policy.

**Edge functions**: `story-guide-chat/index.ts` and `send-agreement-emails/index.ts` use "shared" in natural language prompts/email copy — not as visibility enum values. No changes needed.

#### Dependencies

- P551 (Clarity Docs) depends on: `points.visibility` column, cross-visibility constraint, private story creation flow.
- P581 (Clarity Letters) depends on P551, which depends on P586.
- `story_visibility` enum is used in RLS policies, TypeScript types, and the stories table. Changing it requires the new-type-migrate-drop pattern.

### Architecture Decisions

**Decision 1: Cross-visibility constraint — CHECK constraint (not RLS)**

- **Chosen:** `CHECK` constraint via trigger function on `story_points` INSERT that validates: if the story is public, the linked point must also be public. Implemented as a `BEFORE INSERT` trigger (not a raw CHECK constraint, because CHECK constraints cannot reference other tables).
- **Rationale:** A trigger-based constraint fires for all insert paths (RLS, SECURITY DEFINER triggers, service_role). An RLS-only approach would be bypassed by SECURITY DEFINER functions (e.g., the cascade trigger). The constraint is a data integrity rule, not an access control rule — it belongs at the constraint/trigger layer.
- **Trade-off:** Trigger adds ~1ms per `story_points` INSERT (one SELECT to check story visibility + point visibility). Acceptable for a junction table with low write volume.
- **Alternative rejected:** RLS `WITH CHECK` on `story_points` INSERT — bypassed by SECURITY DEFINER triggers. Also rejected: application-level check only — doesn't protect against direct DB access or future code paths.

**Decision 2: Enum migration — new type, migrate, drop old**

- **Chosen:** Standard PostgreSQL enum replacement: (1) create `story_visibility_v2` as `('public', 'private')`, (2) migrate `shared` → `public` in stories table, (3) alter column to new type, (4) drop old type, (5) rename `story_visibility_v2` → `story_visibility`. All in one migration, wrapped in a transaction.
- **Rationale:** PostgreSQL does not support `ALTER TYPE ... REMOVE VALUE` for enums. The rename pattern is the standard approach and is used across the Supabase ecosystem.
- **Trade-off:** Requires dropping and recreating all RLS policies, constraints, and defaults that reference the column (the ALTER TYPE fails if anything depends on the old type). This is a known PostgreSQL limitation.
- **Alternative rejected:** Keeping `shared` in the enum and just hiding it in the UI — leaves dead code in RLS and invites future confusion.

**Decision 3: Point visibility column — reuse `story_visibility` type (renamed to `content_visibility`)**

- **Chosen:** After removing `shared`, rename the `story_visibility` type to `content_visibility` (since it now applies to both stories and points). Add `visibility content_visibility NOT NULL DEFAULT 'public'` to the `points` table.
- **Rationale:** Both stories and points share the same two-value visibility model. A single enum type prevents drift. The default `'public'` ensures backward compatibility (all existing points remain public).
- **Trade-off:** Renaming a type is cosmetic but reduces future confusion ("why is a point using `story_visibility`?").
- **Alternative rejected:** Creating a separate `point_visibility` enum — identical values, unnecessary duplication. Also rejected: using `TEXT` with CHECK constraint — weaker than enum, already established pattern uses enums.

**Decision 4: Visibility immutability — trigger-based guard (not RLS WITH CHECK)**

- **Chosen:** `BEFORE UPDATE` trigger on both `stories` and `points` that raises an exception if `NEW.visibility != OLD.visibility`. This prevents visibility changes through any path.
- **Rationale:** RLS `WITH CHECK` only applies to the rows the policy allows. A `WITH CHECK (NEW.visibility = OLD.visibility)` clause would silently reject the entire UPDATE if visibility changed — the user would see "update failed" with no explanation. A trigger can raise a descriptive error. Additionally, the trigger protects against service_role and SECURITY DEFINER paths.
- **Trade-off:** Adds a trigger to two hot-path tables. Cost is negligible (one column comparison per UPDATE).
- **Alternative rejected:** RLS `WITH CHECK` — silent failure, poor DX, bypassed by service_role. Application-level only — doesn't protect against direct DB access.

**Decision 5: Junction RLS — story-visibility-scoped SELECT**

- **Chosen:** Replace `story_points` SELECT `USING(true)` with: `USING (EXISTS (SELECT 1 FROM stories WHERE stories.id = story_points.story_id AND (stories.visibility = 'public' OR stories.author_id = auth.uid())))`. Same pattern for `story_point_history`.
- **Rationale:** Junction rows should be visible only when the linked story is visible to the viewer. This prevents enumeration of private story links. The `stories` RLS already gates story visibility — the junction policy mirrors it to prevent leaking link metadata.
- **Trade-off:** Adds a subquery to every `story_points` SELECT. Mitigated by the existing index on `stories(id)` and the small table size.
- **Alternative rejected:** Keeping `USING(true)` and filtering in application code — defense in depth requires DB-level enforcement. A view joining through stories RLS — more complex, harder to maintain.

**Decision 6: Point positions — inherit visibility from point**

- **Chosen:** Replace `point_positions` SELECT `USING(true)` with: `USING (EXISTS (SELECT 1 FROM points WHERE points.id = point_positions.point_id AND (points.visibility = 'public' OR points.first_validator_id = auth.uid())) OR point_positions.user_id = auth.uid())`. Users can always see their own positions.
- **Rationale:** Positions on private points are private. The position-taker should see their own position (for their own profile), but others should not see positions on points they can't access.
- **Trade-off:** Adds subquery to position reads. Performance acceptable given existing index on `points(id)`.
- **Alternative rejected:** No change (positions stay public) — leaks existence of private points through position aggregation.

**Decision 7: Profile/feed query-level exclusion — defense in depth**

- **Chosen:** Add explicit `.eq('visibility', 'public')` filter to `getStoriesByAuthor` (profile) and `getPointsForProfileDisplay` (profile). Feed queries already filter correctly.
- **Rationale:** RLS is the primary gate, but defense in depth means the application layer should also exclude private content from public-facing views. If RLS has a bug, the query filter prevents leaking. This follows the spec's "defense in depth" requirement.
- **Trade-off:** Slight redundancy with RLS. Intentional — belts and suspenders for privacy.
- **Alternative rejected:** Relying solely on RLS — single point of failure for privacy-critical feature.

### Security Review

**RLS Policies:**

- ⚠️ **CRITICAL: 6 tables have `USING(true)` SELECT policies that must be restricted:** `points`, `story_points`, `story_point_history`, `point_positions`, `point_position_history`. The spec ACs and Architecture Decisions cover all five. Additionally:
- ✅ **`story_versions` SELECT already hardened by P427** (`story_versions_select_visible` policy). Still references `shared` branch — will be updated during enum-swap policy drop/recreate (steps 2/17). No new policy needed.
- ⚠️ **MISSED BY SPEC: `story_verifications` SELECT is `USING(true)`.** Verification records link to stories and contain speaker/listener IDs. If a story is private, its verifications leak the story's existence and participants. Must follow story visibility.
- ✅ Stories SELECT RLS (from P424) correctly gates on visibility. The `shared` branch will be removed by the enum migration.
- ✅ `getPublicStoriesFeed` already filters `.eq('visibility', 'public')` — good defense-in-depth pattern.

**Authentication:**

- ✅ Story/point creation requires `auth.uid() IS NOT NULL AND is_verified = true`. Adequate.
- ✅ `story_points` INSERT implicitly requires auth via story author check subquery.
- ⚠️ **Anonymous users and the anon key.** Supabase's anon key allows unauthenticated API access. All `USING(true)` policies are accessible to anyone with the anon key (public in SPA). This is the primary attack vector P586 closes.

**Authorization:**

- ⚠️ **Story UPDATE has no WITH CHECK — visibility column is mutable.** Current policy: `USING (auth.uid() = author_id)` with no `WITH CHECK`. Architecture Decision 4 addresses this with a BEFORE UPDATE trigger (preferred over WITH CHECK for better error messages).
- ⚠️ **`story_point_history` INSERT is `WITH CHECK(true)` — open to any user.** The trigger runs as SECURITY DEFINER (bypasses RLS), but the policy allows direct API inserts. Should be `WITH CHECK(false)` or restricted to `user_id = auth.uid()`.
- ⚠️ **No server-side enforcement of "private creation only from docs."** Any verified user can INSERT a story with `visibility = 'private'` from any context. Acceptable for P586 (constraint is UI-only until P551); documented as known limitation.
- ✅ Cross-visibility constraint addressed by Architecture Decision 1 (BEFORE INSERT trigger on `story_points`).

**Input Validation:**

- ✅ Enum type enforces valid visibility values at DB level — no injection possible.
- ✅ Architecture Decision 3 (shared `content_visibility` enum) ensures type safety.
- ✅ Position values use `position_type` enum — safe.

**Data Protection:**

- ⚠️ **Private point content (statement, context) is core sensitive data.** Therapy/couples use case means deeply personal information. RLS is primary protection; no encryption at rest beyond Supabase defaults. Encryption deferred to future spec — documented as known limitation.
- ⚠️ **Realtime subscriptions.** Both `points` and `point_positions` are in `supabase_realtime`. Supabase Realtime respects RLS for `postgres_changes` when using user JWT. Architect should verify no broadcast channels leak private point data.
- ✅ Display boundary is defense-in-depth (RLS is authoritative, query-level filter is backup).

**Critical Findings Summary:**

1. **Add `story_versions` and `story_verifications` to RLS hardening** — not in spec ACs, must be added to migration
2. **`story_point_history` INSERT policy must be tightened** — `WITH CHECK(false)` for direct API inserts (triggers bypass RLS via SECURITY DEFINER)
3. **Visibility immutability trigger protects all paths** — Architecture Decision 4 is correct approach
4. **Cross-visibility trigger protects all paths** — Architecture Decision 1 is correct approach
5. **Enum migration must be atomic** — single transaction, all policy drops/recreates inside

### Implementation Approach

#### Build Sequence

**Phase 1: Database migration (single migration file)**

1. Migrate `shared` → `public` in stories: `UPDATE stories SET visibility = 'public' WHERE visibility = 'shared';`
2. Drop all policies/defaults referencing `story_visibility` type
3. Create new enum `content_visibility AS ENUM ('public', 'private')`
4. Alter `stories.visibility` to `content_visibility` type
5. Drop old `story_visibility` type
6. Add `visibility content_visibility NOT NULL DEFAULT 'public'` to `points` table
7. Create visibility immutability triggers on `stories` and `points` (`BEFORE UPDATE` — raise exception if visibility changed)
8. Create cross-visibility constraint trigger on `story_points` (`BEFORE INSERT` — reject if story is public and point is private)
9. Replace `story_points` SELECT RLS with story-visibility-scoped policy
10. Replace `story_point_history` SELECT RLS with story-visibility-scoped policy
11. Replace `point_positions` SELECT RLS with point-visibility-scoped policy (+ own position always visible)
12. Replace `point_position_history` SELECT RLS with point-visibility-scoped policy
13. Update `story_versions` existing P427 policy (`story_versions_select_visible`) to remove `shared` branch *(handled by enum-swap drop/recreate in steps 2/17 — explicitly list this policy in the drop set)*
14. Replace `story_verifications` SELECT RLS with story-visibility-scoped policy *(Security Review finding: verifications leak story existence and participants)*
15. Tighten `story_point_history` INSERT to `WITH CHECK(false)` *(Security Review finding: currently open to direct API inserts; triggers use SECURITY DEFINER and bypass RLS)*
16. Add stories UPDATE `WITH CHECK` that excludes visibility column changes (belt — trigger is suspenders)
17. Recreate all dropped policies with `content_visibility` references
18. Run `./scripts/migrate.sh`

**Phase 2: Remove `shared` from TypeScript**

19. Update `StoryVisibility` type to `'public' | 'private'`
20. Update `VISIBILITY_OPTIONS` array to 2 entries (remove shared)
21. Update `VisibilityBadge` config to 2 entries (remove shared)
22. Update `SavedStoryChatCard` inline badge to 2 entries
23. Remove `shared` from `IdeaVisibility` in `prototype-types.ts`
24. Update `mock-profile-data.ts` — change `visibility: 'shared'` to `'public'`

**Phase 3: Story visibility immutability — remove edit controls**

25. `story-detail-page.tsx`: Replace `AuthorActionRow` (visibility dropdown) with read-only `VisibilityBadge`
26. `profile-page-v2.tsx`: Replace inline visibility dropdown with read-only `VisibilityBadge`
27. `StoryGuideChat.tsx` line 646: Remove `visibility` from `updateStory()` payload — change to `{ content: contentToSave }` only
28. `VisibilityAndSave.tsx`: Convert from selector to read-only display when in edit mode (keep selector for creation mode)
29. `stories-service.interface.ts`: Remove `visibility` from `updateStory` parameter type
30. `stories-service-real.ts`: Remove `visibility` from `updateStory` implementation
31. `stories-service-mock.ts`: Remove `visibility` from `updateStory` implementation
32. Audit all `updateStory` call sites — grep for callers passing `visibility`

**Phase 4: Point visibility — types, API, and badges**

33. Add optional `visibility?: ContentVisibility` parameter to `createPoint()` in interface, real, and mock services (defaults to `'public'` — P551 will pass `'private'` when creating points in a private doc)
34. Extend `VisibilityBadge` to accept `content_visibility` (already works — same `'public' | 'private'` values)
35. Add `visibility` to point-related TypeScript types (`Point`, `PointSummary`, `PointWithUserPosition`)
36. Update point queries in `points-service-real.ts` to select `visibility` column
37. Pass `visibility` through to `point-card-with-links.tsx`
38. Render `VisibilityBadge` on point cards (position TBD by `/ui` agent)

**Phase 5: Defense-in-depth query filters**

39. `stories-service-real.ts` `getStoriesByAuthorWithPoints`: Add `.eq('visibility', 'public')` filter for non-self queries (this method receives `userId` — apply filter when `authorId !== userId`)
40. `points-service-real.ts` `getPointsForProfileDisplay`: Add visibility filter excluding private points for non-owners
41. `points-service-real.ts` `getPointsForFeedDisplay`: Add `.eq('visibility', 'public')` filter

#### Files to Create

- `supabase/migrations/YYYYMMDDHHMMSS_p586_visibility_privacy_foundation.sql` — single migration covering all DB changes (enum swap, column addition, triggers, RLS updates)

#### Files to Modify

**Database:**
- (none beyond the new migration file — all changes are additive via migration)

**TypeScript types:**
- `src/app/types/index.ts` — change `StoryVisibility` type, add visibility to point types

**Service layer:**
- `src/app/data/stories-service.interface.ts` — remove `visibility` from `updateStory` params
- `src/app/data/stories-service-real.ts` — remove visibility from update, add query filters
- `src/app/data/stories-service-mock.ts` — align with interface changes
- `src/app/data/points-service.interface.ts` — add optional `visibility` param to `createPoint()`
- `src/app/data/points-service-real.ts` — add `visibility` to `createPoint()`, select `visibility` column, add query filters
- `src/app/data/points-service-mock.ts` — align `createPoint()` with interface changes
- `src/app/data/story-visibility-options.ts` — reduce to 2 options
- `src/app/data/mock-profile-data.ts` — change `shared` to `public`

**Components:**
- `src/app/components/shared/visibility-badge.tsx` — remove shared config entry
- `src/app/components/story-guide/VisibilityAndSave.tsx` — read-only mode for edits
- `src/app/components/story-guide/SavedStoryChatCard.tsx` — remove shared badge entry
- `src/app/components/story-guide/StoryGuideChat.tsx` — drop visibility from updateStory call
- `src/app/components/social/point-card-with-links.tsx` — add VisibilityBadge
- `src/app/components/shared/prototype-types.ts` — remove shared from IdeaVisibility

**Pages:**
- `src/app/pages/story-detail-page.tsx` — replace AuthorActionRow with read-only badge
- `src/app/pages/profile-page-v2.tsx` — replace inline visibility dropdown with read-only badge
- `src/app/pages/create-story-page.tsx` — verify only public/private shown (follows VISIBILITY_OPTIONS change)

## UX Design

**Scope:** Minimal P586 changes only. Inheritance communication (adding points to private stories, cross-visibility error UX) is deferred to P551 — no UI creates private content until P551 ships.

### Current State (Card Surface Audit)

| Context | Story card border | Point card border | Visibility shown? | Editable? |
|---------|------------------|-------------------|-------------------|-----------|
| Feed | blue-500 | slate-400 | Globe badge on story | No |
| Profile (author) | blue-500 | slate-400 | Badge + dropdown | **Yes — dropdown** |
| Profile (visitor) | blue-500 | slate-400 | Static badge | No |
| Story detail (author) | blue-500 | slate-400 | Badge + dropdown in AuthorActionRow | **Yes — dropdown** |
| /live session | blue-500 | slate-400 (or muted-foreground/50) | No | No |
| Point detail | blue-500 (linked stories) | — | Badge on stories | No |
| Story guide chat | — | — | 3-option selector on save; re-shown on edit | **Yes — selector** |

### Change 1: Remove `shared` Everywhere

**Front-end (6 locations):**
- `types/index.ts` — `StoryVisibility` type: remove `'shared'` from union
- `story-visibility-options.ts` — remove shared entry (Users icon) from array
- `visibility-badge.tsx` — remove shared config entry
- `SavedStoryChatCard.tsx` — remove shared from inline badge record
- `prototype-types.ts` — remove shared from `IdeaVisibility`
- `mock-profile-data.ts` — change `visibility: 'shared'` to `'public'`

**Back-end (migration):**
- Migrate all `shared` stories to `public`
- Replace `story_visibility` enum with `content_visibility` (`public`, `private`)
- Drop and recreate all RLS policies referencing the old type

**Result:** 3-option selectors become 2-option. Badges render only public/private. Zero new UI patterns — just fewer options.

### Change 2: Remove Visibility Editing (3 surfaces)

```
BEFORE:                                 AFTER:
┌────────────────────────────┐          ┌────────────────────────────┐
│ [🔒 Private ▾] [✏️] [🗑️]  │          │ [🔒 Private] [✏️] [🗑️]    │
│  ↓ opens dropdown          │          │  static badge, no chevron  │
│  ○ Public                   │          │  tooltip on hover:         │
│  ○ Shared                   │          │  "Set at creation,         │
│  ● Private                  │          │   cannot be changed"       │
└────────────────────────────┘          └────────────────────────────┘
```

**a) Story detail page — AuthorActionRow:** Dropdown becomes static VisibilityBadge. Same position. Tooltip: "Visibility is set at creation and cannot be changed."

**b) Profile page — inline story card:** Author's dropdown becomes same static badge that visitors already see.

**c) Story guide chat — VisibilityAndSave:**
- **New story:** 2-option selector (Public, Private). No change in pattern — just fewer options.
- **Edit mode:** Selector becomes read-only pill showing current visibility. Helper text: "Visibility cannot be changed after creation."

**Accessibility:** `aria-label="Story visibility: {state} — set at creation, cannot be changed"`. Focusable via `tabIndex={0}`.

### Change 3: Add Visibility Badge to Point Cards

Point cards currently have no visibility indicator. Add icon-only badge in header area.

```
┌─────────────────────────────┐
│ 📌 Point Header        🌐  │  ← globe (public) or lock (private)
│                             │
│ "The actual point text..."  │
│                             │
│ [Agree] [Disagree]         │
│ ─────────────────────────── │
│ 2 stories · Share · Open    │
└─────────────────────────────┘
```

- Icon-only badge in header, right-aligned (before point text, not in dense footer)
- Public: Globe icon, muted gray color — default, unremarkable
- Private: Lock icon, amber-600 color — stands out as "restricted"
- Tooltip: "Visible to everyone" / "Private — only you can see it"
- `aria-label="Point visibility: {state} — {description}"`

**Note:** All existing points are public after migration. Private point badges only appear when P551 ships and creates private points. Zero visual change for current users.

### Change 4: Color System — Amber = Private

**Principle:** Public content keeps current colors (unchanged). Private content gets amber treatment. One new association: **amber = private**.

**Border colors:**

| Content | Visibility | Left border | Lock/Globe icon color |
|---------|-----------|-------------|----------------------|
| Story | Public | `border-l-blue-500` (unchanged) | Globe in muted gray |
| Story | Private | `border-l-amber-500` | Lock in amber-600 |
| Point | Public | `border-l-slate-400` (unchanged) | Globe in muted gray |
| Point | Private | `border-l-amber-400` | Lock in amber-600 |

**Private card ambient treatment:**
- Amber left border (replaces blue/slate)
- Lock icon in amber-600 (matches border — reinforces association)
- Private point cards: add subtle `bg-amber-50/50` background tint
- Private story cards: amber border only (stories have rich content, no tint needed)

**Prerequisite normalization:** Unify the two point card border variants (`border-l-slate-400` vs `border-l-muted-foreground/50`) to `border-l-slate-400` before layering privacy treatment.

**Why amber:**
- Already used in the codebase for caution/attention states
- Distinct from blue (stories) and slate (points) — no confusion with existing meanings
- Lock + amber reads as "restricted access" — warm, cautionary, not alarming (not red)

### Edge Cases

- **Empty profile after filtering:** User with only private stories sees existing "No stories yet" message. Private content lives in docs, not profiles.
- **Private point detail page (non-author):** RLS returns no data. Existing 404 handling applies.
- **Mixed visibility on story detail:** Private story with public points → amber story border, slate point borders. Correctly communicates "story is private, points are public claims."
- **Tooltip on mobile:** MobileTooltip already handles long text with tappable popover.

### Deferred to P551 (Inheritance Communication)

The following UX concerns only arise when P551 creates private content. They are tracked as P551 dependencies:

- **AddPointForm on private story:** Pre-creation banner communicating point inherits private visibility
- **Cross-visibility error toast:** When public story tries to link to private point
- **Private story creation context:** Communicating that doc context determines privacy
- **Point inheritance indicator:** Explaining why a point is private (created in private doc)

See P551 spec dependencies section for full list.

## Test Coverage Strategy

### What's Tested

**Integration tests** (`e2e/integration/p586-visibility-privacy.spec.ts` — ~25 tests):
- ✅ Schema: `points.visibility` column exists, `content_visibility` enum works
- ✅ Migration: existing points default to `public`, new points default to `public`
- ✅ Point RLS: private points invisible to non-authors, visible to owner, public visible to all + anon
- ✅ Cross-visibility constraint: public story → private point blocked by trigger; all valid combos pass
- ✅ Junction RLS: `story_points` rows hidden when linked story is private
- ✅ Position RLS: positions on private points hidden; own position always visible
- ✅ Immutability: story/point visibility UPDATE rejected by trigger; content-only UPDATE succeeds
- ✅ Enum removal: INSERT with `visibility='shared'` fails

**Smoke tests** (`e2e/p586-smoke.spec.ts` — 4 tests):
- ✅ Feed page loads after migration
- ✅ Create-story page shows only Public/Private (no Shared)
- ✅ Profile page loads
- ✅ Story detail page loads, no "Shared" badge visible

**UAT scenarios** (`features/uat/p586.md` — 11 scenarios):
- ✅ UAT-1 through UAT-11 covering: `shared` removal, dropdown removal, badge addition, RLS enforcement, border colors, visual regression

### What's NOT Tested (and Why)

- ❌ **Unit tests** — No new utility functions or business logic. All changes are DB-level (migration/RLS) or simple UI prop threading (covered by E2E/smoke).
- ❌ **E2E user flow tests** — No new user-facing flows in P586. Visibility editing is removed (not added). Badge is additive. Private content creation flows don't exist until P551.
- ❌ **Accessibility tests** — Badge ARIA labels are simple prop additions, verified by UAT visual inspection. No complex interaction patterns.
- ❌ **`story_versions` and `story_verifications` RLS** — Security Review flagged these. Tests should be added when the integration test file is implemented (TODO in the file).
- ❌ **Realtime subscription leaks** — Requires live Realtime connection testing; deferred to manual QA.

### Test Pyramid

```
       /\
      /  \    4 smoke tests
     /____\
    /      \   ~25 integration tests (RLS + constraints + migration)
   /________\
  /  0 unit  \
 /____________\
```

**Total:** ~29 automated tests + 11 UAT scenarios
**Estimated run time:** ~45 seconds (integration) + ~15 seconds (smoke)

## Implementation Tasks

> Generated by /decompose. Each task is scoped to 1–3 files and independently verifiable.
> Run /dev to execute — it will dispatch one subagent per task.

## Consistency Check Results
✅ AC coverage: all 30 criteria map to build steps
✅ UX–Arch drift: no conflicts (both layers align on remove shared, replace dropdowns, add badges, amber = private)
✅ Security blockers: all 5 critical findings addressed in build sequence

### Task 1: Database migration — enum swap, column, triggers, RLS
- **Files:** `supabase/migrations/YYYYMMDDHHMMSS_p586_visibility_privacy_foundation.sql` (create)
- **Spec refs:** "Implementation Approach > Build Sequence Phase 1 (lines ~460-479)", "Architecture Decisions 1-7 (lines ~358-405)", "Security Review (lines ~413-455)"
- **Tests:** `e2e/integration/p586-visibility-privacy.spec.ts`
- **Depends on:** None
- **Verify:** `./scripts/migrate.sh` succeeds; integration tests pass (schema checks, RLS, triggers, immutability, shared removal)
- [ ] Complete

### Task 2: Remove `shared` from TypeScript types and configs
- **Files:** `src/app/types/index.ts` (modify), `src/app/data/story-visibility-options.ts` (modify), `src/app/data/mock-profile-data.ts` (modify)
- **Spec refs:** "Implementation Approach > Build Sequence Phase 2 steps 19-24 (lines ~483-488)", "UX Design > Change 1 (lines ~567-580)"
- **Depends on:** Task 1 (DB must accept `public`/`private` only before TS types change)
- **Verify:** `npm run build` succeeds with zero TS errors; no `'shared'` in type unions
- [ ] Complete

### Task 3: Remove `shared` from UI components
- **Files:** `src/app/components/shared/visibility-badge.tsx` (modify), `src/app/components/story-guide/SavedStoryChatCard.tsx` (modify), `src/app/components/shared/prototype-types.ts` (modify)
- **Spec refs:** "Implementation Approach > Build Sequence Phase 2 steps 21-23 (lines ~485-487)"
- **Depends on:** Task 2 (types must be updated before components consuming them)
- **Verify:** `npm run build` succeeds; `VisibilityBadge` renders only public/private; no "Shared" text in UI
- [ ] Complete

### Task 4: Story visibility immutability — service layer
- **Files:** `src/app/data/stories-service.interface.ts` (modify), `src/app/data/stories-service-real.ts` (modify), `src/app/data/stories-service-mock.ts` (modify)
- **Spec refs:** "Implementation Approach > Build Sequence Phase 3 steps 29-32 (lines ~496-499)", "AC: Story Visibility Immutability (lines ~170-178)"
- **Depends on:** Task 1 (DB trigger must enforce immutability before UI removes controls)
- **Verify:** `npm run build` succeeds; `updateStory` signature no longer accepts `visibility`; grep confirms zero callers pass visibility
- [ ] Complete

### Task 5: Story visibility immutability — remove UI dropdowns
- **Files:** `src/app/pages/story-detail-page.tsx` (modify), `src/app/pages/profile-page-v2.tsx` (modify), `src/app/components/story-guide/StoryGuideChat.tsx` (modify), `src/app/components/story-guide/VisibilityAndSave.tsx` (modify)
- **Spec refs:** "Implementation Approach > Build Sequence Phase 3 steps 25-28 (lines ~492-495)", "UX Design > Change 2 (lines ~592-613)"
- **Tests:** `e2e/p586-smoke.spec.ts`
- **Depends on:** Task 4 (service no longer accepts visibility — UI must stop passing it)
- **Verify:** Story detail page shows static badge (no dropdown); profile page shows static badge; story guide chat edit mode shows read-only pill; smoke tests pass
- [ ] Complete

### Task 6: Point visibility — types and service API
- **Files:** `src/app/types/index.ts` (modify), `src/app/data/points-service.interface.ts` (modify), `src/app/data/points-service-real.ts` (modify), `src/app/data/points-service-mock.ts` (modify)
- **Spec refs:** "Implementation Approach > Build Sequence Phase 4 steps 33-36 (lines ~503-506)", "AC: Point Visibility Column-Based Model (lines ~145-153)"
- **Depends on:** Task 1 (visibility column must exist in DB)
- **Verify:** `npm run build` succeeds; `createPoint()` accepts optional `visibility` param; point queries select `visibility` column
- [ ] Complete

### Task 7: Point card badge + amber border treatment
- **Files:** `src/app/components/social/point-card-with-links.tsx` (modify)
- **Spec refs:** "Implementation Approach > Build Sequence Phase 4 steps 37-38 (lines ~507-508)", "UX Design > Change 3 (lines ~615-644)", "UX Design > Change 4 (lines ~646-672)"
- **Depends on:** Task 6 (visibility prop must be available on point data)
- **Verify:** Point cards render globe icon (all existing points are public); amber border class present in component (conditional on `visibility === 'private'`)
- [ ] Complete

### Task 8: Defense-in-depth query filters
- **Files:** `src/app/data/stories-service-real.ts` (modify), `src/app/data/points-service-real.ts` (modify)
- **Spec refs:** "Implementation Approach > Build Sequence Phase 5 steps 39-41 (lines ~512-514)", "AC: Private Content Display Boundaries (lines ~197-203)"
- **Depends on:** Task 1 (visibility column must exist), Task 4 (service layer updated)
- **Verify:** `getStoriesByAuthorWithPoints` excludes private stories for non-self; `getPointsForProfileDisplay` excludes private points for non-owners; `getPointsForFeedDisplay` filters `.eq('visibility', 'public')`
- [ ] Complete

**Total tasks:** 8 | **Can parallelize:** Task 2+6 (after Task 1; no shared files), Task 3+4 (after Task 2; no shared files), Task 7+8 (after Task 6; different files) | **Must be sequential:** Task 1 → 2 → 3, Task 1 → 4 → 5, Task 1 → 6 → 7
