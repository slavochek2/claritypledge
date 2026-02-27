---
status: blocked
type: story
rank: 2
flow: create-prd → generate-tests → decompose → dev → verify
tags:
  - story-cta
  - position
  - consistency
  - ux
  - footer
  - p451-followup
prepped_date: '2026-02-27'
delivery_stage: 5-decompose-review
reviews:
  ux: null
  architect: null
uat_file: features/uat/p456.md
test_files:
  - src/tests/getPositionCTACopy.test.ts
  - e2e/p456-story-cta-footer.spec.ts
  - e2e/a11y/p456-accessibility.spec.ts
  - e2e/p456-smoke.spec.ts
created_date: 2026-02-27T00:00:00.000Z
locked_at: '2026-02-27T16:33:53.945Z'
---

# P456: Story CTA footer — consistency across all surfaces

## Problem Statement

**Current state:** After P451 shipped, "Tell your story →" CTA appears on all 6 position-taking surfaces. But it sits as a sibling element *below* the point card — visually disconnected from the point it belongs to.

**Pain points:**
- CTA reads as a page-level action, not "I want to respond to this specific point" — it floats below with no visual anchor
- Copy "Tell your story →" gives no context: no hint of what position was taken, no connection to the point above
- On QuotedPoint surfaces (Stories tab), the linked-stories toggle also hangs below the card — two orphaned elements stacked below the quoted box
- CTA shows even when the viewer already has a story linked to this point — "Tell your story" is factually wrong at that point
- /live silently omits the CTA with no hint — users have no idea story entry exists or when it becomes available
- The viewer's own position is only visible via the button highlight state — nowhere is it stated explicitly ("you agreed") except the /chat context card, which uses a one-off implementation inconsistent with the rest

**Who's affected:** Every logged-in user who has taken a position on a point — across profiles, Stories tab, point detail pages, and /live sessions.

---

## Intention (Why This Matters)

**Strategic importance:** The position → story pipeline is the core engagement loop of Clarity Pledge. P451 got the CTA onto all surfaces. This spec makes that CTA feel intentional: clearly belonging to the point above it, honest about the user's state, and consistent everywhere so users can build a reliable mental model of how taking a position leads to telling a story.

**Why now:** P451 is freshly shipped and the pattern is live everywhere. The inconsistency is visible now that it's on all surfaces. Fixing it now prevents the pattern from calcifying across more surfaces (P428 /live filing depends on the CTA pattern being solid).

**Impact if not solved:** The CTA that's supposed to drive story creation feels like an afterthought — visually orphaned, contextually generic, and wrong when a story already exists. Users who took a position months ago and already have a story see "Tell your story →" every time, which erodes trust.

---

## Business Requirements

**Must-haves:**
- CTA is visually inside (or clearly attached to) the point card it belongs to — never a floating sibling element
- CTA copy reflects the viewer's actual position: "Why do you agree?" / "Why do you disagree?" / "Why are you unsure?"
- CTA is suppressed when the viewer already has a story linked to this point; a split footer shows stories count + "add story →" instead
- /live surface shows the CTA as a visible but disabled element with a one-line hint ("Available after the session"), not a silent absence
- Viewer's position label ("✓ Agree ·") appears in the footer, making the viewer's stance explicit without requiring them to read button highlight state

**Success conditions:**
- A user who staked a position understands immediately from the footer: (a) what position they took, (b) what to do next, (c) whether they've already done it
- No element hangs below a QuotedPoint card — stories toggle and CTA both live inside the card boundary
- /live users know story entry exists and when it opens

**Constraints:**
- Top-of-card position badge behavior is unchanged — it still shows the *subject's* position (profile owner / story author), not the viewer's
- /chat context card is unchanged — it's already correct (viewer's own position at top, no CTA)
- No new routes, no DB changes, no API changes
- /live story filing (P428) is a separate initiative — this spec only makes the /live disabled state transparent

---

## User Stories

**As a user who just took a position on a point card:**
- I want the follow-up prompt to appear inside the card boundary, so I understand it's responding to *this specific point*
- I want the prompt to name my position ("Why do you agree?"), so I don't have to re-read the buttons to remember what I chose

**As a user who already has a story linked to a point:**
- I want the CTA to reflect reality ("1 story · add another →" instead of "Tell your story →"), so I'm not misled into thinking I haven't responded yet

**As a user browsing someone else's profile:**
- I want my own position stated explicitly in the footer, so I can see at a glance what I think about each of their points without reading button states

**As a user in a /live session:**
- I want to see the story entry button even if it's disabled, so I know the option exists and when I can use it
- I want a one-line hint explaining timing, so I don't assume story creation is /live-only or impossible

**As a user reading a story that includes a quoted point:**
- I want the quoted point's footer (CTA + stories toggle) contained inside the quoted box, so the card is visually self-contained and nothing hangs below it

---

## Jobs to Be Done

**When I stake a position on a point:**
- I want to know immediately *why this prompt appeared* and *what it's asking me to respond to*, so I can decide quickly whether to write a story now or later (motivation: oriented action, not confusion)

**When I revisit a point I positioned on long ago:**
- I want to see whether I've already told my story, so I don't feel pressured to repeat something I've already done (motivation: trust in the system's memory)

**When I'm in a /live session and take a strong position:**
- I want to know story entry exists and will be available after the session, so I can make a mental note without losing focus on the /live round (motivation: deferred intent capture)

**When I browse another person's profile:**
- I want to see my own stance on each of their points without hunting through button states, so I can quickly understand where we agree and disagree (motivation: relationship mapping)

---

## Outcomes (Success Metrics)

**Engagement:**
- Increase in story creations from position-taking surfaces (measured via Mixpanel: events from `/chat?from=position` origin)
- Reduce "Tell your story" CTA impressions on points where user already has a story (eliminate false prompts)

**User comprehension:**
- Users navigating from the CTA to /chat should bounce back less (they understood what they were being asked to do)

**Consistency signal:**
- Zero surfaces with a floating sibling CTA below a point card after this ships
- Zero surfaces where /live silently omits the story entry concept

---

## Acceptance Criteria

**Visual placement:**
- [ ] On every surface (own profile/points tab, own profile/stories tab, other profile/points tab, other profile/stories tab, point detail page, /live), the CTA appears as a footer row inside the point card — not as a sibling element below it
- [ ] On QuotedPoint surfaces (Stories tab, linked points inside story cards), the linked-stories toggle also moves inside the card boundary — nothing hangs below the quoted box

**Copy:**
- [ ] CTA text reflects the viewer's position: "Why do you agree?", "Why do you disagree?", "Why are you unsure?" — not the generic "Tell your story →"
- [ ] Footer includes viewer's position label: "✓ Agree · Why do you agree? →"

**State: story already linked:**
- [ ] When the viewer has at least one story linked to a point, the CTA row changes to split footer: "▶ N stories" (left) + "+ add story →" (right)
- [ ] The split footer replaces the CTA — they do not coexist
- [ ] "N stories" count and "+ add story" behavior matches existing linked-stories functionality

**State: no position taken:**
- [ ] When viewer has no position, the footer row does not appear (same as today)

**/live surface:**
- [ ] The story entry footer is visible in /live but rendered as a disabled/greyed button
- [ ] A one-line hint appears below the disabled button: "Available after the session" (or equivalent)
- [ ] The disabled button is non-clickable (no navigation triggered)

**/chat context card:**
- [ ] No change — already correct

**Cross-surface consistency:**
- [ ] All 6 position-taking surfaces (point-card-with-links, PointCardDetail, StoryCardDetail QuotedPoint, story-card-with-links QuotedPoint, point-detail-page, profile-page-v2 QuotedPointCard) have identical footer structure
- [ ] Viewer's position badge at top of card is unchanged on all surfaces

---

## Surfaces Affected

| Surface | Component | CTA change | Stories toggle | /live disabled |
|---------|-----------|-----------|----------------|----------------|
| Own profile — Points tab | `point-card-with-links.tsx` | ✅ | inside card | n/a |
| Own profile — Stories tab (QuotedPoint) | `StoryCardDetail.tsx` | ✅ | inside card | n/a |
| Other profile — Points tab | `point-card-with-links.tsx` | ✅ | inside card | n/a |
| Other profile — Stories tab (QuotedPoint) | `StoryCardDetail.tsx` | ✅ | inside card | n/a |
| Point detail page | `point-detail-page.tsx` | ✅ | n/a | n/a |
| Linked point inside story (feed) | `story-card-with-links.tsx` | ✅ | inside card | n/a |
| /live session | `live-story-card-expanded.tsx` | disabled + hint | n/a | ✅ |
| /chat context card | `StoryGuideChat.tsx` | no change | n/a | n/a |

---

## Related

