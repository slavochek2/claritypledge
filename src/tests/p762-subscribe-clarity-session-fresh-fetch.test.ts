/**
 * P762 Canary — subscribeToClaritySession fresh-fetch mechanism.
 *
 * Verifies that an UPDATE Realtime event (with stale/empty payload.new.live_state)
 * triggers a fresh SELECT on clarity_sessions, and the callback receives the
 * fresh row — not payload.new. This is the primary P762 fix in api.ts.
 *
 * Reverting the fresh-fetch in api.ts must make these tests fail.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const singleFn = vi.fn();
  const eqFn = vi.fn(() => ({ single: singleFn }));
  const selectFn = vi.fn(() => ({ eq: eqFn }));
  const fromFn = vi.fn(() => ({ select: selectFn }));

  const subscribeFn = vi.fn(() => ({}));
  const onFn = vi.fn((_event: string, _filter: unknown, cb: (payload: unknown) => void) => {
    (mocks as unknown as Record<string, unknown>)._capturedCb = cb;
    return { subscribe: subscribeFn };
  });
  const channelFn = vi.fn(() => ({ on: onFn, subscribe: subscribeFn }));
  const removeChannelFn = vi.fn();

  return {
    from: fromFn,
    channel: channelFn,
    removeChannel: removeChannelFn,
    single: singleFn,
    eq: eqFn,
    select: selectFn,
    on: onFn,
    subscribe: subscribeFn,
    getCapturedCallback: () => capturedEventCallback,
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const SESSION_ID = 'session-uuid-762';

const freshDbRow = {
  id: SESSION_ID,
  code: 'ABC123',
  creator_name: 'Creator',
  state: {},
  demo_status: 'not_started',
  partnership_status: 'none',
  created_at: new Date().toISOString(),
  expires_at: null,
  last_activity_at: new Date().toISOString(),
  live_state: { sessionEnded: true, sessionEndedAt: new Date().toISOString() },
};

// Stale payload — simulates what Supabase Realtime sends when
// clarity_sessions lacks REPLICA IDENTITY FULL
const staleRealtimePayload = {
  new: { id: SESSION_ID, live_state: {} }, // empty live_state
  old: {},
  eventType: 'UPDATE',
};

describe('P762: subscribeToClaritySession — fresh DB SELECT on UPDATE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearSessionChannelRegistryForTesting();
    // Chain: supabase.from().select().eq().single() → freshDbRow
    mocks.single.mockResolvedValue({ data: freshDbRow, error: null });
    mocks.eq.mockReturnValue({ single: mocks.single });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.from.mockReturnValue({ select: mocks.select });

    // Channel chain: channel().on().subscribe()
    mocks.on.mockImplementation(
      (_event: string, _filter: unknown, cb: (payload: unknown) => void) => {
        (mocks as unknown as Record<string, unknown>)._capturedCb = cb;
        return { subscribe: mocks.subscribe };
      }
    );
    mocks.subscribe.mockReturnValue({});
    mocks.channel.mockReturnValue({ on: mocks.on, subscribe: mocks.subscribe });
  });

  it('issues a fresh SELECT when UPDATE event fires with stale payload', async () => {
    const onUpdate = vi.fn();
    subscribeToClaritySession(SESSION_ID, 'TESTCD', onUpdate);

    // Fire the Realtime UPDATE with stale payload
    const capturedCb = (mocks as unknown as Record<string, unknown>)._capturedCb as (
      payload: unknown
    ) => void;
    capturedCb(staleRealtimePayload);

    // Wait for the async fetch
    await vi.waitFor(() => expect(mocks.from).toHaveBeenCalledWith('clarity_sessions'));

    // P1057: this assertion used to be `toHaveBeenCalledWith('*')`. A bare `*` is precisely
    // what breaks once the column-level SELECT grant drops `code` — it raises 42501 rather
    // than narrowing — and this re-fetch runs on every update for both participants with no
    // handling but a console.error, so the failure is silent. The assertion is now the
    // stronger one: an explicit list that must NOT contain `code`.
    const selectArg = mocks.select.mock.calls[0][0] as string;
    expect(selectArg).not.toBe('*');
    expect(selectArg.split(',').map(c => c.trim())).not.toContain('code');
    expect(selectArg).toContain('live_state');
    expect(mocks.eq).toHaveBeenCalledWith('id', SESSION_ID);
    expect(mocks.single).toHaveBeenCalled();
  });

  it('calls onUpdate with fresh DB data — not the stale payload.new', async () => {
    const onUpdate = vi.fn();
    subscribeToClaritySession(SESSION_ID, 'TESTCD', onUpdate);

    const capturedCb = (mocks as unknown as Record<string, unknown>)._capturedCb as (
      payload: unknown
    ) => void;
    capturedCb(staleRealtimePayload);

    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalled());

    // The callback must receive fresh data with sessionEnded from the DB row
    const received = onUpdate.mock.calls[0][0];
    expect(received.liveState?.sessionEnded).toBe(true);
  });

  it('does not call onUpdate after unsubscribe (cancelled guard)', async () => {
    const onUpdate = vi.fn();
    const unsubscribe = subscribeToClaritySession(SESSION_ID, 'TESTCD', onUpdate);

    // Unsubscribe before the fetch resolves
    unsubscribe();

    const capturedCb = (mocks as unknown as Record<string, unknown>)._capturedCb as (
      payload: unknown
    ) => void;
    capturedCb(staleRealtimePayload);

    // Give async fetch time to complete
    await new Promise((r) => setTimeout(r, 10));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(mocks.removeChannel).toHaveBeenCalled();
  });

  it('does not call onUpdate when fetch returns an error', async () => {
    mocks.single.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const onUpdate = vi.fn();
    subscribeToClaritySession(SESSION_ID, 'TESTCD', onUpdate);

    const capturedCb = (mocks as unknown as Record<string, unknown>)._capturedCb as (
      payload: unknown
    ) => void;
    capturedCb(staleRealtimePayload);

    await new Promise((r) => setTimeout(r, 10));

    expect(onUpdate).not.toHaveBeenCalled();
  });
});
