# P98: Sifter Prototype (AI-powered /live)

**Status:** Implemented
**Created:** 2026-01-26
**Updated:** 2026-01-26
**Parent:** [P58 Sifter MVP](./done/p58_sifter_mvp.md) (archived)
**Location:** `/prototype/linkedin-like/sift`

---

## One-Sentence Description

ChatGPT-style AI chat where user articulates their Story, rates understanding 0-10, refines until ≥8.

---

## Core Model: Chat-based Sifting

```
User has thought
      │
      ▼
┌─────────────┐
│   ENTRY     │  ← Type initial thought
└──────┬──────┘
       │
       ▼
┌─────────────┐
│    CHAT     │  ← AI interprets → User rates 0-10 → Refine
└──────┬──────┘
       │
       ≥8 rating (or "Use this anyway" after 3 attempts)
       │
       ▼
┌─────────────────────────────────┐
│ Done: "Invite to verify" or     │
│ "Back to profile"               │
└─────────────────────────────────┘
```

**Why this model:**
1. ChatGPT-style chat is universally understood
2. No "processing screens" - typing indicator is enough
3. ≥8 threshold matches /live's "understood" standard
4. Escape hatch prevents infinite refinement frustration

---

## Scope: Prototype Only

| In Scope | Out of Scope |
|----------|--------------|
| ChatGPT-style chat interface | Real AI/LLM calls |
| 0-10 rating (like /live) | Database persistence |
| Entry → Chat → Done phases | Points extraction flow |
| Mock AI responses | Voice input (future) |
| Reuse /live header pattern | Meeting codes |
| "Invite to verify" CTA | Full /live integration |
| "Use this anyway" escape (3 attempts) | — |

---

## Key UX Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Interface pattern | **ChatGPT-style chat** | Universal pattern users already understand |
| Rating threshold | **≥8 = understood** | Matches /live; strict 10/10 is too hard |
| Refinement escape | **"Use this anyway" after 3 attempts** | Prevents infinite loop frustration |
| Header | **Reuse /live pattern** | Logo \| Badge \| Leave button — consistency |
| Processing | **None — typing indicator** | Fake loading screens feel artificial |
| Options A/B/C | **Removed — direct input only** | Fewer clicks, more natural conversation |

---

## User Flow

```
1. ENTRY (centered, ChatGPT welcome style)
   └── "What's on your mind?"
   └── Textarea with placeholder
   └── Send button (disabled when empty)

2. CHAT (scrolling conversation)
   └── User message appears
   └── AI typing indicator (bouncing dots)
   └── AI interpretation: "So you're saying..."
   └── Rating UI: "How well does this capture your meaning?"
   └── [0][1][2][3][4][5][6][7][8][9][10] + [Submit]

   If rating < 8:
   └── AI: "You rated X/10. What did I miss?"
   └── User types clarification
   └── AI responds with refined interpretation
   └── Rating UI again
   └── (Repeat until ≥8, or after 3 attempts show "Use this anyway")

3. DONE (≥8 rating)
   └── "Your Story is ready" with checkmark
   └── StoryCard preview (user name, story text)
   └── [ Invite someone to verify ] ← primary CTA
   └── [ Back to profile ] ← secondary
```

---

## Components

### Reuse from Live.tsx

| Component | Status |
|-----------|--------|
| Header pattern (Logo \| Badge \| Leave) | ✓ Reused exactly |
| RatingButtons (0-10, blue theme) | ✓ Reused styling |
| Exit confirmation dialog | ✓ Reused pattern |

### Sift.tsx Structure (~400 lines)

| Section | Purpose |
|---------|---------|
| `SiftHeader` | Logo + "Clarity AI" badge + Leave button |
| `ChatMessage` | User/AI message with alternating backgrounds |
| `RatingButtons` | 0-10 inline buttons matching /live |
| `ChatInput` | Textarea + Send button |
| `DoneScreen` | StoryCard preview + CTAs |

---

## State Machine

```typescript
type SiftPhase = 'entry' | 'chat' | 'done';

interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  showRating?: boolean;  // AI can request rating
}

interface SiftState {
  phase: SiftPhase;
  messages: ChatMessage[];
  currentStoryText: string;
  refinementCount: number;  // For "Use this anyway" escape
  currentRating: number | null;
}

// Constants
const UNDERSTOOD_THRESHOLD = 8;
const MAX_REFINEMENTS = 3;
```

---

## Mock Data

```typescript
const MOCK_AI_RESPONSES = [
  {
    interpretation: "So you're saying the commute was draining you both physically and emotionally, affecting your family time?",
    storyText: "I commuted 2 hours daily and felt exhausted.",
  },
  {
    interpretation: "Ah, so the guilt about missing your kids was the real pain, not just the exhaustion.",
    storyText: "I commuted 2 hours daily. The exhaustion was physical, but the real pain was guilt about missing my kids.",
  },
  {
    interpretation: "I understand now. The physical exhaustion combined with guilt about missing your children made the situation unsustainable.",
    storyText: "I commuted 2 hours daily. I was exhausted, couldn't see my kids, and felt overwhelming guilt.",
  },
];
```

