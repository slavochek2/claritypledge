# P23_1: Rating Flow Implementation

**Status:** Ready for Development
**Priority:** High
**Date:** 2025-12-25
**Parent:** P23 (Live Clarity Meetings)
**UX Spec:** [clarity-live-rating-flow.md](../docs/bmad/clarity-live-rating-flow.md)

---

## Summary

Implement the sealed-bid rating flow for Clarity Live sessions. When Gosha speaks, both participants rate how well Slava understood Gosha. Ratings are hidden until both submit (like sealed bids), then gaps are surfaced with explain-back options.

---

## What Exists (Current Code)

The current `live-mode-view.tsx` has:
- Rating buttons (0-10)
- Waiting state with countdown
- Basic gap detection display
- "Let's Check - Paraphrase" button
- "Feels right / Feels different" confirmation (to be removed)

---

## What to Build

### 1. Sealed-Bid Rating Pattern

**Current:** Rating shows immediately when submitted
**New:** Both ratings hidden until both submit

```
Screen 1 → Screen 2 → Screen 3
(Rate)    (Wait)     (Reveal)
```

### 2. Screen States

#### Screen 1: Rating
Both users see rating buttons. No ratings visible yet.

| Gosha's Phone | Slava's Phone |
|---------------|---------------|
| **How much Slava understands you:** | **How much you understand Gosha:** |
| `[0][1][2][3][4][5][6][7][8][9][10]` | `[0][1][2][3][4][5][6][7][8][9][10]` |

#### Screen 2: Waiting (one submitted)

| Gosha's Phone | Slava's Phone |
|---------------|---------------|
| You rated how much Slava understands you. | Gosha rated how much you understand them. |
| (You believe: 7 / Slava believes: ?) | `[0][1][2]...[10]` |
| Waiting for Slava's rating... | Submit yours to see Gosha's rating. |
| `[Change rating]` | |
| `[Skip]` *(auto-skips in 30s)* | `[Skip]` *(auto-skips in 30s)* |

#### Screen 3a: Gap Detected - Overconfidence Risk

When Slava rates higher than Gosha believes:

| Gosha's Phone | Slava's Phone |
|---------------|---------------|
| **Slava has overconfidence risk: 2 points** | **You have overconfidence risk: 2 points** |
| (You believe: 7 / Slava believes: 9) | (You believe: 9 / Gosha believes: 7) |
| `[Ask to explain back]` | `[Change rating]` |
| `[Skip]` *(auto-skips in 30s)* | `[Explain back]` |
| | `[Skip]` *(auto-skips in 30s)* |

#### Screen 3a-ii: Gap Detected - Underconfidence Risk

When Slava rates lower than Gosha believes:

| Gosha's Phone | Slava's Phone |
|---------------|---------------|
| **Slava has underconfidence risk: 2 points** | **You have underconfidence risk: 2 points** |
| (You believe: 7 / Slava believes: 5) | (You believe: 5 / Gosha believes: 7) |
| `[Ask to explain back]` | `[Change rating]` |
| `[Skip]` *(auto-skips in 30s)* | `[Explain back]` |
| | `[Skip]` *(auto-skips in 30s)* |

#### Screen 3b: Perfect Understanding (10/10)

| Gosha's Phone | Slava's Phone |
|---------------|---------------|
| **Slava understood you perfectly!** | **You understood Gosha perfectly!** |
| (You believe: 10 / Slava believes: 10) | (You believe: 10 / Gosha believes: 10) |
| *(auto-returns in 5s)* | *(auto-returns in 5s)* |

#### Screen 4: Explain-Back in Progress

| Gosha's Phone | Slava's Phone |
|---------------|---------------|
| **Waiting for Slava to explain back...** | **Please explain back...** |
| (You believe: 7 / Slava believes: 9) | (You believe: 9 / Gosha believes: 7) |
| **How much does Slava actually understand?** | Waiting for Gosha to rate... |
| `[0][1][2][3][4][5][6][7][8][9][10]` | |
| `[Skip]` | `[Skip]` |

#### Screen 5a: Results (NOT 10/10)

| Gosha's Phone | Slava's Phone |
|---------------|---------------|
| **Results:** | **Results:** |
| (You believe: 7 / Slava believes: 9) | (You believe: 9 / Gosha believes: 7) |
| You believe after explain-back: 8 | Gosha believes after explain-back: 8 |
| `[Ask to explain back again]` ← primary | `[Explain back again]` |
| `[Skip]` | `[Skip]` |

#### Screen 5b: Results (10/10 Achieved)

| Gosha's Phone | Slava's Phone |
|---------------|---------------|
| **Slava understood you perfectly!** | **You understood Gosha perfectly!** |
| (You believe: 7 / Slava believes: 9) | (You believe: 9 / Gosha believes: 7) |
| You believe after explain-back: 10 | Gosha believes after explain-back: 10 |
| *(auto-returns in 5s)* | *(auto-returns in 5s)* |

