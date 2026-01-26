# P97: Sifter Prototype (AI-powered /live)

**Status:** Ready to Build
**Created:** 2026-01-25
**Parent:** [P58 Sifter MVP](./p58_sifter_mvp.md)
**Location:** `/prototype/linkedin-like/sift`

---

## One-Sentence Description

A prototype of `/live` where the partner is AI — user dumps thoughts, AI synthesizes a Story, user rates "do I feel understood?", iterates to 10/10.

---

## Core Insight

> Sifter = /live session where the other side is AI

| /live (human partner) | Sifter (AI partner) |
|-----------------------|---------------------|
| "Did you understand me?" | AI shows synthesized Story |
| Partner rates confidence | AI offers options A/B/C/D |
| Journey to 10/10 | Same journey to 10/10 |
| Explain-back rounds | Option selection rounds |

---

## Scope: Prototype Only

| In Scope | Out of Scope |
|----------|--------------|
| Entry screen (text input) | Real AI/LLM calls |
| Dashboard (show mock Story + Points) | Database persistence |
| Story review flow (rate → options → 10/10) | Points review flow |
| Mock/canned AI responses | Voice input |
| Reuse Live.tsx patterns | Meeting codes, partner matching |

---

## User Flow

```
1. ENTRY
   └── User types brain dump
   └── Taps "Sift my thoughts"

2. DASHBOARD
   └── Shows: "I found 1 Story and 2 Points"
   └── Story card (blue border) with "Review" button
   └── Point cards (gray) - display only for prototype
   └── "Publish all as-is" secondary option

3. STORY REVIEW (reuses Live.tsx rating pattern)
   └── AI "says": [synthesized story text]
   └── User rates 0-10: "Do you feel understood?"
   │
   ├── If <10:
   │   └── AI: "Here's what I'm uncertain about..."
   │   └── Shows options: A / B / C / Other
   │   └── User picks option
   │   └── AI shows refined Story
   │   └── Loop (journey visualization shows progress)
   │
   └── If 10:
       └── Celebration (reuse 'perfect' phase from Live)
       └── "Your Story is ready"

4. DONE
   └── Summary: "1 Story saved (10/10)"
   └── Return to prototype
```

---

## Components

### Reuse from Live.tsx

| Component | Use as-is | Adapt |
|-----------|-----------|-------|
| `RatingButtons` | ✅ | - |
| `RatingDisplay` (dots) | ✅ | - |
| `JourneyToUnderstanding` | - | ✅ Simplify to single-column (no partner) |
| `ActionArea` | ✅ | - |
| `PrimaryButton`, `OutlineButton`, `GhostButton` | ✅ | - |
| `PrototypeLayout` | ✅ | - |
| Phase state machine pattern | - | ✅ New phases |

### New Components

| Component | Location | Lines (est.) |
|-----------|----------|--------------|
| `Sift.tsx` | `linkedin-like/components/` | ~250 |
| `OptionPicker` | inline in Sift.tsx | ~30 |

---

## State Machine

```typescript
type SiftPhase =
  | 'entry'        // Brain dump input
  | 'dashboard'    // Show extracted Story + Points
  | 'story-review' // Rating + refinement loop
  | 'done';        // Celebration + summary

interface SiftState {
  phase: SiftPhase;
  rawInput: string;
  currentRating: number | null;
  ratingHistory: number[];      // [7, 8, 9, 10] — journey visualization
  refinementRound: number;      // Which mock refinement to show
  storyText: string;            // Current (possibly refined) story text
}
```

---

## Mock Data

```typescript
const MOCK_SIFT_RESULT = {
  story: {
    versions: [
      {
        text: "I commuted 2 hours daily and felt exhausted.",
        aiUncertainty: "I'm uncertain whether the core issue was physical exhaustion or guilt about missing family time.",
        options: [
          "A. It was mainly about guilt for not being present",
          "B. The exhaustion was physical, not emotional",
          "C. There's a work culture element I missed",
          "Other — tell me"
        ]
      },
      {
        text: "I commuted 2 hours daily. The exhaustion was physical, but the real pain was guilt about missing my kids.",
        aiUncertainty: "Did I capture the health impact correctly?",
        options: [
          "A. Yes, add that my health suffered",
          "B. The phrasing could be stronger",
          "Other — tell me"
        ]
      },
      {
        text: "I commuted 2 hours daily. I was exhausted, couldn't see my kids, and my health suffered. The guilt was overwhelming.",
        aiUncertainty: null, // 10/10 version
        options: []
      }
    ]
  },
  points: [
    { text: "Remote work improves wellbeing for knowledge workers" },
    { text: "Long commutes negatively impact family life and health" }
  ]
};
```

---

## UI Specs

### Entry Screen

```
┌─────────────────────────────────┐
│  CLARITY SIFTER                 │
├─────────────────────────────────┤
│                                 │
│     Dump your thoughts.         │
│     I'll help untangle them.    │
│                                 │
│  ┌───────────────────────────┐  │
│  │ e.g., "I've been thinking │  │
│  │ about remote work..."     │  │
│  │                           │  │
│  └───────────────────────────┘  │
│                                 │
│     [ Sift my thoughts ]        │  ← Blue CTA
│                                 │
└─────────────────────────────────┘
```

