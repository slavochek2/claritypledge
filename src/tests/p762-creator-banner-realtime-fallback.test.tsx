/**
 * P762 Canary — Symptom 1: useActiveSession must clear banner when Realtime fires
 * with an empty/stale liveState (clarity_sessions lacks REPLICA IDENTITY FULL, so
 * payload.new.live_state may not carry sessionEnded: true).
 *
 * Fix: when Realtime callback fires and liveState does NOT have ended flags,
 * call validateSession() as a fallback — it re-fetches and detects the ended state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useActiveSession } from '@/hooks/use-active-session';
import type { ClaritySession } from '@/app/types';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  clearActiveSession: vi.fn(),
  setActiveSession: vi.fn(),
  clearActiveSessionFromStorage: vi.fn(),
  getActiveSessionFromStorage: vi.fn(),
  getActiveSessionByCode: vi.fn(),
  subscribeToClaritySession: vi.fn(),
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const baseSession: ClaritySession = {
  id: 'session-uuid-1',
  code: 'ABC123',
  creatorName: 'Creator',
  state: {} as ClaritySession['state'],
  demoStatus: 'not_started',
  partnershipStatus: 'none',
  createdAt: new Date().toISOString(),
  expiresAt: null,
  liveState: {},
};

describe('P762: useActiveSession — Realtime fallback for REPLICA IDENTITY gap', () => {
  let capturedCallback: ((session: ClaritySession) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedCallback = null;

    mocks.getActiveSessionFromStorage.mockReturnValue({
      code: 'ABC123',
      partnerName: 'Creator',
      role: 'joiner' as const,
      timestamp: new Date().toISOString(),
    });
    // Initial validateSession: session still active
    mocks.getActiveSessionByCode.mockResolvedValue(baseSession);
    mocks.subscribeToClaritySession.mockImplementation(
      (_id: string, cb: (session: ClaritySession) => void) => {
        capturedCallback = cb;
        return vi.fn();
      }
    );
  });

  it('clears session when Realtime fires with empty liveState but DB shows session ended', async () => {
    // Simulate REPLICA IDENTITY gap: Realtime fires with {} liveState (no sessionEnded),
    // but DB re-fetch returns null (session ended)
    mocks.getActiveSessionByCode
      .mockResolvedValueOnce(baseSession)  // initial validateSession
      .mockResolvedValueOnce(null);        // re-fetch after stale Realtime update

    renderHook(() => useActiveSession());

    await waitFor(() => { expect(capturedCallback).not.toBeNull(); });

    // Fire Realtime with empty liveState — simulates REPLICA IDENTITY gap
    capturedCallback!({ ...baseSession, liveState: {} });

    // Expect the hook to call validateSession() → getActiveSessionByCode → null → clear
    await waitFor(
      () => { expect(mocks.clearActiveSession).toHaveBeenCalled(); },
      { timeout: 200 }
    );
    expect(mocks.clearActiveSessionFromStorage).toHaveBeenCalled();
  });

  it('does not re-populate state when Realtime fires with stale liveState on already-cleared session', async () => {
    // Session is already cleared (sessionIdRef is null after initial clear)
    mocks.getActiveSessionFromStorage.mockReturnValueOnce(null); // no session in storage

    renderHook(() => useActiveSession());

    await waitFor(() => {
      expect(mocks.clearActiveSession).toHaveBeenCalled();
    });

    // Even if capturedCallback fires (shouldn't since session never initialized),
    // no re-population should happen
    if (capturedCallback) {
      capturedCallback({ ...baseSession, liveState: {} });
    }

    // setActiveSession should never be called — banner must stay gone
    expect(mocks.setActiveSession).not.toHaveBeenCalled();
  });
});
