---
status: done
type: story
tags: []
rank: 125444.0
created_date: 2026-01-25
completed_at: '2026-02-09'
---

# P101: Cards UX Overhaul

## Summary

Consolidate all card UX improvements into one consistent system.

**Combines:** P98 (Mobile UX) + P100 (Button Consistency) + refinements

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary CTA placement | Bottom of card, always visible | Thumb-friendly, clear action |
| Primary CTA style | Full-width, blue, `py-2.5`, `rounded-lg` | Consistent, prominent |
| Secondary actions location | Footer row (same row as collapsible trigger) | Consistent across all cards |
| Secondary actions visibility | Always visible (mobile & desktop) | No hover tricks, simpler |
| Subcard actions | No icons, whole card clickable | Clean, less clutter |
| Position selection | Segmented control | It's a choice, not 3 buttons |
| Touch targets | 44px minimum | Mobile accessibility |
| Calibration display | Inline with label, no text legend | KISS, tooltips sufficient |

---

## Visual Spec

### StoryCard

```
┌─────────────────────────────────────────┐
│ ┌──┐                                    │
│ │🔵│ Jordan Taylor 👂3                  │  ← Clean header (no icons)
│ └──┘ PM at Acme · 2h ago                │
│                                         │
│      "When I switched to remote         │
│      work, my deep focus time           │
│      increased by 40%..."               │
│                                         │
│      ┌─────────────────┐                │
│      │  3 understood   │                │
│      └─────────────────┘                │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │   📻  Start a Clarity Session       │ │  ← Primary CTA (always visible)
│ └─────────────────────────────────────┘ │
│                                         │
│ ▸ Supports 2 points           [🔗][↗️] │  ← Icons in footer, always visible
└─────────────────────────────────────────┘
```

### PointCard

```
┌─────────────────────────────────────────┐
│ ┌──┐                                    │
│ │📌│ Point                              │  ← Clean header (no icons)
│ └──┘ Jordan · 👂3 · Agrees              │
│                                         │
│      "Remote work is more               │
│      productive than office work"       │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Disagree ▾ │  Unsure  │ Agree ▾ ✓  │ │  ← Segmented control
│ └─────────────────────────────────────┘ │
│                                         │
│ ▸ Supported by 2 stories      [🔗][↗️] │  ← Icons in footer, always visible
└─────────────────────────────────────────┘

No primary CTA - Points don't have sessions
```

### Position Segmented Control

```
Default state:
┌─────────────────────────────────────────┐
│ Disagree (0) ▾ │  Unsure (2)  │ Agree (2) ▾ │
└─────────────────────────────────────────┘

Selected (Agree):
┌─────────────────────────────────────────┐
│ Disagree (0) ▾ │  Unsure (2)  │████████████│
│                               │ Agree (3) ▾│ ← Blue fill
└─────────────────────────────────────────┘

Dropdown expanded (on Agree ▾):
┌─────────────────────────────────────────┐
│ Disagree (0) ▾ │  Unsure (2)  │ Agree (3) ▾│
└─────────────────────────────────────────┘
                                ┌───────────┐
                                │ Somewhat  │
                                │ Agree ✓   │
                                │ Strongly  │
                                └───────────┘
```

### Profile Calibration (Inline)

```
┌─────────────────────────────────────────────────────┐
│ 🔒 Calibration  ───────🎤─────👂────────            │
│                        ↑      ↑                     │
│                     speaker  listener               │
│                   (tap for tooltip)                 │
└─────────────────────────────────────────────────────┘
```

---

## Tasks

### Part A: Components (create/update)

#### A1. SegmentedControl Component ✅ DONE

**File:** `src/app/prototypes/linkedin-like/components/shared/PositionButton.tsx` (integrated into existing component)

```tsx
interface SegmentOption {
  value: string;
  label: string;
  count?: number;
  subOptions?: Array<{ value: string; label: string }>;
}

interface SegmentedControlProps {
  options: SegmentOption[];
  value: string | null;
  onChange: (value: string) => void;
  compact?: boolean;
}
```

**Behavior:**
- Connected segments (no gaps)
- Selected: `bg-blue-600 text-white`
- Unselected: `bg-white text-gray-700 border-gray-200`
- Dropdown arrow (▾) on segments with subOptions
- Radix Popover for dropdown
- 44px touch targets

#### A2. OverflowMenu Component ✅ DONE

Already created in P98.

### Part B: Card Updates

#### B1. Update PositionButtons → SegmentedControl ✅ DONE

**File:** `src/app/prototypes/linkedin-like/components/shared/PositionButton.tsx`

Implemented segmented control with:
- Disagree segment: strongly_disagree, disagree, somewhat_disagree (dropdown)
- Unsure segment: unsure (no sub-options)
- Agree segment: somewhat_agree, agree, strongly_agree (dropdown)

#### B2. StoryCard Mobile Layout ✅ DONE

Already updated in P98:
- Overflow menu in header (mobile)
- Primary CTA at bottom (always visible)
- Desktop hover unchanged

#### B3. PointCard Actions ✅ DONE

Already updated in P98:
- Removed "Start Session" button
- Only Share + Open remain

### Part C: Profile Page

#### C1. Calibration Inline ✅ DONE

Already updated in P98:
- Label + bar on same row
- No Under/Over labels
- Tooltips on tap/hover

#### C2. Bottom Nav Clearance ✅ DONE

Already updated in P98: `pb-20`

#### C3. Empty State CTA ✅ DONE

Already updated in P98: "Share your first story" button

---

## Implementation Status

| Task | Status | Notes |
|------|--------|-------|
| A1. SegmentedControl | ✅ Done | Integrated into PositionButton.tsx |
| A2. OverflowMenu | ✅ Done | P98 |
| B1. PositionButtons | ✅ Done | Uses segmented control with dropdowns |
| B2. StoryCard mobile | ✅ Done | P98 |
| B3. PointCard actions | ✅ Done | P98 |
| C1. Calibration inline | ✅ Done | P98 |
| C2. Bottom nav clearance | ✅ Done | P98 |
| C3. Empty state CTA | ✅ Done | P98 |

**All tasks complete.**

---

## Acceptance Criteria

- [x] SegmentedControl component works with sub-options
- [x] Position selection uses segmented control
- [x] 7-point scale accessible via dropdowns
- [x] All touch targets ≥ 44px
- [x] StoryCard: CTA at bottom, overflow menu on mobile
- [x] PointCard: No session button, inline Share/Open
- [x] Calibration: Inline, no redundant labels
- [x] Design system updated (done)

---

## Out of Scope

- Production app buttons (landing, auth, etc.)
- Events page cards
- IdeaCard pattern
- QuotedStory/QuotedPoint nested cards
