/**
 * @file p1307-web-locks-single-capture.test.ts
 * @description P1307 Architecture Decision 7 — one capture per browser via the Web Locks
 * API: `navigator.locks.request('cp-room-capture-<roomId>', { mode: 'exclusive',
 * ifAvailable: true }, ...)`. A second tab's non-blocking request fails immediately and
 * that tab renders Open/End without capturing.
 *
 * `navigator.locks` does not exist in jsdom, so it is mocked here exactly as the real API
 * shapes it (a callback-based `request` that resolves the callback's return value, and
 * resolves to `null` when `ifAvailable` and the lock is held). This tests the DECISION —
 * that an `ifAvailable: true` exclusive lock request is used with the room-scoped name —
 * not a full multi-tab browser integration, which is out of this file's reach and is
 * instead the E2E spec's "two tabs open while transcribing: exactly one captures" test.
 *
 * ASSUMPTION, stated because the module does not exist yet: the lock-acquisition helper is
 * exported as `acquireCaptureLock(roomId)` from `src/app/contexts/room-capture-context.tsx`,
 * returning `{ acquired: boolean }` (or equivalent) without needing the whole provider
 * mounted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const requestSpy = vi.fn();

beforeEach(() => {
  requestSpy.mockReset();
  Object.defineProperty(globalThis.navigator, 'locks', {
    configurable: true,
    value: { request: requestSpy },
  });
});

describe('P1307: acquireCaptureLock — one capture per browser', () => {
  it('requests an EXCLUSIVE, non-blocking (ifAvailable) lock scoped to the room id', async () => {
    requestSpy.mockImplementation((name: string, opts: Record<string, unknown>, cb: () => unknown) => {
      expect(name).toBe('cp-room-capture-r1');
      expect(opts.mode).toBe('exclusive');
      expect(opts.ifAvailable).toBe(true);
      return Promise.resolve(cb());
    });
    // /dev: imported from room-capture-core, not room-capture-context. The context imports the
    // Supabase client, whose auth layer takes a Web Lock of its own on load
    // ("lock:sb-…-auth-token") — that second request made "exactly one request" unobservable.
    const { acquireCaptureLock } = await import('@/app/contexts/room-capture-core');
    await acquireCaptureLock('r1');
    expect(requestSpy).toHaveBeenCalledTimes(1);
  });

  it('a second tab\'s request (lock already held) resolves to "not acquired", never throws', async () => {
    // Per the Web Locks spec, an ifAvailable request whose lock is unavailable invokes the
    // callback with `null` rather than rejecting.
    requestSpy.mockImplementation((_name: string, _opts: Record<string, unknown>, cb: (lock: unknown) => unknown) =>
      Promise.resolve(cb(null)));
    const { acquireCaptureLock } = await import('@/app/contexts/room-capture-core');
    const result = await acquireCaptureLock('r1');
    expect(result?.acquired ?? result, 'a held lock must read as "not acquired", not throw or hang').toBeFalsy();
  });

  it('two different rooms use two different lock names — a lock for room A must not block room B', async () => {
    const names: string[] = [];
    requestSpy.mockImplementation((name: string, _opts: unknown, cb: () => unknown) => {
      names.push(name);
      return Promise.resolve(cb());
    });
    const { acquireCaptureLock } = await import('@/app/contexts/room-capture-core');
    await acquireCaptureLock('roomA');
    await acquireCaptureLock('roomB');
    expect(names[0]).not.toBe(names[1]);
  });
});
