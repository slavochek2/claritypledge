---
status: week
type: change-request
rank: 1000005.0
changes: p425
tags:
  - redesign
  - p425
  - chat
  - context-header
  - rating
created_date: 2026-03-02
flow: dev
---

# P467: /chat — slim context header + inline rating (remove drawer)

> **Redesign of:** [P425: AI-Guided Story Creation Core Loop](../features/done/21_feb_26/p425_ai_story_core_loop.md)
>
> **What was wrong:** P425 specified a lightweight `ContextChip` (sticky top header, point text + position badge only) and inline visibility/save UI. The implementation substituted `PointCardWithLinks` — a profile-page component with quote pattern, interactive position buttons, share button, and story CTA rows (~200px tall) — causing the card to consume half the visible screen on mobile. Separately, a `Drawer` was introduced for the rating/save UI despite P425 explicitly placing that UI inline in the thread. Both are implementation drift from the original spec.

## Problem Statement

Two components in `/chat` (`StoryGuideChatPage`) deviate from P425's design intent:

**1. Context card is the wrong component.** P425 called for a simple sticky chip (point text + user's position badge). The implementation uses `PointCardWithLinks`, which was designed for other-people's profile pages and includes: the "quote pattern" with the user's own name in 3rd person ("Vyacheslav Agrees:"), interactive position buttons, a share button, and story CTA footer rows. On mobile (~375px) the card is ~200px tall — nearly half the visible screen before the chat even begins.

**2. Drawer breaks the thread model.** P425 specified that the rating prompt and visibility/save UI appear inline in the chat thread. The implementation uses a bottom `Drawer` for the rating phase, which pins a duplicate of the latest draft above the rating controls. This creates two parallel displays of the same draft (thread bubble + drawer), confuses spatial context, and breaks the "chat as a single continuous thread" mental model.

Neither the share button nor the quote pattern were specified by P425. They appeared as side effects of using `PointCardWithLinks`.

## Jobs To Be Done

- **Preserved from P425:** User writes a story guided by AI, starting from a position they've staked on a point; iterates via rating until satisfied; saves with visibility choice.
- **Corrected:** User sees only what's relevant to their current writing task — not a profile card, not a sharing UI, not interactive position buttons. The chat is a focused, single-column, sequential thread.
- **New (UX improvement):** Rating accepts both click (0–10 buttons) and type (number in input field), removing friction for the most common action in the loop.

## Current State

`StoryGuideChat.tsx` renders `PointCardWithLinks` in a sticky header (lines ~614–630) and a `Drawer` for rating (lines ~768–804).

**Before — context card (~200px on mobile):**
```
┌─ sticky header ──────────────────────────────────────────────┐
│ Vyacheslav Ladischenski  👂  [Agrees ▾]                       │
│ ┌── Quoted box ───────────────────────────────────────────── │
│ │ [Pin] asdf sdflasjdf lkajsdkfljaks djfasf                  │
│ │       [Disagree 0] [Unsure 0] [Agree 50 ▾]                 │
│ │ ──────────────────────────────────────────────────────── │
│ │ ▶ Agree  Why do you agree? →          [share][↗]           │
│ │ ─ Position based — write your experience below ─           │
│ └────────────────────────────────────────────────────────── │
└──────────────────────────────────────────────────────────────┘
```

**Before — rating phase (Drawer pops up, thread still visible behind):**
```
┌─ chat thread ─────────────────────────────────┐
│  [AI] What's your experience?                 │
│  [You] I look at the keyboard...              │
│  ┌── Draft v1 ──────────────────────────────┐ │
│  │ "I feel paralyzed facing disagreement..."│ │
│  └──────────────────────────────────────────┘ │
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓ Draft v1 · not saved                        ▓│
│▓ "I feel paralyzed facing disagreement..."   ▓│
│▓ How well does this capture what you meant?  ▓│
│▓ [0][1][2][3][4][5][6][7][8][9][10]          ▓│
└───────────────────────────────────────────────┘
```

## Root Cause

**Context card:** `StoryGuideChat.tsx:616` passes `contextPoint` and `contextProfileOwner` (with the user's position) to `PointCardWithLinks`. Because `profileOwner.position` is truthy, `showQuotePattern` fires (`point-card-with-links.tsx:197`) — this activates the full quote pattern designed for profile pages. The `hideActions` and `liveSessionMode` flags default to `false`, so the share button and position buttons render unconditionally.

**Drawer:** `StoryGuideChat.tsx:768` opens a `Drawer` when `phase === 'rating' || phase === 'iterating'`. P425 never specified a drawer — the spec described rating prompt and visibility selector as inline thread elements. The drawer was added post-P425 (exact commit origin unclear) and was never in the spec.

## Redesign

Replace both with thread-native components:

**After — context header (~48px):**
```
╭─ sticky header ───────────────────────────────────────────────╮
│ [Pin] asdf sdflasjdf lkajsdkfljaks djfasf...   [You agree] [↗]│
╰───────────────────────────────────────────────────────────────╯
```
- Point text: `line-clamp-1`, expands on tap
- Position chip: 1st person — "You agree" / "You disagree" / "You're unsure" (not 3rd person PositionBadge)
- `[↗]` navigates to `/point/:id`; browser back returns to `/chat`
- No avatar, no position buttons, no share, no footer rows
- Implemented as a new `ChatContextHeader` component (not `PointCardWithLinks`)

**After — rating inline in thread:**
```
│  ┌── 🤖 AI — Draft v1 ─────────────────────────────────────┐ │
│  │  "I feel paralyzed facing disagreement..."               │ │
│  │                                                          │ │
│  │  How well does this capture what you meant?              │ │
│  │  ┌────────────────────────────────────────────────────┐  │ │
│  │  │ 0   1   2   3   4   5   6   7   8   9   10        │  │ │
│  │  │ ○   ○   ○   ○   ○   ○   ○   ○   ○   ○   ○        │  │ │
│  │  │ not at all                           perfectly    │  │ │
│  │  └────────────────────────────────────────────────────┘  │ │
│  │  Or type 0–10 and send ↓                                 │ │
│  └──────────────────────────────────────────────────────────┘ │
```
- Rating prompt is an AI message bubble with embedded 0–10 button row
- Clicking a button immediately sends the rating (no separate send)
- Typing a number in the input bar and hitting send also works
- After rating: button row collapses, selected number echoed as a user message, AI continues
- Escape hatch ("Save as-is →") appears after the 2nd iteration as a small link below the buttons
- Drawer import removed entirely

**Input bar placeholder during rating phase:** `What's off? Or type 0–10...`

## Predecessor Sections Superseded

| Section | P425 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| Context chip component | "Use the existing point component exactly as rendered on profiles" (UX Requirements) | Superseded | New `ChatContextHeader` component — not PointCardWithLinks |
| Save/visibility UI location | "Visibility selector and save action appear inline in the thread (not a separate step, not a modal)" | Implementation drifted to Drawer — this spec restores inline intent | Rating prompt + buttons in thread message bubble |
| Attribution copy | Implied "user's position badge" — no 3rd person name | Implementation added "Vyacheslav Agrees:" via quote pattern | Position chip shows "You agree" (1st person) |
| Share button | Not specified during loop — only post-save | Implementation rendered share in card footer mid-loop | Removed; share only in SavedStoryChatCard |

## Requirements

1. Replace `PointCardWithLinks` in `StoryGuideChat.tsx` with a new `ChatContextHeader` component
2. `ChatContextHeader` renders: point text (truncated, expandable) + 1st-person position chip + open-in-point-detail link
3. `ChatContextHeader` has no interactive position buttons, no share button, no story CTA
4. Remove the `Drawer` from `StoryGuideChat.tsx` entirely
5. Rating prompt (phase `rating` / `iterating`) renders as an AI message bubble with 0–10 button row
6. Clicking a button sends the rating immediately; typing a number in input bar + send also works
7. After 2nd iteration: "Save as-is →" escape hatch appears below buttons
8. P465's edit mode (`existingStory` prop, `phase='visibility'` init) must continue working — do not touch that logic
9. `PointCardWithLinks` is not changed — only its use in `StoryGuideChat` is replaced

## What Stays the Same

- Phase state machine: `idle → brain-dump → streaming → rating → iterating → polish → visibility → saving → saved`
- AI streaming, abort handling, draft versioning
- `DraftCard`, `VisibilityAndSave`, `SavedStoryChatCard`, `ThreadMessage` components
- P465 edit mode: `existingStory` prop, edit-phase initialization, `updateStory` save path
- Rating bands: 10 / 8–9 / 5–7 / <5 AI response logic (unchanged)
- `/chat?from=position&pointId=X` URL entry point
- All storage: `stories` table, `story_points` link

## Surfaces in Scope

**In scope:**
- `src/app/components/story-guide/StoryGuideChat.tsx` — replace PointCardWithLinks + remove Drawer
- `src/app/components/story-guide/ChatContextHeader.tsx` — new component (create)
- `src/app/pages/story-guide-chat-page.tsx` — may need minor prop adjustments

**Out of scope:**
- `src/app/components/social/point-card-with-links.tsx` — not changing the component itself
- `src/app/pages/profile-page-v2.tsx` — profile page unchanged
- P465's edit mode logic — preserve exactly as-is
- Any `/live` session components
- DB schema, RLS, API endpoints

## Acceptance Criteria

- [ ] Context header is ≤52px tall on mobile (measured at 375px width)
- [ ] Context header shows point text (truncated) + "You agree" / "You disagree" / "You're unsure" chip (1st person)
- [ ] Context header shows no share button, no position buttons, no footer rows
- [ ] Tapping `[↗]` navigates to `/point/:id`; browser back returns to `/chat`
- [ ] Rating prompt appears as an AI message bubble (not a drawer) with 0–10 clickable buttons
- [ ] Clicking a button immediately sends the rating without requiring a separate send action
- [ ] Typing a number (0–10) in the input bar and pressing send produces the same outcome as clicking the button
- [ ] After 2nd iteration, "Save as-is →" escape hatch is visible below the rating buttons
- [ ] Drawer (`<Drawer>` import and render) is fully removed from StoryGuideChat.tsx
- [ ] P465 edit mode: entering `/chat?from=position&pointId=X` when the user already has a story shows the edit heading and pre-populates content (regression check)
- [ ] All existing StoryGuideChat tests pass
- [ ] Profile page points tab is visually unchanged

## Next Steps

Run `/ux features/p467_chat_context_header_inline_rating.md` — `ChatContextHeader` is a net-new component; mobile layout for 0–10 button row needs a formal design pass before coding.