- **P451** (done): Added "Tell your story →" CTA to all surfaces — this spec improves placement, copy, and state handling
- **P428** (backlog): /live position → story filing mid-session — this spec only handles the disabled-state transparency, not the filing flow itself
- **P425** (done): AI story core loop — the destination `/chat?from=position` that the CTA navigates to

---

## Next Steps

1. Run `/generate-tests features/p456_story_cta_footer_consistency.md`
2. Run `/decompose features/p456_story_cta_footer_consistency.md`
3. Run `/dev` per sub-story
4. Run `/verify` after all sub-stories ship

---

## UX Requirements

### Validation against Acceptance Criteria

SYSTEM-3 satisfies all spec acceptance criteria with two additions noted below:

- Visual placement: footer row inside card boundary on all 8 surfaces. Satisfied.
- Copy with position label: "✓ Agree · Why do you agree? →" pattern. Satisfied.
- Suppressed CTA when story already linked: split footer. Satisfied.
- No footer when no position taken. Satisfied.
- /live disabled state with hint. Satisfied.

Two gaps identified during code review:

**Gap 1 — `StoryCardDetail.tsx` linked-stories toggle placement.**
In the current `QuotedPoint` sub-component inside `StoryCardDetail.tsx`, the linked-stories expand trigger renders as a sibling div below the quoted box (line 542-565). This must move inside the quoted box boundary as a footer row — consistent with how the CTA footer row works. The spec acceptance criteria covers this ("nothing hangs below the quoted box") but the design mockups only show the CTA footer; the stories toggle footer row needs its own mockup for this component.

**Gap 2 — P451 CTA is absent on profile-page-v2 today.**
Code inspection shows `profile-page-v2.tsx` has no `showStoryCTA` or `/chat?from=position` anywhere. The `QuotedPointCard` component (shown inside Stories tab) has position buttons but no CTA. This means the profile surface CTAs were not shipped by P451 — they need to be created from scratch in this spec, not just refactored.

---

### 1. User Flows

Each flow entry describes: trigger state → footer detection → render outcome → CTA navigation.

#### Surface A: Own profile — Points tab (point-card-with-links.tsx)

**Path 1 — Position just taken, no story yet:**
1. Viewer takes a position on a point card (Agree / Disagree / Unsure)
2. Component detects: `userPosition` is set, viewer's story count for this point = 0
3. Footer row renders inside the card with position label + adaptive CTA
4. Viewer taps "Why do you agree? →"
5. Navigates to `/chat?from=position&pointId={id}`

**Path 2 — Position already existed, story already linked:**
1. Viewer loads the Points tab; existing positions restore via `useEffect` sync
2. Component detects: `userPosition` is set, viewer's story count for this point >= 1
3. Split footer renders: "▶ N stories" (left) + "+ add story →" (right)
4. Viewer taps "▶ N stories": expands the existing linked-stories list (same as existing collapse trigger)
5. Viewer taps "+ add story →": navigates to `/chat?from=position&pointId={id}`

**Path 3 — No position taken:**
1. Viewer loads the page; no position for this point
2. Footer row does not render
3. Existing footer (stories count toggle, share icon, external link) remains unchanged

#### Surface B: Own profile — Stories tab (StoryCardDetail.tsx QuotedPoint)

**Path 1 — Position taken on the quoted point, no story yet:**
1. Viewer loads Stories tab; story card expands its linked points
2. `QuotedPoint` sub-component detects: `userPosition` is set for this point, story count = 0
3. Footer row renders inside the quoted box: position label + CTA
4. Viewer taps CTA → `/chat?from=position&pointId={id}`

**Path 2 — Position taken, story already linked:**
1. `QuotedPoint` detects: story count >= 1
2. Split footer renders inside the quoted box
3. "▶ N stories" expands the in-box stories list; "+ add story →" navigates to /chat

**Path 3 — No position taken on the quoted point:**
1. Footer row does not render inside the quoted box
2. The quoted box shows only its current content (position buttons, point text)

#### Surface C: Other profile — Points tab (point-card-with-links.tsx)

Identical flow to Surface A. The component is shared; `currentUserId` drives the viewer's footer state regardless of whose profile is being viewed.

#### Surface D: Other profile — Stories tab (StoryCardDetail.tsx QuotedPoint)

Identical flow to Surface B. Viewer's own position on the quoted point drives the footer, not the profile owner's position (which is already shown in the top badge).

#### Surface E: Point detail page (point-detail-page.tsx)

**Path 1 — No position taken yet:**
1. Viewer loads the point detail page
2. No footer row

**Path 2 — Position taken during this page visit (new):**
1. Viewer takes a position; `showStoryCTA` state is set to true
2. Footer row renders at the bottom of the card with position label + CTA
3. Viewer taps CTA → `/chat?from=position&pointId={id}`

**Path 3 — Position already existed on page load, no story:**
1. Page loads; viewer's existing position detected from `userPosition`
2. Footer row renders immediately (no need to wait for a new position action)

**Path 4 — Position exists, story already linked:**
1. Split footer renders
2. Same behavior as Surfaces A/B

#### Surface F: Linked point inside story feed (story-card-with-links.tsx QuotedPoint)

**Path 1 — Position taken, no story yet:**
1. Story card expands its linked points list
2. `QuotedPoint` sub-component detects viewer's position for this point
3. Footer row renders inside the quoted box

**Path 2 — Position taken, story already linked:**
1. Split footer renders inside the quoted box

**Path 3 — No position:**
1. No footer row

#### Surface G: /live session (live-story-card-expanded.tsx)

**Path 1 — Position taken during /live:**
1. Viewer takes a position on a point card inside the /live interface
2. Footer row renders immediately inside the card
3. CTA button is visually greyed/disabled; non-interactive
4. Hint text appears below: "Available after the session"
5. Viewer cannot tap the button (no navigation)

**Path 2 — Position taken, then session ends:**
Out of scope for this spec. After session ends, the same card is outside /live context and the CTA should become active — but this transition is handled by P428, not P456.

---

### 2. Screen Designs

All widths assume mobile-first (320–375px card width). The left-border design (4px colored border) is preserved from existing cards.

#### Standard footer row — position taken, no story yet

```
┌────────────────────────────────────────────────┐  ← card border (slate-400 for points)
│ [Avatar] Jordan Taylor [Ear] Agrees            │  ← subject's position badge (unchanged)
│                                                │
│  [Pin icon]  Point text content here...        │
│              ...continues                      │
│                                                │
│              [Agree]  [Disagree]  [Unsure]     │  ← position buttons row
├────────────────────────────────────────────────┤  ← separator (border-t border-gray-100)
│  ✓ Agree  ·  Why do you agree? →              │  ← viewer's footer row
└────────────────────────────────────────────────┘

Mobile detail (footer row):
- Left-pad: aligns with content column (pl-[52px] to clear pin icon + gap, or pl-4 inside quoted box)
- Position symbol + label: text-sm text-gray-600 (subdued, not primary action emphasis)
- Separator dot: " · " (middle dot U+00B7)
- CTA text: text-sm font-medium text-blue-600
- Arrow: "→" (rightwards arrow U+2192), same color as CTA text
- Right pad: pr-4
- Height: py-3 (consistent with existing footer rows)
```

#### Split footer — story already linked

```
┌────────────────────────────────────────────────┐
│ [Avatar] Jordan Taylor [Ear] Agrees            │
│                                                │
│  [Pin icon]  Point text content here...        │
│                                                │
│              [Agree]  [Disagree]  [Unsure]     │
├────────────────────────────────────────────────┤
│  ▶ 2 stories               + add story →      │  ← split footer, space-between
└────────────────────────────────────────────────┘

Left section:
- "▶" play icon (or ChevronRight when collapsed, ChevronDown when expanded)
- "N stories" where N = viewer's own stories count linked to this point
- Tapping left section: toggles linked-stories list (same behavior as existing expand trigger)
- Style: text-sm text-gray-600 hover:text-blue-600

Right section:
- "+ add story →"
- Style: text-sm font-medium text-blue-600
- Tapping: navigates to /chat?from=position&pointId={id}
```

#### Inside quoted box (QuotedPoint / QuotedPointCard)

