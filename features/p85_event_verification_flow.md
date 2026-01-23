# P85: Event Verification Flow — Mock Prototype

**Status:** Planning
**Created:** 2026-01-23
**Updated:** 2026-01-23
**Priority:** High — Required for H2 test (30-person event)
**Supersedes:** p84_verify_with_author.md (archived)

---

## Goal

Build a **mock-only frontend prototype** (LinkedIn "prototype tree" style) to validate the verification flow UX before building backend.

**This is NOT:**
- A working backend implementation
- A leaderboard feature (separate spec)
- Event outcomes/analytics (separate spec)

**This IS:**
- Clickable mock screens
- Hardcoded data
- Navigation between states
- UX validation tool

---

## Screens to Mock

### 1. Event Page (simplified)

```
┌─────────────────────────────────────────────┐
│ 🥾 Clarity Hike: Golden Gate               │
│ Jan 20, 2026 • San Francisco               │
│                                             │
│ [Event description]                         │
│                                             │
│ Host: @maria_k                              │
│                                             │
├─────────────────────────────────────────────┤
│ PARTICIPANTS (12)                           │
│                                             │
│ Maria K.               [Start /live]        │
│ John D.                [Start /live]        │
│ Carol C.               [Start /live]        │
│ You                    [Invite to verify]   │
│                                             │
└─────────────────────────────────────────────┘
```

**Interactions:**
- Tap "Start /live" → goes to Card Selection screen

---

### 2. Card Selection (inside /live)

```
┌─────────────────────────────────────────────┐
│ /live with Carol                            │
│                                             │
│ SELECT CONTENT TO VERIFY                    │
│                                             │
│ [Your Stories]  [Carol's Stories]  ← tabs   │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ 📖 "I burned out commuting 2 hours..."  │ │
│ │    → 3 Points linked                    │ │
│ │                            [Select]     │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ 📖 "My experience with remote work..."  │ │
│ │    → 1 Point linked                     │ │
│ │                            [Select]     │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│                              [Cancel]       │
└─────────────────────────────────────────────┘
```

**Interactions:**
- Toggle tabs (Your Stories / Carol's Stories)
- Tap "Select" → goes to Explain-Back screen
- Tap "Cancel" → returns to Event Page

---

### 3. Explain-Back Flow

```
┌─────────────────────────────────────────────┐
│ /live with Carol                            │
│                                             │
│ EXPLAINING BACK                             │
│                                             │
│ 📖 "I burned out commuting 2 hours..."      │
│                                             │
│ [Full story text displayed here]            │
│                                             │
│ ─────────────────────────────────────────── │
│                                             │
│ Carol: Rate how well they understood        │
│                                             │
│ [0] [1] [2] [3] [4] [5] [6] [7] [8] [9] [10]│
│                                             │
└─────────────────────────────────────────────┘
```

**Interactions:**
- Tap rating 0-7 → goes to "Not Verified" screen
- Tap rating 8-10 → goes to "Verified" screen

---

### 4a. Verified (≥8/10)

```
┌─────────────────────────────────────────────┐
│ /live with Carol                            │
│                                             │
│ ✓ Verified! Carol rated 9/10               │
│                                             │
│ [Verify another]     [End session]          │
│                                             │
└─────────────────────────────────────────────┘
```

**Interactions:**
- "Verify another" → back to Card Selection
- "End session" → back to Event Page

---

### 4b. Not Verified (<8/10)

```
┌─────────────────────────────────────────────┐
│ /live with Carol                            │
│                                             │
│ Not quite — Carol rated 5/10               │
│                                             │
│ Try explaining again or pick another Story  │
│                                             │
│ [Try again]     [Pick different]            │
│                                             │
└─────────────────────────────────────────────┘
```

**Interactions:**
- "Try again" → back to Explain-Back (same story)
- "Pick different" → back to Card Selection

---

## Implementation Constraints

1. **Mock service ONLY** — modify `events-service-mock.ts`, do NOT touch `events-service-real.ts`
2. **No migrations** — do NOT create any files in `supabase/migrations/`
3. **Prototype folder** — changes go in `src/app/prototypes/events/`

---

## Implementation Approach

**LinkedIn "Prototype Tree" pattern:**
- Single React component with state machine
- `useState` for current screen
- Hardcoded mock data (no API calls)
- Route: `/prototype/verification`

```typescript
type Screen =
  | 'event-page'
  | 'card-selection'
  | 'explain-back'
  | 'verified'
  | 'not-verified';

const [screen, setScreen] = useState<Screen>('event-page');
```

---

## Mock Data

```typescript
const mockEvent = {
  name: "Clarity Hike: Golden Gate",
  date: "Jan 20, 2026",
  location: "San Francisco",
  host: "maria_k",
  participants: ["Maria K.", "John D.", "Carol C.", "You"]
};

const mockStories = {
  yours: [
    { id: "1", preview: "I burned out commuting 2 hours...", pointsLinked: 3 },
    { id: "2", preview: "My experience with remote work...", pointsLinked: 1 }
  ],
  carols: [
    { id: "3", preview: "When I switched to async communication...", pointsLinked: 2 }
  ]
};
```

---

## Out of Scope (Explicitly)

| Item | Reason |
|------|--------|
| Real database changes | Mock-only prototype |
| Production service (`events-service-real.ts`) | Do not touch |
| `supabase/migrations/` | No migrations |
| Leaderboard | P93 — different hypothesis |
| Event outcomes | Requires backend, after prototype validated |
| Ears (👂) display | After core flow works |
| Stance prompt | After core flow works |
| Position tracking | Backend feature |
| QR/Link sharing | After core flow works |

---

## Acceptance Criteria

1. `/prototype/verification` route exists
2. Can navigate: Event → Card Selection → Explain-Back → Verified/Not Verified
3. Can toggle between "Your Stories" and "Carol's Stories" tabs
4. Rating <8 shows "Not Verified" screen
5. Rating ≥8 shows "Verified" screen
6. "Verify another" loops back to Card Selection
7. "End session" returns to Event Page
8. All data is hardcoded (no API calls)

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-23 | **Simplified:** Reduced to mock-only prototype. Removed leaderboard, outcomes, data model, stance prompts. Focus on UX validation only. |
| 2026-01-23 | Created from design session. Supersedes p84. |