---

## Implementation Tasks

### Task 1: Update LiveSessionState Type

Add new state fields in `src/app/types/index.ts`:

```typescript
interface LiveSessionState {
  // Existing...

  // New sealed-bid fields
  ratingPhase: 'rating' | 'waiting' | 'revealed' | 'explain-back' | 'results';
  myRating?: number;
  partnerRating?: number;
  myRatingSubmitted: boolean;
  partnerRatingSubmitted: boolean;

  // Explain-back tracking
  explainBackRound: number;
  explainBackRatings: number[];  // History of ratings after each round

  // Who is speaker vs listener this round
  speakerName: string;
  listenerName: string;
}
```

### Task 2: Implement Sealed-Bid Logic

In `live-mode-view.tsx`:

1. **Hide partner rating until both submit**
   - Show `?` for partner's rating while waiting
   - Only reveal when `partnerRatingSubmitted === true`

2. **Add "Change rating" button**
   - Only visible when in waiting state
   - Resets `myRatingSubmitted` to false

3. **Calculate gap type**
   ```typescript
   const gap = myRating - partnerRating;
   const gapType = gap > 0 ? 'overconfidence' : gap < 0 ? 'underconfidence' : 'none';
   const gapPoints = Math.abs(gap);
   ```

### Task 3: Implement Screen Components

Create or update these view states in `live-mode-view.tsx`:

1. **RatingScreen** - Initial rating buttons
2. **WaitingScreen** - Shows own rating, waiting for partner
3. **GapRevealedScreen** - Shows gap with risk label and buttons
4. **PerfectUnderstandingScreen** - Celebration with auto-return
5. **ExplainBackScreen** - Listener explains, speaker rates
6. **ResultsScreen** - Shows progression, offers another round

### Task 4: Remove Old Code

Remove from `live-mode-view.tsx`:
- "Feels right / Feels different" confirmation UI
- "Rate My Understanding" separate flow
- Old gap detection that shows immediately

### Task 5: Rename Review to History

In `live-mode-view.tsx` footer:
```tsx
// Change from:
<Button>Review</Button>

// To:
<Button>History</Button>
```

### Task 6: Add Auto-Timers

- **Screen 2 (Waiting):** Auto-skip after 30s
- **Screen 3 (Gap):** Auto-skip after 30s
- **Screen 3b/5b (Perfect):** Auto-return after 5s
- **Screen 4 (Explain-back):** No auto-timer (manual skip only)
- **Screen 5a (Results):** No auto-timer (manual skip only)

---

## State Machine

```
[RATING] ──submit──► [WAITING] ──partner submits──► [REVEALED]
                          │                              │
                          │ skip                         │
                          ▼                              ▼
                     [DONE]                    ┌─────────┴─────────┐
                                               │                   │
                                          gap > 0             gap = 0
                                               │                   │
                                               ▼                   ▼
                                        [GAP SCREEN]        [PERFECT]
                                               │                   │
                                    ┌──────────┼──────────┐        │
                                    │          │          │        │
                               explain     change       skip       │
                                back       rating                  │
                                    │          │          │        │
                                    ▼          ▼          ▼        ▼
                             [EXPLAIN-BACK] [RATING]   [DONE]   [DONE]
                                    │
                                    ▼
                               [RESULTS]
                                    │
                          ┌─────────┴─────────┐
                          │                   │
                     not 10/10            10/10
                          │                   │
                          ▼                   ▼
                   [ask again?]          [PERFECT]
                          │                   │
                    ┌─────┴─────┐             │
                    │           │             │
                  again       skip            │
                    │           │             │
                    ▼           ▼             ▼
             [EXPLAIN-BACK]  [DONE]        [DONE]
```

---

## Acceptance Criteria

- [ ] Ratings hidden until both users submit (sealed bid)
- [ ] "Change rating" button works while waiting
- [ ] Gap shows correct risk type (overconfidence/underconfidence)
- [ ] Gap shows correct point difference
- [ ] "Ask to explain back" / "Explain back" buttons appear correctly per role
- [ ] Explain-back shows context (original ratings)
- [ ] Results screen shows progression history
- [ ] Multiple explain-back rounds tracked (1st, 2nd, etc.)
- [ ] 10/10 shows celebration and auto-returns
- [ ] Skip buttons work on all relevant screens
- [ ] Auto-timers work (30s for waiting/gap, 5s for celebration)
- [ ] "Review" renamed to "History"

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/app/types/index.ts` | Add new LiveSessionState fields |
| `src/app/components/partners/live-mode-view.tsx` | Implement all screen states |
| `src/app/data/api.ts` | Update live state sync logic |

---

## Out of Scope

- Flag for judgment/criticism (v2)
- Voice activity detection
- Transcript capture
- History screen design (separate story)
