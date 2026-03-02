---
status: all-done
type: feature
rank: 0.5
workstream: E1
created_date: 2026-02-27T00:00:00.000Z
tags: []
flow: dev
uat_file: features/uat/p457.md
test_files:
  - src/tests/p457-chat-empty-state.test.ts
  - e2e/p457-chat-empty-state.spec.ts
locked_at: '2026-03-02T08:34:59.769Z'
---

# P457: Chat Empty State Redesign

## Problem

The `/chat` page loads blank — no empty state, no visual hierarchy. The input bar at the bottom is nearly invisible (low-contrast border, gray send button). Users have no immediate sense of what to do or what this screen is for.

## Solution

**Winning design (Flow 19 hybrid, scored 8.80/10):** The AI message IS the empty state — no separate welcome screen, no layout mode switch.

### Empty state
- AI opening bubble renders unconditionally (not just for position-triggered flow)
- Input is vertically centered in remaining space below the bubble
- Send button is always `bg-blue-600` (never muted/gray — clicking with empty input is a silent no-op)
- Placeholder: **"Tell me so I understand you"**

### Active chat (after first send)
- Input snaps to sticky bottom (`phase !== 'idle'`)
- Everything else unchanged — rating drawer, draft cards, visibility panel, all phases

## UX Design

**Desktop — empty state:**
```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  ✦  What's your experience behind this?            │  │
│  │     Brain-dump it — messy is fine.                 │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────── [→] ─┐   │
│  │  Tell me so I understand you                      │   │
│  └───────────────────────────────────────────────────┘   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Mobile — empty state (375px):**
```
┌──────────────────────────┐
│                          │
│  ┌────────────────────┐  │
│  │  ✦  What's your   │  │
│  │     experience...  │  │
│  │     Brain-dump it  │  │
│  │     — messy is     │  │
│  │     fine.          │  │
│  └────────────────────┘  │
│                          │
│  ┌──────────────── [→] ┐ │
│  │ Tell me so I...    │ │
│  └────────────────────┘ │
└──────────────────────────┘
```

**Active chat (both breakpoints):**
- AI bubble + user messages in scrollable thread
- Input sticky at bottom, placeholder changes per phase
- Send button always blue

## Technical Notes

**File:** `src/app/components/story-guide/StoryGuideChat.tsx`

**Three targeted changes:**

1. **Opening AI message — unconditional**
   - Currently: fires only when `pointId && pointText && messages.length === 0`
   - Change to: fires when `messages.length === 0` regardless of `pointId`
   - Message text: `"What's your experience behind this?\nBrain-dump it — messy is fine."`
   - Sets `phase` to `'brain-dump'`

2. **Send button — always blue**
   - Remove the `!sendDisabled` condition from button className
   - Always apply: `bg-blue-600 text-white hover:bg-blue-700`
   - Keep the `disabled={sendDisabled}` prop — clicking with empty input still no-ops
   - The `cursor-not-allowed` class on the button can be removed entirely

3. **Input centering (idle) vs sticky bottom (active)**
   - Wrap input bar in conditional positioning:
     - `phase === 'idle'`: `flex items-center justify-center flex-1` (vertically centered)
     - `phase !== 'idle'` (and showInputBar): `sticky bottom-0` (existing behavior)
   - Or: render two separate wrappers conditionally

4. **Placeholder text**
   - `getPlaceholder('idle')` and `getPlaceholder('brain-dump')` → `"Tell me so I understand you"`

## Acceptance Criteria

- [ ] `/chat` loads with AI opening bubble visible — not blank
- [ ] Send button is blue on page load (not gray)
- [ ] Input is vertically centered in empty state on desktop and mobile
- [ ] After first message sent, input snaps to sticky bottom
- [ ] Placeholder reads "Tell me so I understand you" in idle/brain-dump phases
- [ ] Position-triggered flow (`?from=position&pointId=XYZ`) still works correctly
- [ ] Rating drawer, draft cards, visibility panel — all unchanged
- [ ] No console errors on `/chat` load

## Testing

- Unit: empty state renders AI bubble when `messages.length === 0` with no props
- Unit: send button has `bg-blue-600` class in both idle and active phases
- Unit: input wrapper has centering classes when `phase === 'idle'`
- Unit: input wrapper has sticky classes when `phase !== 'idle'`
- Unit: placeholder is "Tell me so I understand you" for idle/brain-dump phases
- E2E: `/chat` loads → AI bubble visible → type message → send → input moves to bottom
