# Testing /live Sessions

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

### Using Claude in Chrome — Two-Party via Origin Isolation (Canonical Approach)

Claude in Chrome (`mcp__claude-in-chrome__*`) uses your real Chrome profile, so all same-origin
tabs share `localStorage`. Supabase stores auth tokens in `localStorage` — this would normally
prevent two different authenticated users from coexisting in two tabs.

**Solution: use different hostnames.** Because Vite is configured with `host: true` (binds to
`0.0.0.0`), the dev server is reachable as **both** `localhost:5001` and `127.0.0.1:5001`.
Different origins = separate `localStorage` namespaces = two fully independent Supabase sessions
in the same Chrome window.

```
Tab 1 (creator):  http://localhost:5001        → localStorage[localhost:5001]
Tab 2 (listener): http://127.0.0.1:5001        → localStorage[127.0.0.1:5001]
```

**Permanent listener account credentials:** stored in `.env.test.local`
- `TEST_LISTENER_EMAIL` / `TEST_LISTENER_PASSWORD`
- Created by: `scripts/setup-verify-listener.ts`

**Full boot protocol:** See `/verify` SKILL.md → Step 5a-TWO-PARTY (5-step macro B1–B5).

**What this approach enables (verified in P272 UAT):**
- Role-specific UI isolation: story picker only on creator tab, not listener ✅
- Real-time story sync: creator selects story → appears on listener within ~2s ✅
- Identity-correct DB writes: `profile_id` differs for creator vs listener ✅
- Verification writes (`story_verifications`) trigger with correct speaker/listener roles ✅

**Limitations:**
- Both origins must be reachable (requires `host: true` in vite.config.ts — already set)
- Listener must log in as a real Supabase account (`e2e-verify-listener@gmail.com`), not guest

**What does NOT work (abandoned approach — token injection):**
The old method of injecting the listener's token into tab 2's `localStorage` via
`javascript_tool` fails for role-specific UI testing: the `storage` event propagates to
tab 1, overwriting the creator's auth state. Role-specific UI (story picker, verification
writes) cannot be reliably tested this way. **Do not use token injection.**

### Using Chrome DevTools MCP

For debugging and performance profiling only — not two-party testing. Use the origin isolation
approach above for any UAT that requires role-specific behavior.

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
