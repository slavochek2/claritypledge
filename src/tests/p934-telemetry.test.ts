/**
 * P934 Canary — receiver-side telemetry for /live position propagation diagnostics.
 *
 * Verifies that:
 * 1. subscribeToClaritySession calls onStatusChange on all 4 Supabase channel statuses
 *    (SUBSCRIBED, CLOSED, CHANNEL_ERROR, TIMED_OUT) — so a dropped channel is visible
 *    in analytics after the fact.
 * 2. A SUBSCRIBED/CLOSED status is forwarded (not just error statuses).
 * 3. Other statuses are NOT forwarded (no noise).
 *
 * Reverting the onStatusChange wiring in api.ts must make these tests fail.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  let capturedSubscribeCb: ((status: string) => void) | null = null;

  const subscribeFn = vi.fn((cb: (status: string) => void) => {
    capturedSubscribeCb = cb;
    return {};
  });
  const onFn = vi.fn((_event: string, _filter: unknown, _cb: (payload: unknown) => void) => {
    return { subscribe: subscribeFn };
  });
  const channelFn = vi.fn(() => ({ on: onFn, subscribe: subscribeFn }));
  const removeChannelFn = vi.fn();

  const singleFn = vi.fn().mockResolvedValue({ data: null, error: null });
  const eqFn = vi.fn(() => ({ single: singleFn }));
  const selectFn = vi.fn(() => ({ eq: eqFn }));
  const fromFn = vi.fn(() => ({ select: selectFn }));

  return {
    channel: channelFn,
    on: onFn,
    subscribe: subscribeFn,
    removeChannel: removeChannelFn,
    from: fromFn,
    getStatusCallback: () => capturedSubscribeCb,
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: mocks.channel,
    from: mocks.from,
    removeChannel: mocks.removeChannel,
  },
}));

// Import AFTER mock is set up
import { subscribeToClaritySession, _clearSessionChannelRegistryForTesting } from '@/app/data/api';

const SESSION_ID = 'session-uuid-p934';

describe('P934: subscribeToClaritySession — onStatusChange callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearSessionChannelRegistryForTesting();

    mocks.subscribe.mockImplementation((cb: (status: string) => void) => {
      (mocks as unknown as Record<string, unknown>)._latestStatusCb = cb;
      return {};
    });
    mocks.on.mockImplementation(
      (_event: string, _filter: unknown, _cb: (payload: unknown) => void) => ({
        subscribe: mocks.subscribe,
      })
    );
    mocks.channel.mockReturnValue({ on: mocks.on, subscribe: mocks.subscribe });
  });

  const fireStatus = (status: string) => {
    const cb = (mocks as unknown as Record<string, unknown>)._latestStatusCb as
      | ((s: string) => void)
      | undefined;
    cb?.(status);
  };

  it('calls onStatusChange with CHANNEL_ERROR', () => {
    const onStatusChange = vi.fn();
    subscribeToClaritySession(SESSION_ID, 'TESTCD', vi.fn(), onStatusChange);
    fireStatus('CHANNEL_ERROR');
    expect(onStatusChange).toHaveBeenCalledWith('CHANNEL_ERROR');
  });

  it('calls onStatusChange with TIMED_OUT', () => {
    const onStatusChange = vi.fn();
    subscribeToClaritySession(SESSION_ID, 'TESTCD', vi.fn(), onStatusChange);
    fireStatus('TIMED_OUT');
    expect(onStatusChange).toHaveBeenCalledWith('TIMED_OUT');
  });

  it('calls onStatusChange with SUBSCRIBED', () => {
    const onStatusChange = vi.fn();
    subscribeToClaritySession(SESSION_ID, 'TESTCD', vi.fn(), onStatusChange);
    fireStatus('SUBSCRIBED');
    expect(onStatusChange).toHaveBeenCalledWith('SUBSCRIBED');
  });

  it('calls onStatusChange with CLOSED', () => {
    const onStatusChange = vi.fn();
    subscribeToClaritySession(SESSION_ID, 'TESTCD', vi.fn(), onStatusChange);
    fireStatus('CLOSED');
    expect(onStatusChange).toHaveBeenCalledWith('CLOSED');
  });

  it('does NOT call onStatusChange for other statuses', () => {
    const onStatusChange = vi.fn();
    subscribeToClaritySession(SESSION_ID, 'TESTCD', vi.fn(), onStatusChange);
    fireStatus('JOINING');
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('works without onStatusChange (backward-compatible)', () => {
    expect(() => {
      subscribeToClaritySession(SESSION_ID, 'TESTCD', vi.fn());
      fireStatus('CHANNEL_ERROR');
    }).not.toThrow();
  });
});
