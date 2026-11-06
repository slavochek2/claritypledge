/**
 * P1628: the smokes' recorder watch must not report success when the local /record reply failed.
 * Runs the real helper against a stub page, because a real browser cannot be made to reject fulfil on demand.
 */
import { describe, it, expect } from 'vitest';
import type { Page } from '@playwright/test';
import { keepRecorderWithoutStoringReplays } from '../../e2e/helpers/prod-health';

type StubReq = { url: () => string; response: () => Promise<{ ok: () => boolean } | null> };
const BUNDLE = 'https://cdn.mxpnl.com/libs/mixpanel-recorder.min.js';

function stubPage() {
  const listeners: Record<string, (req: StubReq) => void> = {};
  let handler: ((route: unknown) => Promise<void>) | undefined;
  const page = {
    addInitScript: async () => undefined,
    on: (ev: string, h: (req: StubReq) => void) => { listeners[ev] = h; },
    route: async (_url: string, h: (route: unknown) => Promise<void>) => { handler = h; },
    evaluate: async () => [],
    waitForTimeout: async () => undefined,
  } as unknown as Page;
  const req = (url: string, status: number | null): StubReq => ({
    url: () => url,
    response: async () => (status === null ? null : { ok: () => status >= 200 && status < 300 }),
  });
  return {
    page,
    /** The browser asked for the bundle (the download may never finish). */
    request: (url: string) => listeners.request?.(req(url, null)),
    /** The bundle download finished with this HTTP status. */
    finish: async (url: string, status: number) => {
      listeners.request?.(req(url, status));
      listeners.requestfinished?.(req(url, status));
      await new Promise((r) => setTimeout(r, 0));
    },
    upload: (route: unknown) => handler!(route),
  };
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
    it('/live: timeout passes when the recorder bundle loaded ok', async () => {
      const { page, finish } = stubPage();
      const watch = await keepRecorderWithoutStoringReplays(page);
      await finish(BUNDLE, 200);
      const state = await watch.waitForFirstFlush(50);
      expect(state).toBe('timeout');
      expect(() => watch.assertExercised(state, '/live')).not.toThrow();
    });

    // P1648 review finding 1: "requested" is not "loaded". These two fail with the exemption keyed on bundleRequested.
    it('/live CONTROL: a bundle that was requested but never finished downloading (stalled/aborted) fails', async () => {
      const { page, request } = stubPage();
      const watch = await keepRecorderWithoutStoringReplays(page);
      request(BUNDLE);
      const state = await watch.waitForFirstFlush(50);
      expect(watch.recorderBundleRequested()).toBe(true);
      expect(() => watch.assertExercised(state, '/live')).toThrow(/loaded ok=false/);
    });

    it('/live CONTROL: a bundle that finished with a 404 fails', async () => {
      const { page, finish } = stubPage();
      const watch = await keepRecorderWithoutStoringReplays(page);
      await finish(BUNDLE, 404);
      const state = await watch.waitForFirstFlush(50);
      expect(() => watch.assertExercised(state, '/live')).toThrow(/recorder never reached/);
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
      request(BUNDLE);
      const state = await watch.waitForFirstFlush(50);
      expect(state).toBe('blocked');
      expect(() => watch.assertExercised(state, '/live')).toThrow(/recorder never reached/);
    });

    it('CONTROL: other routes still fail on timeout even with the bundle loaded ok', async () => {
      const { page, finish } = stubPage();
      const watch = await keepRecorderWithoutStoringReplays(page);
      await finish(BUNDLE, 200);
      const state = await watch.waitForFirstFlush(50);
      expect(() => watch.assertExercised(state, '/')).toThrow(/recorder never reached/);
      expect(() => watch.assertExercised(state)).toThrow(/recorder never reached/);
    });
  });
});
