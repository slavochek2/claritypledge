---
status: in-progress
type: change-request
rank: 250010.75
changes: p411
tags:
  - redesign
  - p411
  - p103
created_date: 2026-03-17
delivery_stage: uat
uat_file: features/uat/p542.md
test_files:
  - e2e/p542-story-collapse.spec.ts
  - e2e/a11y/p542-accessibility.spec.ts
  - e2e/p542-smoke.spec.ts
---

# P542: Collapse stories behind chevron on point page position list

> **Redesign of:** [P411: Position Breakdown: Linked Stories](features/done/20_feb_26/p411_position-breakdown-linked-stories.md)
> **Also affects:** [P103: Point Quote Pattern](features/done/5_feb_26/p103_point_quote_pattern.md)
> **What was wrong:** On the point detail page, position holders with linked stories render as a name+avatar row at the same visual level as other position entries, with the story card appearing directly below. This creates "double duty" — the name row is both a position list entry AND a story attribution header. In long position lists, the position badge (e.g., "Agrees+") becomes visually detached from the point it refers to. Users may interpret "Agrees+" as agreeing with the story below, not the point that scrolled off screen. Additionally, the forced `!w-5 !h-5` avatar sizing clips the blue pledger ring.

## Problem Statement

The point detail page needs to clearly communicate three things for each position holder:
1. **Who** holds a position (identity)
2. **What position** they hold on the point above (agree/disagree/unsure)
3. **Why** they hold it (their story, if one exists)

Currently, #1 and #3 are conflated — the same name row serves both the position list and story attribution. The story card appears inline, making the position list harder to scan and breaking the visual connection between the position badge and the point it refers to.

P411's original problem statement ("position breakdown shows each position holder as a compact row... missing linked story display") is still valid — stories should be accessible. But the *mechanism* of always-visible inline story cards creates new UX confusion that P411 didn't anticipate.

## Jobs To Be Done

- **Preserved from P411:** Let visitors see the reasoning (stories) behind each person's stance on a point
- **Preserved from P411:** Show ear count on compact rows
- **Corrected:** Story display should not disrupt the scannability of the position list
- **Corrected:** Position badges must remain visually anchored to the point, not the story
- **New:** Clear visual hierarchy connecting story back to the position it explains

## Current State

P411 shipped two variants: compact row (no story) and story card (with story). The story card variant uses P103's "quote pattern" — name+avatar+position badge outside a quoted story box.

**Before (current):**
```
┌─ Point Card ──────────────────────────────┐
│ ✦ "Cognitive understanding matters..."    │
│   ✕ Disagree  ? Unsure  ✓ Agree (3)      │
└───────────────────────────────────────────┘

  Filter: Agree (3)  Disagree (0)  Unsure (0)

  (●) Jan Barbarič     ♀0  [Agrees+]          ← compact row (no story)
  (●) Victoria I.      ♀4  [Agrees]           ← compact row (no story)
  (●) Vyacheslav L.    ♀0  [Agrees+]          ← SAME visual level as above
  ┌──────────────────────────────────┐
  │ Fractional Chief... · 8d ago     │         ← story card, visually
  │ "Asking someone to paraphrase…"  │            disconnected from name
  └──────────────────────────────────┘
```

Problems visible:
1. Vyacheslav's row looks like another compact entry — story below feels orphaned
2. "Agrees+" next to Vyacheslav reads ambiguously after scrolling past the point
3. Blue avatar ring clipped by `!w-5 !h-5` forced sizing
4. No visual element connects the story back to the position

## Root Cause

**Visual hierarchy failure:** P411's Variant A renders `StoryCardWithLinks` with `context="point-detail"` and `profileSubjectPosition` which triggers the "quote pattern" from P103 — placing name+position OUTSIDE the story box. This works on profile pages (single author, no ambiguity) but fails on the point page where the name row competes with other position list entries at the same visual level.

**Avatar clipping:** `GravatarAvatar` with `className="!w-5 !h-5 !text-[10px]"` forces 20px dimensions, but the pledger ring (`ring-2 ring-offset-2`) needs ~4px extra space on each side, causing overflow clipping.

