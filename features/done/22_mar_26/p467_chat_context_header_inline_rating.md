---
status: all-done
type: change-request
rank: 1000002.5
changes: p425
tags:
  - redesign
  - p425
  - chat
  - context-header
  - rating
created_date: 2026-03-02T00:00:00.000Z
completed_at: '2026-03-04'
flow: dev
uat_file: features/uat/p467.md
test_files:
  - e2e/p467-chat-context-header.spec.ts
  - e2e/a11y/p467-accessibility.spec.ts
---

# P467: /chat — slim context header + inline rating (remove drawer)

> **Redesign of:** [P425: AI-Guided Story Creation Core Loop](../21_feb_26/p425_ai_story_core_loop.md)
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
4. Remove the `Drawer` from `StoryGuideChat.tsx` entirely, including `ChatRatingContent` usage
5. The freeform comment textarea from `ChatRatingContent` is removed; written feedback goes through the main input bar
6. The "Keep refining" button from the current Drawer is removed — clicking a rating button or sending a typed rating IS the continue-iterating action; no separate "keep refining" affordance is needed
7. Rating prompt (phase `rating` / `iterating`) renders as an AI message bubble with 0–10 button row; implemented by adding `children?: React.ReactNode` prop to `ThreadMessage` (see Technical Architecture below)
8. Clicking a button sends the rating immediately; typing a number in input bar + send also works
9. "Save as-is →" escape hatch appears below buttons when `iterationCount >= 1` — this fires after the user has submitted one rating and the AI has responded with a revision (the second rating bubble). The counter increments in `handleSubmit`: from 0→1 when leaving `rating` phase, from 1→2 when leaving `iterating` phase. `iterationCount >= 1` is correct.
10. `RatingButtons` component (`src/app/components/partners/shared.tsx`): remove or override the `max-w-sm` cap when rendering inside a chat bubble — buttons must fill bubble width. Implement by adding an optional `fullWidth?: boolean` prop (when true, omit `max-w-sm`).
11. P465's edit mode (`existingStory` prop, `phase='visibility'` init) must continue working — do not touch that logic
12. Add `data-testid="edit-story-heading"` to the `ThreadMessage` that renders the "Edit your story" AI opening message in edit mode (the first message set in `useEffect` when `existingStory` is truthy)
13. `PointCardWithLinks` is not changed — only its use in `StoryGuideChat` is replaced

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
- `src/app/components/story-guide/ThreadMessage.tsx` — add `children?: React.ReactNode` prop
- `src/app/components/partners/shared.tsx` — add `fullWidth?: boolean` prop to `RatingButtons` (remove `max-w-sm` when true)
- `src/app/pages/story-guide-chat-page.tsx` — may need minor prop adjustments
- `e2e/p425-story-filing.spec.ts` and `e2e/a11y/p425-accessibility.spec.ts` — these use `data-testid="context-card"` which will be removed by this change; update those tests to use `chat-context-header` or remove the assertion if the test no longer applies

**Out of scope:**
- `src/app/components/social/point-card-with-links.tsx` — not changing the component itself
- `src/app/pages/profile-page-v2.tsx` — profile page unchanged
- P465's edit mode logic — preserve exactly as-is
- Any `/live` session components
- DB schema, RLS, API endpoints

## Technical Architecture

### `ThreadMessage` children prop contract

Add `children?: React.ReactNode` to `ThreadMessageProps`. Render rules:
- `children` renders **below** `content` inside the bubble, when provided
- `content` is the rating question text (e.g. "How well does this capture what you meant?") — it is **never empty** when `children` is provided
- `data-testid="rating-bubble"` attaches to the **outer `ThreadMessage` element** (the `article` tag) when `children` is present — pass it as a prop or derive from presence of children
- When buttons are frozen (rating already submitted), `children` still renders — the button row handles its own disabled state internally

### `RatingButtons` `fullWidth` prop

In `shared.tsx`, `RatingButtons` currently has `className="flex gap-1 w-full max-w-sm"`. Add `fullWidth?: boolean` prop: when `true`, render `className="flex gap-1 w-full"` (no `max-w-sm`). Default `false` preserves existing behavior everywhere else.

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

Run `/dev features/p467_chat_context_header_inline_rating.md`.

---

## UX

### 1. User Flow

