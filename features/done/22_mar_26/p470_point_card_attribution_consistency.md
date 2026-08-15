---
status: all-done
completed_at: '2026-03-03'
type: change-request
rank: 31370.75
changes: p465
tags:
  - redesign
  - p465
  - point-card
  - footer
  - attribution
created_date: 2026-03-02T00:00:00.000Z
---

# P470: Point card footer — attribution consistency and viewer story gaps

> **Redesign of:** [P465: Point card footer — unified row, no actor confusion, 1 story per user](../21_feb_26/p465_point_card_footer_redesign.md)
>
> **What was wrong:** P465 solved own-profile duplication and removed actor confusion from the CTA prefix. But it left three structural gaps: (1) the "by [name]" attribution is dropped on own profile and at 0 count, breaking the convention established by the Stories tab ("x points by [name]"); (2) when the profile owner has stories but the viewer has a position and 0 stories, the viewer's CTA is silently suppressed — the owner's count shows but no "Add your story" appears; (3) on the point detail page (`/point/:id`), a viewer with a position has no path to add their story, and their own existing story never renders in the positions list.

---

## How we got here — the design reasoning

This spec emerged from a visual QA session on P465's output. The conversation traced through the following questions:

**"Why does own profile show '1 story' without a name when Stories tab says 'x points by Slava'?"**
Initial answer was: "implied by context — it's your profile, obviously your story." But that reasoning fails the consistency test. The Stories tab shows "x points by [name]" *even on own profile* because points on a story can be authored by anyone and always need attribution. We argued the asymmetry was intentional. But the user pushed back correctly: the name pattern should be uniform — "N stories by [name]" everywhere `profileOwner` is known, including 0 count.

**"What happens at 0 count on Alice's profile — where does Alice's name go?"**
Current code: "0 stories · Add a story" — the name is dropped entirely when count is 0. This is not intentional; it's a side-effect of the 0-count case taking a different code path than the N>0 case. The fix is simple: always render "0 stories by Alice" before the CTA.

**"What happens if I'm on Alice's profile, I have a position, but 0 stories — and Alice has 3 stories?"**
Current: shows "▷ 3 stories by Alice" with no CTA. The `filteredStories.length > 0` branch takes priority and the viewer's "position + 0 stories" CTA is suppressed. Alice's evidence is visible but there's no invitation to contribute. This is a real gap.

**"What does 'Edit' (✏) navigate to?"**
Current: `/chat?from=position&pointId=...` — the full AI story-guide wizard. This is wrong for editing. `/chat` is the creation flow. Editing an existing story should go to `/story/:id` which has inline edit mode. The spec said "edit mode for returning users" exists; the navigation destination was wrong.

**"What about the point detail page?"**
On `/point/:id`, positions are listed. If you have a position but no story, you appear as a compact name row with no "Add your story" path. If you have a story, it doesn't render as a StoryCardWithLinks — only other people's stories do. Both are gaps. P465 explicitly declared this surface out of scope; this spec brings it in.

---

## Problem Statement

P465 established the right structure (single unified footer row, no duplication, no actor confusion) but left three classes of inconsistency:

**Class 1 — Attribution omitted on own profile and at zero count.**
"N stories" without "by [name]" on own profile breaks visual consistency with the Stories tab. "0 stories · Add a story" without "by Alice" at zero count is inconsistent with "2 stories by Alice" at non-zero count. The rule should be: whenever `profileOwner` is known, always show "by [name]", at any count including 0.

**Class 2 — CTA suppressed when owner has stories but viewer has none.**
The condition `filteredStories.length > 0` gates the expand button branch and silently prevents the viewer CTA from rendering, even when the viewer has taken a position and written 0 stories. The correct behavior: show the owner's count AND the viewer's CTA together when viewer has position + 0 stories.

**Class 3 — Point detail page has no viewer story path.**
`/point/:id` lists position holders. Viewers with a position but no story have no "Add your story" CTA. Viewers with an existing story don't see it in the list. Both are dead ends that P465 left explicitly out of scope but are now worth addressing as a clean surface.

---

## Jobs To Be Done

**Preserved from P465:**
- When I view my own profile, I want a single unambiguous count of stories per point with a clear edit/delete path
- When I view another person's profile, I want to see their stories and know whether I've contributed one
- When I've taken a position and have no story yet, I want a clear invitation to write one
- 1 story per user per point — no duplicate creation

**Corrected (P465 got the mechanism wrong):**
- When I view my own profile's point card footer, I want to see "N stories by [my name]" — not "N stories" (name omitted). P465 omitted the name on own profile; this spec adds it.
- When I'm on Alice's profile and have a position but 0 stories, I want both Alice's story count and a CTA to add mine. P465 showed Alice's count OR the CTA, never both simultaneously.
- When I click Edit (✏) on a story, I want to go to the story's edit page, not restart the AI creation wizard. P465 specified `/chat` edit mode; this spec routes to `/story/:id` instead.

