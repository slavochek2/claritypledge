/**
 * @file speak-freely-label.test.tsx
 * @description Unit tests for "Speak Freely" button label consistency (B31_2)
 *
 * Requirement: All listener "Skip"/"Speak freely" buttons should:
 * 1. Default to "Speak freely" (not "Skip")
 * 2. Trigger negotiation dialog (use onSharePerspective, not onSkip)
 *
 * Exception: "Skip without waiting" is correct for when negotiation is already pending
 */

import { describe, it, expect } from 'vitest';

describe('Speak Freely Label - Defaults', () => {

  it('WaitingIndicator should default to "Speak freely" (not "Skip")', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const filePath = path.resolve(__dirname, '../app/components/partners/live-mode-view.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Check WaitingIndicator default skipLabel
    const waitingIndicatorMatch = content.match(/function WaitingIndicator\([^)]*skipLabel\s*=\s*["']([^"']+)["']/);
    expect(waitingIndicatorMatch).not.toBeNull();
    expect(waitingIndicatorMatch?.[1]).toBe('Speak freely');
  });

  it('RatingCard should default to "Speak freely" (not "Skip")', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const filePath = path.resolve(__dirname, '../app/components/partners/live-mode-view.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Check RatingCard default skipLabel
    const ratingCardMatch = content.match(/function RatingCard\([^)]*skipLabel\s*=\s*["']([^"']+)["']/);
    expect(ratingCardMatch).not.toBeNull();
    expect(ratingCardMatch?.[1]).toBe('Speak freely');
  });

  it('should NOT have plain "Skip" as a default label anywhere', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const filePath = path.resolve(__dirname, '../app/components/partners/live-mode-view.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    // WaitingIndicator default should NOT be just "Skip"
    const waitingIndicatorDefault = content.match(/function WaitingIndicator\([^)]*skipLabel\s*=\s*["']Skip["']/);
    expect(waitingIndicatorDefault).toBeNull();

    // RatingCard default should NOT be just "Skip"
    const ratingCardDefault = content.match(/function RatingCard\([^)]*skipLabel\s*=\s*["']Skip["']/);
    expect(ratingCardDefault).toBeNull();
  });

});

describe('Speak Freely Label - Negotiation Wiring', () => {

  it('should preserve "Skip without waiting" for pending negotiation states', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const filePath = path.resolve(__dirname, '../app/components/partners/live-mode-view.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Verify "Skip without waiting" is still used where intended
    expect(content).toContain('skipLabel="Skip without waiting"');
  });

  it('listener waiting states should use onSharePerspective (not onSkip) for Speak freely', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const filePath = path.resolve(__dirname, '../app/components/partners/live-mode-view.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Key listener waiting states should use onSharePerspective:
    // 1. After "Done Explaining" - waiting for speaker to evaluate
    // 2. Waiting for speaker to finish clarifying
    // 3. Speaker is deciding whether to clarify

    // These patterns should use onSharePerspective (triggers negotiation dialog)
    const listenerWaitingPatterns = [
      // After "Done Explaining"
      /Waiting for .* to evaluate how well you captured their idea.*onSkip=\{onSharePerspective\}/s,
      // Waiting for speaker to finish clarifying (listener view)
      /Waiting for .* to finish clarifying.*onSkip=\{onSharePerspective\}/s,
      // Speaker is deciding whether to clarify (listener view)
      /is deciding whether to clarify.*onSkip=\{onSharePerspective\}/s,
    ];

    for (const pattern of listenerWaitingPatterns) {
      expect(content).toMatch(pattern);
    }
  });

});