#### 1a. ChatContextHeader — all states

**Entry:** User arrives at `/chat?from=position&pointId=X`. The page mounts with `contextPoint` and `contextProfileOwner` props populated.

```
1. Header renders immediately above the thread, sticky at top-16 (below nav).
   - Shows: [Pin icon] {point text, line-clamp-1}  [You agree | You disagree | You're unsure]  [↗]
   - If position is null/undefined → chip is hidden (see edge cases §3).

2. User reads the truncated point text.
   - If text fits in one line → no interaction needed, no expand affordance shown.
   - If text overflows → tap anywhere on the text area expands it.

3. Expanded state:
   - Point text expands to show full content (line-clamp removed).
   - Tap again (or tap outside) collapses back to line-clamp-1.

4. User taps [↗]:
   - Navigates to /point/:id in the same tab.
   - Browser back button returns to /chat with scroll position preserved.

5. Header stays sticky as user scrolls the thread — always visible.
```

#### 1b. Inline rating — click path

```
Entry: AI streaming finishes, phase transitions to 'rating'.
       A DraftCard message appears in thread, followed by an AI rating-prompt bubble
       containing the 0–10 button row.

1. Rating bubble appears inline in the thread after the DraftCard:
   ┌── 🤖 AI ─────────────────────────────────────────────────────┐
   │  How well does this capture what you meant?                   │
   │  [0][1][2][3][4][5][6][7][8][9][10]                          │
   │  not at all                              perfectly            │
   └───────────────────────────────────────────────────────────────┘

2. User taps any number button (e.g. [7]).
   - Button highlights immediately (selected state).
   - Rating is sent as a user message without requiring a separate Send tap.
   - User message "[7]" appears in thread.
   - Phase transitions to 'iterating', AI streaming begins.
   - Button row is no longer interactive (the message is already committed).

3. AI responds with revised draft (streaming → DraftCard + new rating bubble).
   Loop continues until user is satisfied.
```

#### 1c. Inline rating — type path

```
Entry: Same as 1b — phase is 'rating' or 'iterating'.
       Input bar is visible with placeholder "What's off? Or type 0–10..."

1. User taps input bar and types a number (e.g. "8") or a sentence
   (e.g. "8 — the opening feels too abstract").

2. User presses Enter (or taps Send button).
   - Input is validated: if pure number 0–10 → treated as rating.
   - If mixed text with leading number → sent as-is (AI interprets).
   - Message appears in thread as user bubble.
   - Phase transitions, AI streams next response.

3. After send, input bar clears and placeholder reverts to default for next phase.
```

#### 1d. Escape hatch — "Save as-is →"

```
Trigger: iterationCount >= 1 (after the 2nd iteration). The rating bubble shows
         an additional link below the 0–10 buttons.

1. User sees below the button row:
   Save as-is →

2. User taps "Save as-is →".
   - Phase transitions immediately to 'visibility'.
   - VisibilityAndSave component renders inline in thread (unchanged from P425).
   - Rating bubble remains visible in scroll history (the link is now inert).

3. User completes save flow normally via VisibilityAndSave.
```

---

### 2. Screen Designs

#### 2a. ChatContextHeader — normal state (text fits one line)

```
╭─ sticky, ~48px tall ─────────────────────────────────────────────╮
│ 📌  Avoiding hard conversations causes more damage than...  [You agree] [↗] │
╰───────────────────────────────────────────────────────────────────╯

Layout (horizontal):
  [Pin icon 16px] [point text flex-1 line-clamp-1 text-sm] [chip] [↗ icon button 44px tap target]

Chip: "You agree" / "You disagree" / "You're unsure"
  - Rounded pill, muted background, text-xs, no interactive affordance
  - Chip is read-only — no dropdown, no tap behavior

↗ button:
  - Lucide ExternalLink or ArrowUpRight icon, 16px
  - Minimum 44×44px tap target
  - aria-label="Open point detail"
```

#### 2b. ChatContextHeader — expanded state (after tap on text)

```
╭─ sticky, height auto ─────────────────────────────────────────────╮
│ 📌  Avoiding hard conversations causes more damage than            │
│     having them, even when they go badly. This applies            │
│     to co-founder pairs especially.     [You agree] [↗]           │
╰───────────────────────────────────────────────────────────────────╯

- line-clamp removed, text wraps naturally
- Header grows downward; thread scrolls down to compensate (no layout jump)
- Tap on text again → collapses back to normal state
- Chip and [↗] remain on the same last line or wrap below text depending on width
```

