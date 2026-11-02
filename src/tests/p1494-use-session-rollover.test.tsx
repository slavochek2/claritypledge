import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ClaritySession } from '@/app/types';

const track = vi.fn();
const unregister = vi.fn();
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: (...a: unknown[]) => track(...a), unregisterMLCollector: () => unregister() } }));

import { useSessionRollover } from '@/hooks/use-session-rollover';

const fresh = { id: 'new', code: 'ABC234', joinerName: 'Newguest', isPrivate: true, liveState: { checksCount: 0 } } as unknown as ClaritySession;

function setup() {
  const ref = <T,>(v: T) => ({ current: v });
  const refs = {
    currentSessionIdRef: ref<string | null>('old'),
    confirmedLiveStateRef: ref<Record<string, unknown>>({ checksCount: 3 }),
    gracePeriodStartRef: ref<Date | null>(new Date()),
    previousPhaseRef: ref<string | undefined>('rating'),
    isCreatorRef: ref(true),
    sessionCodeForChunks: ref<string | null>('ABC234'),
    userNameForChunks: ref<string | null>('Host'),
    sessionForChunks: ref<ClaritySession | null>({ id: 'old' } as ClaritySession),
    userForChunks: ref<{ id: string } | null>({ id: 'u' }),
    eventsCollectorRef: ref({ reset: vi.fn() }),
  };
  const s = {
    setGuestSeatLost: vi.fn(), setGracePeriodStart: vi.fn(), setDepartedPartnerName: vi.fn(), setIsLocallyRating: vi.fn(),
    setLocalFlowType: vi.fn(), setLiveState: vi.fn(), setSession: vi.fn(), setView: vi.fn(), setPendingLiveTransition: vi.fn(),
  };
  const stopRecording = vi.fn().mockResolvedValue(null);
  const { result } = renderHook(() => useSessionRollover(
    refs.currentSessionIdRef as never, refs.confirmedLiveStateRef as never, refs.gracePeriodStartRef, refs.previousPhaseRef,
    s.setGuestSeatLost, s.setGracePeriodStart, s.setDepartedPartnerName, s.setIsLocallyRating, s.setLocalFlowType,
    s.setLiveState, s.setSession, s.setView, s.setPendingLiveTransition, refs.isCreatorRef, stopRecording,
    refs.sessionCodeForChunks, refs.userNameForChunks, refs.sessionForChunks, refs.userForChunks, refs.eventsCollectorRef as never,
  ));
  return { apply: result.current, refs, s, stopRecording };
}

describe('P1494 useSessionRollover', () => {
  beforeEach(() => { track.mockClear(); unregister.mockClear(); });

  it('follow: moves to the new row, drops local conversation state, stops the recorder without uploading', () => {
    const { apply, refs, s, stopRecording } = setup();
    apply('follow', fresh);
    expect(refs.currentSessionIdRef.current).toBe('new');
    expect(s.setSession).toHaveBeenCalledWith(fresh);
    expect(s.setLiveState).toHaveBeenCalledWith(expect.objectContaining({ checksCount: 0 }));
    expect(s.setIsLocallyRating).toHaveBeenCalledWith(false);
    expect(s.setGracePeriodStart).toHaveBeenCalledWith(null);
    expect(refs.gracePeriodStartRef.current).toBeNull();
    expect(refs.previousPhaseRef.current).toBeUndefined();
    // recorder: references cleared before the stop, collector reset, nothing finalized
    expect(refs.sessionCodeForChunks.current).toBeNull();
    expect(refs.userNameForChunks.current).toBeNull();
    expect(refs.sessionForChunks.current).toBeNull();
    expect(refs.userForChunks.current).toBeNull();
    expect(refs.eventsCollectorRef.current.reset).toHaveBeenCalled();
    expect(unregister).toHaveBeenCalled();
    expect(stopRecording).toHaveBeenCalledTimes(1);
    expect(s.setGuestSeatLost).not.toHaveBeenCalled();
  });

  it('follow by a guest whose own claim opened the session is recorded as a guest follow', () => {
    const { apply, refs } = setup();
    refs.isCreatorRef.current = false;
    apply('follow', fresh);
    expect(track).toHaveBeenCalledWith('live_session_rolled_over', expect.objectContaining({ role: 'guest', outcome: 'followed' }));
  });

  it('seat-lost: hands the guest to the join form and touches nothing else', () => {
    const { apply, refs, s, stopRecording } = setup();
    apply('seat-lost', fresh);
    expect(s.setGuestSeatLost).toHaveBeenCalledWith(true);
    expect(s.setSession).not.toHaveBeenCalled();
    expect(stopRecording).not.toHaveBeenCalled();
    expect(refs.currentSessionIdRef.current).toBe('old');
  });

  it('same / ignore: nothing happens', () => {
    const { apply, refs, s, stopRecording } = setup();
    apply('same', fresh);
    apply('ignore', fresh);
    expect(s.setSession).not.toHaveBeenCalled();
    expect(stopRecording).not.toHaveBeenCalled();
    expect(refs.currentSessionIdRef.current).toBe('old');
  });
});
