# P23.2 Understanding Get/Give Model

## Summary

This feature refines the Clarity Live rating flow from P23.1 based on learnings from implementation.

## Key Learnings from P23.1

### What We Built
- Sealed-bid rating: both users rate simultaneously, ratings hidden until both submit
- Speaker/listener terminology caused confusion in implementation
- Variables like `speakerName`, `listenerName`, `speakerRating`, `listenerRating` were hard to reason about
- Text kept breaking because the logic tried to differentiate "speaker view" vs "listener view"

### Core Insight
**Both users always rate the same thing from their own perspective:**
- "How much does [Partner] understand ME?"

There's no need for speaker/listener distinction in the rating itself - just "me" and "partner".

### Problems with Current Implementation
1. `speakerName`/`listenerName` set based on who created session or who submitted first - not meaningful
2. Swapping roles on skip caused text to flip incorrectly
3. Too many variables with confusing semantics
4. Fixing one screen broke another due to intertwined logic

## Proposed New Model: Check/Prove

### Concept
Instead of forced simultaneous rating, use an intentional request/response pattern:

```
┌─────────────────────────────────────────┐
│       Achieve Clarity Together           │
│                                          │
│  [Check partner's    [Prove my           │
│   understanding]      understanding]     │
│                       (disabled)         │
│                                          │
└─────────────────────────────────────────┘
```

### Actions
- **"Check partner's understanding"** = I just spoke, I want to verify partner understood (initiates rating)
- **"Prove my understanding"** = Partner just spoke, I want to demonstrate I understood (TBD - placeholder for now)

### "Check if partner gets me" Flow

**Checker (initiator):**
1. User taps [Check if partner gets me]
2. Sees: "How much does [Partner] understand you?" with rating buttons
3. Submits rating
4. Waits for partner to respond

**Partner (responder):**
1. Receives notification: "[Partner] wants to check if you understand them"
2. Sees rating buttons: "How much do you understand [Partner]?"
3. Submits rating
4. Gap revealed after both submit

### Benefits
1. **Simpler variables**: `checkerName` (who initiated), `myRating`, `partnerRating`
2. **Clear ownership**: The person who taps "Check" is always the one being understood
3. **Intent signal**: Both users know WHY the rating is happening

## Variables for "Check" Flow

```typescript
interface LiveSessionState {
  // Session basics
  sessionId: string;
  partnerName: string;
  isConnected: boolean;

  // Current understanding check
  checkInProgress: boolean;
  checkerName?: string;           // Who tapped "Check if partner gets me"

  // Ratings - always from checker's perspective
  // "How much does partner understand the checker?"
  checkerRating?: number;         // Checker's belief (self-assessment)
  responderRating?: number;       // Responder's belief (how much they understand checker)

  checkerSubmitted: boolean;
  responderSubmitted: boolean;

  // Phase
  phase: 'idle' | 'rating' | 'waiting' | 'revealed' | 'explain-back' | 'results';

  // Explain-back (for gap resolution)
  explainBackInProgress: boolean;
  explainBackRound: number;
  explainBackRatings: number[];
}
```

### Key Simplification
- **No more speaker/listener** - just "checker" (who initiated) and "responder" (partner)
- **Both rate the same question**: "How much does responder understand checker?"
  - Checker answers: "How much does [Partner] understand me?" (belief about partner)
  - Responder answers: "How much do I understand [Checker]?" (self-assessment)
- **Ratings always describe the same thing** - the responder's understanding of the checker

## Screen Flow for "Check"

### Screen 0: Idle (Both phones)
```
Achieve Clarity Together

[Check partner's     [Prove my
 understanding]       understanding]
                      (disabled/placeholder)
```

### Screen 1a: Checker taps button, rates (Gosha's phone)
```
How much does Slava understand you?
[0][1][2]...[10]
```

### Screen 1b: After Checker submits (Gosha's phone)
```
You believe Slava understands you at: 7/10
Waiting for Slava to rate...
[Cancel]
```

### Screen 2: Responder sees notification (Slava's phone)
```
Gosha wants to check if you understand them.

How much do you understand Gosha?
[0][1][2]...[10]
```

### Screen 3: Both submitted - Gap revealed
(Same as current - shows gap, offers explain-back if needed)

## Mapping Old → New Variables

| Old Variable | New Variable | Notes |
|--------------|--------------|-------|
| `speakerName` | `checkerName` | Who initiated the check |
| `listenerName` | (derived) | `partnerName` when not checker |
| `speakerRating` | `checkerRating` | Checker's belief about partner |
| `listenerRating` | `responderRating` | Responder's self-assessment |
| `speakerRatingSubmitted` | `checkerSubmitted` | - |
| `listenerRatingSubmitted` | `responderSubmitted` | - |
| `ratingPhase` | `phase` | Simplified phases |

## Open Questions
1. What happens if responder doesn't respond? (timeout → skip?)
2. Can both users tap "Check" at the same time? (race condition)
3. "Prove I understand partner" flow - design later

## Implementation Status

### Completed
1. ✅ Document new model in this file
2. ✅ Refactor `LiveSessionState` type to use new variables (`checkerName`, `checkerRating`, `responderRating`, `checkerSubmitted`, `responderSubmitted`)
3. ✅ Update `live-mode-view.tsx` to use new variable names (all screens updated)
4. ✅ Add idle screen with Check/Prove buttons
5. ✅ Implement the Check flow with new variable semantics
6. ✅ Update `clarity-live-page.tsx` handlers for new model

### Pending (Future Work)
- Implement "Prove I understand partner" flow (placeholder button added)
- Handle race condition if both users tap "Check" simultaneously