Code references:
- Quote pattern trigger: `src/app/components/social/story-card-with-links.tsx:150-217`
- Position list rendering: `src/app/pages/point-detail-page.tsx` (conditional: storyByAuthorId.has → StoryCardWithLinks vs PositionHolderCard)
- Forced avatar sizing: `story-card-with-links.tsx:161`, `point-detail-page.tsx:631`

## Redesign

**Principle:** Position list stays clean and scannable. Stories are accessible but don't disrupt the list. A vertical connecting line (same pattern as profile stories tab) anchors the story to its position entry.

**After (redesign):**

### Collapsed (default):
```
  (●) Jan Barbarič     ♀0  [Agrees+]
  (●) Victoria I.      ♀4  [Agrees]
  (●) Vyacheslav L.    ♀0  [Agrees+]  ▸ story
```
All entries at same visual level. Chevron + "story" indicator on rows that have a linked story.

### Expanded:
```
  (●) Jan Barbarič     ♀0  [Agrees+]
  (●) Victoria I.      ♀4  [Agrees]
  (●) Vyacheslav L.    ♀0  [Agrees+]  ▾ story
  │
  │  ┌──────────────────────────────────┐
  └──│ (●) Vyacheslav L.               │  ← author header (repeated)
     │ Fractional Chief... · 8d ago     │
     │                                  │
     │ "Asking someone to paraphrase…"  │
     └──────────────────────────────────┘
```

### Key design decisions:
- **Collapsed by default** — position list stays scannable. Stories are for deeper engagement, not first scan.
- **Accordion behavior** — only one story expanded at a time. Expanding a second collapses the first. Prevents clutter from returning with many story-holders.
- **Chevron + "story" text** on position row — minimal indicator, not a full card
- **Vertical connecting line** when expanded — uses `ThreadLine` shared component from `src/app/components/shared/ThreadLine.tsx` (already used in stories tab for linked points)
- **Avatar + name repeated** in expanded story card header — story is standalone authored content, needs its own attribution
- **Position badge stays on position row only** — not repeated in story card (the connecting line establishes the relationship)
- **Avatar sizing fix** — add `showRing?: boolean` prop to `GravatarAvatar` (defaults to `isPledger`). Compact rows pass `showRing={false}` to suppress the ring at `!w-5` size. Expanded card header uses default `size="sm"` with ring visible.
- **Expanded card includes** — "understood" count, visibility badge, share button, tag pills (all existing StoryCardWithLinks elements, not just text)
- **Truncation** — pass `compact={true}` to `StoryCardWithLinks` in expanded card (150-char truncation, existing behavior)
- **PositionHolderCard extension** — add props: `hasStory: boolean`, `isExpanded: boolean`, `onToggle: () => void`. Chevron is rendered INSIDE the card with `stopPropagation` on its click handler. Row-level `onClick` still navigates to profile. This avoids ambiguity about DOM structure.

### Viewer's own row:
- **Viewer with story:** same as others — chevron + "story" on position row, expands to show own story card
- **Viewer with position but no story:** "Add your story" CTA on the position row (right side, where chevron would be). No chevron — CTA replaces it.
- **Viewer with no position:** position-taking UI unchanged (out of scope)

### Implementation note — viewer story data source:
The viewer's story comes from `viewerStory` state (fetched via `getStoryByUserAndPoint`), NOT from `storyByAuthorId`. The current code checks `isViewer && viewerStory` FIRST, then `storyByAuthorId` for other holders. This priority ordering must be preserved: viewer's row uses `viewerStory` data for the chevron/expanded card, other holders' rows use `storyByAuthorId`.

### Embed mode:
- Existing `ResizeObserver` on the embed wrapper element automatically detects height changes from expand/collapse — no additional `postMessage` calls needed. The observer already fires `window.parent.postMessage({ type: 'claritypledge-embed-resize', height })` when content height changes.

