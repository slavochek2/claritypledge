# P98: Sifter Prototype (AI-powered /live)

**Status:** Ready to Build
**Created:** 2026-01-26
**Parent:** [P58 Sifter MVP](./done/p58_sifter_mvp.md) (archived)
**Location:** `/prototype/linkedin-like/sift`

---

## One-Sentence Description

Sifter-first flow: user dumps thoughts → AI extracts Story/Points → refine to 10/10 → optionally invite someone to verify via /live.

---

## Core Model: Sifter-first, /live optional

```
User has thought
      │
      ▼
┌─────────────┐
│   SIFT IT   │  ← Entry: type (voice later)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Processing  │  ← 2-3 sec fake loading
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Story 10/10 │  ← Refinement until understood
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│ Done: "Invite to verify" or     │
│ "Back to profile" → My Events   │
└─────────────────────────────────┘
```

**Why this model:**
1. Sifting is ALWAYS valuable (even solo)
2. /live becomes verification of SIFTED content (not raw thoughts)
3. Clear user journey: clarify → share → verify
4. Existing Stories/Points from profile = already sifted, skip to invite

---

## Scope: Prototype Only

| In Scope | Out of Scope |
|----------|--------------|
| Entry screen (text input) | Real AI/LLM calls |
| Processing screen (fake loading) | Database persistence |
| Story review with text evolution | Points review flow |
| Mock/canned AI responses | Voice input (future) |
| Reuse Live.tsx patterns | Meeting codes |
| "Invite to verify" CTA | Full /live integration |
| "Back to profile" → My Events | Dashboard screen |

---

## Key UX Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Journey position | **Above** current story | Progress-first, then "rate this" |
| Text evolution | **Show versions** (collapsed) | Users see HOW it improved, not just ratings |
| "Other" option | **Direct input field** | Fewer clicks, KISS |
| Existing profile content | **Already sifted** | Skip to invite, no re-sifting |

---

## User Flow

```
1. ENTRY
   └── User types brain dump
   └── Taps "Sift my thoughts"
   └── (Disable button if input empty)

2. PROCESSING (2-3 sec fake loading)
   └── "Sifting your thoughts..."
   └── ✓ Finding your Stories...
   └── ✓ Finding your Points...
   └── ✓ Hardening claims...
   └── ● Preparing overview...

3. STORY REVIEW
   ┌─────────────────────────────────┐
   │  JOURNEY (above, collapsed)     │
   │  ───────────────────────────    │
   │  0  "I commuted 2 hours..."  7  │  ← tap to expand text
   │  1  "...guilt about kids..." 8  │
   │  2  ← rating now                │
   └─────────────────────────────────┘
   ┌─────────────────────────────────┐
   │  CURRENT VERSION                │
   │  "I commuted 2 hours daily.     │
   │   The exhaustion was physical,  │
   │   but the real pain was guilt   │
   │   about missing my kids."       │
   └─────────────────────────────────┘

   Do you feel understood? [0-10]

   If <10 → show options + input:
   ┌─────────────────────────────────┐
   │  AI: "Here's what I'm unsure:"  │
   │  ───────────────────────────    │
   │  A. Guilt about missing time    │
   │  B. Physical exhaustion         │
   │  C. Work culture element        │
   │  ┌───────────────────────────┐  │
   │  │ Tell me what's off...     │  │  ← direct input
   │  └───────────────────────────┘  │
   └─────────────────────────────────┘

4. DONE (10/10)
   └── Celebration 🎉
   └── Journey summary (all versions)
   └── [ Invite someone to verify → ] ← starts /live
   └── [ Back to profile ] ← returns to /profile → My Events
```

---

## Components

### Reuse from Live.tsx

| Component | Adapt? |
|-----------|--------|
| `RatingButtons` (0-10) | As-is |
| `RatingDisplay` (dots) | As-is |
| `JourneyToUnderstanding` | **Adapt**: single column, show text versions |
| `ActionArea`, buttons | As-is |
| `PrototypeLayout` | As-is |
| Phase state machine | **Adapt**: new phases |

### New Components

