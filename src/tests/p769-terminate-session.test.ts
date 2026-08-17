/**
 * P769 Unit Tests — Session-end must be terminal and authoritative.
 *
 * Covers:
 * T1: terminateSessionDb is called with the sessionId (via useTerminateSession)
 * T2: clearActiveSession is called after DB write completes
 * T3: sessionStorage clarity_live_* keys are cleared by terminateSessionDb
 * T4: On DB error, terminateSessionDb throws and clearActiveSession is NOT called
 * T5: Multiple subscribeToClaritySession callers → same channel (ref-counting)
 * T6: Last unsubscriber removes channel; earlier unsubscribers do not
 * T7: subscribeToClaritySession cancelled flag preserved per registry entry
 *
 * Reverting the subscription registry or terminateSession composition must
 * make the ref-counting tests (T5, T6) fail.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  // Supabase channel chain
  const subscribeFn = vi.fn(() => ({}));
  const onFn = vi.fn((_event: string, _filter: unknown, _cb: (payload: unknown) => void) => {
    return { subscribe: subscribeFn };
  });
  const channelFn = vi.fn(() => ({ on: onFn, subscribe: subscribeFn }));
  const removeChannelFn = vi.fn();

  // DB query chain
  const singleFn = vi.fn();
  const eqFn = vi.fn(() => ({ single: singleFn }));
  const selectFn = vi.fn(() => ({ eq: eqFn }));
  const fromFn = vi.fn(() => ({ select: selectFn }));

  // RPC mock
  const rpcFn = vi.fn();

  return {
    from: fromFn,
    channel: channelFn,
    removeChannel: removeChannelFn,
    on: onFn,
    subscribe: subscribeFn,
    single: singleFn,
    eq: eqFn,
    select: selectFn,
    rpc: rpcFn,
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: mocks.channel,
    from: mocks.from,
    removeChannel: mocks.removeChannel,
    rpc: mocks.rpc,
  },
}));

// ── Context mocks ─────────────────────────────────────────────────────────────

const mockClearActiveSession = vi.fn();

vi.mock('@/app/contexts/live-session-context', () => ({
  useLiveSession: () => ({
    clearActiveSession: mockClearActiveSession,
    activeSessionCode: null,
    setActiveSession: vi.fn(),
    setIsLive: vi.fn(),
  }),
  getActiveSessionFromStorage: () => null,
  clearActiveSessionFromStorage: vi.fn(),
}));

// ── sessionStorage helper ─────────────────────────────────────────────────────

const SESSION_STORAGE_KEYS = [
  'clarity_live_session_id',
  'clarity_live_session_code',
  'clarity_live_role',
  'clarity_live_guest_name',
];

function seedSessionStorage() {
  SESSION_STORAGE_KEYS.forEach((key, i) => {
    window.sessionStorage.setItem(key, `value-${i}`);
  });
}

// ── Import after mocks ────────────────────────────────────────────────────────

import { subscribeToClaritySession, _clearSessionChannelRegistryForTesting } from '@/app/data/api';

// ─────────────────────────────────────────────────────────────────────────────
// T5 + T6 + T7 — Subscription registry ref-counting
// ─────────────────────────────────────────────────────────────────────────────

describe('P769: subscribeToClaritySession — subscription registry ref-counting', () => {
  const SESSION_ID = 'sess-uuid-769';

  beforeEach(() => {
    vi.clearAllMocks();
    _clearSessionChannelRegistryForTesting();

    // Default: successful fresh SELECT returns a session row
    mocks.single.mockResolvedValue({
      data: {
        id: SESSION_ID,
        code: 'ABC123',
        live_state: { sessionEnded: false },
        creator_name: 'Host',
        created_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        expires_at: null,
      },
      error: null,
    });
    mocks.eq.mockReturnValue({ single: mocks.single });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.from.mockReturnValue({ select: mocks.select });

    mocks.on.mockReturnValue({ subscribe: mocks.subscribe });
    mocks.subscribe.mockReturnValue({});
    mocks.channel.mockReturnValue({ on: mocks.on, subscribe: mocks.subscribe });
  });

  it('T5: three subscribe calls on the same sessionId create exactly one Supabase channel', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const cb3 = vi.fn();

    subscribeToClaritySession(SESSION_ID, 'TESTCD', cb1);
    subscribeToClaritySession(SESSION_ID, 'TESTCD', cb2);
    subscribeToClaritySession(SESSION_ID, 'TESTCD', cb3);

    // Only one channel should have been created regardless of call count
    expect(mocks.channel).toHaveBeenCalledTimes(1);
  });

  it('T5b: subscribe calls on different sessionIds create separate channels', () => {
    const SESSION_ID_2 = 'sess-uuid-769-b';

    subscribeToClaritySession(SESSION_ID, 'TESTCD', vi.fn());
    subscribeToClaritySession(SESSION_ID_2, 'TESTCD', vi.fn());

    // Two distinct session IDs → two channels
    expect(mocks.channel).toHaveBeenCalledTimes(2);
  });

  it('T6: first unsubscriber does not remove the channel', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    const unsub1 = subscribeToClaritySession(SESSION_ID, 'TESTCD', cb1);
    subscribeToClaritySession(SESSION_ID, 'TESTCD', cb2);

    unsub1();

    // Channel still active — cb2 is still subscribed
    expect(mocks.removeChannel).not.toHaveBeenCalled();
  });

  it('T6b: last unsubscriber removes the channel from Supabase', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    const unsub1 = subscribeToClaritySession(SESSION_ID, 'TESTCD', cb1);
    const unsub2 = subscribeToClaritySession(SESSION_ID, 'TESTCD', cb2);

    unsub1();
    expect(mocks.removeChannel).not.toHaveBeenCalled();

    unsub2();
    expect(mocks.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('T6c: unsubscribing all callers then resubscribing creates a fresh channel', () => {
    const unsub1 = subscribeToClaritySession(SESSION_ID, 'TESTCD', vi.fn());
    unsub1();

    expect(mocks.channel).toHaveBeenCalledTimes(1);

    // Resubscribe after full unsubscribe — should create a new channel
    subscribeToClaritySession(SESSION_ID, 'TESTCD', vi.fn());
    expect(mocks.channel).toHaveBeenCalledTimes(2);
  });

  it('T7: after last unsubscriber, in-flight callbacks do not invoke removed handlers', async () => {
    let capturedCb: ((payload: unknown) => void) | undefined;

    mocks.on.mockImplementation(
      (_event: string, _filter: unknown, cb: (payload: unknown) => void) => {
        capturedCb = cb;
        return { subscribe: mocks.subscribe };
      }
    );

    const onUpdate = vi.fn();
    const unsub = subscribeToClaritySession(SESSION_ID, 'TESTCD', onUpdate);

    // Unsubscribe before the Realtime event fires
    unsub();

    // Simulate a late Realtime UPDATE event
    if (capturedCb) {
      capturedCb({
        new: { id: SESSION_ID, live_state: { sessionEnded: true } },
        old: {},
        eventType: 'UPDATE',
      });
    }

    // Give async SELECT time to complete
    await new Promise((r) => setTimeout(r, 20));

    // Handler must not be called after unsubscribe
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T1–T4 — useTerminateSession hook
//
// Note: useTerminateSession is a new hook (src/hooks/use-terminate-session.ts)
// that does not exist yet. These tests are written as CANARY tests that must
// fail before implementation and pass after.
//
// To run these pre-implementation, they are wrapped in describe.
// The /dev agent must unskip them once the hook file is created.
// ─────────────────────────────────────────────────────────────────────────────

describe('P769: useTerminateSession hook (canary — unskip after implementation)', () => {
  const SESSION_ID = 'sess-uuid-769-hook';

  beforeEach(() => {
    vi.clearAllMocks();
    seedSessionStorage();

    // Default RPC success
    mocks.rpc.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    SESSION_STORAGE_KEYS.forEach((key) => window.sessionStorage.removeItem(key));
  });

  async function getTerminateHook() {
    // Dynamic import so the mock is in place before the module loads
    const { useTerminateSession } = await import('@/hooks/use-terminate-session');
    return useTerminateSession;
  }

  it('T1: terminate(sessionId) calls complete_clarity_session RPC with the sessionId', async () => {
    const useTerminateSession = await getTerminateHook();
    const { result } = renderHook(() => useTerminateSession(), {
      wrapper: ({ children }: { children: React.ReactNode }) =>
        React.createElement('div', null, children),
    });

    await act(async () => {
      await result.current(SESSION_ID);
    });

    expect(mocks.rpc).toHaveBeenCalledWith('complete_clarity_session', {
      p_session_id: SESSION_ID,
    });
  });

  it('T2: terminate() calls clearActiveSession after DB write completes', async () => {
    const useTerminateSession = await getTerminateHook();
    const { result } = renderHook(() => useTerminateSession());

    await act(async () => {
      await result.current(SESSION_ID);
    });

    // clearActiveSession must be called AFTER the RPC returns
    expect(mockClearActiveSession).toHaveBeenCalledTimes(1);

    // Verify ordering: RPC before clearActiveSession
    const rpcCallOrder = mocks.rpc.mock.invocationCallOrder[0];
    const clearCallOrder = mockClearActiveSession.mock.invocationCallOrder[0];
    expect(rpcCallOrder).toBeLessThan(clearCallOrder);
  });

  it('T3: terminate() clears all clarity_live_* sessionStorage keys', async () => {
    const useTerminateSession = await getTerminateHook();
    const { result } = renderHook(() => useTerminateSession());

    // Verify keys exist before
    expect(window.sessionStorage.getItem('clarity_live_session_id')).not.toBeNull();

    await act(async () => {
      await result.current(SESSION_ID);
    });

    SESSION_STORAGE_KEYS.forEach((key) => {
      expect(
        window.sessionStorage.getItem(key),
        `sessionStorage key "${key}" should be cleared after terminate`
      ).toBeNull();
    });
  });

  it('T4: on DB error, terminate() throws and clearActiveSession is NOT called', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Not authorized', code: '42501' },
    });

    const useTerminateSession = await getTerminateHook();
    const { result } = renderHook(() => useTerminateSession());

    await expect(
      act(async () => {
        await result.current(SESSION_ID);
      })
    ).rejects.toThrow();

    // clearActiveSession must NOT be called when the DB write fails
    expect(mockClearActiveSession).not.toHaveBeenCalled();
  });

  it('T4b: on DB error, sessionStorage keys are NOT cleared (no partial cleanup)', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Network error', code: '00000' },
    });

    const useTerminateSession = await getTerminateHook();
    const { result } = renderHook(() => useTerminateSession());

    try {
      await act(async () => {
        await result.current(SESSION_ID);
      });
    } catch {
      // Expected
    }

    // Storage should still contain all keys on failure
    expect(window.sessionStorage.getItem('clarity_live_session_id')).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SessionEndedScreen component smoke (canary — unskip after implementation)
// ─────────────────────────────────────────────────────────────────────────────

describe('P769: SessionEndedScreen component (canary — unskip after implementation)', () => {
  it('renders "This session has ended" heading', async () => {
    const { render, screen } = await import('@testing-library/react');
    const { MemoryRouter } = await import('react-router-dom');
    const { SessionEndedScreen } = await import(
      '@/app/components/session/session-ended-screen'
    );

    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(SessionEndedScreen)
      )
    );

    expect(screen.getByRole('heading', { name: /this session has ended/i })).toBeInTheDocument();
  });

  it('renders a CTA that links to /letters', async () => {
    const { render, screen } = await import('@testing-library/react');
    const { MemoryRouter } = await import('react-router-dom');
    const { SessionEndedScreen } = await import(
      '@/app/components/session/session-ended-screen'
    );

    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(SessionEndedScreen)
      )
    );

    const cta = screen.getByRole('link', { name: /letters|go to letters|view letters/i });
    expect(cta).toHaveAttribute('href', '/letters');
  });
});