### Context distinction (why profiles don't need this):
On profile pages, all stories belong to the profile holder — no attribution ambiguity. The stories tab's "N points by Name" section works because the story is the parent and points are children. On the point page, the direction is reversed: the point is the parent, positions are children, and stories are evidence — requiring different visual treatment.

## Predecessor Sections Superseded

| Section | P411 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| UX Variant A layout | "The holder's identity is shown above a quoted story box, not inside it. [...] Quoted story box below the identity row" | Superseded | Collapsed row with chevron; expanded region with connecting line |
| UX step 3-4 | "If a holder has a linked story, the visitor can tap the quoted story box to navigate to the full story detail page" | Superseded | Visitor must expand chevron first, then tap story card |
| Implementation rendering | `storyByAuthorId.has(holder.userId)? YES -> <StoryCardWithLinks context="point-detail" ...>` | Superseded | Conditional shows chevron on position row; expanded state renders story card in sub-region |
| Build step 6 | "Replace PositionHolderCard call with conditional (story card vs compact row)" | Superseded | All holders render as position rows; story holders get chevron + expandable region |

| Section | P103 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| T5 (point-detail context) | "Render {name} {verb}: label OUTSIDE quoted box" as flat inline display | Superseded (point-detail only) | Collapsed/expanded pattern with connecting line. Profile pages still use T5's flat pattern |
| AC #4 | "PointDetail page: Stories show quote pattern with position label" | Superseded | Stories show behind expand chevron with connecting line |

**Preserved from P103:** Profile Points tab layout (T2), Stories tab QuotedPoint layout (T3), position verb helper (T1), share/open actions (T6).

## Requirements

1. All position holders render as uniform rows in the position list (compact format)
2. Rows with a linked story show a chevron + "story" indicator on the right
3. Clicking the chevron expands a region below the row showing the story card
4. Expanded region has a vertical connecting line from position row to story card
5. Story card header shows avatar + author name (story attribution)
6. Story card body shows role, date, story text (with truncation/show-more)
7. Clicking the story card navigates to story detail page
8. Clicking chevron again collapses the region
9. Avatar sizing accommodates pledger ring without clipping
10. Compact rows (no story) are unchanged from P411

## What Stays the Same

- **Data layer:** `getStoriesForPoints`, `storyByAuthorId` memo, `getPositionsForPoint` query with ear count — all unchanged
- **Compact row variant (no story):** avatar + name + EarBadge + PositionBadge — unchanged
- **Profile pages:** Points tab and Stories tab layouts — completely untouched
- **Feed/home page:** Story cards in feed — unchanged
- **Story detail page:** No changes
- **Edge cases from P411:** multiple stories (show most recent), private story exclusion, fetch failure fallback — all preserved
- **Position filter tabs:** Agree/Disagree/Unsure filtering — unchanged

## Surfaces in Scope

**In scope:**
- `src/app/pages/point-detail-page.tsx` — conditional rendering, new expand/collapse state
- `src/app/components/social/story-card-with-links.tsx` — modify or replace quote pattern for `context="point-detail"`
- Possibly extract a new `ExpandableStoryRegion` component for the connecting line + expand logic

**Out of scope:**
- `src/app/pages/profile-page-v2.tsx` — profile stories tab unchanged
- `src/app/data/points-service-real.ts` — data layer unchanged
- Feed components — unchanged
- Story detail page — unchanged

## Acceptance Criteria