#### 2c. Rating message bubble — buttons visible (1st iteration, no escape hatch)

```
Thread at phase 'rating':

  ┌── DraftCard (v1) ─────────────────────────────────────────────┐
  │  Draft v1 · Draft · not saved                                  │
  │  "I feel paralyzed when disagreement surfaces. I look at..."   │
  └────────────────────────────────────────────────────────────────┘

  ┌── 🤖 AI ───────────────────────────────────────────────────────┐
  │  How well does this capture what you meant?                    │
  │                                                                │
  │  ┌─────────────────────────────────────────────────────────┐   │
  │  │  0   1   2   3   4   5   6   7   8   9   10             │   │
  │  └─────────────────────────────────────────────────────────┘   │
  │  not at all                                         perfectly  │
  └────────────────────────────────────────────────────────────────┘

  ┌── input bar ───────────────────────────────────────────────────┐
  │  What's off? Or type 0–10...                          [→ send] │
  └────────────────────────────────────────────────────────────────┘
```

#### 2d. Rating message bubble — after rating selected (collapsed)

```
After clicking [7]:

  ┌── 🤖 AI ───────────────────────────────────────────────────────┐
  │  How well does this capture what you meant?                    │
  │  [buttons row — visually inert / grayed, selected=7 shown]     │
  └────────────────────────────────────────────────────────────────┘

  ┌── You ─────────────────────────────────────────────────────────┐
  │  7                                                             │
  └────────────────────────────────────────────────────────────────┘

  🤖 AI streaming indicator...
```

Buttons remain visible in thread history but non-interactive. The selected value is visually highlighted in the frozen state (bg-blue-500).

#### 2e. Escape hatch state — after 2nd iteration (iterationCount >= 1)

```
  ┌── 🤖 AI ───────────────────────────────────────────────────────┐
  │  How well does this capture what you meant?                    │
  │                                                                │
  │  ┌─────────────────────────────────────────────────────────┐   │
  │  │  0   1   2   3   4   5   6   7   8   9   10             │   │
  │  └─────────────────────────────────────────────────────────┘   │
  │  not at all                                         perfectly  │
  │                                                                │
  │  Save as-is →                                                  │
  └────────────────────────────────────────────────────────────────┘
```

"Save as-is →" is a small text link (text-sm, muted, underline on hover) centered or left-aligned below the buttons. It is not a button — no border, no filled background. Tap target still meets 44px height by including generous vertical padding.

#### 2f. Input bar placeholder during rating phase

```
Phase 'rating' or 'iterating':
  placeholder = "What's off? Or type 0–10..."

All other phases:
  placeholder = existing behavior (unchanged)
```

---

### 3. Edge Cases

#### Long point text (truncation + expand)

- Normal state: `line-clamp-1` truncates with `…` ellipsis at end.
- If text is short enough to fit without truncation, no expand behavior is needed and no visual affordance is shown.
- If text is truncated: the text region is tappable (full row minus chip and ↗ button area). A subtle visual cue (e.g., cursor pointer on desktop) indicates it is expandable. No explicit "Read more" label is added to keep the header slim.
- Expanded state: header grows, no max-height cap — show full point text however long.
- Collapse: second tap on text region.

#### Position is null/undefined

- The chip is not rendered at all — no empty pill, no placeholder text.
- The header still shows: Pin icon + point text + [↗].
- This applies when `userPosition` is null (user has not staked a position) or when `contextProfileOwner` is not provided.
- The header still renders normally; the missing chip does not break the layout (text simply takes the space).

#### User types invalid rating (letters, >10, negative)

- Letters only (e.g. "abc"): treated as a comment message — sent as-is, AI interprets it as qualitative feedback and continues iterating.
- Number > 10 (e.g. "12"): sent as-is. AI is expected to handle gracefully (or prompt for valid rating). No client-side blocking.
- Negative number (e.g. "-1"): sent as-is, same treatment.
- Empty string: Send button remains disabled (no change from current behavior).
- Rationale: Client-side blocking of unusual inputs adds UI complexity for a rare case. The AI backend is the appropriate validation layer for this conversational input.