### Dashboard Screen

```
┌─────────────────────────────────┐
│  ← Back           REVIEW        │
├─────────────────────────────────┤
│                                 │
│  I found these in your thoughts │
│                                 │
│  STORY                          │
│  ┌───────────────────────────┐  │
│  │ 🔵 "I commuted 2 hours    │  │
│  │    daily and felt..."     │  │
│  │                           │  │
│  │     [ Review now ]        │  │  ← Blue CTA
│  └───────────────────────────┘  │
│                                 │
│  POINTS (2)                     │
│  ┌───────────────────────────┐  │
│  │ "Remote work improves..." │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │ "Long commutes negative..." │ │
│  └───────────────────────────┘  │
│                                 │
│        — or —                   │
│  [ Skip review, publish as-is ] │  ← Gray secondary
│                                 │
└─────────────────────────────────┘
```

### Story Review Screen (reuses Live patterns)

```
┌─────────────────────────────────┐
│  ← Back         STORY REVIEW    │
├─────────────────────────────────┤
│                                 │
│  ┌───────────────────────────┐  │
│  │ STORY                     │  │
│  │ "I commuted 2 hours       │  │
│  │  daily. I was exhausted,  │  │
│  │  couldn't see my kids..." │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ Your journey to feel      │  │
│  │ understood                │  │
│  │ ─────────────────────────│  │
│  │ 0  ●●●●●●●○○○  7          │  │
│  │ 1  ●●●●●●●●○○  8          │  │
│  │ 2  ●●●●●●●●●○  9  ← now   │  │
│  └───────────────────────────┘  │
│                                 │
│  Do you feel understood?        │
│  [0][1][2][3][4][5][6][7][8][9][10]│
│                                 │
│        [ Submit ]               │
│                                 │
└─────────────────────────────────┘
```

### Options Screen (after rating <10)

```
┌─────────────────────────────────┐
│  You rated 8/10                 │
│                                 │
│  Here's what I'm uncertain about│
│  ─────────────────────────────  │
│  "Did I capture the health      │
│   impact correctly?"            │
│                                 │
│  What's closer?                 │
│                                 │
│  ┌───────────────────────────┐  │
│  │ A. Yes, add that my       │  │  ← Blue if selected
│  │    health suffered        │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │ B. The phrasing could     │  │
│  │    be stronger            │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │ Other — tell me           │  │
│  └───────────────────────────┘  │
│                                 │
│        [ Continue ]             │
│                                 │
└─────────────────────────────────┘
```

### Done Screen (reuses 'perfect' phase)

```
┌─────────────────────────────────┐
│                                 │
│            🎉                   │
│                                 │
│   AI understood you perfectly!  │
│                                 │
│   Achieved in 3 rounds          │
│                                 │
│  ┌───────────────────────────┐  │
│  │ Your journey              │  │
│  │ 0  ●●●●●●●○○○  7          │  │
│  │ 1  ●●●●●●●●○○  8          │  │
│  │ 2  ●●●●●●●●●○  9          │  │
│  │ 3  ●●●●●●●●●●  10 ✓       │  │
│  └───────────────────────────┘  │
│                                 │
│  Your Story is saved.           │
│  2 Points extracted (unreviewed)│
│                                 │
│     [ Back to prototype ]       │
│                                 │
└─────────────────────────────────┘
```

---

## Route Setup

```typescript
// In linkedin-like/index.tsx, add:
import { Sift } from './components/Sift';

// Add route:
<Route path="sift" element={<Sift />} />
```

---

## Entry Points

1. **Direct URL**: `/prototype/linkedin-like/sift`
2. **Future**: Could replace "Start Session" in BottomNav (but keep separate for now)

---

## Success Criteria

| Criteria | Target |
|----------|--------|
| Flow completable | Entry → Dashboard → Story 10/10 → Done |
| Reuses Live patterns | RatingButtons, RatingDisplay, JourneyToUnderstanding |
| Mock data only | No AI calls, no database |
| Mobile-friendly | Works on 375px width |

---

## Implementation Order

1. **Create `Sift.tsx`** — copy Live.tsx structure, strip partner logic
2. **Add Entry phase** — text input + button
3. **Add Dashboard phase** — show mock Story + Points
4. **Add Story Review phase** — rating + options loop
5. **Add Done phase** — celebration
6. **Add route** — wire up in index.tsx
7. **Test flow** — entry → 10/10 → done

---

## Related Documents

- [P58 Sifter MVP](./p58_sifter_mvp.md) — full spec (this is subset)
- [Live.tsx](../src/app/prototypes/linkedin-like/components/Live.tsx) — patterns to reuse
- [Wireframe v8](../docs/bmad/diagrams/sifter-mvp-wireframe-v8.excalidraw) — visual reference