| Component | Lines (est.) |
|-----------|--------------|
| `Sift.tsx` | ~300 |
| `JourneyWithVersions` (inline) | ~50 |
| `OptionPickerWithInput` (inline) | ~40 |

---

## State Machine

```typescript
type SiftPhase = 'entry' | 'processing' | 'story-review' | 'done';

interface StoryVersion {
  text: string;
  rating: number | null;  // null = current (not yet rated)
}

interface SiftState {
  phase: SiftPhase;
  rawInput: string;
  storyVersions: StoryVersion[];  // [v0, v1, v2...] — text evolves
  currentRating: number | null;
  selectedOption: string | null;
  customInput: string;
  points: string[];  // display only
}
```

---

## Mock Data

```typescript
const MOCK_REFINEMENTS = [
  {
    // After initial sift (user will rate this)
    text: "I commuted 2 hours daily and felt exhausted.",
    aiUncertainty: "I'm uncertain whether the core issue was physical exhaustion or guilt about missing family time.",
    options: [
      "A. It was mainly about guilt for not being present",
      "B. The exhaustion was physical, not emotional",
      "C. There's a work culture element I missed",
    ]
  },
  {
    // After first refinement
    text: "I commuted 2 hours daily. The exhaustion was physical, but the real pain was guilt about missing my kids.",
    aiUncertainty: "Did I capture the health impact correctly?",
    options: [
      "A. Yes, add that my health suffered",
      "B. The phrasing could be stronger",
    ]
  },
  {
    // Final version (when user rates 10)
    text: "I commuted 2 hours daily. I was exhausted, couldn't see my kids, and my health suffered. The guilt was overwhelming.",
    aiUncertainty: null,
    options: []
  }
];

const MOCK_POINTS = [
  "Remote work improves wellbeing for knowledge workers",
  "Long commutes negatively impact family life and health"
];
```

---

## UI Wireframes

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
│  │ about remote work. I used │  │
│  │ to commute 2 hours..."    │  │
│  │                           │  │
│  │                           │  │
│  └───────────────────────────┘  │
│                                 │
│     [ Sift my thoughts ]        │  ← Blue CTA
│                                 │
└─────────────────────────────────┘
```

### Processing Screen

```
┌─────────────────────────────────┐
│  CLARITY SIFTER                 │
├─────────────────────────────────┤
│                                 │
│     Sifting your thoughts...    │
│                                 │
│     ✓ Finding your Stories...   │
│     ✓ Finding your Points...    │
│     ✓ Hardening claims...       │
│     ● Preparing overview...     │
│                                 │
│     [pulse animation]           │
│                                 │
└─────────────────────────────────┘
```

### Story Review Screen

```
┌─────────────────────────────────┐
│  ← Back       STORY REVIEW      │
├─────────────────────────────────┤
│                                 │
│  ┌───────────────────────────┐  │
│  │ Your journey to feel      │  │
│  │ understood                │  │
│  │ ─────────────────────────│  │
│  │ 0 ●●●●●●●○○○ 7            │  │
│  │   "I commuted 2 hours..." │  │  ← collapsed, tap to expand
│  │ 1 ●●●●●●●●○○ 8            │  │
│  │   "...guilt about kids.." │  │
│  │ 2 ← rating now            │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ CURRENT VERSION           │  │
│  │ "I commuted 2 hours       │  │
│  │  daily. The exhaustion    │  │
│  │  was physical, but the    │  │
│  │  real pain was guilt      │  │
│  │  about missing my kids."  │  │
│  └───────────────────────────┘  │
│                                 │
│  Do you feel understood?        │
│  [0][1][2][3][4][5][6][7][8][9][10]
│                                 │
│        [ Submit ]               │
└─────────────────────────────────┘
```

### Options Screen (after rating <10)

```
┌─────────────────────────────────┐
│  You rated 8/10                 │
├─────────────────────────────────┤
│                                 │
│  Here's what I'm uncertain about│
│  ─────────────────────────────  │
│  "Did I capture the health      │
│   impact correctly?"            │
│                                 │
│  What's closer?                 │
│                                 │
│  ┌───────────────────────────┐  │
│  │ A. Yes, add that my       │  │
│  │    health suffered        │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │ B. The phrasing could     │  │
│  │    be stronger            │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │ Tell me what's off...     │  │  ← Direct input field
│  └───────────────────────────┘  │
│                                 │
│        [ Continue ]             │
│                                 │
└─────────────────────────────────┘
```

### Done Screen

```
┌─────────────────────────────────┐
│                                 │
│            🎉                   │
│                                 │
│   AI understood you perfectly!  │
│   Achieved in 3 rounds          │
│                                 │
│  ┌───────────────────────────┐  │
│  │ Your journey              │  │
│  │ 0 ●●●●●●●○○○ 7            │  │
│  │   "I commuted 2 hours..." │  │
│  │ 1 ●●●●●●●●○○ 8            │  │
│  │   "...guilt about kids.." │  │
│  │ 2 ●●●●●●●●●○ 9            │  │
│  │   "...health suffered..." │  │
│  │ 3 ●●●●●●●●●● 10 ✓         │  │
│  │   "...guilt overwhelming" │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ FINAL STORY               │  │
│  │ "I commuted 2 hours       │  │
│  │  daily. I was exhausted,  │  │
│  │  couldn't see my kids,    │  │
│  │  and my health suffered.  │  │
│  │  The guilt was            │  │
│  │  overwhelming."           │  │
│  └───────────────────────────┘  │
│                                 │
│  2 Points extracted (unreviewed)│
│                                 │
│  [ Invite someone to verify → ] │  ← Blue CTA → /live
│  [ Back to profile ]            │  ← Gray secondary → /profile
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

