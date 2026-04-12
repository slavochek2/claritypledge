---
status: all-done
type: feature
rank: 62741.5
workstream: live
created_date: 2026-02-27T00:00:00.000Z
tags:
  - live-session
  - mobile
  - layout
  - story-card
  - journey-card
flow: dev
superseded_by: p468
uat_file: features/uat/p455.md
test_files:
  - e2e/p455-live-mobile-layout.spec.ts
  - e2e/a11y/p455-accessibility.spec.ts
locked_at: '2026-03-02T14:39:39.656Z'
---

# P455: Live Mobile Layout — Compact Story + Reorder

## Problem

On mobile, when a story is selected in the live session, the story card + journey card stack pushes the primary CTAs (Check button, ActionArea with icon/title, WaitingIndicator) below the fold. Users must scroll to find the action they need to take.

Confirmed from screenshots: `Desktop/1.jpg` – `Desktop/4.jpg` (session at 17:58).

## Solution

Two changes applied consistently across all affected screens:

1. **Reorder elements** — Story card first (context), then CTAs/ActionArea, then Journey card (history)
2. **Compact story card** — `line-clamp-2` on story text body; card stays small by default, expands on tap via existing Show more toggle

### New element order (when story selected)

```
┌─ Story card (compact) ─────┐  ← context, always at top
│ 👤 Author · timestamp  ›   │
│ "First two lines of        │
│  story text..."            │  line-clamp-2
└────────────────────────────┘

[Primary CTA button]           ← Check / WaitingIndicator / ActionArea icon+title
 Secondary action (Speak freely) ← right below primary

┌─ Journey card ─────────────┐  ← history, moved to bottom
│ Gosha's confidence: 7      │
│ Your belief:        7      │
└────────────────────────────┘

─ Session history rows ─
```

### Screens affected (6 states in IdleScreen + UnderstandingScreen)

| Screen | Current problem | Fix |
|--------|----------------|-----|
| Idle — story, owner, no history | Story pushes Check below fold | Reorder |
| Idle — story, owner, has history | Journey + Story both push Check off | Reorder |
| Idle — story, reviewer | Story + Journey, no CTA below | Reorder |
| Idle — waitingForPartnerToContinue | Journey + Story push WaitingIndicator | Reorder |
| UnderstandingScreen — explain-back, checker | Journey + Story push 👂 ActionArea off | Reorder |
| RatingScreen | Journey (if history) + Story before rating drawer | Reorder |

### Screens NOT affected (no story card or CTA already visible)
- Idle — free-form (no story, centered layout)
- UnderstandingScreen: gap-revealed, calibrated, perfect, results (story not the focus)

## Technical Notes

**Files to change:**
- `src/app/components/partners/live-mode-view.tsx` — IdleScreen JSX (~line 970–1070) + UnderstandingScreen explain-back checker (~line 2107–2135) + RatingScreen (~line 1238–1274)
- `src/app/components/partners/live-story-card-expanded.tsx` — add `line-clamp-2` to story text paragraph (~line 114)

**Key constraint:** `line-clamp-2` must only apply when card is in collapsed state (default). When `storyExpanded` is true (Show more clicked), full text must show. Check existing `storyExpanded` state — apply class conditionally: `className={storyExpanded ? '' : 'line-clamp-2'}`.

**Speak freely:** Already positioned after ActionArea in JSX. With reorder it naturally sits right below the CTA — no change needed to Speak freely itself.

**Journey card `min-h-[180px]`:** Intentional (prevents layout shift as rounds are added). Keep as-is — just moving it lower.

## UX Design

```
PROPOSED — all affected screens (story selected)
─────────────────────────────────────────────────
Header: [C] Clarity Pledge    [Leave]
        🔒 Private session

┌─ Story card (compact) ─────────────────────┐
│ 👤 Vyacheslav Ladischenski · 1d  ›         │
│ "She's someone I've known for years. We    │  ← line-clamp-2
│  were on a call trying to work it out..."  │
└────────────────────────────────────────────┘

  [Primary CTA]                ← Check / ActionArea(👂 icon + title) / WaitingIndicator
  Secondary (Speak freely)     ← immediately below, same as today

┌─ Journey card ─────────────────────────────┐
│ Gosha's journey to understand you          │
│ Gosha's confidence: ●●●●●●●○○○  7         │
│ Your belief:        ●●●●●●●○○○  7         │
└────────────────────────────────────────────┘

  ─ Session history ─
```

## Acceptance Criteria

- [ ] Story card appears above CTAs in all 6 affected screens
- [ ] Story text truncated to 2 lines when collapsed; full text visible after "Show more"
- [ ] Journey card appears below CTAs in all affected screens
- [ ] "Speak freely" button remains immediately below primary CTA
- [ ] ActionArea icon (👂) + title + WaitingIndicator visible without scrolling on 375px width (iPhone SE)
- [ ] Free-form idle screen (no story) unchanged
- [ ] UnderstandingScreen non-affected phases (gap-revealed, perfect, results) unchanged
- [ ] Existing e2e tests pass

## Testing

Visual verify on 375px mobile viewport after implementation:
- Start a live session with a story selected
- Confirm Check button visible without scrolling (owner view)
- Confirm Speak freely is immediately below
- Confirm journey card is below CTAs
- Tap "Show more" — confirm full story text appears