- [x] Position list shows all holders as uniform compact rows (avatar + name + EarBadge + PositionBadge)
- [x] Rows with a linked story show a chevron and "story" text indicator
- [x] Chevron is keyboard-operable (Enter/Space toggles, `aria-expanded` attribute)
- [x] Clicking chevron expands story card below with `ThreadLine` vertical connecting line
- [x] **Accordion:** expanding one story collapses any previously expanded story
- [x] Expanded story card has avatar + author name header (regular size, with pledger ring if applicable)
- [x] Expanded story card shows role, date, story text (150-char truncation with "show more"), "understood" count, visibility badge, share button
- [x] Clicking story card navigates to story detail
- [x] Clicking chevron again collapses the region
- [x] **Viewer with story:** chevron + "story" expands own story card (same as other holders)
- [x] **Viewer without story (but with position):** "Add your story" CTA on position row where chevron would be
- [x] Avatar pledger ring: suppressed at compact row size (`!w-5`), visible at expanded card header size
- [x] Compact rows (no story) are visually identical to current P411 behavior
- [x] Profile pages (Points tab, Stories tab) are visually unchanged
- [x] All existing P411 tests pass (data layer, compact row, filter tabs)
- [x] Mobile (360px): expand/collapse works, story card doesn't overflow
- [x] Embed mode: expand/collapse triggers iframe resize via existing `postMessage` mechanism
- [x] Tab order: chevron → expanded story card (if open) → next row

## Raw Material from Conversation

ASCII mockups and analysis from the /screenshot-debug conversation that led to this spec:

### Problem identification (from point page screenshot):
- Name row at same level as other position entries — story card visually orphaned
- "Agrees+" ambiguous when point scrolls off screen in long lists
- Blue pledger ring clipped on avatar

### Inspiration (from stories tab screenshot):
- Vertical connecting lines in profile stories tab `QuotedPointCard` — links points back to story
- Same visual language can be reused in reverse direction on point page

### Design evolution in conversation:
- Option A (indent group) → rejected, still confuses position list
- Option B (collapse + chevron) → selected core interaction
- Option C (card-wrap as one unit) → partially incorporated (story card is contained, but behind collapse)
- Added: connecting line from stories tab pattern
- Added: avatar+name repeated in story card (story needs author attribution)

## UX

### Component Analysis

| Element | Status | Notes |
|---------|--------|-------|
| `ThreadLineGroup` / `ThreadLineItem` | **Reuse** | `src/app/components/shared/ThreadLine.tsx` — provides vertical spine + horizontal branch. Already used in stories tab. |
| `PositionHolderCard` | **Extend** | Local to `point-detail-page.tsx` (line 601). Add chevron + "story" indicator, expand/collapse state, "Add your story" CTA variant. |
| `StoryCardWithLinks` | **Extend** | `src/app/components/social/story-card-with-links.tsx`. Current `context="point-detail"` triggers quote pattern (name outside box). Needs a new context or prop for collapsed-card mode: avatar+name INSIDE the card, no position badge, compact=true. |
| `GravatarAvatar` | **Reuse** | `src/components/ui/gravatar-avatar.tsx`. Two sizes: compact row (`!w-5 !h-5`, ring suppressed) and expanded card header (default `sm`, ring visible). |
| `EarBadge` | **Reuse** | `src/components/ui/ear-badge.tsx`. Appears on compact row (existing) and in expanded card footer (`understoodCount`). |
| `PositionBadge` | **Reuse** | `src/app/components/shared/PositionBadge.tsx`. Stays on compact row only — not repeated in expanded card. |
| `VisibilityBadge` | **Reuse** | Already in `story-card-with-links.tsx`. Shows in expanded card metadata row. |
| `ShareButton` | **Reuse** | Already in `story-card-with-links.tsx`. Shows in expanded card footer. |
| **New: `ExpandableStoryRegion`** | **New** | Wraps ThreadLine + expanded story card. Manages expand/collapse animation, accordion state callback, iframe resize postMessage. |

---

### 1. User Flows

#### Flow A: Visitor browsing point page (not logged in)

1. Visitor lands on point detail page
2. Sees point card at top, position filter tabs below
3. All position holders shown as compact rows (avatar + name + EarBadge + PositionBadge)
4. Rows with linked stories show `▸ story` chevron on the right
5. Visitor clicks/taps chevron → row chevron rotates to `▾`, story card expands below with ThreadLine
6. Visitor reads story text (150-char truncation, "...more" to expand inline)
7. Visitor clicks story card → navigates to story detail page
8. Visitor clicks chevron again → story collapses
9. Visitor clicks a different chevron → previous story collapses, new one expands (accordion)

#### Flow B: Logged-in user with position + story