| Entry | Behavior |
|-------|----------|
| `/prototype/linkedin-like/sift` | Fresh sift (empty input) |
| Profile "Share what you believe" | Opens `/sift` with pre-filled text |
| Existing Story/Point on profile | Already sifted → show "Invite to verify" directly |

### Profile Integration

In `Profile.tsx`, the "Create Stories & Points" button navigates with state:

```typescript
const handleCreateStoriesAndPoints = () => {
  navigate('/prototype/linkedin-like/sift', {
    state: { initialInput: composerText }
  });
};
```

In `Sift.tsx`, read initial input from location state:

```typescript
const location = useLocation();
const initialInput = (location.state as { initialInput?: string })?.initialInput || '';
```

---

## Success Criteria

| Criteria | Target |
|----------|--------|
| Flow completable | Entry → Processing → Story 10/10 → Done |
| Text evolution visible | Each round shows version + rating |
| Options + direct input | Both work (when rating <10) |
| Invite CTA | Navigates to `/live` (stub) |
| Back to profile | Navigates to `/profile` |
| Empty input | Button disabled |

---

## Implementation Order

1. **Create `Sift.tsx`** — copy Live.tsx structure, strip partner logic
2. **Entry phase** — text input + button (disabled when empty)
3. **Processing phase** — fake loading animation (2-3 sec)
4. **Story Review phase** — journey with versions above, rating below
5. **Options phase** — A/B/C buttons + direct input field (when <10)
6. **Done phase** — celebration + "Invite to verify" / "Back to profile"
7. **Wire up route**

---

## Open Questions

None — ready to build.

---

## /live Integration

Sifted Stories/Points flow into /live verification:

| Where | What happens |
|-------|--------------|
| **Sifter "Done" screen** | "Invite to verify" → opens /live with card pre-selected |
| **/live card picker** | Shows all sifted Stories from profile |
| **Verification flow** | Story verified → linked Points unlock for position staking |

See [P85: /live Verification with Cards](./p85_live_verification_with_cards.md) for the full /live spec.

---

## Related Documents

- [P85 /live Verification](./p85_live_verification_with_cards.md) — How sifted cards are verified in /live
- [P58 Sifter MVP](./done/p58_sifter_mvp.md) — full spec (archived, for future reference)
- [Live.tsx](../src/app/prototypes/linkedin-like/components/Live.tsx) — patterns to reuse
