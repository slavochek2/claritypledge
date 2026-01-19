# P72: E2E Test for Celebration Continue Flow

## Status: Planned

## Context

P71 fixed the celebration Continue button coordination. This feature adds E2E test coverage to prevent regression.

## Motivation

Unit tests verify component behavior with mocked state, but E2E tests verify the full flow:
- Realtime state synchronization between two browser contexts
- Actual button click → state update → UI refresh cycle
- Race conditions with network latency

## Test Scenario

### Happy Path: Both Click Continue

```
1. Creator and Joiner in same session
2. Start verification round (Creator clicks "Did you understand me?")
3. Both rate 10 → celebration screen appears
4. Creator clicks Continue → sees disabled button + "Waiting for Joiner..."
5. Joiner clicks Continue → both return to idle screen
```

### Edge Cases

- Creator clicks Continue, waits 5s, Joiner clicks → verify transition
- Rapid double-click on Continue → should not cause issues
- Network disconnect after Continue click → verify recovery

## Implementation Notes

### Pattern from Existing Tests

See `e2e/creator-detects-joiner.spec.ts` for two-context pattern.

### Test Skeleton

```typescript
// e2e/celebration-continue.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Celebration Continue Flow', () => {
  test('both users can continue after celebration', async ({ browser }) => {
    // Create two browser contexts
    const creatorContext = await browser.newContext({ permissions: ['microphone'] });
    const joinerContext = await browser.newContext({ permissions: ['microphone'] });

    const creatorPage = await creatorContext.newPage();
    const joinerPage = await joinerContext.newPage();

    // Setup session (reuse helper)
    // ...

    // Reach celebration (both rate 10)
    // Creator submits rating of 10
    // Joiner submits confidence of 10
    // Both see celebration screen

    // Creator clicks Continue
    await creatorPage.getByRole('button', { name: /continue/i }).click();
    await expect(creatorPage.getByRole('button', { name: /continue/i })).toBeDisabled();
    await expect(creatorPage.getByText(/waiting for/i)).toBeVisible();

    // Joiner still sees enabled button
    await expect(joinerPage.getByRole('button', { name: /continue/i })).toBeEnabled();

    // Joiner clicks Continue
    await joinerPage.getByRole('button', { name: /continue/i }).click();

    // Both return to idle
    await expect(creatorPage.getByTestId('start-check')).toBeVisible();
    await expect(joinerPage.getByTestId('start-check')).toBeVisible();

    // Cleanup
    await creatorContext.close();
    await joinerContext.close();
  });
});
```

## Acceptance Criteria

- [ ] E2E test covers full celebration → continue → idle flow
- [ ] Test uses two browser contexts (creator + joiner)
- [ ] Test verifies waiting state for first clicker
- [ ] Test verifies transition when both click
- [ ] Test cleans up session after completion

## Dependencies

- [live-session-testing.md](docs/technical/live-session-testing.md) - Testing patterns
- [creator-detects-joiner.spec.ts](e2e/creator-detects-joiner.spec.ts) - Reference implementation

## Estimate

Small (~2-4 hours) - mostly copying existing patterns with new assertions.
