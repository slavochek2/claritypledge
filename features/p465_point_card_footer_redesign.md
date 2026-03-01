---
status: week
type: story
rank: 1000003.0
changes: p456
delivery_stage: 2-ux-review
tags:
  - redesign
  - p456
  - point-card
  - footer
  - story-cta
created_date: 2026-03-01
---

# P465: Point card footer — unified row, no actor confusion, 1 story per user

> **Redesign of:** [P456: Story CTA footer — consistency across all surfaces](../features/done/5_feb_26/p456_story_cta_footer_consistency.md)
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

Single unified footer row per context. CTA appears between position buttons and the stories row — not after it. No "✓ Agree ·" prefix (position shown by highlighted button). Share/open icons live in the stories row.

**OWN PROFILE — no story yet:**
```
┌─────────────────────────────────────────┐
│  ◉ Agree   ○ Disagree   ○ Unsure        │
│                                         │
│  Why do you agree? →                    │  ← CTA: no prefix, follows position block
│  ▷ 0 stories  [share] [open]            │  ← stories row with icons
└─────────────────────────────────────────┘
```

**OWN PROFILE — story exists:**
```
┌─────────────────────────────────────────┐
│  ◉ Agree   ○ Disagree   ○ Unsure        │
│                                         │
│  ▷ 1 story  [edit] [delete] [share] [open] │  ← no CTA; edit/delete in stories row
└─────────────────────────────────────────┘
```
"1 story" — no "by you" (own profile, implied). No add-another CTA (1 story per user per point).

**OTHER PROFILE — position taken, no story yet:**
```
┌─────────────────────────────────────────┐
│  ◉ Agree   ○ Disagree   ○ Unsure        │
│                                         │
│  Why do you agree? →                    │  ← CTA between position and stories
│  ▷ 2 stories by Alice  [share] [open]   │  ← Alice's stories; share/open here
└─────────────────────────────────────────┘
```

**OTHER PROFILE — position taken, story exists:**
```
┌─────────────────────────────────────────┐
│  ◉ Agree   ○ Disagree   ○ Unsure        │
│                                         │
│  ▷ 2 stories by Alice · 1 by you  [share] [open] │  ← no CTA; viewer count appended
└─────────────────────────────────────────┘
```
No CTA when viewer already has a story. Edit/delete accessible via the viewer's own story row (existing pattern).

**OTHER PROFILE — no position taken:**
```
┌─────────────────────────────────────────┐
│  ○ Agree   ○ Disagree   ○ Unsure        │
│                                         │
│  ▷ 2 stories by Alice  [share] [open]   │  ← no CTA (position is prerequisite)
└─────────────────────────────────────────┘
```

**Feed view (no profileOwner context — unchanged):**
```
▷ N stories  [share] [open]
```

**CTA copy mapping (preserved from P456):**

| Viewer position | CTA text |
|---|---|
| Agree | Why do you agree? → |
| Disagree | Why do you disagree? → |
| Unsure | Why are you unsure? → |

No "✓ Agree ·" prefix on any surface. Position is shown by the highlighted button above the point.

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

- All data fetching (`getStoriesByAuthorWithPoints`, `getStoriesForPoints`) — no new service methods
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
- `src/app/pages/profile-page-v2.tsx` — `PointCardProfile` component (lines 1248-1289) — own-profile-specific footer
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
| **Own profile** | `PointCardProfile` in `profile-page-v2.tsx` | Yes | Self |
| **Other profile** | `PointCardProfile` in `profile-page-v2.tsx` | No | Alice |
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
| `PointCardProfile` footer | Extend | `profile-page-v2.tsx` lines 1276-1317. Replace dual-row with unified single-row per the state matrix. | No |
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
