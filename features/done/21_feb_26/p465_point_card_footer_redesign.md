---
status: all-done
type: change-request
rank: 31370.75
changes: p456
superseded_by: p470
completed_at: "2026-03-02"
flow: ux → architect → generate-tests → decompose → dev → verify
uat_file: features/uat/p465.md
test_files:
  - e2e/integration/p465-story-points-migration.spec.ts
  - src/tests/getStoryByUserAndPoint.test.ts
  - e2e/p465-point-card-footer.spec.ts
tags:
  - redesign
  - p456
  - point-card
  - footer
  - story-cta
created_date: 2026-03-01T00:00:00.000Z
locked_at: '2026-03-02T09:04:26.892Z'
---

# P465: Point card footer — unified row, no actor confusion, 1 story per user

> **Redesign of:** [P456: Story CTA footer — consistency across all surfaces](../5_feb_26/p456_story_cta_footer_consistency.md)
>
> **What was wrong:** P456 placed a second CTA footer row ("split footer") below the existing "N stories by owner" row without accounting for the own-profile case. On own profile, both rows count the same stories — `filteredStories` is pre-filtered to the profile owner upstream, so `viewerStoryCount === filteredStories.length` when viewer === owner, producing visible number duplication. On other profiles, the "✓ Agree ·" label in the CTA row reads as the profile owner's agreement (actor confusion) — the spec added it to surface viewer position, but placed it immediately after "2 stories by Alice", reversing the implied subject. Both are structural design errors, not implementation bugs.

---

## Problem Statement

P456 solved the right problem (orphaned CTA, generic copy, no position context) but created two new problems:

**Problem 1 — Own-profile duplication:** The spec said "the split footer replaces the CTA — they do not coexist." But on own-profile surfaces, there was already a separate footer row showing the story count ("▷ 2 stories by Alice"). P456 added a split footer below it without removing the first row. When viewer equals owner, both rows compute from the same pre-filtered story list — the same number appears twice in adjacent lines.

**Problem 2 — Actor confusion on other profiles:** The spec designed "✓ Agree · Why do you agree? →" to surface the viewer's own stance inline. But placed after "▷ 2 stories by Alice", it reads: "2 stories by Alice — ✓ Agrees". The viewer's position, shown correctly by the highlighted button above the point, is re-read as Alice's position by proximity. Inserting the viewer's stance between their position buttons and the profile owner's story count is the correct order; appending it after is the wrong order.

**Problem 3 — Viewer story data gap:** `viewerStoryCount` is computed as `filteredStories.filter(s => s.authorId === currentUserId).length`. On other-profile surfaces, `filteredStories` contains only the profile owner's stories (loaded upstream). The viewer's linked stories for that point are never fetched — `viewerStoryCount` is always 0 on other profiles regardless of reality.

---

## Jobs To Be Done

**Preserved from P456 (still valid, unchanged):**
- When I stake a position on a point, I want immediate context for why this prompt appeared so I can decide whether to write a story now or later
- When I revisit a point I positioned on, I want to see whether I've already told my story so I don't feel pressured to repeat
- When I'm in /live and take a position, I want to know story entry exists and will be available after the session
- When I browse another person's profile, I want to see my own stance on each of their points without hunting through button states

**Corrected (P456 got the mechanism wrong):**
- When I view my own profile, I want a single, unambiguous count of stories linked to each point — not the same number shown twice from different rows
- When I view another person's profile and see their stories linked to a point, I want to know whose stories those are — the "✓ Agrees" label should never be mistakable for the profile owner's stance

