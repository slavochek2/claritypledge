/**
 * P1628: the smokes' recorder watch must not report success when the local /record reply failed.
 * Runs the real helper against a stub page, because a real browser cannot be made to reject fulfil on demand.
 */
import { describe, it, expect } from 'vitest';
import type { Page } from '@playwright/test';
import { keepRecorderWithoutStoringReplays } from '../../e2e/helpers/prod-health';

function stubPage() {
  let onRequest: ((req: { url: () => string }) => void) | undefined;
  let handler: ((route: unknown) => Promise<void>) | undefined;
  const page = {
    addInitScript: async () => undefined,
    on: (ev: string, h: (req: { url: () => string }) => void) => { if (ev === 'request') onRequest = h; },
    route: async (_url: string, h: (route: unknown) => Promise<void>) => { handler = h; },
    evaluate: async () => [],
    waitForTimeout: async () => undefined,
  } as unknown as Page;
  return { page, request: (url: string) => onRequest?.({ url: () => url }), upload: (route: unknown) => handler!(route) };
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

  // P1648: /live stops the recorder on mount, so a flush there is a race, not a signal.
  describe('routes that stop the recorder on mount', () => {
    it('/live: timeout passes when the recorder bundle was requested', async () => {
      const { page, request } = stubPage();
      const watch = await keepRecorderWithoutStoringReplays(page);
      request('https://cdn.mxpnl.com/libs/mixpanel-recorder.min.js');
      const state = await watch.waitForFirstFlush(50);
      expect(state).toBe('timeout');
      expect(() => watch.assertExercised(state, '/live')).not.toThrow();
    });

    it('/live CONTROL: timeout still fails when the bundle was never requested (opt-in broken)', async () => {
      const { page } = stubPage();
      const watch = await keepRecorderWithoutStoringReplays(page);
      const state = await watch.waitForFirstFlush(50);
      expect(() => watch.assertExercised(state, '/live')).toThrow(/recorder never reached/);
    });

    it('/live CONTROL: a recorder CSP block still fails', async () => {
      const { page, request } = stubPage();
      (page as unknown as { evaluate: () => Promise<string[]> }).evaluate = async () => ['script-src blocked mixpanel-recorder'];
      const watch = await keepRecorderWithoutStoringReplays(page);
      request('https://cdn.mxpnl.com/libs/mixpanel-recorder.min.js');
      const state = await watch.waitForFirstFlush(50);
      expect(state).toBe('blocked');
      expect(() => watch.assertExercised(state, '/live')).toThrow(/recorder never reached/);
    });

    it('CONTROL: other routes still fail on timeout even with the bundle requested', async () => {
      const { page, request } = stubPage();
      const watch = await keepRecorderWithoutStoringReplays(page);
      request('https://cdn.mxpnl.com/libs/mixpanel-recorder.min.js');
      const state = await watch.waitForFirstFlush(50);
      expect(() => watch.assertExercised(state, '/')).toThrow(/recorder never reached/);
      expect(() => watch.assertExercised(state)).toThrow(/recorder never reached/);
    });
  });
});