**New:**
- When I'm on the point detail page with a position but no story, I want a "Add your story" CTA inline with my position row
- When I'm on the point detail page and I've already written a story for this point, I want to see my story rendered there just like everyone else's

---

## Current State

### Points tab on profile page (PointCardWithLinks)

```
OWN PROFILE — has story:
  ▷ 1 story  [✏][🗑][↗][⬡]
        ↑ no name — inconsistent with Stories tab

OWN PROFILE — no story yet:
  ▷ 0 stories · Add a story →  [↗][⬡]
        ↑ no name, wrong CTA copy ("a story" not "your story")

ALICE'S PROFILE — Alice has stories, I have position, 0 stories by me:
  ▷ 2 stories by Alice  [↗][⬡]
        ↑ gap: no CTA for me even though I have a position

ALICE'S PROFILE — Alice has stories, I also have a story:
  ▷ 2 stories by Alice · 1 by you  [↗][⬡]
        ↑ "1 by you" is not a link — reads like tap target, isn't one
          ✏ should navigate to /story/:id not /chat

ALICE'S PROFILE — Alice has 0 stories, I have position, 0 stories by me:
  ▷ 0 stories · Add a story →  [↗][⬡]
        ↑ no name — inconsistent with "2 stories by Alice" pattern
```

### Point detail page (/point/:id)

```
  [ All (5) ] [ Agree (3) ] [ Disagree (1) ] [ Unsure (1) ]

  ┌─ Alice · Agrees ───────────────────────────────────┐
  │  "My story about remote work..." (full story card)  │
  └─────────────────────────────────────────────────────┘

  ┌─ You · Unsure ──────────────────────────┐
  │  (compact row — no CTA, no path forward) │  ← dead end
  └──────────────────────────────────────────┘
```

---

## Redesign

### Points tab — proposed final design

**Rule: "by [name]" always appears when `profileOwner` is known, regardless of count.**
**CTA copy: "Add your story" everywhere (not "Add a story" or "Add a story for this point").**

```
CASE A — Own profile, has story:
  ▷ 1 story by Slava  [✏][🗑][↗][⬡]
       ↑ name added
              ✏ → /story/:id  (inline edit, not /chat wizard)

CASE B — Own profile, no story yet:
  ▷ 0 stories by Slava · Add your story →  [↗][⬡]
       ↑ name added at zero count
                        ↑ "your" not "a"

CASE C — Alice's profile, Alice has stories, I have NO position:
  ▷ 2 stories by Alice  [↗][⬡]
     ← unchanged — no CTA when no position ✅

CASE D — Alice's profile, Alice has stories, I have position, 0 stories by me:
  ▷ 2 stories by Alice · Add your story →  [↗][⬡]
                          ↑ CTA added — previously missing
                            shows owner count AND invites viewer to contribute

CASE E — Alice's profile, Alice has stories, I ALSO have a story:
  ▷ 2 stories by Alice · ✏ your story  [↗][⬡]
                          ↑ was "· 1 by you" (plain text)
                            now a clickable edit link → /story/:id

CASE F — Alice's profile, Alice has 0 stories, I have position, 0 stories:
  ▷ 0 stories by Alice · Add your story →  [↗][⬡]
       ↑ name at zero count — previously "0 stories · Add a story" (no name)

CASE G — Alice's profile, Alice has 0 stories, I have NO position:
  (empty left)  [↗][⬡]
  ← unchanged — nothing to show ✅
```

### Point detail page — proposed

```
  [ All (5) ] [ Agree (3) ] [ Disagree (1) ] [ Unsure (1) ]

  ┌─ Alice · Agrees ───────────────────────────────────┐
  │  "My story about remote work..." (full story card)  │
  └─────────────────────────────────────────────────────┘

  ┌─ You · Unsure ─────────────────────────────────────┐
  │  Add your story →                                   │  ← was: dead end
  └─────────────────────────────────────────────────────┘

  OR — if you already have a story:

  ┌─ You · Unsure ─────────────────────────────────────┐
  │  "My story text..." (full StoryCardWithLinks)       │  ← was: never shown
  └─────────────────────────────────────────────────────┘
```

---

## Predecessor Sections Superseded

| Section | P465 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| AC: own profile no story | `"▷ 0 stories [share] [open]"` (no name) | Superseded | Case B: `"▷ 0 stories by Slava · Add your story →"` |
| AC: own profile has story | `"▷ N stories [edit] [delete] [share] [open]"` (no name) | Superseded | Case A: `"▷ N stories by Slava [✏][🗑][↗][⬡]"` |
| AC: other profile viewer story exists | `"▷ N stories by [Alice] · 1 by you"` (plain text) | Superseded | Case E: `"▷ N by Alice · ✏ your story"` (clickable edit) |
| Requirement 5: edit mode | `"/chat edit mode for returning users"` | Superseded | Edit navigates to `/story/:id` (inline edit); `/chat` is create-only |
| Surfaces: point detail page | `"Out of scope"` | Superseded | In scope: viewer CTA + viewer story render on `/point/:id` |

