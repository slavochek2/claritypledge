---
status: in-progress
sort_order: 1000003
---
# P85: /live Verification with Cards

**Status:** Prepped
**Created:** 2026-01-23
**Updated:** 2026-01-26
**Location:** Updates to `/prototype/linkedin-like/Live.tsx`
**Prepped:** 2026-01-26 (Architect ✓, UX ✓, Definitions ✓, Execution Scout ✓)

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

### Partner Side (Receiving a Card) — Mocked

```
(Mocked: auto-proceeds after timeout)
                                     │
                                     ▼
                             You rate 0-10
                                     │
                              ≥8? ───┼─── <8: Try again or Speak freely
                                     │
                                    Yes
                                     │
                       ┌─────────────┴─────────────┐
                       │                           │
                Has Points?                   No Points
                       │                           │
                       ▼                           ▼
              Stake positions              Done (update history)
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
└────────────────────────────┘
```

Note: Session history section appears only after first verification (not shown when empty).

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
│ 📖 "My team works better   │
│    asynchronously..."      │
│    └─ 0 points linked      │
│                            │
│           [ Cancel ]       │
└────────────────────────────┘
```

### 2b. Card Picker — Empty State

```
┌────────────────────────────┐
│ SELECT A STORY             │
├────────────────────────────┤
│                            │
│   You don't have any       │
│   Stories yet.             │
│                            │
│   Share a lived experience │
│   first, then ask Carol    │
│   to understand it.        │
│                            │
│       [ Just talk ]        │
│                            │
└────────────────────────────┘
```

Note: Stories with 0 linked Points can still be selected — the Points phase is simply skipped after verification.

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

### 4. Partner Receives Card (Drawer) — FUTURE

> **Note:** For this prototype, partner actions are mocked with timeouts. This wireframe documents future real-time behavior.

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
│ Now: Your position?        │
│                            │
│ ┌────────────────────────┐ │
│ │ "Remote work improves  │ │
│ │  wellbeing"            │ │
│ │                        │ │
│ │ [Disagree ▼][Unsure][Agree ▼] │
│ └────────────────────────┘ │
│                            │
│ ┌────────────────────────┐ │
│ │ "Long commutes harm    │ │
│ │  family life"          │ │
│ │                        │ │
│ │ [Disagree ▼][Unsure][Agree ▼] │
│ └────────────────────────┘ │
│                            │
│ [ Submit ]  [ Speak freely]│
└────────────────────────────┘
```

Uses existing `PositionButtons` segmented control with dropdown for intensity (-3 to -1 or +1 to +3).

### 6b. Story Verified — No Linked Points

If the Story has 0 linked Points, skip directly to session history update:

```
┌────────────────────────────┐
│ ✓ STORY UNDERSTOOD (9/10)  │
├────────────────────────────┤
│                            │
│   Carol understands your   │
│   Story. No Points to      │
│   stake positions on.      │
│                            │
│        [ Continue ]        │
│                            │
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

Reuse existing `PositionButtons` component (segmented control with dropdown):

```
[Disagree ▼] [Unsure] [Agree ▼]
     │                    │
     └─ -3, -2, -1        └─ +1, +2, +3
```

This matches the existing pattern in `PositionButton.tsx` and works well on mobile.

---

## State Machine

```typescript
type CardPhase =
  | 'idle'              // [Pick cards] or [Just talk]
  | 'picking'           // Card picker drawer open
  | 'selected'          // Card selected, showing CTA
  | 'waiting'           // Waiting for partner (sent + explaining combined)
  | 'rating'            // Rating 0-10
  | 'verified'          // ≥8, showing Points (or skip to done if 0 Points)
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

**Persistence:** Use `sessionStorage` to survive accidental page refresh.

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

## Data Flow (Prototype)

Partner actions are **mocked with timeouts** for this prototype. No real WebSocket/realtime sync.

```
You                          Partner (mocked)
───                          ───────────────
Select Story
     │
     └──── (timeout 2s) ─────────► Partner "responds"
                                         │
                                    Auto-proceeds to rating
     │
Rate 0-10
     │
     └──── (instant) ────────────► If ≥8 + has Points: show positioning
                                   If ≥8 + no Points: done
                                   If <8: show retry
```

Future: Replace mocked timeouts with real WebSocket sync.

---

## Scope

### In Scope

- Card picker UI (Stories with linked Points count)
- Card visible during verification flow
- Points unlock after Story verified (≥8)
- Position staking (-3 to +3) on Points using existing `PositionButtons`
- Session history (this session only, persisted via sessionStorage)
- "Speak freely" escape at every step
- Empty state when user has no Stories
- Skip Points phase when Story has 0 linked Points

### Out of Scope (Later)

- "I have a Story" link on Points (creates new Story mid-session — separate feature)
- Full history across all sessions
- Post-session email with summary
- AI extraction of new cards from recording
- Event container / participant list
- Real WebSocket sync (using mocked timeouts for prototype)

---

## Acceptance Criteria

1. [Pick cards] opens drawer with my Stories
2. Stories show linked Points count (including 0)
3. Empty state shown when user has no Stories
4. Selecting Story shows "Does [Partner] understand?"
5. Card visible at top during existing flow
6. Rating ≥8 unlocks linked Points (using `PositionButtons` segmented control)
7. Rating ≥8 with 0 Points skips to "done" state
8. Rating <8 shows "try again" or "speak freely"
9. Session history shows verified cards + positions (hidden when empty)
10. Session history persists on page refresh (sessionStorage)
11. "Speak freely" available at every step
12. Entry from StoryCard (`?story={id}`) pre-selects that Story (skip picker, go to "selected" phase)
13. Entry without context shows idle state with [Pick cards] button

---

## Entry Points

| Source | URL | Behavior |
|--------|-----|----------|
| **StoryCard** "Start a Clarity Session" | `/prototype/live/new?with={authorId}&story={storyId}` | Pre-select Story, set partner, skip to "selected" phase |
| **BottomNav** button | `/prototype/live/new` | Idle state → [Pick cards] or [Just talk] |
| **Direct navigation** | `/prototype/live` | Same as BottomNav |

### Query Parameters

Live.tsx must read and handle:

| Param | Purpose | Effect |
|-------|---------|--------|
| `story` | Story ID to verify | Pre-select in card picker, skip to "selected" phase |
| `with` | Partner user ID | Set partner name in UI |

If `?story=` is provided but Story not found → fall back to idle state with warning toast.

---

## Related Documents

- [P98 Sifter Prototype](./p98_sifter_prototype.md) — Creates Stories/Points that appear in card picker
- [Live.tsx](../src/app/prototypes/linkedin-like/components/Live.tsx) — Existing /live to modify
- [PositionButton.tsx](../src/app/prototypes/linkedin-like/components/shared/PositionButton.tsx) — Existing position scale

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-26 | **Entry points:** Added AC 12-13 for StoryCard entry (pre-select) vs direct entry (idle). Added Entry Points section with query param handling. |
| 2026-01-26 | **Prep-spec review:** Simplified position UI (use existing PositionButtons), added empty states, deferred "I have a Story" link, hide empty session history, simplified state machine, mock partner sync with timeouts. |
| 2026-01-26 | **Complete rewrite:** Focused on card verification only. Removed event container (separate spec). Added Story → Points unlock flow. Added session history. KISS wireframes. |
| 2026-01-23 | Original version (mixed event + verification concerns) |