**New (P456 didn't address):**
- When I've already filed one story for a point and return to that point, I want to edit my existing story — not create a duplicate

---

## Current State

P456 implemented two footer rows in `PointCardWithLinks` (and `PointCardProfile` in `profile-page-v2.tsx`):

**Row 1 (pre-P456, always present when stories exist):**
A clickable expand trigger showing "▷ N stories by [owner name]" — counts `filteredStories.length` (all stories passed into the component).

**Row 2 (P456 split footer, gated on `userPosition && !liveSessionMode`):**
Shows "✓ Agree · Why do you agree? →" (no story) or "▶ N stories · + add story →" (story exists).
Counts `viewerStoryCount = filteredStories.filter(s => s.authorId === currentUserId).length`.

**Before (current state on own profile — duplication):**
```
┌─────────────────────────────────────────┐
│  ◉ Agree   ○ Disagree   ○ Unsure        │  ← position buttons
├─────────────────────────────────────────┤
│  ▷ 2 stories by Alice  [↗][↗]           │  ← Row 1: pre-P456, counts filteredStories
│  ▶ 2 stories · + add story →            │  ← Row 2: P456 split, same count
└─────────────────────────────────────────┘
```
Both rows show "2" — identical metric from same source.

**Before (current state on other profile — actor confusion):**
```
┌─────────────────────────────────────────┐
│  ◉ Agree   ○ Disagree   ○ Unsure        │  ← position buttons
├─────────────────────────────────────────┤
│  ▷ 2 stories by Alice  [↗][↗]           │  ← Row 1
│  ✓ Agree · Why do you agree? →          │  ← Row 2: reads as Alice agrees
└─────────────────────────────────────────┘
```
"2 stories by Alice — ✓ Agrees" — subject appears to be Alice.

---

## Root Cause

**Own-profile duplication:**
In `profile-page-v2.tsx` (lines 253-344), `storiesService.getStoriesByAuthorWithPoints(profile.id, ...)` fetches only the profile owner's stories. These are passed down as `linkedStories` to `PointCardWithLinks`. In the component:

```
const filteredStories = linkedStories;  // line 173 — no author filtering
const viewerStoryCount = filteredStories.filter(s => s.authorId === currentUserId).length;
```

When the viewer IS the profile owner (`currentUserId === profileOwner.id`), `viewerStoryCount === filteredStories.length`. Row 1 shows `filteredStories.length`. Row 2 shows `viewerStoryCount`. Same number. Same source. Different rows.

**Actor confusion:**
The spec designed "✓ Agree ·" as a position prefix for the viewer's CTA. Placed after "▷ 2 stories by Alice", it is separated from the viewer's position buttons (above the point text) by the full point card. The visual proximity to "Alice" outweighs the intended association with the viewer's highlighted button.

**Viewer story data gap:**
On other-profile surfaces, `filteredStories` contains only Alice's stories. `viewerStoryCount` correctly filters for `currentUserId`, but that userId never appears in the loaded data — result is always 0. The viewer's own stories linked to Alice's points are never shown.

---

## Redesign

Single unified footer row per context. CTA appears between position buttons and the stories row — not after it. No "✓ Agree ·" prefix (position shown by highlighted button). Share/open icons live in the stories row. On own profile, a single row replaces both the pre-P456 stories row and the P456 split footer. On other profiles, the viewer count ("· 1 by you") is appended to the owner count in the same row when the viewer has a story. Feed view is unchanged.

**CTA copy mapping (preserved from P456):**

| Viewer position | CTA text |
|---|---|
| Agree | Why do you agree? → |
| Disagree | Why do you disagree? → |
| Unsure | Why are you unsure? → |

No "✓ Agree ·" prefix on any surface. Position is shown by the highlighted button above the point.

See UX Design → Screen Layouts below for full per-state ASCII.

---

## Predecessor Sections Superseded

| Section | P456 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| Design decision | "The split footer replaces the CTA — they do not coexist" | **Superseded** — on own profile, pre-P456 stories row and P456 split footer coexist and show same count | This spec: single unified row, no dual-row at all |
| AC | "The split footer replaces the CTA — they do not coexist" | **Superseded** — violated on own-profile surfaces | AC: single stories row, no two rows with same count |
| AC | "All 6 position-taking surfaces have identical footer structure" | **Superseded** — own profile, other profile, /live, /chat have meaningfully different footer states | This spec: own profile, other profile, and /live are explicitly differentiated |
| Design decision | "Footer includes viewer's position label: '✓ Agree · Why do you agree? →'" | **Superseded** — "✓ Agree ·" prefix causes actor confusion on other profiles | This spec: CTA text only ("Why do you agree? →"), no position prefix |
| Design decision | "Split footer: '▶ N stories' (left) + '+ add story →' (right)" | **Superseded** — allows multiple stories per user per point | This spec: 1 story per user per point; returning users go to edit mode, not create |

**Not superseded:** All 8 surfaces still in scope. Adaptive copy ("Why do you agree?" etc.) preserved. /live disabled state preserved. Navigation to `/chat?from=position&pointId=X` preserved. `getPositionCTACopy()` utility preserved.

---

## Requirements

1. **Single row on own profile** — one footer row combining story count + action icons. No separate CTA row if story exists.
2. **CTA order** — CTA appears immediately after position buttons, before story count. Never after "N stories by Alice."
3. **No actor prefix** — CTA text only ("Why do you agree? →"), no "✓ Agree ·" label.
4. **Viewer count on other profiles** — when viewer has a story for a point on another profile, show "by Alice · 1 by you" appended to the owner's count. Requires fetching viewer's own story count per point.
5. **1 story per user per point** — DB constraint + `/chat` edit mode for returning users.
6. **Remove P451 dead code** — `point-card-with-links.tsx` lines 576-586 ("Tell your story →" legacy button from P451).
7. **Share/open icons in stories row** — not in CTA row. Stories row is the stable row; CTA is transient.
8. **Edit/delete on own profile** — remain in the stories row (existing behavior, verify not lost).

---

## What Stays the Same

- Profile owner story fetching — `getStoriesByAuthorWithPoints` unchanged; owner stories pipeline is not modified
- ⚠️ Viewer story fetching on other profiles is NOT unchanged — Requirement 4 explicitly requires fetching the viewer's own story count per point. Service method changes for this are scoped to the architect phase. See also: AC line 251 and UX Design Decision 2.
- `getPositionCTACopy()` utility in `types.ts` — copy mapping unchanged
- Navigation destination: `/chat?from=position&pointId={id}` — unchanged
- /live disabled state and "Available after the session" hint — unchanged
- /chat context card — no change
- RLS policies on `story_points`
- All other position-taking surfaces not listed in "Surfaces in Scope"
- Position button behavior and styling

---

## Surfaces in Scope

**In scope:**
- `src/app/components/social/point-card-with-links.tsx` — main shared component (quote pattern + feed view); both own and other-profile contexts share this
- `src/app/pages/profile-page-v2.tsx` — `QuotedPointCard` component (footer at lines 1276-1317) — profile-surface footer (own and other profiles)
- `supabase/migrations/` — new migration: `UNIQUE(author_id, point_id)` constraint on `story_points`
- `/chat` entry point — detect existing story for `(currentUserId, pointId)` and open edit mode instead of create

**Out of scope:**
- `/chat` story creation/edit flow internals — only the entry point branch changes
- `StoryCardDetail.tsx` (Stories tab) — P456 changes there are correct; no new duplication on that surface
- `story-card-with-links.tsx` (feed linked points) — no profile context, no duplication issue
- `live-story-card-expanded.tsx` — /live disabled state correct, no change needed
- Feed page layout
- Point detail page — P456 changes there are correct

---

## Acceptance Criteria

**Duplication fix:**
- [ ] Own profile: exactly one footer area per point card — no two rows showing the same story count
- [ ] Own profile, no story: shows "▷ 0 stories [share] [open]" with CTA "Why do you agree? →" between position buttons and stories row
- [ ] Own profile, story exists: shows "▷ N stories [edit] [delete] [share] [open]" — no CTA

**Actor confusion fix:**
- [ ] "✓ Agree ·" prefix does NOT appear on any surface in any context
- [ ] CTA ("Why do you agree? →") appears between position buttons and the stories row — never after "N stories by Alice"
- [ ] Other profile, position taken, no story: stories row shows "▷ N stories by [Alice]" with CTA above it (between positions and stories)

**Viewer count on other profiles:**
- [ ] Other profile, position taken, viewer has story: stories row shows "▷ N stories by [Alice] · 1 by you" — single row, no CTA
- [ ] Other profile, position taken, viewer has no story: shows "▷ N stories by [Alice]" + CTA "Why do you agree? →"
- [ ] Viewer story count on other profiles is accurate (not always 0) — requires data pipeline fix

**1 story per user per point:**
- [ ] `story_points` table has `UNIQUE(author_id, point_id)` constraint
- [ ] `/chat?from=position&pointId=X` opens in edit mode when viewer already has a story for that point
- [ ] Creating a second story for the same point as the same user is blocked at both UI and DB level

**Cleanup:**
- [ ] P451 legacy "Tell your story →" button removed from `point-card-with-links.tsx` (lines 576-586)
- [ ] Share/open icons appear in the stories row, not in the CTA row, on all surfaces

**Regression:**
- [ ] Surfaces NOT in scope (feed, /live, Stories tab, point detail, /chat) are visually unchanged
- [ ] All existing tests for P456 still pass — or are updated to reflect corrected behavior
- [ ] Own-profile edit/delete controls remain accessible on stories linked to viewer's own points

---

## Next Steps

Has layout + visual hierarchy changes AND a DB migration → run:
1. `/ux features/p465_point_card_footer_redesign.md` — finalize per-surface layouts, edge cases (0 stories, /live, Stories tab)
2. `/architect features/p465_point_card_footer_redesign.md` — data pipeline for viewer story count on other profiles, DB constraint, /chat edit mode routing
3. `/dev` — implement

---

## UX Design

### Lean Challenge Review

No lean violations found. The feature is a targeted fix — reducing displayed rows from 2→1, removing a misleading label, and correcting data gaps. No new steps, no new setup screens, no scope that benefits one edge case but taxes all users. Proceeding.

---

### Surface Map

This feature has three distinct rendering contexts, each with distinct footer logic:

| Context | Component | Viewer === Owner? | Profile owner available? |
|---------|-----------|-------------------|--------------------------|
| **Own profile** | `QuotedPointCard` in `profile-page-v2.tsx` | Yes | Self |
| **Other profile** | `QuotedPointCard` in `profile-page-v2.tsx` | No | Alice |
| **Feed / quote pattern** | `PointCardWithLinks` (non-profile-owner context) | N/A | No |
| **/live** | `PointCardWithLinks` with `liveSessionMode=true` | N/A | N/A |

---

### User Flows

#### Flow 1 — Own profile, no story yet

Entry: User is on their own profile page. They agreed on a point but haven't written a story.

1. User sees point card with position buttons (Agree highlighted).
2. Below position buttons: a single CTA row — `"Why do you agree? →"` — links to `/chat?from=position&pointId=X`.
3. Below CTA: a single stories row — `"▷ 0 stories  [share] [open]"`.
4. User clicks CTA → navigates to `/chat` in create mode for this point.
5. After story created, return path brings user back to profile. Footer now shows Flow 2 state.

#### Flow 2 — Own profile, story exists

Entry: User is on their own profile page. They have one story linked to this point.

1. User sees point card with position buttons (position highlighted).
2. Single footer row (no CTA): `"▷ 1 story  [edit] [delete] [share] [open]"`.
3. User clicks `[edit]` → `/chat?from=position&pointId=X&storyId=Y` in edit mode.
4. User clicks `[delete]` → confirmation dialog → story deleted → footer reverts to Flow 1 state.
5. User clicks `[share]` → share sheet for this point.
6. User clicks `[open]` → navigates to `/point/X`.
7. No "add another story" path exists (1 story per user per point).

#### Flow 3 — Other profile, viewer has position, no story yet

Entry: User is browsing Alice's profile. Viewer has taken a position on this point but has no story for it yet.

1. User sees point card with position buttons (Agree highlighted).
2. Below position buttons: CTA row — `"Why do you agree? →"` — links to `/chat?from=position&pointId=X`.
3. Below CTA: stories row — `"▷ 2 stories by Alice  [share] [open]"`.
4. User clicks CTA → navigates to `/chat` in create mode.
5. After story created, return. Footer now shows Flow 4 state (CTA gone, viewer count appended).

#### Flow 4 — Other profile, viewer has position, viewer story exists

Entry: User is on Alice's profile. They have taken a position AND have already written one story linked to this point.

1. User sees point card with position buttons (position highlighted).
2. Single footer row (no CTA): `"▷ 2 stories by Alice · 1 by you  [share] [open]"`.
3. No edit/delete icons in this row — viewer's story is accessible via the viewer's own profile (existing pattern).
4. User can click `[share]` or `[open]` on the point.
5. No path to create a second story (UI suppresses CTA; DB constraint enforces).

#### Flow 5 — Other profile, viewer has no position

Entry: User is on Alice's profile. They have NOT taken a position on this point.

1. Position buttons shown, none highlighted.
2. No CTA (position is prerequisite for CTA).
3. Stories row: `"▷ 2 stories by Alice  [share] [open]"`.
4. User takes a position → footer transitions to Flow 3 state (CTA appears).

#### Flow 6 — Feed view (no profileOwner context)

Entry: User sees a point card in the feed (home feed, search, etc.).

1. Stories row only: `"▷ N stories  [share] [open]"` (no "by [name]", no viewer count).
2. If user has a position and no story: CTA appears as a second row below (consistent with current feed behavior — feed is not in the duplication scope since `filteredStories` is not pre-filtered by owner).
3. If user has a story: single merged row, no CTA.

#### Flow 7 — /live session mode

Entry: User is in a live session and encounters a point card.

1. Position buttons shown.
2. Footer: `"▷ N stories  [expand]"` — no share/open icons (liveSessionMode hides them).
3. No CTA shown in live mode (`liveSessionMode` flag suppresses it).
4. Story expand still works.

---

### Screen Layouts

All layouts below use text notation. The footer sits inside the quoted box (profile surfaces) or as a separate div (feed surfaces). The separator line is `border-t border-gray-200`.

#### Own profile — no story (quote pattern, inside quoted box)

```
┌─────────────────────────────────────────────────────────┐
│  [Avatar] Alice agrees                                  │  ← position badge above box
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐    │
│  │  [Pin]  Point statement text                    │    │
│  │                                                 │    │
│  │         [Agree] [Disagree] [Unsure]             │    │
│  │  ─────────────────────────────────────────────  │    │
│  │         Why do you agree? →                     │    │  ← CTA row (text only, no prefix)
│  │  ─────────────────────────────────────────────  │    │
│  │         ▷ 0 stories          [share] [open]     │    │  ← stories row
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

- CTA text color: `text-blue-600`, underline on hover, `font-medium`
- Stories row text: `text-gray-600`, `text-sm`
- `▷` is a plain text character (ChevronRight or literal), not a Lucide icon in this position

#### Own profile — story exists (quote pattern, inside quoted box)

```
│  ┌─────────────────────────────────────────────────┐    │
│  │  [Pin]  Point statement text                    │    │
│  │                                                 │    │
│  │         [Agree] [Disagree] [Unsure]             │    │
│  │  ─────────────────────────────────────────────  │    │
│  │         ▷ 1 story  [edit] [delete] [share] [open] │  │  ← single unified row, no CTA
│  └─────────────────────────────────────────────────┘    │
```

- `[edit]` = pencil icon (Lucide `Pencil`), `aria-label="Edit story"`
- `[delete]` = trash icon (Lucide `Trash2`), `aria-label="Delete story"`
- Icon order: edit → delete → share → open
- All icons: `min-w-[44px] min-h-[44px]` touch targets (existing pattern)
- Story count: `"1 story"` or `"N stories"` (singular/plural). No "by you" (implied on own profile).

#### Other profile — position taken, no story (quote pattern)

```
│  ┌─────────────────────────────────────────────────┐    │
│  │  [Pin]  Point statement text                    │    │
│  │                                                 │    │
│  │         [Agree] [Disagree] [Unsure]             │    │
│  │  ─────────────────────────────────────────────  │    │
│  │         Why do you agree? →                     │    │  ← CTA (between positions and stories)
│  │  ─────────────────────────────────────────────  │    │
│  │  ▷ 2 stories by Alice         [share] [open]   │    │  ← Alice's story count
│  └─────────────────────────────────────────────────┘    │
```

- CTA sits above stories row with its own separator line
- Stories row shows `profileOwner.name` ("by Alice")

#### Other profile — position taken, viewer story exists (quote pattern)

```
│  ┌─────────────────────────────────────────────────┐    │
│  │  [Pin]  Point statement text                    │    │
│  │                                                 │    │
│  │         [Agree] [Disagree] [Unsure]             │    │
│  │  ─────────────────────────────────────────────  │    │
│  │  ▷ 2 stories by Alice · 1 by you  [share] [open] │  │  ← single row, no CTA
│  └─────────────────────────────────────────────────┘    │
```

- `"· 1 by you"` appended to owner count in same text node, `text-gray-500` or same color
- No CTA. No edit/delete here (viewer edits via own profile).

#### Other profile — no position taken (quote pattern)

```
│  ┌─────────────────────────────────────────────────┐    │
│  │  [Pin]  Point statement text                    │    │
│  │                                                 │    │
│  │         [○ Agree] [○ Disagree] [○ Unsure]       │    │
│  │  ─────────────────────────────────────────────  │    │
│  │  ▷ 2 stories by Alice         [share] [open]   │    │  ← no CTA
│  └─────────────────────────────────────────────────┘    │
```

#### Feed / no-profile context (non-quote pattern)

```
┌─────────────────────────────────────────────────────────┐
│  [Pin]  Point statement text                            │
│                                                         │
│         [Agree] [Disagree] [Unsure]                     │
├─────────────────────────────────────────────────────────┤
│  ▷ N stories                    [share] [open]          │  ← stories row
├─────────────────────────────────────────────────────────┤
│  Why do you agree? →                                    │  ← CTA row (if position + no story)
└─────────────────────────────────────────────────────────┘
```

Note: In feed view there is no `filteredStories` pre-filtering by owner — no duplication risk. Existing two-row structure is acceptable in feed. The CTA appears BELOW the stories row in feed (above would require restructuring feed footer, out of scope).

---

### Edge Cases

#### Zero stories — own profile, no position taken

```
▷ 0 stories  [share] [open]
```

No CTA (position is prerequisite). `"0 stories"` is shown (not hidden) to orient the user that story filing is possible.

#### Zero stories — own profile, position taken

```
Why do you agree? →
▷ 0 stories  [share] [open]
```

CTA visible. Story count is `0`.

#### Zero stories — other profile

```
▷ 0 stories by Alice  [share] [open]
```

No CTA if viewer has no position. CTA shown above if viewer has position.

#### Viewer story count = 0 on other profile (data pipeline not yet fixed)

During the interim before the data pipeline fix (architect phase), `viewerStoryCount` on other profiles may still compute as 0 even when the viewer has a story. The UI must be defensive:

- If `viewerStoryCount === 0`, show CTA (treat as "no story"). This is the current incorrect behavior — acceptable short-term.
- After pipeline fix, the accurate count will suppress the CTA correctly.
- **Decision needed:** architect phase should confirm whether to ship UI change first (accepting temporary false-positive CTAs) or require data pipeline + UI together. This is an implementation sequencing question, not a UX question.

#### User deletes their story on own profile

1. `[delete]` clicked → confirmation dialog ("Delete this story?", "Delete" / "Cancel").
2. On confirm: story deleted, footer transitions from Flow 2 → Flow 1 (CTA appears, count becomes 0).
3. On cancel: no change.
4. Deletion in flight: disable delete button (loading state), show spinner on button or inline.

#### `/chat` route receives existing story for (userId, pointId)

Entry: Viewer has a story for this point and is routed to `/chat?from=position&pointId=X`.

- `/chat` must detect existing story at load time.
- Opens in edit mode, pre-populating existing story text.
- Title/prompt should reflect editing context ("Edit your story"), not creation context.
- This is a `/chat` routing change — UX defined here, implementation in architect.

#### DB constraint violation attempt (create second story)

- UI suppresses CTA when `viewerStoryCount > 0` — user cannot reach create flow.
- If somehow they reach it (direct URL, stale UI), `/chat` edit-mode detection catches it.
- DB `UNIQUE(author_id, point_id)` constraint is final safety net — returns error, toast shown: "You already have a story for this point."

#### Loading state — viewer story count fetch on other profile

When fetching viewer's story count for other-profile points:

- Show stories row with known owner count immediately (owner stories already loaded).
- `"· N by you"` appended once viewer data resolves.
- While loading: either omit the `"· N by you"` suffix entirely, or show a subtle skeleton/spinner in that position only.
- Preferred: omit suffix until resolved (no spinner pollution in a compact row). If count resolves to 0, show CTA; if >0, suppress CTA.

#### /live disabled state (unchanged from P456)

Position buttons shown (to allow selection). CTA suppressed by `liveSessionMode`. After session ends, user routes back to profile where the persistent CTA is available. No change to this behavior.

#### Unauthenticated viewer

Position buttons not shown (`currentUserId` is null → buttons hidden by `!hideActions && currentUserId` guard). No CTA rendered (no position possible). Stories row with count and expand still visible. Share icon visible. Open icon visible.

#### Point with no linked stories (count = 0) — other profile, viewer has position

```
Why do you agree? →
▷ 0 stories by Alice  [share] [open]
```

Both rows shown. The `0 stories` label is informative — Alice hasn't linked any stories to this point.

#### Plural / singular story counts

- 0 → `"0 stories"` (not `"0 story"`)
- 1 → `"1 story"`
- 2+ → `"N stories"`
- Applies to both owner count ("2 stories by Alice") and viewer count ("1 by you", not "1 stories by you")

---

### Accessibility

#### ARIA labels

| Element | ARIA label |
|---------|-----------|
| CTA button "Why do you agree? →" | `aria-label="Tell your story about why you agree"` (or disagree / unsure) |
| Stories expand trigger `▷ N stories` | `aria-expanded={storiesExpanded}`, `aria-label="Expand linked stories"` |
| `[edit]` icon button | `aria-label="Edit your story for this point"` |
| `[delete]` icon button | `aria-label="Delete your story for this point"` |
| `[share]` icon button | existing `ShareButton` component — already has `aria-label` |
| `[open]` icon button | `aria-label="Open point"` (existing) |

#### Keyboard navigation

- All interactive elements reachable via Tab.
- CTA button: Tab → Enter activates navigation to `/chat`.
- Expand trigger: Tab → Enter toggles story list.
- Icon buttons (edit, delete, share, open): Tab → Enter / Space activates.
- Delete confirmation dialog: focus trapped within dialog. Escape cancels. Tab cycles between "Delete" and "Cancel".
- Tab order within footer row: expand trigger → edit → delete → share → open (left to right, reading order).

#### Color contrast

- CTA text (`text-blue-600` on white): 4.5:1 — WCAG AA compliant.
- Stories row text (`text-gray-600` on white): 4.5:1 — WCAG AA compliant.
- `"· 1 by you"` suffix: use `text-gray-600` (same as owner count) or `text-gray-500`. Verify 4.5:1 at chosen value — `text-gray-500` on white is 3.95:1 (fails AA for normal text). Use `text-gray-600` or darker.
- Icon buttons in default state (`text-gray-400`): 1.9:1 — below AA, but icons with tooltips and labels are standard pattern in this codebase (existing `ShareButton` and `ExternalLink` icons use same approach). Keep consistent with existing pattern; add visible focus rings for keyboard users.

#### Focus indicators

- All buttons: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2` (existing pattern in codebase).
- Delete confirmation dialog: auto-focus "Cancel" button on open (safer default).

#### Screen reader announcements

- When footer transitions (e.g., story created → CTA disappears, count updates): no special live region needed. The transition happens via navigation (user went to `/chat` and back) — full page re-render, screen reader re-reads.
- Delete confirmation: dialog role should be `role="dialog"` with `aria-labelledby` pointing to dialog title.

---

### Responsive Design

The point card renders inside the profile page which is a single-column layout on mobile. The card itself is full-width on all breakpoints.

#### Mobile (320px–767px)

- Footer rows stack vertically — no wrapping risk in single-column layout.
- Icon buttons maintain `min-w-[44px] min-h-[44px]` touch targets (existing pattern — do not reduce).
- CTA text wraps if needed — full width available, should not wrap on typical point lengths.
- `"▷ 2 stories by Alice · 1 by you  [share] [open]"` — on very narrow screens (320px) this row may crowd. Acceptable; share/open icons are at right edge and maintain tap targets.
- If overflow is a concern: float icons to right with `justify-between`, story count text on left. This is already the existing pattern in the footer row.

#### Tablet (768px–1023px)

No structural change from mobile. Single-column profile layout still applies. More horizontal space means less crowding in the combined count row.

#### Desktop (1024px+)

Profile page is constrained to a max-width column (existing layout). Footer row behavior identical to tablet — same single-column card, more padding on outer container.

#### Breakpoint behavior

No layout changes at breakpoints for the footer rows themselves. The `pl-[44px]` / `pl-[52px]` indentation that aligns footer content with the point text column is consistent across breakpoints (existing pattern, preserve it).

---

### Component Analysis

| Element | Classification | File / Notes | Decision needed? |
|---------|---------------|--------------|-----------------|
| Stories row (expand trigger) | Extend | `point-card-with-links.tsx` lines 269-283 (quote pattern) and 402-444 (feed pattern). Add "by you" suffix logic; add edit/delete icons when `isOwnProfile && viewerStoryCount > 0`. | No — extend existing row |
| CTA row ("Why do you agree? →") | Extend | `point-card-with-links.tsx` lines 308-352 (quote) and 447-490 (feed). Remove `copy.symbol` / `copy.label` prefix. Change position to render before stories row, not after. | No — text + position change only |
| `QuotedPointCard` footer | Extend | `profile-page-v2.tsx` lines 1276-1317. Replace dual-row with unified single-row per the state matrix. | No |
| Edit icon button | New | `Pencil` icon from Lucide, same styling as existing icon buttons (`min-w-[44px] min-h-[44px]`, `text-gray-400 hover:text-gray-600`). Navigation to `/chat?from=position&pointId=X&storyId=Y`. | No |
| Delete icon button | New | `Trash2` icon from Lucide. Triggers confirmation dialog. Same icon button styling. | No |
| Delete confirmation dialog | Reuse / Extend | Check for an existing confirmation dialog component in `src/app/components/ui/`. If none: a small headless modal or `window.confirm` (simpler, lower risk for this case). **Decision needed:** use `window.confirm` (zero new code, accessible by default) or a styled dialog component? | Yes — `window.confirm` vs styled dialog. Recommend `window.confirm` to keep scope minimal; upgrade later if needed. |
| `ShareButton` | Reuse | `src/app/prototypes/linkedin-like/components/shared` — existing, no change. | No |
| Open point button (ExternalLink) | Reuse | Existing `ExternalLink` icon + `navigate(\`/point/${point.id}\`)` pattern — no change. | No |
| P451 "Tell your story →" button | Remove | `point-card-with-links.tsx` lines 576-586 — dead code per Requirements §6. | No |
| `getPositionCTACopy()` utility | Reuse | `src/app/prototypes/shared/types.ts` — no change to utility, only usage changes (drop prefix rendering). | No |

**Decisions requiring founder input:**

1. **Delete confirmation: `window.confirm` vs styled dialog.** `window.confirm` is zero-code, accessible, mobile-friendly, and appropriate for a destructive action on a secondary surface. A styled dialog matches the design system but adds 30-50 lines of code. For P465 scope, `window.confirm` is the lean choice. Upgrade to styled dialog in a dedicated polish pass if needed. **Recommend: `window.confirm` — confirm or override.**

2. **Viewer story count fetch timing (other profile).** The current architecture does not fetch viewer stories for other-profile points. The architect phase will design the data pipeline. UX implication: if we ship the UI change before the data fix, the CTA will show (incorrectly) for viewers who already have a story on another person's profile. This is a P465 AC failure. **Decision: ship UI + data fix together, or accept the false positive temporarily?** UX recommendation: ship together.

3. **`"· 1 by you"` color.** `text-gray-500` is 3.95:1 contrast (below WCAG AA for normal text). `text-gray-600` passes. **Recommend: `text-gray-600`** for the viewer count suffix — same color as owner count, visually consistent, contrast-compliant.

---

### Self-Review Checklist

- [x] All user stories have corresponding user flows (Flows 1-7 cover all JTBD)
- [x] User flows are complete: Entry → Actions → Exit (not just happy path)
- [x] Edge cases identified: zero stories, unauthenticated, delete confirmation, loading state, DB constraint violation, plural/singular, /live, data pipeline gap
- [x] Accessibility requirements specified: ARIA labels, keyboard nav, color contrast, focus indicators, dialog focus management
- [x] Responsive design considered: mobile touch targets, narrow-screen row crowding, breakpoint behavior
- [x] Component analysis complete — every major element classified as Reuse/Extend/New
- [x] Decisions requiring founder input surfaced explicitly (3 decisions)
- [x] Sections 1–5 contain no file paths or code patterns
- [x] Flows are specific enough that developer can implement without guessing

---

## Architecture

### Prior Decisions Checked

- **[technical] `getPositionCTACopy`** (2026-02-27) — Pure function in `src/app/prototypes/shared/types.ts`. P465 preserves this utility; only changes the rendering side (drop `copy.symbol` / `copy.label` prefix, keep `copy.ctaText` and `copy.ariaLabel`).
- **P117** — `story_points` table defined with `PRIMARY KEY (story_id, point_id)` only. No `UNIQUE(author_id, point_id)` constraint exists. Confirmed via migration file.
- **P134 / P136** — Profile story-point join pattern: `getStoriesByAuthorWithPoints` fetches only the profile owner's stories upstream; `filteredStories` in `PointCardWithLinks` therefore contains only owner stories on profile surfaces. This is the root of the viewer-count-always-0 bug.
- **P456 Index entry** — Notes the split-footer implementation. P465 replaces it.

---

### Technical Analysis

#### Current Code State

**`src/app/components/social/point-card-with-links.tsx`**

Two rendering branches:
- **Quote pattern** (lines 216–353): triggered when `showQuotePattern = profileOwner && profileOwner.position`. Renders the quoted box with footer inside. The P456 Story CTA block at lines 308–352 appends below the existing stories-row footer at lines 263–306. Both rows are always rendered when `userPosition` is truthy — the duplication.
- **Feed pattern** (lines 355–491): standalone layout. Similar two-row structure (stories row at lines 396–444, P456 CTA row at lines 446–490).
- **P451 dead code** (lines 575–586): `showStoryCTA && !liveSessionMode` outer-component button — the "Tell your story →" blue button rendered _outside_ the card div. This is a sibling element to the card, not in the footer.

The `filteredStories` variable (line 173) is set to `linkedStories` directly — no author filtering in the component. All filtering happens upstream.

`viewerStoryCount` (lines 312, 450) = `filteredStories.filter(s => s.authorId === currentUserId).length`. On other-profile surfaces `filteredStories` contains only the profile owner's stories, so this is always 0.

**`src/app/pages/profile-page-v2.tsx`**

- `viewerStoriesForPoint` memo (lines 183–196): only populates when `currentUserId === profile.id` (own profile). Returns empty Map on other profiles, so `viewerStoryCount` passed to `QuotedPointCard` is always 0 on other profiles.
- `QuotedPointCard` component (lines 1143–1318): separate local component used in the Stories tab (profile owner's story cards showing linked points). Its footer at lines 1276–1317 has the same P456 pattern.
- Data loading (lines 249–359): `getStoriesByAuthorWithPoints(profile.id, currentUser?.id)` fetches only the profile owner's stories. Viewer's stories are never fetched here.

**`src/app/pages/story-guide-chat-page.tsx`**

Page reads `?from=position&pointId=XYZ`. Calls `pointsService.getPointWithUserPosition(pointId, user.id)` to get the point and the user's position. No logic to detect whether the user already has a story for this point. `StoryGuideChat` component has no `editMode` or `existingStoryId` prop — always creates new.

**`supabase/migrations/20260204_stories_points_calibration.sql`**

```sql
CREATE TABLE story_points (
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  point_id UUID NOT NULL REFERENCES points(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (story_id, point_id)
);
```

No `UNIQUE(author_id, point_id)` constraint. The junction table doesn't even have `author_id` — author identity flows through `story_id → stories.author_id`. A uniqueness constraint on `(author_id, point_id)` would need to be a computed constraint spanning two tables, which PostgreSQL does not support directly. The correct approach is a partial unique index or a constraint function. See Decision 3 below.

**`src/app/data/stories-service.interface.ts` / `stories-service-real.ts`**

No method for `getStoryByUserAndPoint(userId, pointId)`. The `linkPointToStory` method already handles the 23505 duplicate-key error on the current PK — but that only catches `(story_id, point_id)` duplicates, not `(author_id, point_id)` duplicates.

#### Dependencies

- No new npm packages needed.
- New Supabase migration required.
- New method on `StoriesService` interface required.
- `StoryGuideChatPage` and `StoryGuideChat` require new props.

---

### Architecture Decisions

**Decision 1: Viewer story count on other profiles — fetch strategy**

- **Chosen:** One targeted query at profile-page load time, scoped to the viewer and the set of point IDs on the page.
- **Approach:** In `profile-page-v2.tsx`, after `adaptedPoints` is built (so `pointIds` is known), fire a secondary query:
  ```ts
  // After existing story_points batch query (line 290-301)
  if (currentUserId && currentUserId !== profile.id) {
    const { data: viewerLinks } = await supabase
      .from('story_points')
      .select('point_id, story_id, story:stories!inner(author_id)')
      .in('point_id', pointIds)
      .eq('story.author_id', currentUserId);
    // Build Map<pointId, count>
  }
  ```
  This produces a `viewerStoriesForPoint` Map populated for all other-profile cases, not just own-profile.
- **Rationale:** The batch is already structured here; adding a second batch for the viewer's links follows the existing P134/P151 pattern of batch loading at profile load time. Avoids per-card fetches. Reuses the `viewerStoriesForPoint` state variable that already exists in the page.
- **Trade-off:** One extra query per profile page load (for authenticated viewer on another profile). Acceptable; it is a bounded join on indexed columns (`story_points.point_id` index exists).
- **Alternative rejected — Fetch in component:** Putting the fetch in `PointCardWithLinks` would cause N queries for N point cards. The per-card fetch pattern was already rejected in P134/P151 for this reason.
- **Alternative rejected — Fetch viewer stories separately upfront:** Could call `getStoriesByAuthorWithPoints(currentUserId)` to get all viewer stories, then cross-reference. But this fetches the viewer's entire story library, which grows unboundedly and would be inefficient.
- **Viewer story ID also needed:** For edit mode routing (Decision 3), we need not just the count but the `story_id` itself. The query above already returns `story_id`. Store a `Map<pointId, string>` for `viewerStoryIdForPoint` alongside the count map. Both maps are built from the same query result.

**Decision 2: DB constraint — 1 story per user per point**

- **Chosen:** Unique partial index via an intermediate view/approach — specifically, a `UNIQUE` constraint on a generated column or a `UNIQUE` index on `story_points` joined with `stories.author_id`. Since `story_points` does not have `author_id`, and cross-table unique indexes are not native to PostgreSQL, the correct approach is a **trigger that enforces the constraint**.
- **Revised approach after analysis:** Add an `author_id` denormalization column to `story_points` (populated at insert time) and add a `UNIQUE(author_id, point_id)` constraint on that column. This is the most robust and query-efficient solution.

  ```sql
  -- New migration
  ALTER TABLE story_points ADD COLUMN author_id UUID REFERENCES profiles(id) ON DELETE CASCADE;

  -- Backfill from stories table
  UPDATE story_points sp
  SET author_id = s.author_id
  FROM stories s
  WHERE sp.story_id = s.id;

  -- Make non-nullable after backfill
  ALTER TABLE story_points ALTER COLUMN author_id SET NOT NULL;

  -- Unique constraint
  ALTER TABLE story_points ADD CONSTRAINT story_points_author_point_unique UNIQUE (author_id, point_id);

  -- Index (covered by the unique constraint, no separate index needed)
  ```

- **Rationale:** Denormalization of `author_id` into the junction table is a standard PostgreSQL pattern when cross-table uniqueness is needed. The `author_id` is functionally dependent on `story_id` (stories.author_id), so it is technically redundant, but this redundancy is acceptable and maintained by the existing INSERT pattern (`linkPointToStory` always inserts with a known story). An ON DELETE CASCADE on `author_id → profiles` is an extra safety net.
- **Backfill safety:** The backfill SQL above is idempotent if run twice (UPDATE SET ... WHERE is idempotent when source data is consistent). Before adding the NOT NULL constraint, must confirm zero NULLs remain.
- **Data violation check:** The migration must check for existing violations before adding the UNIQUE constraint:
  ```sql
  -- Check for existing violations before adding constraint
  SELECT sp.author_id, sp.point_id, COUNT(*) AS cnt
  FROM story_points sp
  JOIN stories s ON sp.story_id = s.id
  GROUP BY sp.author_id, sp.point_id   -- wait: we need to use sp.author_id after backfill
  HAVING COUNT(*) > 1;
  ```
  This is a pre-flight check; if violations exist, they must be resolved (keep the oldest story_point, delete newer duplicates) before adding the constraint. Include this resolution in the migration as a safe DELETE with a CTE.
- **`linkPointToStory` update:** The service method currently inserts `{ story_id, point_id }`. It must now also insert `author_id`. The service knows the story, so it can pass the author_id. Update the call sites in `StoryGuideChat.tsx` where `linkPointToStory` is called.
- **RLS update:** The existing INSERT policy `"Story authors can link points"` checks `EXISTS (stories WHERE id = story_id AND author_id = auth.uid())`. This policy already enforces authorship — it remains correct and sufficient. No new RLS policy needed for the uniqueness column.
- **Alternative rejected — Trigger-only enforcement:** A PostgreSQL trigger that raises an exception on duplicate `(author_id, point_id)` would work but: (1) doesn't provide a unique index for efficient querying, (2) error message is less clear to the application layer, (3) convention in this codebase is DB constraints, not trigger-based business rules.
- **Alternative rejected — Application-layer only:** Checking for existing story before creating is the UI/UX layer defense, but not sufficient as a DB constraint. The DB constraint is the authoritative enforcement.

**Decision 3: /chat edit mode routing**

- **Chosen:** Detect existing story in `StoryGuideChatPage` at load time using a new service method; pass `existingStory` to `StoryGuideChat` as a prop.
- **Approach:**
  1. Add `getStoryByUserAndPoint(userId: string, pointId: string): Promise<Story | null>` to `StoriesService` interface and real implementation. Query: `stories INNER JOIN story_points ON stories.id = story_points.story_id WHERE stories.author_id = userId AND story_points.point_id = pointId LIMIT 1`. Or equivalently: `story_points WHERE author_id = userId AND point_id = pointId` (after adding `author_id` column from Decision 2) with a join to `stories`.
  2. In `StoryGuideChatPage`, fire this query in the same `useEffect` that fetches the point. If a story is found, pass it as `existingStory` to `StoryGuideChat`.
  3. `StoryGuideChat` receives optional `existingStory?: Story` prop. When present: skip the brain-dump/AI phases, pre-populate the draft card with `existingStory.content`, open at the `polish` phase with an "Edit your story" heading, and save via `updateStory` instead of `createStory`.
- **"Edit mode" definition in StoryGuideChat:** The phase machine (`idle → brain-dump → streaming → ...`) is bypassed. Component initializes directly at `polish` phase with the existing content as the draft. The user can edit the text and re-save. This is a targeted entry point into an existing phase — no new phases needed.
- **State initialization on edit-mode entry (explicit):** Set `phase = 'polish'`, `polishedContent = existingStory.content`, `messages = []`. `linkPointToStory` is NOT called in edit mode — the story is already linked in `story_points`. `DraftCard` renders from `polishedContent` state, so seeding it from `existingStory.content` delivers the pre-populated content without new state variables. The edit/save path calls `updateStory(existingStory.id, ...)` instead of `createStory`.
- **URL shape:** `/chat?from=position&pointId=X` — unchanged. The edit detection is automatic at load time. No `storyId` or `editMode` URL param needed, because `pointId` + `userId` uniquely identify the story (enforced by Decision 2 constraint).
- **Rationale:** Putting detection in the page shell keeps `StoryGuideChat` receiving explicit state (not querying DB itself), consistent with how `contextPoint` and `contextProfileOwner` are passed. The page is the data-fetching boundary.
- **Trade-off:** One extra query per `/chat?from=position&pointId=X` load for authenticated users. Acceptable; it is a lightweight point lookup on indexed columns.
- **Alternative rejected — URL param `?storyId=Y`:** Would require the CTA button to know the story ID at render time, which requires the viewer story data to be loaded before rendering the button. Adds complexity to the UI before we've even verified the data pipeline works. The load-time detection approach doesn't require story ID in the URL.
- **Alternative rejected — Edit via `/chat?from=position&storyId=Y` separate route:** The UX spec says the edit entry point is the same CTA click path. Introducing a separate URL shape complicates the router and the component. One URL, load-time branch is simpler.

**Decision 4: PointCardWithLinks — viewer story ID propagation**

- **Chosen:** Add `viewerStoryIdForPoint?: Map<string, string>` prop to `profile-page-v2.tsx` rendering, but **not** to `PointCardWithLinks`. The story ID is only needed for the edit navigation URL (`/chat?from=position&pointId=X`), and `pointId` is already known to the component via `point.id`. Since Decision 3 establishes that edit detection happens in the chat page (not the profile page), the edit CTA URL remains `/chat?from=position&pointId=X` — same as the create CTA. No story ID needed in the URL.
- **Consequence:** `PointCardWithLinks` does not need a new prop for story ID. The viewer story count (`viewerStoryCount > 0`) determines whether to suppress the CTA. When count > 0, the CTA is hidden and no edit link is shown in the stories row (edit is via own profile).

**Decision 5: Own-profile edit/delete icons**

- **Chosen:** Own-profile edit/delete in `QuotedPointCard` (Stories tab) is existing behavior. For the Points tab, the `PointCardWithLinks` component does not currently render edit/delete for the viewer's own stories. Per UX spec, on own profile a unified footer row shows edit/delete icons when `viewerStoryCount > 0`. These icons need a `storyId` to navigate to `/chat?from=position&pointId=X&storyId=Y`. This requires knowing the viewer's `storyId` for each point on own-profile.
- **Approach:** On own profile, `viewerStoriesForPoint` already maps point_id → count. Add a parallel `viewerStoryIdForPoint: Map<pointId, storyId>` built from the same story data. Pass into the rendering of point cards. This is own-profile only (when `currentUserId === profile.id`), using the already-loaded `realStories`.
- **Implementation note:** On own profile, `realStories` contains all the viewer's stories with their linked points. Building the `storyId` map is a trivial `.map()` over the existing data — no new queries.

---

### Security Review

**RLS Policies:**

- `story_points` has RLS enabled. INSERT policy: `EXISTS (stories WHERE id = story_id AND author_id = auth.uid())`. This correctly enforces that only the story author can link their story to a point. The new `author_id` column (Decision 2) does not weaken this — the existing policy already validates authorship via the stories table join.
- The new `UNIQUE(author_id, point_id)` constraint operates at the DB constraint level, below RLS. It will fire for any insert, including service-role inserts. This is correct — the constraint is a data integrity rule, not an access control rule.
- `stories` table RLS: UPDATE policy uses `auth.uid() = author_id`. Edit mode in `/chat` calls `updateStory`, which is already protected by this policy. No new policy needed.
- SELECT on `story_points` is public (readable by all). The new secondary viewer-story query in `profile-page-v2.tsx` uses the public anon key (client-side Supabase). Because SELECT on `story_points` is public, this query works without special auth. No RLS change needed.
- The new service method `getStoryByUserAndPoint` reads from `stories` (public SELECT) and `story_points` (public SELECT). No RLS change needed.

**Authentication:**

- `StoryGuideChatPage` already has an auth gate (`if (!user) return <Navigate to="/signup" />`). The new story existence check runs inside the same `useEffect` that guards on `!user` — no unauthenticated query path introduced.
- The viewer-story secondary query in `profile-page-v2.tsx` is guarded by `if (currentUserId && currentUserId !== profile.id)` — only fires for authenticated viewers on other profiles.
- Edit mode in `StoryGuideChat` updates a story via `updateStory`. The RLS policy `auth.uid() = author_id` on `stories` prevents any user from editing another user's story, even if they somehow pass a different `storyId`.

**Authorization:**

- The 1-story-per-user-per-point constraint is enforced at three layers: (1) UI — CTA is hidden when `viewerStoryCount > 0`, (2) `/chat` page — edit-mode detection redirects to edit instead of create, (3) DB — `UNIQUE(author_id, point_id)` on `story_points` returns a 23505 error if violated. Existing `linkPointToStory` already handles 23505 gracefully (returns `true` — idempotent). After Decision 2 the 23505 will fire on the new constraint too; the error code check is already in place and will continue to work.
- Delete icon on own-profile navigates to a delete flow. Story deletion is already protected by `auth.uid() = author_id` DELETE policy on `stories`.

**Input Validation:**

- No new user-supplied inputs introduced. The `pointId` from the URL is passed to `getStoryByUserAndPoint` and `getPointWithUserPosition`. Both are used in Supabase `.eq()` calls — PostgREST parameterizes these values; no SQL injection risk.
- `existingStory.content` passed to `StoryGuideChat` as pre-populated draft is rendered as controlled textarea value — no XSS risk (React escapes by default).

**Data Protection:**

- No PII introduced. `author_id` denormalized into `story_points` is a UUID — not an email or name. Already visible via the stories join; denormalization does not increase exposure.
- The viewer-story query returns only `point_id`, `story_id`, and `author_id` (UUID). No story content or personal data fetched in this query.
- `story_points` SELECT is already public — anyone can see which story IDs are linked to which point IDs. The new query pattern does not open new data exposure.

**AI Prompt Security:**

Not applicable. This feature does not add new AI API calls or modify prompt construction. Edit mode in `StoryGuideChat` re-uses the existing prompt infrastructure; the existing AI prompt security review from P425 applies unchanged.

---

### Implementation Approach

#### Files to Create

1. `supabase/migrations/20260301HHMMSS_story_points_author_unique.sql` — new migration (timestamp to be generated by `./scripts/migrate.sh` convention; use a unique timestamp like `20260301120000`).

#### Files to Modify

1. **`supabase/migrations/20260301120000_story_points_author_unique.sql`** (new) — Add `author_id` column to `story_points`, backfill, add UNIQUE constraint, pre-flight duplicate check with cleanup CTE.

2. **`src/app/data/stories-service.interface.ts`** — Add `getStoryByUserAndPoint(userId: string, pointId: string): Promise<Story | null>` to the interface.

3. **`src/app/data/stories-service-real.ts`** — Implement `getStoryByUserAndPoint`: query `story_points` where `author_id = userId AND point_id = pointId`, join `stories` to get content. Also update `linkPointToStory` to include `author_id` in the insert payload.

4. **`src/app/data/stories-service-mock.ts`** — Add stub for `getStoryByUserAndPoint` returning `null`.

5. **`src/app/pages/profile-page-v2.tsx`** — Three changes:
   a. **Viewer story secondary query:** After `adaptedPoints` is built, when `currentUserId && currentUserId !== profile.id`, query `story_points` for viewer links to these point IDs. Build `Map<pointId, count>` and `Map<pointId, storyId>`.
   b. **`viewerStoriesForPoint` memo:** Extend to also handle the other-profile case (currently only populates on own profile). The memo is replaced by state (the secondary query is async, memo cannot be async). Or: keep the memo for own-profile (synchronous from `realStories`), and use a new `viewerStoryCountMap` state variable for other-profile (populated from the secondary query).
   c. **`viewerStoryIdForPoint` map (own profile):** Built from `realStories` in the same memo — maps `pointId → storyId` for own-profile edit navigation.

6. **`src/app/pages/story-guide-chat-page.tsx`** — Add story existence check in the position-triggered `useEffect`. Call `storiesService.getStoryByUserAndPoint(user.id, pointId)`. If found, pass as `existingStory` prop to `StoryGuideChat`. Import `storiesService`.

7. **`src/app/components/story-guide/StoryGuideChat.tsx`** — Add `existingStory?: Story` prop to `StoryGuideChatProps`. When present, initialize phase to `'polish'` instead of `'idle'`, pre-populate draft content with `existingStory.content`, change heading to "Edit your story", and call `updateStory` on save instead of `createStory`.

8. **`src/app/components/social/point-card-with-links.tsx`** — Four changes:
   a. **Remove P451 dead code** (lines 575–586): delete the outer `showStoryCTA` button.
   b. **Quote pattern footer restructure:** Remove the P456 CTA block (lines 308–352). Replace both the old stories-row div and the P456 CTA block with a new unified footer structure: CTA row (when `userPosition && !liveSessionMode && viewerStoryCount === 0`) above the stories row, both inside the quoted box.
   c. **Add `viewerStoryCount` prop:** Currently computed inline from `filteredStories.filter(...)`. Change to accept it as a prop (so profile-page can pass the accurate count for other profiles). Keep the inline computation as the fallback default value `viewerStoryCount ?? filteredStories.filter(s => s.authorId === currentUserId).length`.
   d. **Feed pattern:** CTA below stories row (as documented in UX spec for feed — no restructure of order needed in feed).

9. **`src/app/pages/profile-page-v2.tsx` — `QuotedPointCard` component** (lines 1143–1318): Restructure the P456 footer block (lines 1276–1317) to match the new single-row / CTA-above-stories order. Remove the "✓ Agree ·" prefix (`copy.symbol` / `copy.label`). On own profile, when `viewerStoryCount > 0`, show edit link navigating to `/chat?from=position&pointId=X&storyId=Y`.

#### Build Sequence

1. **Migration** — Write and run `./scripts/migrate.sh`. Verify on test DB. Check no violations before constraint add. (Does not affect frontend.)
2. **Service layer** — Add `getStoryByUserAndPoint` to interface + real implementation. Update `linkPointToStory` to pass `author_id`. Update mock stub. Run unit tests.
3. **Profile page — data pipeline** — Add viewer story secondary query for other profiles. Add `viewerStoryIdForPoint` map for own profile. Pass correct counts to `PointCardWithLinks` and `QuotedPointCard`. Verify `viewerStoryCount` is accurate on other-profile pages.
4. **`PointCardWithLinks` — footer restructure** — Remove P451 dead code. Restructure quote-pattern footer (CTA above stories row, remove `copy.symbol`/`copy.label`, add `viewerStoryCount` prop). Leave feed pattern order as-is.
5. **`QuotedPointCard` footer** — Restructure P456 block; add edit link on own profile.
6. **`StoryGuideChatPage`** — Add story existence check, pass `existingStory` to chat component.
7. **`StoryGuideChat`** — Add `existingStory` prop, implement edit mode entry (skip to `polish` phase with pre-populated content, use `updateStory` on save).
8. **Visual verification** — Run `/verify` on own profile (Flow 1 + Flow 2) and other profile (Flow 3 + Flow 4). Confirm no duplication, no actor-confusion label, accurate viewer count.

#### No New npm Packages

All required functionality (Supabase client queries, React state, navigation) is already available. No new dependencies.

#### Migration File

```sql
-- Migration: Add author_id to story_points for 1-story-per-user-per-point enforcement
-- P465: Point card footer redesign
-- Date: 2026-03-01

BEGIN;

-- Step 1: Add author_id column (nullable initially, for backfill)
ALTER TABLE story_points
  ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES profiles(id) ON DELETE CASCADE;

-- Step 2: Backfill from stories table
UPDATE story_points sp
SET author_id = s.author_id
FROM stories s
WHERE sp.story_id = s.id
  AND sp.author_id IS NULL;

-- Step 3: Pre-flight check — surface any violations before adding constraint
-- (If this query returns rows, resolve them in Step 3b before proceeding)
-- After backfill, check for (author_id, point_id) duplicates:
DO $$
DECLARE
  violation_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO violation_count
  FROM (
    SELECT author_id, point_id
    FROM story_points
    WHERE author_id IS NOT NULL
    GROUP BY author_id, point_id
    HAVING COUNT(*) > 1
  ) dups;

  IF violation_count > 0 THEN
    -- Delete duplicate story_points rows, keeping the oldest (smallest story_id as tiebreaker)
    DELETE FROM story_points sp
    WHERE sp.ctid NOT IN (
      SELECT MIN(sp2.ctid)
      FROM story_points sp2
      WHERE sp2.author_id IS NOT NULL
      GROUP BY sp2.author_id, sp2.point_id
    );

    RAISE NOTICE 'Resolved % duplicate (author_id, point_id) pairs in story_points', violation_count;
  ELSE
    RAISE NOTICE 'No duplicate (author_id, point_id) pairs found — clean backfill';
  END IF;
END $$;

-- Step 4: Make non-nullable
ALTER TABLE story_points ALTER COLUMN author_id SET NOT NULL;

-- Step 5: Add unique constraint
ALTER TABLE story_points
  ADD CONSTRAINT story_points_author_point_unique UNIQUE (author_id, point_id);

-- Step 6: Add index on author_id for viewer-story lookups
CREATE INDEX IF NOT EXISTS idx_story_points_author ON story_points(author_id);

COMMIT;
```

---

## Test Coverage Strategy

### Files Generated

| File | Type | What It Tests |
|------|------|---------------|
| `e2e/integration/p465-story-points-migration.spec.ts` | Integration (P270 mandatory) | `author_id` column exists, insert succeeds, `UNIQUE(author_id, point_id)` rejects duplicate, SELECT by author_id, RLS public SELECT policy |
| `src/tests/getStoryByUserAndPoint.test.ts` | Unit (Vitest) | Returns Story on match, returns null on PGRST116, queries with correct userId+pointId, handles unexpected DB errors |
| `e2e/p465-point-card-footer.spec.ts` | E2E (Playwright) | Flow 1 (own, no story: CTA visible, no actor confusion prefix), Flow 2 (own, story: CTA hidden, count appears once), Flow 3 (other, no viewer story: CTA above stories row, owner attribution), Flow 4 (other, viewer has story: CTA hidden, "by you" visible) |
| `e2e/p465-smoke.spec.ts` | Smoke (Playwright) | App loads without JS errors, body not blank |
| `features/uat/p465.md` | Manual UAT | Duplication fix (D), actor confusion fix (AC), viewer story count (VS), 1-story-per-user (OS), CTA ordering (ORD), regressions (REG), mobile (MOB) |

### What's Tested

- ✅ DB migration: column/constraint/index presence (integration)
- ✅ RLS: public SELECT on `story_points` for viewer secondary query (integration)
- ✅ Service: `getStoryByUserAndPoint` returns Story or null (unit)
- ✅ Own-profile: no story count duplication (E2E Flow 2)
- ✅ Other-profile: viewer count accuracy + no actor confusion prefix (E2E Flows 3+4)
- ✅ CTA hidden when viewer already has story (E2E Flows 2+4)
- ✅ CTA row positioned above stories row (E2E Flow 3)

### What's NOT Tested (Rationale)

- ❌ Edit mode full flow (`StoryGuideChat` polish phase) — requires AI mocking; covered by manual UAT OS-3
- ❌ `QuotedPointCard` in isolation — always rendered via profile page; covered by E2E flows
- ❌ `linkPointToStory` `author_id` update — tested indirectly via integration test insert

### Test Pyramid

```
       /\
      /  \   9 E2E tests
     /____\
    / 5 INT  \
   /__________\
  / 4 UNIT    \
 ______________
```

**Total:** 18 automated tests + 24 UAT checks

---

## Implementation Tasks

> Generated by /decompose. Each task is scoped to 1–3 files and independently verifiable.
> Run /dev to execute — it will dispatch one subagent per task.
>
> ⚠️ **Note:** `getStoryByUserAndPoint` is already implemented in `stories-service.interface.ts`
> and `stories-service-real.ts` (done during BLOCK-fix session). Task 2 covers only the
> remaining service work: `linkPointToStory` author_id update + mock stub.

### Task 1: DB Migration — author_id column + UNIQUE constraint
- **Files:** `supabase/migrations/20260301120000_story_points_author_unique.sql` (create)
- **Spec refs:** "Technical Analysis > Implementation Approach > Migration File (lines ~872-936)"
- **Tests:** `e2e/integration/p465-story-points-migration.spec.ts`
- **Depends on:** None
- **Verify:** `./scripts/migrate.sh` succeeds on test DB; migration spec passes 5/5 (author_id column exists, insert works, UNIQUE rejects duplicate, SELECT by author_id, RLS SELECT public)
- [x] Complete

### Task 2: Service layer — linkPointToStory author_id + mock stub
- **Files:** `src/app/data/stories-service-real.ts` (modify: add `author_id` to `linkPointToStory` insert), `src/app/data/stories-service-mock.ts` (modify: add `getStoryByUserAndPoint` stub returning `null`)
- **Spec refs:** "Technical Analysis > Files to Modify #3-4 (lines ~836-838), Build Sequence step 2 (lines ~860)"
- **Tests:** `src/tests/getStoryByUserAndPoint.test.ts` (already passing)
- **Depends on:** Task 1 (author_id column must exist before linkPointToStory passes it)
- **Verify:** `linkPointToStory` inserts include `author_id`; mock compiles without type errors; unit tests still 4/4
- [x] Complete

### Task 3: Profile page — viewer data pipeline + QuotedPointCard footer
- **Files:** `src/app/pages/profile-page-v2.tsx` (modify: two changes — (a) viewer secondary query + viewerStoryCountMap state for other profiles, viewerStoryIdForPoint map for own profile; (b) QuotedPointCard footer restructure at lines 1276-1317 — remove "✓ Agree ·" prefix, CTA above stories row, edit link on own profile)
- **Spec refs:** "Technical Analysis > Files to Modify #5 (lines ~840-843), Files to Modify #9 (lines ~855), Decisions 3-5 (lines ~758-782), UX Design > State Matrix (lines ~482-530)"
- **Tests:** `e2e/p465-point-card-footer.spec.ts` (Flows 1-4)
- **Depends on:** Task 2
- **Verify:** On own profile: CTA above stories row, no "✓ Agree ·" prefix, edit link visible when story exists. On other profile: viewer story count accurate, "by you" suffix appears when viewer has a story.
- [x] Complete

### Task 4: PointCardWithLinks — footer restructure + P451 cleanup
- **Files:** `src/app/components/social/point-card-with-links.tsx` (modify: remove P451 dead code lines 576-586; restructure quote-pattern footer — CTA above stories row, remove copy.symbol/copy.label prefix; add `viewerStoryCount` prop with inline fallback)
- **Spec refs:** "Technical Analysis > Files to Modify #8 (lines ~849-853), UX Design > Flows 1-4 (lines ~255-388), Decision 1 (lines ~712-725)"
- **Tests:** `e2e/p465-point-card-footer.spec.ts` (all flows), `e2e/p465-smoke.spec.ts`
- **Depends on:** Task 3 (viewerStoryCount prop passed from profile page)
- **Verify:** "✓ Agree ·" prefix gone from all surfaces; P451 button absent; CTA renders above stories row in quote pattern; feed pattern CTA position unchanged; no TypeScript errors
- [x] Complete

### Task 5: StoryGuideChatPage — edit mode detection
- **Files:** `src/app/pages/story-guide-chat-page.tsx` (modify: add `getStoryByUserAndPoint` call in position-triggered useEffect; pass `existingStory` prop to `StoryGuideChat` when found)
- **Spec refs:** "Technical Analysis > Files to Modify #6 (lines ~845), Decision 3 > Approach steps 2-3 (lines ~761-764)"
- **Tests:** `e2e/p465-point-card-footer.spec.ts` (OS-3 manual UAT covers edit mode entry)
- **Depends on:** Task 2 (`getStoryByUserAndPoint` already in interface + real service)
- **Verify:** TypeScript compiles; when navigating to `/chat?from=position&pointId=X` with an existing story, `existingStory` prop is populated; when no story, `existingStory` is undefined
- [x] Complete

### Task 6: StoryGuideChat — edit mode UI
- **Files:** `src/app/components/story-guide/StoryGuideChat.tsx` (modify: add `existingStory?: Story` prop; when present initialize `phase = 'polish'`, `polishedContent = existingStory.content`, `messages = []`; change heading to "Edit your story"; call `updateStory` on save instead of `createStory`)
- **Spec refs:** "Technical Analysis > Files to Modify #7 (lines ~847), Decision 3 > State initialization (lines ~765-766), Decision 3 > Edit mode definition (lines ~765)"
- **Tests:** `src/tests/getStoryByUserAndPoint.test.ts` (service contract); manual UAT OS-3 covers full edit flow
- **Depends on:** Task 5 (existingStory prop passed from StoryGuideChatPage)
- **Verify:** TypeScript compiles; when `existingStory` present, component renders at polish phase with pre-populated content and "Edit your story" heading; save calls `updateStory` not `createStory`
- [x] Complete

---

**Total tasks:** 6 | **Can parallelize:** Task 3 + Task 5 (after Task 2, different files) | **Must be sequential:** Task 1 → Task 2 → {Task 3 ∥ Task 5} → {Task 4 (after 3) ∥ Task 6 (after 5)}

**Post-implementation:** Run `/verify` on own profile (Flows 1+2) and other profile (Flows 3+4) to confirm no duplication, no actor-confusion label, accurate viewer count.