1. User sees own row in position list, same format as others: compact row + `▸ story` chevron
2. Clicking chevron expands own story card (identical treatment to any other holder)
3. User can click story card to navigate to own story detail page

#### Flow C: Logged-in user with position, no story

1. User sees own row in position list
2. Instead of chevron, row shows "Add your story →" CTA link on the right
3. Clicking CTA navigates to `/create?pointId={id}`
4. Clicking the rest of the row navigates to own profile (same as other compact rows)

#### Flow D: Logged-in user with no position

1. User sees position-taking UI (unchanged, out of scope)
2. Position list renders normally for other holders
3. No special row for this user

---

### 2. Screen Designs

#### 2a. All collapsed (default state)

```
┌─ Point Card ──────────────────────────────────┐
│ ✦ "Cognitive understanding matters..."        │
│   ✕ Disagree  ? Unsure  ✓ Agree (3)          │
└───────────────────────────────────────────────┘

  Filter: [Agree (3)]  Disagree (0)  Unsure (0)

┌───────────────────────────────────────────────┐
│ (●) Jan Barbarič      ♀0  [Agrees+]          │  ← compact, no story
├───────────────────────────────────────────────┤
│ (●) Victoria I.       ♀4  [Agrees]           │  ← compact, no story
├───────────────────────────────────────────────┤
│ (●) Vyacheslav L.     ♀0  [Agrees+]  ▸ story │  ← has story, collapsed
└───────────────────────────────────────────────┘
```

- All rows at identical visual weight and height
- `▸` = collapsed chevron (ChevronRight icon, 16px)
- "story" text label in muted gray, 12px, next to chevron
- Rows without stories: no chevron area, full width for name+badges

#### 2b. One story expanded (with ThreadLine)

```
┌───────────────────────────────────────────────┐
│ (●) Jan Barbarič      ♀0  [Agrees+]          │
├───────────────────────────────────────────────┤
│ (●) Victoria I.       ♀4  [Agrees]           │
├───────────────────────────────────────────────┤
│ (●) Vyacheslav L.     ♀0  [Agrees+]  ▾ story │  ← expanded
└───────────────────────────────────────────────┘
  │
  │  ┌──────────────────────────────────────────┐
  └──│ (●) Vyacheslav L.                       │  ← author header
     │ Fractional Chief of Staff · 8d ago  🔒   │  ← role · date · visibility
     │                                          │
     │ "Asking someone to paraphrase what you   │  ← story text (150 chars)
     │  just said is one of the most..."  ...more│
     │                                          │
     │  💬 writing  🧠 relationships             │  ← tag pills
     │                                          │
     │  3 understood          [↗ Share]         │  ← footer: count + share
     └──────────────────────────────────────────┘
```

- `▾` = expanded chevron (ChevronDown icon, 16px)
- ThreadLine: `ThreadLineGroup` wraps the expanded region; single `ThreadLineItem` with `isLast={true}`
- Vertical spine starts at left edge of position row (aligned with avatar column)
- Horizontal branch connects to story card top-left
- Story card has `border-l-4 border-l-blue-500` (matches existing StoryCardWithLinks style)

#### 2c. Expanded story card detail (all elements)

```
┌──────────────────────────────────────────────┐
│  (●) Vyacheslav L.                           │  Author header:
│       ↑ avatar (sm size, pledger ring         │    - GravatarAvatar size="sm" (32px)
│         visible at this size)                 │    - isPledger ring visible (not suppressed)
│                                               │
│  Fractional Chief of Staff · 8d ago  🔒       │  Metadata row:
│                                               │    - role (or "Member" fallback)
│                                               │    - formatTimeAgo(createdAt)
│  "Asking someone to paraphrase what you       │    - VisibilityBadge (🔒/🌐)
│   just said is one of the most powerful       │
│   tools for cognitive understanding.          │  Story text:
│   It shows respect..."  ...more               │    - 150-char truncation (compact mode)
│                                               │    - "...more" expands text inline
│  💬 writing  🧠 relationships                  │    - Full text on story detail page
│                                               │
│  3 understood                    [↗ Share]    │  Tag pills:
└──────────────────────────────────────────────┘    - Existing tag rendering from StoryCardWithLinks

                                                  Footer:
                                                    - "N understood" (MobileTooltip)
                                                    - ShareButton (hidden in embed mode)

                                                  Click target:
                                                    - Entire card navigates to /story/{id}
                                                    - "...more" and Share are stopPropagation
```

