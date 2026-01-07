# P23.3: "Did I get it?" — Listener-Initiated Understanding Check

## Overview

Add a second understanding check flow where the **listener** initiates by tapping "Did I get it?" — volunteering to prove they understood the speaker. This is the mirror image of "Did you get it?" (speaker-initiated).

**Wireframe:** [wireframe-did-i-get-it.excalidraw](../docs/bmad/diagrams/wireframe-did-i-get-it.excalidraw)

## User Story

> As a listener in a Live Clarity Meeting, I want to proactively prove that I understood the speaker, so I can demonstrate my commitment to clarity without waiting for them to check me.

## Role Terminology

| Term | "Did you get it?" | "Did I get it?" |
|------|-------------------|-----------------|
| **Initiator** | Speaker (checker) | Listener (prover) |
| **Receiver** | Listener (responder) | Speaker |
| **Who's tested** | Listener | Listener (same!) |
| **Who initiates** | Speaker asks "did you get me?" | Listener offers "let me prove I got you" |

**Key insight:** In both flows, the LISTENER is the one being tested. The difference is who initiates the check.

## Implementation

### 1. Add New Handler: `onStartProve`

In [clarity-live-page.tsx](../src/app/pages/clarity-live-page.tsx), add a new handler parallel to `handleStartCheck`:

```typescript
// Listener taps "Did I get it?" — they become the prover
const handleStartProve = async () => {
  if (!session?.id || !userName) return;

  // In "Did I get it?", the LISTENER initiates
  // But the roles flip: listener is now the "responder" who rates first
  // Speaker becomes the "checker" who rates "how understood do I feel?"

  await updateLiveState(session.id, {
    ...liveState,
    ratingPhase: 'rating',
    // The person who tapped becomes the responder (they rate their confidence)
    // The partner becomes the checker (they rate how understood they feel)
    checkerName: partnerName, // Speaker becomes checker
    proverName: userName,     // NEW FIELD: Track who initiated "Did I get it?"
    checkerSubmitted: false,
    responderSubmitted: false,
    checkerRating: undefined,
    responderRating: undefined,
  });

  // Local state: prover rates immediately
  setIsLocallyRating(true);
};
```

### 2. Add `proverName` to LiveSessionState

In [types/index.ts](../src/app/types/index.ts), add to `LiveSessionState`:

```typescript
// V12: "Did I get it?" — listener-initiated check
// When set, indicates listener initiated (proverName = listener)
// When undefined, indicates speaker initiated (checkerName = speaker)
proverName?: string;
```

### 3. Update IdleScreen Buttons

In [live-mode-view.tsx](../src/app/components/partners/live-mode-view.tsx), enable the "Did I get it?" button:

```tsx
// IdleScreen component
<Button
  variant="outline"
  size="lg"
  className="w-full"
  onClick={onStartProve}  // NEW PROP
  disabled={showRatingDrawer}
>
  Did <span className="underline font-bold">I</span> get it?
</Button>
```

### 4. Update Rating Questions

The questions change based on who initiated:

| Flow | Initiator rates | Receiver rates |
|------|-----------------|----------------|
| "Did you get it?" | Speaker: "How well does [Listener] understand you?" | Listener: "How confident are you that you understand [Speaker]?" |
| "Did I get it?" | Listener: "How confident are you that you understand [Speaker]?" | Speaker: "How well do you feel understood?" |

In `RatingScreen`, detect which flow we're in:

```tsx
const isProverInitiated = liveState.proverName !== undefined;
const isProver = liveState.proverName === currentUserName;

// Determine question
let prompt: string;
if (isProverInitiated) {
  // "Did I get it?" flow
  prompt = isProver
    ? `How confident are you that you understand ${displayPartnerName}?`
    : `How well do you feel understood by ${displayPartnerName}?`;
} else {
  // "Did you get it?" flow (existing)
  prompt = isChecker
    ? `How well do you feel ${displayPartnerName} understands you?`
    : `How confident are you that you understand ${checkerName}?`;
}
```

### 5. Update Drawer Notification for Speaker

When listener taps "Did I get it?", speaker sees drawer:

```tsx
// In IdleScreen, when prover initiated
<Drawer open={showRatingDrawer}>
  <DrawerContent>
    <DrawerHeader>
      <DrawerTitle>{proverName} wants to prove understanding</DrawerTitle>
    </DrawerHeader>
    <div className="px-4 pb-8 pt-4 space-y-4">
      <RatingCard
        question={`How well do you feel understood by ${proverName}?`}
        onSelect={onRatingSubmit}
      />
      <Button variant="outline" onClick={onSkip}>Decline</Button>
    </div>
  </DrawerContent>
</Drawer>
```

### 6. Rest of Flow is Identical

Once both have rated:
- Gap detection works the same
- Explain-back flow is the same (listener explains, speaker rates)
- Journey history shows the same structure

## Props Changes

### LiveModeViewProps

Add:
```typescript
onStartProve: () => void;
```

### IdleScreenProps

Add:
```typescript
onStartProve: () => void;
```

## State Changes

### LiveSessionState additions

```typescript
// V12: "Did I get it?" flow
proverName?: string; // Set when listener initiates, undefined when speaker initiates
```

### DEFAULT_LIVE_STATE

No changes needed — `proverName` defaults to `undefined`.

## UI Label Changes

### IdleScreen

| Current | New |
|---------|-----|
| `Did you get it?` (primary) | Same |
| `Did I get it?` (disabled) | `Did I get it?` (enabled, outline style) |

### JourneyToUnderstanding Header

Detect flow and adjust header:

```tsx
// When prover initiated
const headerText = isProverInitiated
  ? (isProver
      ? `Your journey to understand ${checkerName}`
      : `${proverName}'s journey to understand you`)
  : (isChecker
      ? `${displayPartnerName}'s journey to understand you`
      : `Your journey to understand ${checkerName}`);
```

## Testing Checklist

- [ ] Listener can tap "Did I get it?" from idle screen
- [ ] Listener immediately sees confidence rating screen
- [ ] Speaker sees drawer notification with "How well do you feel understood?"
- [ ] Both ratings are sealed-bid (hidden until both submit)
- [ ] Gap detection works correctly
- [ ] Explain-back flow triggers if gap detected
- [ ] JourneyToUnderstanding shows correct perspective for both users
- [ ] Skip/decline works for both users
- [ ] Returning to idle clears proverName

## Edge Cases

1. **Simultaneous taps:** If both users tap their respective buttons at the same time, first write wins (Supabase optimistic locking). Second user's tap is ignored.

2. **Mixed flows:** After returning to idle, either flow can be initiated next. Each flow is independent.

3. **Explain-back flow:** Always the same — listener explains, speaker rates — regardless of who initiated.

## Files to Modify

1. `src/app/types/index.ts` — Add `proverName` to `LiveSessionState`
2. `src/app/pages/clarity-live-page.tsx` — Add `handleStartProve` handler
3. `src/app/components/partners/live-mode-view.tsx`:
   - Add `onStartProve` prop
   - Enable "Did I get it?" button
   - Update rating questions based on flow
   - Update drawer notification for speaker
   - Update JourneyToUnderstanding header