#### User types valid rating and hits send during rating phase

- Works identically to clicking a button. E.g., typing "7" + Enter sends "7" as a user message.
- The button row in the currently active rating bubble does not get a highlighted state — the user bypassed the buttons. This is acceptable: the historical rating bubble shows buttons in neutral state; the user message "7" in the thread communicates what was sent.
- The phase transitions normally to 'iterating' and AI streams.

#### Connection drops during AI streaming

- Existing abort/error handling in `StoryGuideChat.tsx` is unchanged (lines ~332–342).
- On error: `apiError` is set, phase resets to `'brain-dump'`, retry or "Write without AI →" link appears.
- The rating bubble that was about to appear does not render (streaming was aborted).
- The previously committed DraftCard remains visible in the thread — no data loss.

#### Escape hatch "Save as-is →" — what happens

- Tapping "Save as-is →" calls `handleEscapeHatchSave()`, which sets `phase = 'visibility'`.
- `VisibilityAndSave` renders inline in the thread at the bottom of the message list.
- The content saved is the latest DraftCard content (same as current escape hatch path — `polishedContent ?? latestDraftCard.content`).
- The rating bubble that contained the escape hatch link stays frozen in the thread history (buttons inert, "Save as-is →" link no longer triggers anything meaningful since phase has moved on).
- The input bar hides (consistent with `showInputBar` logic excluding `'visibility'` phase).

---

### 4. Accessibility

#### 0–10 button row

- Each button: `aria-label="Rate {n}"` (e.g. `aria-label="Rate 7"`).
- The group is wrapped in a `role="group"` with `aria-label="Rating scale from 0 to 10"`.
- Keyboard navigation: Tab moves focus to the first unselected button (or first button if none selected). Arrow keys (Left/Right) move within the group. Enter or Space selects and immediately sends.
- When a button is selected: `aria-pressed="true"` on that button; `aria-pressed="false"` on all others.
- After send (buttons frozen): add `aria-disabled="true"` and `tabIndex={-1}` to all buttons so focus moves past the row.
- Anchor labels at row ends ("not at all" / "perfectly") are `aria-hidden="true"` — decorative only.

#### Expanded point text

- The text region that triggers expand/collapse: `role="button"` when truncated, `aria-expanded={isExpanded}`, `aria-label="Point text — tap to expand"`.
- When not truncated: plain `<p>`, not interactive, no role needed.
- Keyboard: Enter or Space toggles when text region is focused.

#### Position chip

- `aria-label="Your position: You agree"` (full description, not just the visible text).
- Not interactive — no `role="button"`.
- If chip is absent (no position), nothing is rendered — no empty element.

#### Screen reader announcements

- When user taps a rating button and the rating is sent: an `aria-live="polite"` region announces "Rating {n} sent" so screen reader users hear confirmation without needing to read the full thread.
- When the escape hatch appears: no special announcement needed — it appears inline in the chat bubble which the user is already reading.
- When streaming starts: existing `ThreadMessage` with `isStreaming` prop renders `aria-hidden` dots (already implemented in `ThreadMessage.tsx`). The live region can announce "AI is thinking..." via a separate `aria-live` region (implementation detail for /dev to determine).

---

### 5. Responsive Design

#### Mobile (375px) — 0–10 button row

This is the highest-risk layout concern for this spec.

**Button count:** 11 buttons (0–10), each needing ≥44px tap target height.

**Width budget at 375px:**
- Chat bubble max-width: ~85% of screen = ~319px
- Bubble padding: ~px-4 per side = 32px total
- Available for buttons: ~287px
- 11 buttons with gap-1 (4px × 10 gaps): 40px consumed by gaps
- Remaining for button width: ~247px / 11 = ~22px per button

At 22px width per button, label "10" (two digits) clips. Solutions in order of preference:

**Option A — Single-digit labels, no internal padding (chosen approach):**
- Labels "0"–"9" and "10" shown as-is.
- Each button: `flex-1 min-w-0 py-2.5` (height satisfies 44px), minimal horizontal padding.
- "10" renders at font-size xs (12px) — fits in ~22px even at two digits.
- This matches the existing `RatingButtons` implementation in `partners/shared.tsx` (`flex gap-1 w-full max-w-sm`). The `max-w-sm` cap (384px) must be removed when embedded in the chat bubble — buttons should fill bubble width, not be capped.
- Verified fit: at 375px with the constraints above, xs font "10" fits without clipping.

