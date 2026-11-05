/**
 * P1628: the smokes' recorder watch must not report success when the local /record reply failed.
 * Runs the real helper against a stub page, because a real browser cannot be made to reject fulfil on demand.
 */
import { describe, it, expect } from 'vitest';
import type { Page } from '@playwright/test';
import { keepRecorderWithoutStoringReplays } from '../../e2e/helpers/prod-health';

function stubPage() {
  let handler: ((route: unknown) => Promise<void>) | undefined;
  const page = {
    addInitScript: async () => undefined,
    on: () => undefined,
    route: async (_url: string, h: (route: unknown) => Promise<void>) => { handler = h; },
    evaluate: async () => [],
    waitForTimeout: async () => undefined,
  } as unknown as Page;
  return { page, upload: (route: unknown) => handler!(route) };
}

describe('P1628: recorder watch', () => {
  it('counts an upload whose local reply succeeded', async () => {
    const { page, upload } = stubPage();
    const watch = await keepRecorderWithoutStoringReplays(page);
    await upload({ fulfill: async () => undefined });
    expect(await watch.waitForFirstFlush(50)).toBe('flushed');
  });

  it('does not count an upload whose local reply failed', async () => {
    const { page, upload } = stubPage();
    const watch = await keepRecorderWithoutStoringReplays(page);
    await upload({ fulfill: async () => { throw new Error('route closed'); } });
    const state = await watch.waitForFirstFlush(50);
    expect(state).toBe('timeout');
    expect(() => watch.assertExercised(state)).toThrow(/recorder never reached/);
  });
});