---

## Requirements

### Group 1 — point-card-with-links.tsx

1. **Name at all counts:** When `profileOwner` is set, always render `"by [profileOwner.name]"` in the story count text, regardless of whether count is 0 or non-zero.

2. **Case D fix:** When `filteredStories.length > 0` AND viewer has a position AND viewer has 0 stories, render `"▷ N stories by Alice · Add your story →"` — expand button for the count + inline CTA. Do not suppress the CTA just because the owner has stories.

3. **Case E: "your story" as edit link:** When viewer has a story on another profile's point, render `"· ✏ your story"` as a separate clickable element navigating to `/story/${viewerStoryId}`. Requires new prop `viewerStoryId?: string` passed from profile-page-v2.tsx.

4. **Edit navigates to `/story/:id`:** On own profile, ✏ navigates to `/story/${filteredStories[0].id}`. On other profile (Case E), ✏ navigates to `/story/${viewerStoryId}`. Neither route to `/chat`.

5. **CTA copy:** All CTAs use "Add your story" (not "Add a story", not "Add a story for this point").

### Group 2 — point-detail-page.tsx

6. **Viewer story render:** On load, fetch viewer's own story for this point using `getStoryByUserAndPoint(userId, pointId)` (service method already exists). If found, render it as `StoryCardWithLinks` in the positions list, replacing the compact `PositionHolderCard` row.

7. **Viewer CTA:** If viewer has a position (`userPosition !== null`) and no story, render `"Add your story →"` inside their compact row, navigating to `/chat?from=position&pointId=:id`.

---

## What Stays the Same

- DB `UNIQUE(author_id, point_id)` constraint — unchanged
- 1 story per user per point rule — unchanged
- No "✓ Agree ·" prefix on any surface — unchanged
- Share/open icon placement — unchanged
- Edit/delete only on own profile (not on other profiles) — unchanged
- Feed view (no `profileOwner`) — unchanged, no "by name" suffix there
- `/live` session mode suppression — unchanged
- Stories tab (StoryCardWithLinks, QuotedPointCard) — unchanged
- `/chat` create flow internals — unchanged; only the post-creation edit routing changes

---

## Surfaces in Scope

**In scope:**
- `src/app/components/social/point-card-with-links.tsx` — attribution and CTA logic (Groups 1, 2, 3, 4, 5)
- `src/app/pages/profile-page-v2.tsx` — pass `viewerStoryId` prop to `PointCardWithLinks` (Group 1, Req 3)
- `src/app/pages/point-detail-page.tsx` — viewer story fetch + CTA (Group 2, Req 6–7)

**Out of scope:**
- `/chat` story creation internals
- `story-detail-page.tsx` (edit mode already works there)
- Stories tab components (`story-card-with-links.tsx`, `QuotedPointCard`)
- Feed page
- `/live` session
- Any surface not listed above

---

## Acceptance Criteria

### Group 1: Points tab attribution

- [ ] Own profile, story exists: footer shows `"▷ N stories by [own name]"` — name present
- [ ] Own profile, no story: footer shows `"▷ 0 stories by [own name] · Add your story →"`
- [ ] Own profile: ✏ navigates to `/story/:id`, not `/chat`
- [ ] Other profile, Alice has stories, viewer has position + 0 stories: shows `"▷ N stories by Alice · Add your story →"` — both count and CTA visible
- [ ] Other profile, Alice has stories, viewer has story: shows `"▷ N by Alice · ✏ your story"` as clickable edit link → `/story/:id`
- [ ] Other profile, Alice has 0 stories, viewer has position: shows `"▷ 0 stories by Alice · Add your story →"` — name present at zero count
- [ ] Feed view (no profileOwner): unchanged — no "by name" suffix, no regression
- [ ] `/live` mode: unchanged — CTA still suppressed

### Group 2: Point detail page

- [ ] Viewer has position + no story: "Add your story →" appears in viewer's position row → navigates to `/chat?from=position&pointId=:id`
- [ ] Viewer has a story: story renders as `StoryCardWithLinks` in positions list, same as other holders' stories
- [ ] Viewer with no position: compact row unchanged (no CTA shown)
- [ ] Other position holders' rendering unchanged

### Regression

- [ ] All P465 UAT scenarios still pass (run `/verify p465` after implementation)
- [ ] No "by [name]" appears in feed view (no profileOwner → no name)
- [ ] Delete dialog still works on own profile
- [ ] Stories tab (QuotedPointCard) unchanged

---

## Next Steps

Run `/dev features/p468_point_card_attribution_consistency.md` directly — scope is targeted (3 files, well-defined logic changes), no new architecture needed. Service method `getStoryByUserAndPoint` already exists for Group 2.