**Option B — fallback if A clips visually:**
- Use `text-[10px]` for the button label (below standard `text-xs`).
- Or: use `gap-0.5` instead of `gap-1` to reclaim 5px.
- Only use if verified via browser screenshot that Option A clips.

**Tap target height:** `py-2.5` gives 20px top + 20px bottom + 16px line height = ~56px actual touch height. Meets ≥44px requirement.

**"not at all / perfectly" anchor labels:**
- Rendered as `<div class="flex justify-between text-xs text-muted-foreground">` below the button row, within the bubble.
- Do not affect button layout.

#### Mobile (375px) — ChatContextHeader

```
╭─ h-12 (48px) ─────────────────────────────────────────────────────╮
│ [📌 20px] [text flex-1 min-w-0 text-sm line-clamp-1] [chip] [↗] │
╰────────────────────────────────────────────────────────────────────╯
```

- Pin icon: 20px, flex-shrink-0.
- Point text: `flex-1 min-w-0 truncate` or `line-clamp-1`.
- Chip ("You agree"): `whitespace-nowrap text-xs`. On very long points the chip stays, text truncates.
- [↗]: 44×44px tap target minimum, flex-shrink-0.
- Total row at 375px: 20 (icon) + 8 (gap) + text + 8 (gap) + chip + 8 (gap) + 44 (tap) = chip + text share remaining ~289px, text truncates first.

**Scroll behavior:** The header is `sticky top-16 z-10` — it stays pinned below the app nav bar as the thread scrolls. No height change on scroll (only expand/collapse on tap).

#### Desktop (768px+)

- Button row has more room; 11 buttons spread naturally, no layout concern.
- ChatContextHeader: text is less likely to truncate; expand behavior still available.
- No layout changes from mobile — same component, responsive via flex.

---

### 6. Component Analysis

Scanned: `src/app/components/story-guide/` and `src/app/components/social/`

| Element | Classification | File / Notes | Decision needed? |
|---------|---------------|--------------|-----------------|
| `ChatContextHeader` | **New** | `src/app/components/story-guide/ChatContextHeader.tsx` (create) | No — spec is clear: new file, not PointCardWithLinks |
| Position chip ("You agree" text) | **New** | Inline in `ChatContextHeader`. Not `PositionBadge` (which is 3rd-person). Simple `<span>` with conditional text from `userPosition`. | No |
| 0–10 rating button row | **Extend** | `RatingButtons` in `src/app/components/partners/shared.tsx` — reuse logic, but must remove `max-w-sm` cap for inline-bubble use. Consider extracting a `max-w` prop or wrapping with `w-full`. | Minor: confirm whether to add a `maxWidth` prop to `RatingButtons` or just override with a wrapper `div`. Recommend adding prop to keep it clean. |
| Rating message bubble wrapper | **Extend** | `ThreadMessage` in `src/app/components/story-guide/ThreadMessage.tsx` — currently renders `content: string`. For the rating phase, the bubble needs embedded JSX (button row + labels). Options: (A) add `children?: React.ReactNode` prop to `ThreadMessage`; (B) create a `RatingThreadMessage` variant. Recommend (A) — simpler, keeps ThreadMessage as the single bubble component. | Yes — confirm: add `children` prop to `ThreadMessage`, or new variant? Recommend `children` prop. |
| Escape hatch link ("Save as-is →") | **New** | Inline inside the rating bubble content (not a separate component). Renders when `iterationCount >= 1`. Replaces the current escape-hatch buttons in `ChatRatingContent` (which had "Save at this version" + "Keep refining"). | No — straightforward inline element |
| `ChatRatingContent` | **Retire from this surface** | `src/app/components/partners/shared.tsx` — currently used inside the Drawer. After this change, the Drawer is removed. `ChatRatingContent` stays in the codebase (may be used elsewhere or in partners surface), but `StoryGuideChat` no longer imports it for the rating phase. | No — keep the component, stop using it in StoryGuideChat |
| Input bar placeholder (phase-dependent) | **Extend** | `getPlaceholder()` helper in `StoryGuideChat.tsx` (line 113). Currently returns `'0–10, or describe what\'s off...'` for rating/iterating phases. Change to `"What's off? Or type 0–10..."`. Single-line change. | No |
| `PointCardWithLinks` | **Remove from this surface** | `src/app/components/social/point-card-with-links.tsx` — not modified. Its import and render in `StoryGuideChat.tsx` is removed and replaced by `ChatContextHeader`. | No |
| `Drawer` / `DrawerContent` | **Remove** | `@/components/ui/drawer` — import and all render code removed from `StoryGuideChat.tsx`. | No |
| `DraftCard` | **Reuse as-is** | `src/app/components/story-guide/DraftCard.tsx` — unchanged. Still renders after each AI draft response. | No |
| `VisibilityAndSave` | **Reuse as-is** | `src/app/components/story-guide/VisibilityAndSave.tsx` — unchanged. Renders when phase = 'visibility'. | No |
| `SavedStoryChatCard` | **Reuse as-is** | `src/app/components/story-guide/SavedStoryChatCard.tsx` — unchanged. | No |

