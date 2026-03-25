---
status: today
type: story
rank: 0.312
tags:
  - privacy
  - rls
  - visibility
  - foundation
delivery_stage: 1-prd-review
reviews:
  ux: null
  architect: null
  alignment: null
created_date: 2026-03-25T00:00:00.000Z
related:
  - p424
  - p551
  - p581
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
- Points are visible only if the viewer can see at least one story that links to them
- The `story_points` junction table follows story visibility (no public enumeration of private story links)
- Story visibility cannot be changed after creation — edit controls are removed from all surfaces
- The `shared` visibility value is removed — only `public` and `private` remain
- Story cards and point cards both show clear privacy indicators (lock for private, globe for public)
- Private stories and points never appear in profile pages or public feeds — only inside their doc/letter context
- Private story creation is only available from within Clarity Docs (P551) — existing creation flows (/live, create-story-page) remain public-only
- All changes are backward-compatible — existing public stories and points continue working

**Success conditions:** *(UAT validation checklist — detailed criteria in Acceptance Criteria section)*
- Zero privacy leaks: private points/junctions invisible to non-authors (verified via direct API query)
- Zero `shared` references anywhere in codebase
- Privacy indicators on 100% of story and point cards
- Private content excluded from profile/feed
- Public creation flows (/live, create-story-page) have no private option

**Constraints:**
- Must not break existing public content (public stories, public points, public positions)
- Must not break existing /live session flows (which create stories with points)
- Point positions (user stances) follow the same visibility as the point itself
- The `story_point_history` audit table must also respect visibility
- Migration must handle existing `shared` stories (convert to `private` — safer default)

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
- Zero point-level privacy leaks — non-authors cannot see points linked exclusively to private stories (absolute, any leak is a critical bug)
- Zero junction-level leaks — `story_points` SELECT returns no rows for private story links to non-authors

**Simplification:**
- `shared` enum value fully removed from database, RLS, and UI — zero references remain
- Visibility edit controls removed from all 3 surfaces (story detail, profile, story guide chat)

**Visual clarity:**
- Privacy indicator visible on 100% of story cards and point cards across all app surfaces

**Compatibility:**
- Zero regressions in existing public content behavior (stories, points, positions, /live flows)

## Acceptance Criteria

### Point Visibility RLS
- [ ] Points are visible only if the viewer can see at least one linked story (via `story_points` join + story RLS)
- [ ] Points with no linked stories remain visible (orphan points are public — backward compatibility)
- [ ] Points linked only to private stories of other users are invisible to non-authors
- [ ] Points linked to at least one public story remain visible to all (one public link = public point)
- [ ] Point positions follow the same visibility as the point
- [ ] Badge rule: if a point is linked to both public and private stories, the point is considered **public** (one public link = public). Badge shows globe, not lock.

### Junction Table RLS
- [ ] `story_points` SELECT returns rows only when the viewer can see the linked story
- [ ] `story_point_history` SELECT follows the same visibility rules
- [ ] `story_point_history` INSERT restricted to story author (prevents audit trail from accumulating records that leak private link events)
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
- [ ] Existing stories with `visibility = 'shared'` migrated to `private`
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
- [ ] Private points (inherited from private-only stories) are excluded from profile point lists
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
- P551 creation flow must communicate that stories inside a private doc inherit private visibility
- P551 creation flow must warn when linking to a private-only point from a public context (would make the point visible)

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
| Inheritance indicator | `/ui` agent to propose | Point cards: communicate that privacy is inherited from linked stories, not set directly |

## Open Questions for `/challenge-prd`

### Visibility Cascade Model
Current spec: "one public link = public point" (dynamic computation from linked stories). Alternative model proposed: **points get their own `visibility` column**, set when first linked to a story, immutable after. Cascade: private story → private point → any new story linking to it must be private → any new points added to that story are also private. The entire block stays consistently private.

**Why this matters:** In therapy/letter contexts, a user encounters a private point and files a story about it. Under current model, their story could be public (making the point public). Under cascade model, their story inherits the point's privacy. The cascade model is "private by construction" — but adds a `visibility` column to `points` and changes the inheritance direction.

**Decision needed:** Dynamic computation (current spec) vs. point-level visibility column (cascade model)?

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

### Visibility Inheritance Communication
Points inherit visibility from their linked stories — they have no `visibility` column of their own. This means a point's privacy state can change (e.g., when the last private-only story is deleted, or when a new public story links to it). How should the UI communicate that a point's privacy is inherited and potentially dynamic?

Options: (a) tooltip on the badge explaining inheritance, (b) no explanation — just show the current state, (c) show a count of "linked to N private / M public stories" on hover.

**Recommendation:** `/ui` agent decides, but the spec should note that (b) is the simplest and (a) is the most honest.

## Next Steps

1. **Run `/challenge-prd`** — stress-test cascade model, orphan points, display boundary split, border consistency, inheritance communication
2. **Run `/architect`** — RLS migration design, enum removal strategy, UPDATE policy, full `shared` grep, query-level exclusion from profile/feed
3. **Run `/ux`** — border color audit, privacy visual treatment, inheritance indicator design
4. **Run `/generate-tests`** — RLS leak tests, visibility immutability tests, migration tests, display boundary tests
5. **Run `/spec-review`** — validate before implementation
6. **Run `/dev`** — implement (Phase 1: migration + RLS, Phase 2: UI cleanup + display boundaries)