#### 2d. Viewer's "Add your story" CTA variant

```
┌───────────────────────────────────────────────┐
│ (●) Jan Barbarič      ♀0  [Agrees+]          │
├───────────────────────────────────────────────┤
│ (●) You               ♀2  [Agrees]           │
│                            Add your story →   │  ← CTA replaces chevron
├───────────────────────────────────────────────┤
│ (●) Vyacheslav L.     ♀0  [Agrees+]  ▸ story │
└───────────────────────────────────────────────┘
```

- "Add your story →" is a link (`text-blue-600`, `text-xs`, `hover:underline`)
- Positioned at `ml-auto` on the right side of the row (same slot as chevron)
- Click navigates to `/create?pointId={id}` (stopPropagation — row click still goes to profile)
- No chevron shown — CTA and chevron are mutually exclusive

---

### 3. Edge Cases

#### 3a. 0 position holders (empty state)

```
  No one has taken a position yet
```

Existing empty state text, centered, muted. No change from current behavior.

#### 3b. 1 holder with story, 0 without

Single row with chevron. Expanding works normally — no accordion complexity (only one expandable item).

#### 3c. All holders have stories

Every row shows `▸ story` chevron. Accordion rule applies: expanding any row collapses the previously expanded one. Position list stays scannable since all are collapsed by default.

#### 3d. Story fetch fails (P411 edge case preserved)

If `getStoriesForPoints` fails or returns empty, `storyByAuthorId` map is empty. All rows render as compact (no chevron) — graceful degradation identical to current P411 fallback. No error UI shown to user.

#### 3e. Very long story text

- Expanded card uses 150-char truncation with "...more" link
- "...more" expands text inline within the card (existing `textExpanded` state in StoryCardWithLinks)
- If text is extremely long (1000+ chars), expanded inline text grows the card — ThreadLine adjusts automatically (CSS stretches with content)
- Full story always available on story detail page

#### 3f. Story with no tags

Tag pills row simply doesn't render. Footer row (understood count + share) shifts up. No empty state needed for tags.

#### 3g. Point with many holders (10+) — scroll behavior

- Position list renders all rows in the filtered tab (existing behavior, no pagination)
- Expanding a story pushes subsequent rows down — browser scroll position preserved
- Accordion ensures only one expanded card at a time, limiting vertical growth
- If the expanded card pushes the row below the fold, no auto-scroll — user scrolls naturally
- On collapse, rows shift up — again, no auto-scroll

#### 3h. Multiple stories by same author (P411 edge case)

Only the most recent story is shown (existing `storyByAuthorId` logic picks latest). Chevron expands that single story. No multi-story carousel.

#### 3i. Private story exclusion

Stories with visibility restrictions that the viewer cannot see are excluded from `storyByAuthorId`. Row renders as compact (no chevron) even if the author has a private story. Consistent with P411.

---

### 4. Accessibility

#### 4a. Keyboard interaction

| Key | Context | Action |
|-----|---------|--------|
| `Tab` | Position list | Moves focus to next row (compact rows are focusable via `tabIndex={0}`) |
| `Tab` | Row with chevron | Focus lands on the row; chevron is part of the row's click target |
| `Enter` / `Space` | Focused row with chevron | Toggles expand/collapse |
| `Enter` / `Space` | Focused compact row (no story) | Navigates to profile |
| `Tab` | Expanded story card | Focus moves into story card (card is focusable) |
| `Enter` / `Space` | Focused story card | Navigates to story detail page |
| `Tab` | "...more" link | Focus moves to truncation toggle |
| `Tab` | Share button | Focus moves to share button |
| `Escape` | Expanded story | Collapses the expanded story, returns focus to the chevron row |

