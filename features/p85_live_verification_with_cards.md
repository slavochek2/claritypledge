# P85: /live Verification with Cards

**Status:** Ready to Build
**Created:** 2026-01-23
**Updated:** 2026-01-26
**Location:** Updates to `/prototype/linkedin-like/Live.tsx`

---

## One-Sentence Description

Add card selection to /live so people can verify understanding of specific Stories, then unlock linked Points for position staking.

---

## Core Principle

> "Can't disagree until you acknowledge their Story"

- **Story** = WHY they believe it (understand first)
- **Points** = WHAT they believe (react after understanding)

Verification flow: Story → Verified → Points unlocked

---

## What's New vs Existing

| Existing /live | New |
|----------------|-----|
| "Did you understand me?" button | [Pick cards] button → card picker |
| Free-form explain-back | Card visible during explain-back |
| Rating 0-10 | Same, but tied to specific card |
| — | Points unlocked after Story verified (≥8) |
| — | Position staking (-3 to +3) on Points |
| — | Session history (this session's verified cards) |

---

## User Flow

### Your Side (Sending a Card)

```
Idle → [Pick cards] → Select Story → [Does Carol understand?] → Existing flow
                                                                    │
                                               Card visible at top of journey
```

### Partner Side (Receiving a Card)

```
Drawer appears → See Story → [Ready to explain] or [Speak freely]
                                     │
                                     ▼
                             Explain back → You rate
                                     │
                              ≥8? ───┼─── <8: Try again or Speak freely
                                     │
                                    Yes
                                     │
                                     ▼
                             Points unlocked → Stake positions (-3 to +3)
```

---

## Wireframes

### 1. Idle State (Your View)

```
┌────────────────────────────┐
│ /live with Carol           │
│ ● Recording                │
├────────────────────────────┤
│                            │
│     [ Pick cards ]         │
│                            │
│     [ Just talk ]          │
│                            │
├────────────────────────────┤
│ THIS SESSION               │
│ (empty)                    │
└────────────────────────────┘
```

### 2. Card Picker (Drawer)

```
┌────────────────────────────┐
│ SELECT A STORY             │
├────────────────────────────┤
│                            │
│ 📖 "I burned out commuting │
│    2 hours daily..."       │
│    └─ 2 points linked      │
│                            │
│ 📖 "Remote work changed    │
│    my relationship..."     │
│    └─ 1 point linked       │
│                            │
│           [ Cancel ]       │
└────────────────────────────┘
```

### 3. Card Selected (Your View)

```
┌────────────────────────────┐
│ ┌────────────────────────┐ │
│ │ 📖 "I burned out       │ │
│ │    commuting..."       │ │
│ │    └─ 2 points linked  │ │
│ └────────────────────────┘ │
│                            │
│ [ Does Carol understand? ] │
│                            │
│ [ Pick different ]         │
└────────────────────────────┘
```

### 4. Partner Receives Card (Drawer)

```
┌────────────────────────────┐
│ UNDERSTAND THIS            │
├────────────────────────────┤
│                            │
│ 📖 Their Story             │
│                            │
│ "I burned out commuting    │
│  2 hours daily. The        │
│  exhaustion was physical,  │
│  but the real pain was     │
│  guilt about missing my    │
│  kids."                    │
│                            │
│ ─────────────────────────  │
│ 2 points unlock after you  │
│ understand this story      │
│                            │
│ [ Ready to explain ]       │
│                            │
│ [ Speak freely ]           │
└────────────────────────────┘
```

### 5. During Flow (Your View)

Card stays visible at top of existing journey UI:

```
┌────────────────────────────┐
│ 📖 "I burned out..."       │
├────────────────────────────┤
│                            │
│ Journey                    │
│ 0 ●●●●●○○○○○ 5            │
│ 1 ← rating now             │
│                            │
│ [0][1][2][3][4][5]...      │
│                            │
│ [ Submit ]                 │
│                            │
│ [ Speak freely ]           │
└────────────────────────────┘
```

### 6. Story Verified (≥8) → Points Unlock

```
┌────────────────────────────┐
│ ✓ STORY UNDERSTOOD (9/10)  │
├────────────────────────────┤
│                            │
│ Unlocking 2 Points...      │
│ ●●●○○                      │
│                            │
└────────────────────────────┘
        │
        │ (1 sec transition)
        ▼
┌────────────────────────────┐
│ ✓ STORY UNDERSTOOD         │
├────────────────────────────┤
│                            │
│ Now: Your position?        │
│                            │
│ ┌────────────────────────┐ │
│ │ "Remote work improves  │ │
│ │  wellbeing"            │ │
│ │                        │ │
│ │ Disagree    Neutral    │ │
│ │ [-3][-2][-1] [0]       │ │
│ │                        │ │
│ │       Agree            │ │
│ │ [+1][+2][+3]           │ │
│ │                        │ │
│ │ [←] I have a Story     │ │
│ └────────────────────────┘ │
│                            │
│ ┌────────────────────────┐ │
│ │ "Long commutes harm    │ │
│ │  family life"          │ │
│ │                        │ │
│ │ [-3][-2][-1][0]        │ │
│ │ [+1][+2][+3]           │ │
│ │                        │ │
│ │ [←] I have a Story     │ │
│ └────────────────────────┘ │
│                            │
│ [ Submit ]  [ Speak freely]│
└────────────────────────────┘
```

### 7. Not Verified (<8)

```
┌────────────────────────────┐
│ NOT YET (5/10)             │
├────────────────────────────┤
│                            │
│ 🔒 Points still locked     │
│                            │
│ [ Try again ]              │
│                            │
│ [ Speak freely ]           │
└────────────────────────────┘
```

### 8. Session History

Bottom of idle screen after verifications:

```
┌────────────────────────────┐
│ THIS SESSION               │
├────────────────────────────┤
│ ✓ 📖 "I burned out..." 9   │
│   └─ Carol: +2, +1         │
│                            │
│ ✗ 📖 "Remote work..." 5    │
│   └─ Points locked         │
└────────────────────────────┘
```

---

## Speak Freely (Escape Hatch)

Available at every step:

| When | "Speak freely" means |
|------|---------------------|
| Partner receives card | Skip explain-back, just talk |
| After Story verified | Skip staking positions |
| During rating | Abort, back to conversation |

Always returns to open /live conversation.

---

## Position Buttons

Use existing 7-point scale with sub-option:

```
[-3] [-2] [-1] [0] [+1] [+2] [+3]
 │                            │
 Strongly                Strongly
 disagree                  agree

[←] I have a Story about this
    └─ Links partner's Story to this Point
```

---

## State Machine

```typescript
type CardPhase =
  | 'idle'              // [Pick cards] or [Just talk]
  | 'picking'           // Card picker drawer open
  | 'selected'          // Card selected, showing CTA
  | 'sent'              // Waiting for partner
  | 'explaining'        // Partner explaining back
  | 'rating'            // Rating 0-10
  | 'verified'          // ≥8, showing Points
  | 'not-verified'      // <8, try again?
  | 'positioning'       // Partner staking positions

interface CardState {
  phase: CardPhase;
  activeCard: Story | null;
  linkedPoints: Point[];
  rating: number | null;
  positions: Map<PointId, number>;  // -3 to +3
  sessionHistory: VerifiedCard[];
}
```

---

## Integration with Existing /live

| Existing Component | Integration |
|--------------------|-------------|
| Idle state | Replace buttons with [Pick cards] + [Just talk] |
| `JourneyToUnderstanding` | Add card header above |
| Rating phase | Add card header, same rating UI |
| Result phase | Branch: verified → Points, not → try again |
| — (new) | Card picker drawer |
| — (new) | Points with position scale |
| — (new) | Session history panel |

---

## Data Flow

```
You                          Partner
───                          ───────
Select Story
     │
     └──── WebSocket/Realtime ────► Drawer appears
                                         │
                                    [Ready] or [Speak freely]
                                         │
                                    Explains back
                                         │
     ◄──── Audio/presence ───────────────┘
     │
Rate 0-10
     │
     └──── Rating sent ──────────► If ≥8: Points appear
                                         │
                                    Stake positions
                                         │
     ◄──── Positions sent ───────────────┘
     │
Session history updated (both sides)
```

---

## Scope

### In Scope

- Card picker UI (Stories with linked Points count)
- Card visible during verification flow
- Points unlock after Story verified (≥8)
- Position staking (-3 to +3) on Points
- "I have a Story" sub-option on Points
- Session history (this session only)
- "Speak freely" escape at every step

### Out of Scope (Later)

- Full history across all sessions
- Post-session email with summary
- AI extraction of new cards from recording
- Event container / participant list

---

## Acceptance Criteria

1. [Pick cards] opens drawer with my Stories
2. Stories show linked Points count
3. Selecting Story shows "Does [Partner] understand?"
4. Partner sees drawer with Story + "Ready to explain"
5. Card visible at top during existing flow
6. Rating ≥8 unlocks linked Points
7. Rating <8 shows "try again" or "speak freely"
8. Partner can stake position -3 to +3 on each Point
9. "I have a Story" links partner's Story to Point
10. Session history shows verified cards + positions
11. "Speak freely" available at every step

---

## Related Documents

- [P98 Sifter Prototype](./p98_sifter_prototype.md) — Creates Stories/Points that appear in card picker
- [Live.tsx](../src/app/prototypes/linkedin-like/components/Live.tsx) — Existing /live to modify
- [PositionButton.tsx](../src/app/prototypes/linkedin-like/components/shared/PositionButton.tsx) — Existing position scale

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-26 | **Complete rewrite:** Focused on card verification only. Removed event container (separate spec). Added Story → Points unlock flow. Added session history. KISS wireframes. |
| 2026-01-23 | Original version (mixed event + verification concerns) |