**Key decision for /dev:** Should `ThreadMessage` receive a `children?: React.ReactNode` prop to support the rating button row inline in the AI bubble, or should a new `RatingThreadMessage` component be created? Recommendation: add `children` prop to `ThreadMessage`. It is a clean, minimal extension — `children` renders below `content` when provided, keeping the single-bubble mental model intact. The `content` string can be empty (or the rating question text) and `children` contains the button row JSX.

---

## Test Coverage Strategy

**Approach:** E2E + accessibility tests only. No unit tests or integration tests (pure UI change, no DB/API changes).

### Coverage by layer

| Layer | Files | Rationale |
|-------|-------|-----------|
| E2E — main flow | `e2e/p467-chat-context-header.spec.ts` | ChatContextHeader rendering, inline rating flow (click + type paths), escape hatch, Drawer removal, P465 regression, no-position edge case |
| E2E — smoke | `e2e/p467-smoke.spec.ts` | /chat page loads without Drawer, context header present, no static asset failures, auth redirect |
| Accessibility | `e2e/a11y/p467-accessibility.spec.ts` | 0–10 button row keyboard nav, aria-labels, aria-pressed, aria-disabled after send, position chip aria-label, aria-live announcement, decorative anchor labels |
| UAT — manual | `features/uat/p467.md` | Visual verification checklist for all AC items; rating flow (click + type paths); escape hatch; P465 edit mode; profile page regression |

### test-id contract for /dev

The test files rely on these `data-testid` attributes that `/dev` must implement:

| `data-testid` | Component | Notes |
|--------------|-----------|-------|
| `chat-context-header` | `ChatContextHeader` | Root element of new component |
| `position-chip` | Inline span in `ChatContextHeader` | The "You agree" / "You disagree" / "You're unsure" pill |
| `point-text-toggle` | Text region in `ChatContextHeader` | Present only when text is truncated; has `role="button"` and `aria-expanded` |
| `rating-bubble-{id}` | `ThreadMessage` wrapping the rating prompt | Per-message unique testid (e.g. `rating-bubble-abc123`). Use `[data-testid^="rating-bubble-"]` with `.last()` in E2E to target the active bubble. Changed from `rating-bubble` (code review fix: avoid duplicate testids across multiple rating bubbles). |
| `thread-message-ai` | `ThreadMessage` (role=ai) | Already exists in current `ThreadMessage.tsx` |
| `thread-message-user` | `ThreadMessage` (role=user) | Already exists in current `ThreadMessage.tsx` |
| `story-guide-chat` | `StoryGuideChat` root | Already exists |
| `story-guide-input` | Input bar textarea | Already exists |
| `edit-story-heading` | Edit mode heading (P465) | Existing or new — needed for regression test |

### Coverage gaps (accepted)

- Rating click/type paths: tests use `test.skip()` stubs when not in rating phase — full flow requires AI edge function running and returning a draft. Mark as TODO for post-implementation verification via `/verify`.
- Escape hatch iteration count: cannot assert `iterationCount >= 1` without completing 2 full AI loops in test — accepted as manual-only via UAT.
- "Save as-is →" triggers save flow: covered in UAT manual checklist only.
