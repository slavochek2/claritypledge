# Testing /live Sessions

**Last Updated:** 2026-01-18

---

## Overview

The `/live` feature enables real-time verification sessions between two participants. Testing requires simulating two-party interactions with synchronized state.

## Architecture

### Session Flow

1. **Creator** navigates to `/live`, enters name + email, clicks "New meeting"
2. System generates 6-character room code (e.g., `ABC123`)
3. **Joiner** navigates to `/live/ABC123`, enters name + email, clicks "Join Meeting"
4. Both participants see synchronized state via Supabase Realtime + polling fallback

### State Synchronization

- **Primary:** Supabase Realtime subscription (`subscribeToClaritySession`)
- **Fallback:** Polling at 1000ms interval (for unreliable mobile connections)
- **State machine:** `LiveSessionState` with ref-based optimistic updates

### Key State Fields

```typescript
interface LiveSessionState {
  ratingPhase: 'idle' | 'rating' | 'results' | 'revealed' | 'explain-back';
  checkerName?: string;           // Who initiated the check
  checkerRating?: number;         // Speaker's rating (0-10)
  responderRating?: number;       // Listener's confidence (0-10)
  checkerSubmitted: boolean;
  responderSubmitted: boolean;
  celebrationAcknowledgedBy?: string[];  // Who clicked Continue on celebration
  // ... more fields
}
```

## Unit Testing (Vitest)

### Test File

`src/tests/live-mode-view.test.tsx`

### Pattern: Testing Component States

```typescript
it('shows waiting state when user has acknowledged but partner has not', () => {
  const aliceAcknowledgedState: LiveSessionState = {
    ...DEFAULT_LIVE_STATE,
    ratingPhase: 'revealed',
    checkerName: 'alice',
    checkerRating: 10,
    responderRating: 10,
    checkerSubmitted: true,
    responderSubmitted: true,
    celebrationAcknowledgedBy: ['alice'], // Alice clicked Continue
  };

  renderWithRouter(
    <LiveModeView
      {...defaultProps}
      currentUserName="alice"
      partnerName="bob"
      liveState={aliceAcknowledgedState}
    />
  );

  // Alice should see disabled button + waiting indicator
  const continueButton = screen.getByRole('button', { name: /continue/i });
  expect(continueButton).toBeDisabled();
  expect(screen.getByText(/waiting for bob/i)).toBeInTheDocument();
});
```

### Testing Both Perspectives

Always test from both participants' perspectives:

```typescript
// Test as checker (alice)
renderWithRouter(
  <LiveModeView currentUserName="alice" partnerName="bob" liveState={state} />
);

// Test as responder (bob)
renderWithRouter(
  <LiveModeView currentUserName="bob" partnerName="alice" liveState={state} />
);
```

## E2E Testing (Playwright)

### Existing Pattern

See `e2e/creator-detects-joiner.spec.ts` for the established pattern:

```typescript
test.describe('Live session', () => {
  test('creator detects when joiner connects', async ({ browser }) => {
    // Create two browser contexts
    const creatorContext = await browser.newContext({
      permissions: ['microphone'],
    });
    const joinerContext = await browser.newContext({
      permissions: ['microphone'],
    });

    const creatorPage = await creatorContext.newPage();
    const joinerPage = await joinerContext.newPage();

    // Creator flow
    await creatorPage.goto('/live');
    await creatorPage.getByPlaceholder('Your name').fill('Alice');
    await creatorPage.getByPlaceholder('your@email.com').fill('alice@test.com');
    await creatorPage.getByRole('checkbox').check();
    await creatorPage.getByRole('button', { name: /new meeting/i }).click();

    // Extract room code from share link
    const shareLink = await creatorPage.getByRole('link', { name: /copy/i }).getAttribute('href');
    const roomCode = shareLink?.split('/').pop();

    // Joiner flow
    await joinerPage.goto(`/live/${roomCode}`);
    await joinerPage.getByPlaceholder('Your name').fill('Bob');
    await joinerPage.getByPlaceholder('your@email.com').fill('bob@test.com');
    await joinerPage.getByRole('checkbox').check();
    await joinerPage.getByRole('button', { name: /join/i }).click();

    // Both should see each other
    await expect(creatorPage.getByText('Bob')).toBeVisible();
    await expect(joinerPage.getByText('Alice')).toBeVisible();
  });
});
```

### Test Helpers

Location: `e2e/helpers/test-user.ts`

```typescript
import { createTestUser, deleteClaritySession } from './helpers/test-user';

// Create session
const sessionCode = await createClaritySession(page, 'Alice', 'alice@test.com');

// Cleanup
await deleteClaritySession(sessionCode);
```

## Manual Testing with Browser Tools

### Using Docker MCP Browser Tools

```typescript
// Open two tabs
await mcp__MCP_DOCKER__browser_tabs({ action: 'new' });
await mcp__MCP_DOCKER__browser_navigate({ url: 'http://localhost:5001/live' });

// Tab 1: Creator
await mcp__MCP_DOCKER__browser_type({ ref: 'name-input', text: 'Alice' });
// ... fill form, click create

// Get room code from UI

// Tab 2: Joiner
await mcp__MCP_DOCKER__browser_tabs({ action: 'select', index: 1 });
await mcp__MCP_DOCKER__browser_navigate({ url: 'http://localhost:5001/live/ROOMCODE' });
// ... fill form, click join
```

### Using Chrome DevTools MCP

Similar approach with `mcp__chrome-devtools__` tools (for debugging/performance).

## Coordination Patterns

### Waiting State Pattern

Used when one user completes an action and waits for partner:

```typescript
// State tracking
const acknowledged = liveState.celebrationAcknowledgedBy || [];
const userHasAcknowledged = acknowledged.includes(currentUserName);

// UI rendering
<Button disabled={userHasAcknowledged}>Continue</Button>
{userHasAcknowledged && (
  <WaitingIndicator message={`Waiting for ${partnerName} to continue...`} />
)}
```

### Both-Acknowledged Transition

In `clarity-live-page.tsx`:

```typescript
const handleCelebrationComplete = useCallback(() => {
  const acknowledged = currentState.celebrationAcknowledgedBy || [];

  if (acknowledged.includes(name)) return; // Already acknowledged

  const newAcknowledged = [...acknowledged, name];
  const bothAcknowledged = partnerName && newAcknowledged.includes(partnerName);

  if (bothAcknowledged) {
    // Reset to idle - both done
    updateLiveState({ ratingPhase: 'idle', ... });
  } else {
    // Wait for partner
    updateLiveState({ celebrationAcknowledgedBy: newAcknowledged });
  }
}, [name, partnerName, updateLiveState]);
```

## Common Issues

### Race Conditions

- Use ref-based state (`confirmedLiveStateRef`) for accurate current state
- Block optimistic updates during `updateInFlightRef=true`

### Mobile Connection Issues

- Realtime subscriptions can be unreliable on mobile
- Polling fallback at 1000ms ensures eventual consistency

### Test Isolation

- Each test should create a fresh session
- Always cleanup sessions after tests

## Related Files

- [live-mode-view.tsx](../../src/app/components/partners/live-mode-view.tsx) - Main UI component
- [clarity-live-page.tsx](../../src/app/pages/clarity-live-page.tsx) - Page with state management
- [api.ts](../../src/app/data/api.ts) - Session CRUD functions
- [creator-detects-joiner.spec.ts](../../e2e/creator-detects-joiner.spec.ts) - E2E example