The quoted box has less horizontal space (~12px padding each side vs card's ~16px). The footer row uses the same separator pattern but left-aligned with content:

```
┌──────────────────────────────────────────┐  ← quoted box (bg-muted, border, rounded-lg)
│  [Pin icon]  Point text here             │
│                                          │
│  [Agree]  [Disagree]  [Unsure]  (85%)   │  ← position buttons scaled to 85%
├──────────────────────────────────────────┤  ← border-t border-gray-200
│  ✓ Agree  ·  Why do you agree? →        │  ← footer row, pl aligns under text column
└──────────────────────────────────────────┘
```

Left-pad inside quoted box: `pl-[44px]` (32px pin icon + 12px gap — matches existing footer in point-card-with-links.tsx quoted box pattern).

#### /live disabled state

```
├────────────────────────────────────────────────┤
│  ✓ Agree  ·  Tell your story  [→ greyed]      │  ← disabled button, opacity-50
│  Available after the session                   │  ← hint, text-xs text-gray-400
└────────────────────────────────────────────────┘

- Entire footer row: pointer-events-none, opacity-50
- Hint text: separate line, text-xs, text-gray-400, not inside the button
- Hint renders below the footer row line (not truncated on one line)
```

#### Copy variants — all three positions

| Viewer position | Footer label | CTA text |
|----------------|--------------|----------|
| Agree (or Strongly Agree / Somewhat Agree) | ✓ Agree | Why do you agree? → |
| Disagree (or Strongly / Somewhat) | ✗ Disagree | Why do you disagree? → |
| Unsure | ~ Unsure | Why are you unsure? → |

Position groups map 7-point scale to 3 display groups (matching existing `getPositionGroup()` logic).

Note: The symbols (✓ ✗ ~) are decorative. Screen readers should not announce the symbol character — see Accessibility section.

---

### 3. Edge Cases

**Viewer has multiple stories linked (N > 1):**
- Split footer shows the actual count: "▶ 3 stories"
- Singular/plural handled: "▶ 1 story" vs "▶ 2 stories"
- The expanded stories list shows up to 3; "+N more" link for overflow — consistent with existing pattern

**Story count loading state (while fetching viewer's linked stories):**
- On initial load, viewer's story count for a given point is not yet known
- During fetch: show the standard CTA footer (position label + "Why do you...? →") as the safe default
- If fetch resolves to count >= 1: transition to split footer
- Never show an empty footer row while loading — default to CTA, not nothing
- This avoids layout shift where a footer row appears then disappears

**Position taken but story link data not yet loaded:**
- Same as above: render CTA footer (position is known, story count is unknown → default to CTA)
- This is the optimistic-display-safe path: the CTA is always correct to show when position is taken but story count unknown

**Viewer IS the profile owner (own profile vs other profile):**
- The footer behavior is identical whether the viewer is the profile owner or a guest
- The top badge ("Jordan Taylor Agrees") always shows the subject's (profile owner's / story author's) position — unchanged
- The footer always shows the viewer's own position and CTA — this is the new element
- Result: on own profile, the viewer sees their own position both as the subject (top badge) AND as the viewer (footer). This is intentional and correct — it reinforces "this is my point, and here is my stance on it"

**Position toggle mid-session (/live):**
- User takes position → footer appears disabled immediately (same render cycle)
- User removes position → footer disappears immediately
- No flicker: the footer row's presence is gated on `userPosition !== null`

**Point in isDetailView mode (no card click navigation):**
- The footer CTA button still works — it navigates to /chat
- The card-level click handler is disabled in isDetailView; the footer CTA is a separate button with its own onClick

---

### 4. Accessibility

**CTA button aria-label:**
The footer CTA is a button or link. The visible label ("Why do you agree? →") is sufficient for most users, but the aria-label should include position context for clarity:

```
aria-label="Tell your story about your agreement"
aria-label="Tell your story about your disagreement"
aria-label="Tell your story about being unsure"
```

**Position symbol in footer label:**
The symbols ✓, ✗, ~ are rendered as decorative characters. Wrap them with `aria-hidden="true"` so screen readers announce "Agree" not "check mark Agree":

```html
<span aria-hidden="true">✓</span> Agree
```

**Disabled CTA in /live:**
```html
<button
  disabled
  aria-disabled="true"
  aria-describedby="live-cta-hint-{pointId}"
>
  Tell your story →
</button>
<p id="live-cta-hint-{pointId}" class="...">Available after the session</p>
```

Both `disabled` and `aria-disabled` should be set. `aria-describedby` links the button to its hint so screen readers announce the hint when focus reaches the button.

**Split footer — story count announcement:**
The "▶" character is decorative. Use:

```html
<span aria-hidden="true">▶</span>
<span>2 stories</span>
```

Screen readers announce "2 stories", not "right-pointing triangle 2 stories".

**Focus management:**
- Footer CTA and split footer buttons must be keyboard-focusable (tab order)
- Disabled /live button: `disabled` attribute removes it from tab order — acceptable since it cannot be activated
- If keyboard access to the disabled button is desired for discovery, use `aria-disabled="true"` without `disabled` and block the click handler manually

**Minimum touch target:**
- Footer row should be at least 44px tall on mobile (py-3 = 12px top + 12px bottom + ~20px text = 44px total at text-sm)
- Split footer: left and right sections are separate touch targets; each must meet 44px height

---

### 5. Responsive Design

**Mobile (default, 320–375px):**
- Footer row: full-width single row
- Position label + separator + CTA on one line: `flex items-center gap-1` or inline text
- If the CTA text wraps at very narrow widths (< 320px): acceptable — the separator and CTA move to second line naturally; no special handling needed
- The footer separator line (`border-t`) spans the full card width

**Split footer on mobile:**
```
│  ▶ 2 stories               + add story →  │
```
- `flex items-center justify-between` preserves left/right layout on all mobile widths
- "▶ 2 stories" truncates if needed but story counts are short strings; truncation is unlikely

**Tablet and wider (≥ 640px):**
- Card width expands; footer row gains more breathing room
- No layout changes needed — flexbox handles it

**Inside quoted box:**
- Quoted boxes are already narrower than the full card (nested indentation)
- At 320px card width, the quoted box is approximately 280px wide
- Footer row at 280px: position label (50px) + separator (8px) + CTA text (120px) = ~178px; fits on one line
- No wrapping issue expected in normal cases

**The separator line behavior:**
- The `border-t` line inside the quoted box uses `border-gray-200` (slightly more visible than card-level `border-gray-100`)
- This matches the existing footer separator inside the quoted box in `point-card-with-links.tsx` (line 257)
- On card-level footer rows (non-quoted), use `border-gray-100` to match existing card footer styling

---

### 6. Component Analysis

Every element classified as Reuse / Extend / New:

| Element | Classification | Notes |
|---------|---------------|-------|
| Footer separator line (`border-t`) | Reuse | Already present in both card and quoted-box footer patterns |
| Viewer position label ("✓ Agree") | New | Derived from `userPosition` via `getPositionGroup()`; format string with symbol + group label |
| CTA text ("Why do you agree? →") | New | Derived from position group; 3 copy variants |
| Footer row wrapper div | Extend | Extend the existing footer `div` in each component to conditionally render the new CTA row |
| Split footer left section ("▶ N stories") | Extend | Reuses existing linked-stories expand trigger pattern; change from toggle to static label when stories exist |
| Split footer right section ("+ add story →") | New | New CTA navigating to `/chat?from=position&pointId={id}` |
| Disabled CTA button for /live | New | Styled like the standard CTA but `disabled` + `opacity-50`; not reusing any existing disabled pattern |
| /live hint text ("Available after the session") | New | Single `<p>` element below the disabled button; no existing equivalent |

**Components that need changes (file-level):**

| File | Change type | What changes |
|------|-------------|-------------|
| `src/app/components/social/point-card-with-links.tsx` | Extend | Add viewer-position footer row inside card and inside quoted-box footer section; both non-quote and quote pattern branches need the CTA row appended to their existing footers |
| `src/app/components/social/StoryCardDetail.tsx` | Extend | `QuotedPoint` sub-component: add footer row inside the quoted box; move linked-stories toggle inside the box (currently hangs as sibling div) |
| `src/app/components/social/story-card-with-links.tsx` | Extend | `QuotedPoint` sub-component: add footer row inside the quoted box |
| `src/app/pages/profile-page-v2.tsx` | Extend | `QuotedPointCard` component: add footer row inside the quoted box; this component has no CTA today — created from scratch for this surface |
| `src/app/pages/point-detail-page.tsx` | Extend | Replace the current sibling `showStoryCTA` button with the footer-row pattern inside the card; also add split-footer state when viewer already has a linked story |
| `src/app/components/partners/live-story-card-expanded.tsx` | Extend | Add disabled footer row + hint text when user has taken a position |

**No new files required.** All changes are extensions to existing components.

**Shared utility (implementation decision for architect):**
The position label + CTA copy logic ("✓ Agree · Why do you agree? →") is identical across all 6 non-live surfaces. The architect should decide whether to extract this into a shared `PointCTAFooter` component or keep it inline per-component. Either is valid — flag for architect review.

---

### Decisions for Founder Input

**Decision 1 — Should the footer row have a visual separator from the position buttons row?**

Current design shows a `border-t` separator line between position buttons and the CTA footer row (see ASCII mockups). The existing footer rows in all cards already use this separator. The question is whether the CTA footer uses the same separator weight as the existing footer, or a lighter one to signal it's secondary to the existing footer content.

Options:
- (A) Same separator as existing card footer (`border-t border-gray-100`) — consistent, no extra weight
- (B) No separator — the CTA row flows directly under the position buttons with just spacing (`mt-2`)

Recommendation: **A**. The separator matches existing footer patterns exactly and signals "footer section" clearly. Without it the CTA could feel like a second row of buttons rather than a follow-up prompt.

**Decision 2 — On mobile, if position label + CTA wraps to two lines — is that acceptable?**

At 320px, "✓ Agree · Why do you agree? →" is approximately 200px of text. This fits on one line at text-sm (14px). However, if the font scales larger for accessibility (e.g., 18px text size in iOS accessibility settings), it will wrap. The second line would be "Why do you agree? →" which is readable.

Options:
- (A) Accept wrapping — no truncation, full copy always visible
- (B) Truncate label to position symbol only, drop separator: "✓  Why do you agree? →"

Recommendation: **A**. Wrapping is acceptable and keeps the full context visible. Option B saves 8px but loses the position name.

**Decision 3 — For the split footer "▶ N stories" — should tapping the left section navigate to the point detail page, or just expand the in-card list?**

Currently the linked-stories toggle in cards expands the list inline. The split footer left section could:
- (A) Expand the in-card stories list (same as existing toggle behavior)
- (B) Navigate to the point detail page which shows all stories

Recommendation: **A**. The existing expand-inline behavior is established UX that users may already rely on. Navigation to a different page is a bigger interruption and harder to undo.

---

## Technical Section

### Technical Analysis

#### Current state per file

**1. `src/app/components/social/point-card-with-links.tsx`**

- `userPosition` is local `useState`, initialized from `point.positions[currentUserId]?.position` and synced via `useEffect` when `selectedPosition` or `point.positions` change.
- Two render branches: "quote pattern" (when `profileOwner` with a `position` is set — shown on profile) and "feed view" (plain layout without quote box).
- Quote pattern: footer row lives inside the quoted box (`bg-gray-50 border`), with a collapsible stories trigger and share/open icons. The stories trigger counts from `filteredStories` (all `linkedStories`). No CTA today.
- Feed view: footer row outside the box, at `pl-[52px]`. Same structure. No CTA today.
- `showStoryCTA` does NOT exist in this file — it does not have P451 CTA at all. The sibling-below-card CTA pattern was implemented only on `point-detail-page.tsx`.
- `storiesExpanded` state controls the expandable linked stories list.
- `getPositionGroup` is imported and used for count adjustment logic; the group label ("agree"/"disagree"/"unsure") is already available.

**2. `src/app/components/social/StoryCardDetail.tsx` — `QuotedPoint` sub-component**

- `QuotedPoint` is a private sub-component at line 394.
- `effectivePosition` = `localPosition ?? serverPosition` (optimistic pattern with explicit server-confirm clearing).
- `userPosition` flows in as `userPositions.get(point.id)` — a `PointPosition` object with `.position`.
- The linked-stories toggle (lines 542–565) renders as a sibling div BELOW the quoted box div — outside the quoted box boundary. This is the UX bug flagged in Gap 1.
- The quoted box itself is a `div[role=button]` (not `<button>`) to avoid nested button violations.
- No CTA today.
- `getPositionGroup` is imported.

**3. `src/app/components/social/story-card-with-links.tsx` — `QuotedPoint` sub-component**

- `QuotedPoint` is a private sub-component at line 425.
- `userPosition` is local `useState`, initialized from `point.positions[currentUserId]?.position`.
- The quoted box is a `<button>` element (nested button HTML violation concern not yet addressed here — see note below).
- No linked-stories toggle at all — `linkedStoriesForPoints` is not passed to this component.
- No CTA today.
- `getPositionGroup` is imported.

**4. `src/app/pages/profile-page-v2.tsx` — `QuotedPointCard` sub-component**

- `QuotedPointCard` is a private sub-component at lines 1083–1204.
- `userPosition` is local `useState`, initialized from `point.userPosition` (a pre-resolved `PositionType` already extracted from the service response) and synced via `useEffect`.
- The entire quoted box is a `<button>` navigating to the point detail page.
- Position buttons are inside the box with `role="presentation"` + `e.stopPropagation()`.
- No CTA today — confirmed by UX analysis (Gap 2). P451 never shipped here.
- No linked-stories toggle.
- `getPositionGroup` is imported in the page file but not used inside `QuotedPointCard`.

**5. `src/app/pages/point-detail-page.tsx`**

- `userPosition` is page-level `useState<PositionType | null>`, initialized from `(pointData as PointWithUserPosition).userPosition?.position` at data load time (line 100–102).
- `showStoryCTA` is `useState(false)` — set to `true` only inside `handlePositionClick` when `newPosition !== null` (line 184). It is NOT derived from `!!userPosition`.
- Result: if the viewer already had a position before loading the page, `showStoryCTA` stays `false` and no CTA renders. The UX spec (Path 3, Surface E) requires the CTA to appear when position pre-exists on page load.
- The CTA is currently a sibling `<div>` below the card (`mt-4`), not a footer row inside the card.
- `storiesService.getStoriesForPoints([id])` is called at page load and populates `linkedStories` — a `Map<pointId, StoryWithAuthor[]>`. The viewer's stories for this point are reachable as `linkedStories.get(id)?.filter(s => s.authorId === user?.id)`.

**6. `src/app/components/partners/live-story-card-expanded.tsx` — `PointRow` sub-component**

- `PointRow` is a private sub-component at line 196.
- `userPosition` is local `useState<PositionType | null>`, initialized from `point.userPosition ?? null` and synced via `useEffect` on `point.userPosition`.
- No CTA today. No footer section inside the point box at all.
- The point box is a styled `div` (not a button), with position buttons directly inside.
- `getPositionGroup` is NOT imported in this file. It is not currently needed because there's no position-group-derived display.

---

#### Key data flow: how userPosition reaches each component

| Surface | userPosition type | Initialization | Sync pattern |
|---------|-------------------|---------------|--------------|
| `point-card-with-links` | `Position` (union `PositionType \| null`) | `point.positions[currentUserId]?.position` | `useEffect` on `point.positions` + `selectedPosition` |
| `StoryCardDetail.QuotedPoint` | `PositionType \| null` via `effectivePosition` | `userPositions.get(point.id)?.position` | Optimistic local + server clear |
| `story-card-with-links.QuotedPoint` | `PositionType \| null` | `point.positions[currentUserId]?.position` | None — static init only |
| `profile-page-v2.QuotedPointCard` | `Position` | `point.userPosition` (pre-resolved from service) | `useEffect` on `point.userPosition` |
| `point-detail-page` | `PositionType \| null` | From `pointData.userPosition?.position` at load | Overwritten on each `handlePositionClick` |
| `live-story-card-expanded.PointRow` | `PositionType \| null` | `point.userPosition ?? null` | `useEffect` on `point.userPosition` |

---

#### Inconsistencies to resolve

**Inconsistency 1 — `showStoryCTA` state management (`point-detail-page` only):**
`showStoryCTA` is event-driven (`useState(false)` set only on new position click). All other surfaces use `!!userPosition` (permanent derivation). This means on point detail, if the user already has a position when the page loads, the CTA is silently absent. Resolution: replace `showStoryCTA` state with `!!userPosition` derivation — same as all other surfaces.

**Inconsistency 2 — Linked-stories toggle position in `StoryCardDetail.QuotedPoint`:**
The toggle renders outside the quoted box boundary (lines 542–565: sibling `<div>` with `mt-1.5`). All other card patterns keep footer content inside the box. Resolution: move the toggle inside the quoted box as a footer row separated by `border-t`.

**Inconsistency 3 — No viewer-specific story count query today:**
`getStoriesForPoints` returns all stories for a point (all authors). It does not filter by viewer. To implement "split footer when viewer already has a linked story", each component needs to know: does the current viewer have at least one story linked to this point? This data is not pre-loaded in most components.

**Inconsistency 4 — `getPositionGroup` not imported in `live-story-card-expanded.tsx`:**
Needed to derive the position group label ("agree"/"disagree"/"unsure") for the disabled footer copy. Will need to be imported.

---

### Architecture Decisions

#### Decision 1: Shared `PointCTAFooter` component vs inline per-component

**Chosen: Inline per-component, with a shared pure utility function `getPositionCTACopy(group)`.**

**Rationale:**
Code inspection reveals the 6 surfaces are NOT structurally identical. Each has meaningfully different wrapper elements, padding contexts, click-stop propagation patterns, and layout constraints:
- `point-card-with-links` has two internal branches (quote pattern vs feed view) that need different `pl-` values
- `StoryCardDetail.QuotedPoint` needs the toggle to move from sibling to inside-box footer — a structural change to the quoted box JSX
- `story-card-with-links.QuotedPoint` uses a `<button>` as the quoted box container (nested button concern); the footer row needs to be outside the `<button>` or the box needs to change to `div[role=button]`
- `profile-page-v2.QuotedPointCard` has the entire box as a `<button>` navigating to point detail — same nested button issue
- `live-story-card-expanded.PointRow` needs a disabled/hint variant unique to /live
- `point-detail-page` has the card as a raw `div` with different layout than all others

Attempting to extract a `PointCTAFooter` component would require threading 5–7 props into each call site (position, pointId, viewerStoryCount, isLive, storiesExpanded, onStoriesToggle, onNavigate). This produces prop-threading overhead that exceeds the code duplication cost of 6 small footer row blocks.

The consistent part — mapping position group to copy strings — is a pure function with zero component overhead. That is extracted. The JSX is kept inline.

**Trade-off:** 6 independent footer row blocks to maintain instead of 1. Acceptable because each is under 10 lines of JSX, the surfaces diverge meaningfully, and a shared component would need a configuration surface nearly as large as the inline code.

**Alternative rejected:** Shared `<PointCTAFooter>` component. The per-surface structural variation means the component would need complex conditional rendering that defeats the reuse benefit.

---

#### Decision 2: Position → copy mapping

**Chosen: New shared pure utility `getPositionCTACopy(group: PositionButtonGroup): { label: string; symbol: string; ctaText: string }`** exported from `src/app/prototypes/shared/types.ts` alongside `getPositionGroup`.

**Rationale:**
The copy mapping ("agree" → "✓ Agree · Why do you agree? →") is the only piece that is truly identical across all surfaces. It has no JSX, no state, no side effects. A pure function export is zero cost and gives a single place to update copy.

The symbol, label, and CTA text are returned as separate fields to allow the caller to set `aria-hidden` on the symbol independently (accessibility requirement from UX spec).

**Trade-off:** Adds 3 lines to `types.ts`. No downside.

**Alternative rejected:** Inline ternary at each call site. Would create 6 copies of the copy strings that diverge if product changes the text.

---

#### Decision 3: showStoryCTA state management — normalization

**Chosen: Replace `showStoryCTA` state in `point-detail-page.tsx` with `!!userPosition` derived check. Add viewer story count check for split footer.**

> ⚠️ **P451 already did the `showStoryCTA` removal** (shipped 2026-02-27). `point-detail-page.tsx` already uses `showStoryCTA = !!userPosition` as a derived const. When implementing this surface, skip the state removal — only add the split-footer (viewer story count) on top of the existing derived check.

**Rationale:**
`showStoryCTA = useState(false)` in `point-detail-page` is the only surface that uses event-driven CTA visibility. Every other surface uses `!!position` (permanent derivation from the position state). The inconsistency causes the missing CTA on pre-existing positions (UX Path 3, Surface E).

The fix is a one-line change: remove `showStoryCTA` state entirely, replace the condition `showStoryCTA && id` with `userPosition && id`. This aligns `point-detail-page` with every other surface and handles Paths 2 and 3 simultaneously.

For the split footer (viewer already has a story), `point-detail-page` already loads `linkedStories` via `storiesService.getStoriesForPoints([id])`. The viewer's story count for this point is `(linkedStories.get(id) ?? []).filter(s => s.authorId === user?.id).length`. This is available synchronously from loaded state — no new query.

**Trade-off:** `showStoryCTA` state removal removes the original P451 intent-tracking variable. Accepted — the UX spec explicitly says the footer shows for any existing position, not only on new position click.

**Alternative rejected:** Keep `showStoryCTA` state and additionally set it to `true` in the `useEffect` that loads position data. This would be equivalent in behavior but adds a second code path for the same state — confusing and fragile.

---

#### Decision 4: Story count for split footer — where to source viewer's linked story count

**Chosen: Per-surface strategy, no new service method needed.**

`getStoriesForPoints` returns ALL stories for a point (all authors). Filtering by `authorId === currentUserId` client-side is sufficient to determine viewer story count. This filter is applied at render time from already-loaded data.

**Per-surface breakdown:**

| Surface | Current story data available? | Viewer count derivation |
|---------|------------------------------|------------------------|
| `point-detail-page` | Yes — `linkedStories.get(id)` from page-level query | `.filter(s => s.authorId === user?.id).length` |
| `point-card-with-links` | Partial — `linkedStories` prop contains all stories for the point | `.filter(s => s.authorId === currentUserId).length` |
| `StoryCardDetail.QuotedPoint` | Yes — `linkedStoriesForPoints` prop passed in | Already passed as `LinkedStory[]`; filter by author |
| `story-card-with-links.QuotedPoint` | No — no `linkedStories` prop passed to QuotedPoint today | Needs new prop: parent must pass viewer's stories per point |
| `profile-page-v2.QuotedPointCard` | No — no linked stories data passed to QuotedPointCard today | Needs new prop: profile-page must pass viewer stories |
| `live-story-card-expanded.PointRow` | Irrelevant — /live shows disabled state regardless of story count | No split footer on /live |

**For surfaces lacking viewer story data (`story-card-with-links.QuotedPoint`, `profile-page-v2.QuotedPointCard`):**
The viewer story count needs to be passed down from parent. The parent components (`story-card-with-links`, profile-page-v2 story section) have access to the current user's stories. The implementation must add a `viewerStoryCount?: number` prop to `QuotedPoint` and `QuotedPointCard` and thread the value from parent.

For the profile page specifically: `realStories` (the viewer's own stories) is already loaded. The profile page can compute `viewerStoriesForPoint: Map<pointId, number>` from the loaded `realStories` array — no additional query.

For `story-card-with-links`: the `linkedStories` prop in `StoryCardDetail` is already `linkedStoriesForPoints` (a Map). A similar prop can be passed to `story-card-with-links.QuotedPoint`.

**Trade-off:** No new service calls. The split footer is accurate for the data already fetched. The only cost is new prop threading. Loading state: while data loads, default to CTA (optimistic default, per UX edge case spec).

**Alternative rejected:** New service method `getViewerStoriesForPoints(pointIds, userId)`. Adds a DB round-trip per surface where the data is already present in loaded state. Not justified.

---

### Security Review

**RLS Policies:**
- ✅ `point_positions` is world-readable (`USING (true)`) — displaying viewer's own position label exposes nothing beyond what is already publicly queryable
- ✅ `stories` and `story_points` are similarly world-readable — story count display introduces no new exposure
- ✅ Write paths enforce `auth.uid() = user_id` — P456 introduces no mutations
- ✅ No new DB queries, tables, or RPC calls — footers read from already-fetched, already-RLS-scoped props

**Authentication:**
- ✅ Footer row is conditional on `userPosition !== null`; `userPosition` is initialized from `currentUserId` — null for unauthenticated users, so footer never renders for unauthenticated visitors
- ✅ CTA destination `/chat?from=position` has an independent auth gate that redirects to `/signup` if `!user`

**Authorization:**
- ✅ Footer shows viewer's own position (sourced from `currentUserId`), not the profile owner's
- ✅ `/chat?from=position&pointId={id}` uses `user.id` (authenticated user) on the receiving page — URL-supplied `pointId` cannot be used to access another user's context
- ⚠️ **Implementation-time risk:** Split footer "▶ N stories" count must be scoped to viewer's own stories only. `storiesService.getStoriesForPoints([id])` returns ALL public stories — implementor must filter by `authorId === user.id`. Using the unfiltered count would show an inflated number (not a data leak, but wrong UX).

**Input Validation:**
- ✅ Supabase uses parameterized queries — `pointId` passed to `.eq('id', pointId)` has no SQL injection risk
- ⚠️ Minor hardening: no UUID format validation on `pointId` before querying or before using in `navigate(\`/point/${pointId}\`)`. Worst case is a failed fetch with graceful fallback; not a blocking risk. A UUID regex guard would close it cleanly.

**Data Protection:**
- ✅ Footer displays only the viewer's own position label and story count — their own data, shown only to themselves
- ✅ All displayed data is either the authenticated user's own or already publicly readable per existing RLS

---

### Implementation Approach

#### Files to Modify

**1. `src/app/prototypes/shared/types.ts`**
- Add exported pure utility function `getPositionCTACopy(group: PositionButtonGroup): { symbol: string; label: string; ctaText: string; ariaLabel: string }`
- Maps: `'agree'` → `{ symbol: '✓', label: 'Agree', ctaText: 'Why do you agree? →', ariaLabel: 'Tell your story about your agreement' }`
- Maps: `'disagree'` → `{ symbol: '✗', label: 'Disagree', ctaText: 'Why do you disagree? →', ariaLabel: 'Tell your story about your disagreement' }`
- Maps: `'unsure'` → `{ symbol: '~', label: 'Unsure', ctaText: 'Why are you unsure? →', ariaLabel: 'Tell your story about being unsure' }`

**2. `src/app/pages/point-detail-page.tsx`**
- Remove `showStoryCTA` state entirely
- Import `getPositionCTACopy` from shared types
- Replace the existing sibling `<div>` CTA (lines 325–336) with a footer row inside the card boundary (inside the card div, after the existing footer row with share button)
- Derive viewer story count from `linkedStories.get(id)?.filter(s => s.authorId === user?.id).length ?? 0`
- Footer renders when `userPosition !== null`: standard CTA when `viewerStoryCount === 0`, split footer when `viewerStoryCount >= 1`
- The existing share button footer row becomes a sibling footer row above the CTA footer row

**3. `src/app/components/social/point-card-with-links.tsx`**
- Import `getPositionCTACopy`, `useNavigate` is already imported
- Add CTA footer row in both render branches:
  - **Quote pattern**: append a new footer row below the existing footer div inside the quoted box (after the collapsible trigger + action icons row), separated by `border-t border-gray-200`, with `pl-[44px]`
  - **Feed view**: append a new footer row after the existing footer div (keep existing footer, add new one below with `border-t border-gray-100`, `pl-[52px]`)
- For the split footer: filter `filteredStories` by `authorId === currentUserId` to get viewer story count
- CTA navigates to `/chat?from=position&pointId={point.id}`

**4. `src/app/components/social/StoryCardDetail.tsx` — `QuotedPoint` sub-component**
- Import `getPositionCTACopy`
- Move the linked-stories toggle (lines 542–565) from sibling div BELOW the quoted box INTO the quoted box as a footer row (inside the `div[role=button]` quoted box, after the position buttons section, with `border-t border-gray-200`)
- Add CTA footer row below the linked-stories footer row inside the quoted box
- `linkedStories` already passed as prop; viewer story count = `linkedStories.filter(s => s.authorId === currentUserId).length` — but `QuotedPoint` in this file does not currently receive `currentUserId`
- Add `currentUserId?: string` to `QuotedPoint` props; thread from parent `StoryCardDetail` which receives `userPositions` (the viewer's positions Map, implying the viewer is known). The viewer ID must be added to `StoryCardDetail` props as `currentUserId?: string`

**5. `src/app/components/social/story-card-with-links.tsx` — `QuotedPoint` sub-component**
- Import `getPositionCTACopy`
- Change the quoted box from `<button>` to `div[role="button"]` (to allow nested button/link inside the CTA footer without HTML violation)
- Add CTA footer row inside the quoted box with `border-t border-gray-200` and `pl-[44px]`
- Add `viewerStoryCount?: number` prop to `QuotedPoint`; thread from parent
- Parent `StoryCardWithLinks` needs `viewerStoriesPerPoint?: Map<string, number>` prop added, populated from caller

**6. `src/app/pages/profile-page-v2.tsx` — `QuotedPointCard` sub-component**
- Import `getPositionCTACopy`, `useNavigate` is already imported in `QuotedPointCard`
- Change the quoted box from `<button>` to `div[role="button"]` (same nested button fix as above)
- Add CTA footer row inside the box with `border-t border-border` separator and `pl-[44px]`
- Add `viewerStoryCount?: number` to `QuotedPointCard` props
- Profile page already has `realStories` loaded; compute `viewerStoriesForPoint = Map<pointId, count>` from `realStories` where `authorId === currentUserId` and filter by `point.id` in each story's `points` array
- Thread `viewerStoryCount` into `QuotedPointCard` at the call site (around line 1052)

**7. `src/app/components/partners/live-story-card-expanded.tsx` — `PointRow` sub-component**
- Import `getPositionCTACopy`, `getPositionGroup` from shared types
- Add a disabled footer row inside the point box (`div.p-3.rounded-lg`) when `userPosition !== null`
- Footer row: `border-t border-gray-200 mt-2 pt-2`
- CTA button: `disabled aria-disabled="true"` + `opacity-50 pointer-events-none`
- Hint text: `<p id="live-cta-hint-{point.id}" className="text-xs text-gray-400 mt-1">Available after the session</p>`
- No split footer for /live — always shows disabled CTA regardless of story count

---

#### Files to Create

None. All changes are extensions to existing components.

---

#### Build Sequence

1. **`src/app/prototypes/shared/types.ts`** — Add `getPositionCTACopy` utility. No dependencies. All other files import from here.

2. **`src/app/pages/point-detail-page.tsx`** — Simplest surface: single card, no QuotedPoint sub-component, viewer story data already loaded. Validates the footer row pattern before applying to card-level components. Removes `showStoryCTA` inconsistency.

3. **`src/app/components/social/point-card-with-links.tsx`** — Most-used card component (profile Points tab, both own and other profile). Two internal branches need CTA. No prop interface changes needed — `currentUserId` and `linkedStories` already present.

4. **`src/app/components/social/StoryCardDetail.tsx`** — `QuotedPoint` sub-component. Adds `currentUserId` to both `QuotedPoint` props and `StoryCardDetail` props. Also moves the linked-stories toggle inside the box (structural change — careful not to break existing expand behavior).

5. **`src/app/components/social/story-card-with-links.tsx`** — `QuotedPoint` sub-component. Requires `<button>`→`div[role=button]` conversion on the quoted box. Adds `viewerStoryCount` prop threading. Requires callers to pass `viewerStoriesPerPoint`.

6. **`src/app/pages/profile-page-v2.tsx`** — `QuotedPointCard`. Same `<button>`→`div[role=button]` conversion. Compute `viewerStoriesForPoint` from already-loaded `realStories`. Thread into `QuotedPointCard`. Most complex caller due to the adaptation layer (AdaptedPoint format).

7. **`src/app/components/partners/live-story-card-expanded.tsx`** — `PointRow`. Add disabled CTA + hint. Import `getPositionGroup` and `getPositionCTACopy`. No prop changes to external interface.


---

## Test Coverage Strategy

Generated by `/generate-tests` on 2026-02-27.

### Files Generated

| File | Type | Scope |
|------|------|-------|
| `src/tests/getPositionCTACopy.test.ts` | Unit (Vitest) | `getPositionCTACopy` utility function — all 3 position groups × all 4 copy fields + shape contract |
| `e2e/p456-story-cta-footer.spec.ts` | E2E (Playwright) | Core user flows: Surface A (own profile Points tab), Surface E (point detail), Surface G (/live disabled CTA), nested button regression |
| `e2e/a11y/p456-accessibility.spec.ts` | A11y (Playwright) | ARIA contract: symbol aria-hidden, CTA button aria-label, /live aria-disabled + aria-describedby, split footer ▶ symbol |
| `e2e/p456-smoke.spec.ts` | Smoke (Playwright) | All 3 modified page surfaces load without JS console errors, authenticated and anonymous |
| `features/uat/p456.md` | Manual UAT | All 6 surfaces × 3 states (0/1/2) + adaptive copy verification + split footer count accuracy + nested button check |

### Coverage Rationale

**Why unit test only `getPositionCTACopy`?**
It is the only pure logic added by P456 — the 3→3 mapping of position group to copy fields. All other changes are rendering decisions (conditional JSX) best verified in context via E2E. Unit testing JSX conditionals would require mocking 5–7 props per component and produce brittle tests that mirror implementation rather than behaviour.

**Why E2E on Surfaces A, E, G specifically?**
- Surface A (own profile Points tab) is the highest-traffic surface — most users see this first after taking a position.
- Surface E (point detail) contains the `showStoryCTA` normalization fix — the most mechanically distinct change. A dedicated E2E test verifies the pre-existing-position case that the original P451 implementation missed.
- Surface G (/live) is the only surface with a disabled state — qualitatively different from the other 5 and not covered by any existing test.
- Surfaces B/C/D/F are structurally identical to A (same `QuotedPoint` pattern or same component) — covered by UAT manual checklist to avoid fixture duplication.

**Nested button regression:**
Two components convert from `<button>` to `div[role=button]` (story-card-with-links QuotedPoint, profile-page-v2 QuotedPointCard). The E2E test runs a DOM query for `button > button` on the rendered page — catches any regression to the nested-button pattern without needing to test the component in isolation.

**Smoke tests:**
Run after every deploy as a fast gate. If P456's conditional rendering introduces a runtime exception on any surface, the smoke test catches it before UAT begins.

**What automated tests do NOT cover (UAT required):**
- Visual placement accuracy — footer row is visually inside the card boundary (pixel-level check not practical in Playwright without screenshots)
- Split footer story count accuracy — verifying the count is scoped to viewer's OWN stories (not all linked stories). This requires setting up scenarios with mixed viewer/non-viewer linked stories — high setup cost for a rule best verified manually once.
- /live disabled state full coverage — the hint text and aria-disabled assertions in the E2E tests self-skip if the live session context isn't reached. UAT-G covers this manually.
- Copy consistency across all 6 surfaces simultaneously — verified via UAT matrix.

### Running the Tests

```bash
# Unit tests
npm test -- src/tests/getPositionCTACopy.test.ts

# E2E (requires test DB credentials in .env.local)
npx playwright test e2e/p456-story-cta-footer.spec.ts
npx playwright test e2e/p456-smoke.spec.ts
npx playwright test e2e/a11y/p456-accessibility.spec.ts

# All P456 tests
npx playwright test --grep "P456"
```

---

## Task Manifest

### Consistency Check Findings (Pre-Decompose)

**AC coverage gap — non-regression requirement:**
AC "Viewer's position badge at top of card is unchanged on all surfaces" has no corresponding build step. It is a non-regression constraint. Each task that modifies card JSX (Tasks 2–7) must explicitly preserve the existing position badge markup and not alter its props or placement. This is noted in each affected task below.

**Spec ambiguity resolved:**
For `story-card-with-links.tsx` (Task 5), the spec says "callers must pass `viewerStoriesPerPoint`" without naming them. Code inspection confirms the primary caller is `StoryCardDetail.tsx` — which already has `linkedStoriesForPoints` loaded. Task 5 specifies the exact caller and prop threading path.

**UX–Architecture drift:** None found.

---

### Task 1: Add `getPositionCTACopy` utility to shared types
**Files:** `src/app/prototypes/shared/types.ts`
**Depends on:** none
**Description:**
Export a new pure utility function `getPositionCTACopy(group: PositionButtonGroup): { symbol: string; label: string; ctaText: string; ariaLabel: string }` from the shared types file, alongside the existing `getPositionGroup` function.

Mapping:
- `'agree'` → `{ symbol: '✓', label: 'Agree', ctaText: 'Why do you agree? →', ariaLabel: 'Tell your story about your agreement' }`
- `'disagree'` → `{ symbol: '✗', label: 'Disagree', ctaText: 'Why do you disagree? →', ariaLabel: 'Tell your story about your disagreement' }`
- `'unsure'` → `{ symbol: '~', label: 'Unsure', ctaText: 'Why are you unsure? →', ariaLabel: 'Tell your story about being unsure' }`

The function must accept the `PositionButtonGroup` type (already defined in this file as `'agree' | 'disagree' | 'unsure'`). No component, no JSX, no side effects.

**Tests:** `src/tests/getPositionCTACopy.test.ts` — covers all 3 groups × all 4 fields + TypeScript shape contract. Run: `npm test -- src/tests/getPositionCTACopy.test.ts`
**AC covered:**
- "CTA copy reflects viewer's position" (copy strings defined here)
- "Footer includes viewer's position label" (label/symbol strings defined here)

---

### Task 2: Refactor point-detail-page — remove showStoryCTA, add footer row inside card
**Files:** `src/app/pages/point-detail-page.tsx`
**Depends on:** Task 1
**Description:**
This is the simplest surface with the most important normalization fix.

1. **Remove `showStoryCTA` state** (`useState(false)`) entirely. This is the inconsistency flagged in Architecture Decision 3 — the only event-driven CTA (set only on new position click). Replace every reference to `showStoryCTA` with `!!userPosition`.

2. **Remove the existing sibling `<div>` CTA** (currently rendered as `mt-4` below the card — lines 325–336 approximately). This is the floating orphan element being fixed.

3. **Add a footer row INSIDE the card div**, after the existing footer row that contains the share button. The footer row is conditional on `userPosition !== null`.

4. **Derive viewer story count** from already-loaded `linkedStories`:
   ```
   const viewerStoryCount = (linkedStories.get(id) ?? []).filter(s => s.authorId === user?.id).length ?? 0
   ```

5. **Conditional footer rendering:**
   - When `userPosition !== null && viewerStoryCount === 0`: standard CTA footer row
     - Position label: `<span aria-hidden="true">{copy.symbol}</span> {copy.label}` (text-sm text-gray-600)
     - Separator: ` · ` (middle dot)
     - CTA: `<button onClick={() => navigate('/chat?from=position&pointId=' + id)} aria-label={copy.ariaLabel}>{copy.ctaText}</button>` (text-sm font-medium text-blue-600)
   - When `userPosition !== null && viewerStoryCount >= 1`: split footer row (flex justify-between)
     - Left: `<span aria-hidden="true">▶</span> {viewerStoryCount} {viewerStoryCount === 1 ? 'story' : 'stories'}` — clicking toggles linked stories list
     - Right: `+ add story →` button navigating to `/chat?from=position&pointId={id}`

6. The footer row is separated from the section above it by `border-t border-gray-100`.
7. Left-pad: `pl-[52px]` (matches existing footer row).
8. **Non-regression:** preserve the existing top position badge (subject's position) — do not alter any markup above the position buttons row.

**Tests:** `e2e/p456-story-cta-footer.spec.ts` — Surface E flows (point detail pre-existing position, new position). Also `e2e/p456-smoke.spec.ts` — point detail page smoke.
**AC covered:**
- "CTA appears as footer row inside card" (point-detail surface)
- "CTA copy reflects viewer's position"
- "Footer includes viewer's position label"
- "Split footer when viewer has at least 1 story"
- "Split footer replaces CTA"
- "No footer when no position taken" (derived from `!!userPosition`)

---

### Task 3: Add CTA footer row to point-card-with-links — both quote and feed branches
**Files:** `src/app/components/social/point-card-with-links.tsx`
**Depends on:** Task 1
**Description:**
This component is used on both own and other-profile Points tabs. It has two render branches that each need the CTA footer row.

1. **Import `getPositionCTACopy`** from `src/app/prototypes/shared/types.ts`. `useNavigate` is already imported.

2. **Derive viewer story count** from the `filteredStories` prop (already present), filtered to `authorId === currentUserId`:
   ```
   const viewerStoryCount = filteredStories.filter(s => s.authorId === currentUserId).length
   ```

3. **Quote pattern branch** (when `profileOwner` with a `position` is set — rendered on profile pages):
   - Append a new footer row INSIDE the quoted box div, below the existing collapsible trigger + action icons row
   - Separator: `border-t border-gray-200` (quoted box uses slightly more visible separator than card level)
   - Left-pad: `pl-[44px]`
   - Conditional: same CTA / split footer logic as Task 2

4. **Feed view branch** (plain layout without quote box):
   - Append a new footer row after the existing footer div (keep existing footer, add new one below)
   - Separator: `border-t border-gray-100`
   - Left-pad: `pl-[52px]`
   - Conditional: same CTA / split footer logic

5. **Non-regression:** do not alter the existing footer row content (stories count toggle, share icon, external link icon). The CTA row is additive, not a replacement of the existing footer.
6. **Non-regression:** preserve the position badge at top of card.

**Tests:** `e2e/p456-story-cta-footer.spec.ts` — Surface A flows (own profile Points tab). `e2e/p456-smoke.spec.ts` — profile page smoke. `e2e/a11y/p456-accessibility.spec.ts` — symbol aria-hidden, CTA aria-label.
**AC covered:**
- "CTA appears as footer row inside card" (profile Points tab, both own and other profile)
- "CTA copy reflects viewer's position"
- "Footer includes viewer's position label"
- "Split footer when viewer has at least 1 story"
- "No footer when no position taken"

---

### Task 4: Refactor StoryCardDetail QuotedPoint — move toggle inside box, add CTA footer
**Files:** `src/app/components/social/StoryCardDetail.tsx`
**Depends on:** Task 1
**Description:**
Two structural changes in this file: (1) move the linked-stories toggle from sibling-below-box to inside-the-box, and (2) add the CTA footer row inside the box.

1. **Import `getPositionCTACopy`** from shared types.

2. **Add `currentUserId?: string` to the `StoryCardDetail` component props** (threaded from the parent — the viewer's user ID, needed to scope story count to the viewer). Also add `currentUserId?: string` to the `QuotedPoint` private sub-component props.

3. **Move linked-stories toggle INSIDE the quoted box** (fixing UX Gap 1):
   - The current implementation renders a sibling `<div>` with `mt-1.5` BELOW the quoted box div (lines 542–565 approximately)
   - Move this entire toggle block to inside the `div[role=button]` quoted box, as a footer row after the position buttons section
   - Separator: `border-t border-gray-200`
   - Verify the `storiesExpanded` state toggle still works (same onClick handler, just repositioned)

4. **Add CTA footer row** below the linked-stories footer row, still inside the quoted box:
   - Derive viewer story count: `linkedStories.filter(s => s.authorId === currentUserId).length`
   - `linkedStories` is already passed as a prop to `QuotedPoint`
   - Conditional: CTA footer when viewerStoryCount === 0, split footer when >= 1
   - Left-pad: `pl-[44px]`

5. **Non-regression:** the `div[role=button]` already avoids nested button violations — the CTA inside it must use a `<button>` with `e.stopPropagation()` or an `<a>` tag (not a nested `div[role=button]`). Use `<button onClick={e => { e.stopPropagation(); navigate(...) }}>`.
6. **Non-regression:** preserve position badge at top of StoryCardDetail card.

**Tests:** `e2e/p456-smoke.spec.ts` — Stories tab smoke. `e2e/a11y/p456-accessibility.spec.ts` — symbol aria-hidden. UAT-B and UAT-D (Stories tab, own and other profile) for manual visual verification.
**AC covered:**
- "Stories toggle moves inside card boundary on QuotedPoint surfaces" (StoryCardDetail)
- "CTA appears as footer row inside card" (Stories tab surfaces)
- "CTA copy reflects viewer's position"
- "Split footer when viewer has at least 1 story"
- "No footer when no position taken"

---

### Task 5: Add CTA footer to story-card-with-links QuotedPoint — fix nested button, thread viewerStoryCount
**Files:** `src/app/components/social/story-card-with-links.tsx`
**Depends on:** Task 1
**Description:**
This component's QuotedPoint sub-component uses a `<button>` as the quoted box container — a nested button violation that blocks adding the CTA footer. Fix the container first, then add the footer.

1. **Import `getPositionCTACopy`** from shared types.

2. **Change the quoted box container** from `<button>` to `<div role="button" tabIndex={0} onClick={...} onKeyDown={...}>`. Transfer the existing click handler (navigating to point detail). Add `onKeyDown` to handle Enter/Space for keyboard accessibility (to match `<button>` behavior: `e.key === 'Enter' || e.key === ' '`).

3. **Add `viewerStoryCount?: number` prop to the `QuotedPoint` sub-component.** Default: `0` (safe default — shows CTA, not split footer, when count unknown).

4. **Add `viewerStoriesPerPoint?: Map<string, number>` prop to the parent `StoryCardWithLinks` component** — a map of `pointId → viewer's story count for that point`. Thread `viewerStoriesPerPoint?.get(point.id) ?? 0` down to `QuotedPoint`.

5. **Update the call sites** of `StoryCardWithLinks` (primary caller: `StoryCardDetail.tsx`) to pass `viewerStoriesPerPoint`. In `StoryCardDetail.tsx`, derive this from `linkedStoriesForPoints` (already loaded): filter each point's stories by `authorId === currentUserId`, build a `Map<pointId, count>`. Note: `currentUserId` must now be available in `StoryCardDetail` — already added in Task 4.

6. **Add CTA footer row** inside the `div[role=button]` quoted box, after position buttons:
   - Separator: `border-t border-gray-200`
   - Left-pad: `pl-[44px]`
   - CTA button: `<button onClick={e => { e.stopPropagation(); navigate(...) }}>` (stop propagation to prevent triggering parent div[role=button] click)
   - Conditional: standard CTA when viewerStoryCount === 0, split footer when >= 1

7. **Non-regression:** the E2E test runs `button > button` DOM query on the rendered page — passing means the nested button regression is confirmed fixed. Preserve position badge at top of card.

**Tests:** `e2e/p456-story-cta-footer.spec.ts` — nested button regression check (`button > button` query). `e2e/p456-smoke.spec.ts` — story feed smoke. UAT-F (linked point inside story feed).
**AC covered:**
- "CTA appears as footer row inside card" (story feed QuotedPoint)
- "All 6 surfaces have identical footer structure" (this surface aligned)
- "Viewer's position badge unchanged" (non-regression)

---

### Task 6: Add CTA footer to profile-page-v2 QuotedPointCard — fix nested button, compute viewerStoriesForPoint
**Files:** `src/app/pages/profile-page-v2.tsx`
**Depends on:** Task 1
**Description:**
This surface has no CTA today (P451 never shipped here — UX Gap 2). Adding the CTA requires fixing the nested button container and computing the viewer's story count from already-loaded profile data.

1. **Import `getPositionCTACopy`** at the top of the file (or inside `QuotedPointCard` if it is a module-level sub-component). `useNavigate` is already imported inside `QuotedPointCard`.

2. **Change the quoted box container** in `QuotedPointCard` from `<button>` to `<div role="button" tabIndex={0} onClick={...} onKeyDown={...}>`. Same keyboard handler pattern as Task 5.

3. **Add `viewerStoryCount?: number` prop to `QuotedPointCard`.** Default: `0`.

4. **Compute `viewerStoriesForPoint: Map<pointId, count>`** at the profile page level, from the already-loaded `realStories` array:
   ```
   const viewerStoriesForPoint = useMemo(() => {
     const map = new Map<string, number>()
     realStories.forEach(story => {
       story.points?.forEach(p => {
         map.set(p.id, (map.get(p.id) ?? 0) + 1)
       })
     })
     return map
   }, [realStories])
   ```
   Note: `realStories` contains the VIEWER's own stories (filtered by `authorId === currentUserId` in the existing data loading). Confirm this filter is already applied — if not, filter at computation time.

5. **Thread `viewerStoryCount`** into `QuotedPointCard` at the call site (around line 1052): `viewerStoryCount={viewerStoriesForPoint.get(point.id) ?? 0}`.

6. **Add CTA footer row** inside the `div[role=button]` quoted box, after position buttons:
   - Separator: `border-t border-border` (profile page uses `border-border` CSS variable matching design system)
   - Left-pad: `pl-[44px]`
   - CTA button with `e.stopPropagation()`
   - Conditional: CTA when viewerStoryCount === 0, split footer when >= 1

7. **Non-regression:** `button > button` DOM query must pass (nested button fixed). Preserve position badge.

**Tests:** `e2e/p456-story-cta-footer.spec.ts` — nested button regression check (same `button > button` query, catches this component too). `e2e/p456-smoke.spec.ts` — profile page smoke. UAT-B/D (Stories tab on own/other profile).
**AC covered:**
- "CTA appears as footer row inside card" (profile Stories tab QuotedPointCard — new CTA not previously present)
- "Split footer when viewer has at least 1 story"
- "No footer when no position taken"
- "All 6 surfaces have identical footer structure"

---

### Task 7: Add disabled CTA + hint to live-story-card-expanded PointRow
**Files:** `src/app/components/partners/live-story-card-expanded.tsx`
**Depends on:** Task 1
**Description:**
The /live surface needs a visible but non-interactive CTA footer to signal that story entry exists and will open after the session. No split footer — /live always shows the disabled CTA regardless of story count.

1. **Import `getPositionCTACopy` and `getPositionGroup`** from shared types. (`getPositionGroup` is not currently imported in this file — add it.)

2. **Add a disabled footer row INSIDE the point box** (`div.p-3.rounded-lg` or equivalent) when `userPosition !== null`:
   - Separator: `border-t border-gray-200 mt-2 pt-2`
   - Layout: two rows — CTA row above, hint row below

3. **CTA row:**
   ```html
   <div class="flex items-center gap-1 opacity-50 pointer-events-none">
     <span aria-hidden="true">{copy.symbol}</span>
     <span>{copy.label}</span>
     <span aria-hidden="true"> · </span>
     <button
       disabled
       aria-disabled="true"
       aria-describedby={`live-cta-hint-${point.id}`}
       class="text-sm font-medium text-blue-600"
     >
       Tell your story →
     </button>
   </div>
   ```
   Note: Use "Tell your story →" (not the position-specific "Why do you agree?") for /live — the /live variant is intentionally generic (per UX mockup for Surface G). The position label still appears to the left.

4. **Hint row:**
   ```html
   <p id={`live-cta-hint-${point.id}`} class="text-xs text-gray-400 mt-1">
     Available after the session
   </p>
   ```

5. **No navigation** — the entire row has `pointer-events-none`. The button has `disabled` attribute (removes from tab order, per accessibility decision in spec).

6. **Non-regression:** preserve the existing position badge at top of the point box. No changes to position buttons row.

**Tests:** `e2e/p456-story-cta-footer.spec.ts` — Surface G disabled CTA flow. `e2e/a11y/p456-accessibility.spec.ts` — `aria-disabled`, `aria-describedby` assertions. `e2e/p456-smoke.spec.ts` — /live page smoke. UAT-G (manual /live disabled state verification).
**AC covered:**
- "/live story entry footer visible but disabled"
- "/live hint text 'Available after the session'"
- "/live disabled button non-clickable"
- "CTA appears as footer row inside card" (/live surface)