---

## UI Wireframes

### Entry Screen (ChatGPT welcome style)

```
┌─────────────────────────────────┐
│ [C]    Clarity AI      [Leave]  │  ← Header matches /live
├─────────────────────────────────┤
│                                 │
│            [C]                  │  ← Centered logo
│                                 │
│     What's on your mind?        │
│                                 │
│  ┌───────────────────────────┐  │
│  │ e.g., "I've been thinking │  │
│  │ about remote work..."     │  │
│  └───────────────────────────┘  │
│           [→]                   │  ← Send button (disabled)
└─────────────────────────────────┘
```

### Chat Phase (scrolling conversation)

```
┌─────────────────────────────────┐
│ [C]    Clarity AI      [Leave]  │
├─────────────────────────────────┤
│ ┌───────────────────────────┐   │
│ │ You                       │   │  ← White bg
│ │ I commuted 2 hours daily  │   │
│ │ and felt exhausted...     │   │
│ └───────────────────────────┘   │
│                                 │
│ ┌───────────────────────────┐   │
│ │ [C] Clarity AI            │   │  ← Gray bg
│ │ So you're saying the      │   │
│ │ commute was draining you  │   │
│ │ physically and affecting  │   │
│ │ your family time?         │   │
│ └───────────────────────────┘   │
│                                 │
│ How well does this capture...?  │
│ [0][1][2][3][4][5][6][7][8][9][10]
│           [ Submit ]            │
│                                 │
├─────────────────────────────────┤
│ ┌───────────────────────────┐   │
│ │ Share what's on your mind │   │
│ └─────────────────────[→]───┘   │
└─────────────────────────────────┘
```

### Clarification (after rating < 8)

```
│ ┌───────────────────────────┐   │
│ │ [C] Clarity AI            │   │
│ │ You rated 5/10. What did  │   │
│ │ I miss? Tell me more...   │   │
│ └───────────────────────────┘   │
│                                 │
│ (After 3 attempts, show:)       │
│ [Use this anyway]               │  ← Escape hatch
```

### Done Screen

```
┌─────────────────────────────────┐
│ [C]    Clarity AI      [Leave]  │
├─────────────────────────────────┤
│                                 │
│            ✓                    │
│                                 │
│     Your Story is ready         │
│                                 │
│  ┌───────────────────────────┐  │
│  │ Sarah Chen           ✓    │  │  ← StoryCard preview
│  │ "I commuted 2 hours       │  │
│  │  daily. The exhaustion    │  │
│  │  was physical, but the    │  │
│  │  real pain was guilt..."  │  │
│  └───────────────────────────┘  │
│                                 │
│  [ Invite someone to verify ]   │  ← Primary CTA
│  [ Back to profile ]            │  ← Secondary
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

| Criteria | Status |
|----------|--------|
| Entry → Chat → Done flow | ✓ Implemented |
| ChatGPT-style chat interface | ✓ Implemented |
| 0-10 rating matching /live | ✓ Implemented |
| ≥8 threshold for "understood" | ✓ Implemented |
| "Use this anyway" after 3 attempts | ✓ Implemented |
| Exit confirmation (mid-chat) | ✓ Implemented |
| Invite CTA → /live | ✓ Navigates |
| Back to profile → /profile | ✓ Navigates |
| Empty input → button disabled | ✓ Implemented |
| 22 tests passing | ✓ Verified |

---

## Learnings (Post-Implementation)

| What we planned | What we built | Lesson |
|-----------------|---------------|--------|
| Processing screen | No processing | Typing indicator is enough |
| Options A/B/C | Direct text input | Fewer clicks, more natural |
| Journey with versions | Chat messages | ChatGPT pattern is universal |
| 10/10 target | ≥8 threshold | Strict 10/10 is too hard |
| No escape | "Use this anyway" | Critical for UX |

---

## Open Questions

None — implemented and tested.

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
- [Live.tsx](../src/app/prototypes/linkedin-like/components/Live.tsx) — patterns reused
- [Sift.tsx](../src/app/prototypes/linkedin-like/components/Sift.tsx) — implementation
- [sift.test.tsx](../src/tests/sift.test.tsx) — 22 tests

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-26 | **Implemented:** ChatGPT-style chat replaces processing+versions UI. Added ≥8 threshold (not 10/10). Added "Use this anyway" escape. Removed options A/B/C. Updated spec to reflect learnings. |
| 2026-01-26 | **Original spec:** Entry → Processing → Story Review → Done with versions and options |
