/**
 * P1369: offline, the /live rejoin pointer must survive so the session bar can show its offline
 * state. getActiveSessionByCode maps a failed request to null — the same value as "ended" — so
 * useActiveSession deleted the pointer on every offline load. A null that came with a failed
 * request is kept; a null from a request that reached the server still clears (control).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useActiveSession } from '@/hooks/use-active-session';
import { recordNetworkFailure, recordNetworkSuccess, _resetNetworkOutcomeForTesting } from '@/lib/network-outcome';

const mocks = vi.hoisted(() => ({
  clearActiveSession: vi.fn(),
  setActiveSession: vi.fn(),
  clearActiveSessionFromStorage: vi.fn(),
  getActiveSessionFromStorage: vi.fn(),
  getActiveSessionByCode: vi.fn(),
  subscribeToClaritySession: vi.fn(() => vi.fn()),
}));

vi.mock('@/app/contexts/live-session-context', () => ({
  useLiveSession: () => ({
    activeSessionCode: null,
    activeSessionPartnerName: null,
    activeSessionRole: null,
    activeSessionGuestDisplayName: null,
    setActiveSession: mocks.setActiveSession,
    clearActiveSession: mocks.clearActiveSession,
  }),
  getActiveSessionFromStorage: mocks.getActiveSessionFromStorage,
  clearActiveSessionFromStorage: mocks.clearActiveSessionFromStorage,
}));

vi.mock('@/app/data/api', () => ({
  getActiveSessionByCode: mocks.getActiveSessionByCode,
  subscribeToClaritySession: mocks.subscribeToClaritySession,
}));

beforeEach(() => {
  vi.clearAllMocks();
  _resetNetworkOutcomeForTesting();
  mocks.getActiveSessionFromStorage.mockReturnValue({
    code: 'ABC123',
    partnerName: 'Partner',
    role: 'creator' as const,
    timestamp: new Date().toISOString(),
  });
});

describe('P1369: useActiveSession offline', () => {
  it('a null that came with a failed request keeps the pointer and restores the session', async () => {
    mocks.getActiveSessionByCode.mockImplementation(async () => {
      recordNetworkFailure();
      return null;
    });
    const { result } = renderHook(() => useActiveSession());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.clearActiveSessionFromStorage).not.toHaveBeenCalled();
    expect(mocks.clearActiveSession).not.toHaveBeenCalled();
    expect(mocks.setActiveSession).toHaveBeenCalledWith('ABC123', 'Partner', 'creator', undefined);
  });

  it('an unrelated failure before this lookup reached the server does not keep an ended session', async () => {
    mocks.getActiveSessionByCode.mockImplementation(async () => {
      recordNetworkFailure(); // some other request failed
      recordNetworkSuccess(); // this lookup reached the server: the session really ended
      return null;
    });
    const { result } = renderHook(() => useActiveSession());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.clearActiveSessionFromStorage).toHaveBeenCalled();
    expect(mocks.setActiveSession).not.toHaveBeenCalled();
  });

  it('control: a null from a request that reached the server (ended) still clears', async () => {
    mocks.getActiveSessionByCode.mockImplementation(async () => {
      recordNetworkSuccess();
      return null;
    });
    const { result } = renderHook(() => useActiveSession());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.clearActiveSessionFromStorage).toHaveBeenCalled();
    expect(mocks.setActiveSession).not.toHaveBeenCalled();
  });
});