#### 4b. Tab order (expanded state)

```
[Row 1: Jan]  →  [Row 2: Victoria]  →  [Row 3: Vyacheslav ▾]
                                              ↓
                                        [Story card]  →  [...more]  →  [Share]
                                              ↓
                                        [Row 4: next holder...]
```

When collapsed, story card and its children are removed from tab order (`display: none` or conditional render, not `visibility: hidden`).

#### 4c. ARIA attributes

**Chevron toggle (on the row):**
```
aria-expanded="false"          → collapsed
aria-expanded="true"           → expanded
aria-controls="story-{holderId}" → points to expanded region ID
aria-label="Expand story by {name}" / "Collapse story by {name}"
```

**Expanded story region:**
```
id="story-{holderId}"
role="region"
aria-label="{name}'s story"
```

**Accordion container (position group):**
No special ARIA role needed — accordion is implicit via `aria-expanded` on individual toggles. WAI-ARIA Accordion pattern not required since each toggle is semantically independent.

#### 4d. Screen reader announcements

- Expanding: screen reader announces the `aria-expanded="true"` state change. The story region content becomes discoverable.
- Collapsing: screen reader announces `aria-expanded="false"`. Story content removed from DOM.
- No `aria-live` region needed — the toggle is user-initiated and `aria-expanded` change is sufficient for AT to announce.

#### 4e. Focus management

- **On expand:** Focus stays on the chevron row (do NOT auto-move focus into the story card). User tabs forward to reach the card. This follows WAI disclosure pattern — expanding reveals content but doesn't steal focus.
- **On collapse:** Focus stays on the chevron row (the toggle that was clicked). If focus was inside the story card when Escape is pressed, focus returns to the chevron row.
- **On accordion (auto-collapse of another row):** Focus stays on the newly clicked chevron row. The previously expanded card's content is removed silently — no focus disruption since focus is already on the new row.

---

### 5. Responsive Design

#### 5a. Mobile (360px)

```
┌─────────────────────────────────┐
│ (●) Vyacheslav L.  ♀0          │
│     [Agrees+]         ▸ story  │  ← badges wrap to second line if needed
└─────────────────────────────────┘
  │
  │ ┌───────────────────────────┐
  └─│ (●) Vyacheslav L.        │
    │ Fractional Chief... · 8d  │
    │                           │
    │ "Asking someone to        │
    │  paraphrase what you..."  │
    │  ...more                  │
    │                           │
    │ 💬 writing  🧠 rels        │
    │                           │
    │ 3 understood    [↗]       │
    └───────────────────────────┘
```

**Key mobile considerations:**

- **Chevron touch target:** Entire right portion of the row (chevron + "story" label) is the toggle target. Minimum 44px height (row is already `p-3` = 48px min with content). Touch target width: chevron area is at least 48px wide (chevron icon 16px + "story" text + padding).
- **Row layout:** `flex-wrap` allowed — if name + EarBadge + PositionBadge + chevron don't fit on one line at 360px, PositionBadge and chevron wrap to a second line within the row. Name and EarBadge stay on first line.
- **Story card width:** Full width minus ThreadLine indent (`pl-4` from ThreadLineItem = 16px + `pl-1` = 4px + `ml-2` from ThreadLineGroup = 8px → 28px total indent). Card fills remaining width.
- **ThreadLine connecting line:** Same visual as desktop — `w-0.5 bg-gray-200` vertical spine, `w-3 h-0.5` horizontal branch. Proportionally correct at mobile widths.
- **Story text:** `break-words` already set on story text. Long words break correctly at narrow widths.
- **Tag pills:** Wrap naturally with `flex-wrap` (existing behavior).
- **Share button:** Icon-only variant at mobile widths if ShareButton supports it (existing responsive behavior).

#### 5b. Desktop (768px+)

- All elements fit on a single row line: avatar + name + EarBadge + PositionBadge + chevron/"story"
- Expanded story card has comfortable reading width
- No layout changes from the ASCII mockups above

#### 5c. Embed mode

- Same layout as the host viewport width
- Existing `ResizeObserver` on embed wrapper automatically detects height changes from expand/collapse — no manual `postMessage` needed
- Uses `type: 'claritypledge-embed-resize'` (existing mechanism)
- No special timing needed — ResizeObserver fires on DOM layout change

---

### 6. Interaction Details

#### 6a. Expand/collapse animation

- **Expand:** `max-height: 0` → `max-height: auto` with `overflow: hidden` during transition. Use CSS transition `max-height 200ms ease-out` or Tailwind's `animate-accordion-down` if available.
- **Collapse:** Reverse animation, `200ms ease-in`.
- **Chevron rotation:** `rotate-0` (collapsed) → `rotate-90` (expanded), `transition-transform 200ms`.
- Keep animations subtle — content shift is the primary signal, not the animation itself.

#### 6b. Accordion state management

- Parent component (position list renderer in `point-detail-page.tsx`) holds `expandedHolderId: string | null` state.
- Each row with a story receives `isExpanded` and `onToggle` props.
- `onToggle(holderId)` → if `expandedHolderId === holderId`, set to `null` (collapse). Otherwise, set to `holderId` (expand new, implicitly collapsing old).
- Accordion scope: per-position-group (within one "Agree"/"Disagree" tab). Switching filter tabs resets `expandedHolderId` to `null`.

#### 6c. Click target disambiguation

| Area clicked | Action |
|---|---|
| Row (excluding chevron area) | Navigate to holder's profile |
| Chevron + "story" label area | Toggle expand/collapse |
| Expanded story card body | Navigate to story detail page |
| "...more" in story text | Expand text inline (stopPropagation) |
| Share button in story card | Open share dialog (stopPropagation) |
| "Add your story →" CTA | Navigate to `/create?pointId={id}` (stopPropagation) |

This requires splitting the current `PositionHolderCard` click handler: the row-level `onClick` goes to profile, but the chevron area has its own `onClick` with `stopPropagation` to prevent profile navigation.

---

## Test Coverage Strategy

### Why no unit tests
No new pure logic was introduced. Accordion state is React `useState` (expand/collapse of `expandedHolderId`), not a utility function. The data layer (`getStoriesForPoints`, `storyByAuthorId`) is unchanged. Testing React state in isolation would duplicate what E2E already covers.

### Why no integration tests
No DB schema changes, no new API endpoints, no new RPC calls. The data fetching layer is identical to P411. All integration coverage from P411's existing tests carries forward.

### E2E tests (primary coverage)
**File:** `e2e/p542-story-collapse.spec.ts` (12 tests)

Covers: collapsed default state, chevron presence/absence, expand/collapse interaction, story card content verification, story card navigation, accordion (one-at-a-time), viewer with story, viewer "Add your story" CTA, filter tab state reset, profile page regression.

### Accessibility tests
**File:** `e2e/a11y/p542-accessibility.spec.ts` (10 tests)

Covers: `aria-expanded` toggle, Enter/Space keyboard activation, `aria-controls` + `role="region"`, focus management (no focus steal on expand), tab order through expanded card, Escape key collapse + focus return, compact row keyboard navigation (regression), filter tab keyboard access.

### Smoke tests
**File:** `e2e/p542-smoke.spec.ts` (5 tests)

Covers: page loads without console errors, filter tabs render, holders visible as compact rows, chevron visible on story rows, no chevron on non-story rows.

### UAT scenarios
**File:** `features/uat/p542.md` (13 scenarios)

Covers all acceptance criteria plus: mobile 360px layout, embed iframe resize, avatar ring clipping, profile regression, filter tab + expand state interaction, graceful degradation on fetch failure.

### P411 test retention
All existing P411 tests (`e2e/p411-position-breakdown-stories.spec.ts`, `e2e/p411-smoke.spec.ts`, `e2e/a11y/p411-accessibility.spec.ts`) remain. Some P411 E2E assertions will need updating during `/dev` since story text is no longer visible by default (it requires expand). The data setup and cleanup patterns are identical.
