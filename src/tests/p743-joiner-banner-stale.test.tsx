/**
 * P743: useActiveSession — Realtime dismissal when creator ends session
 *
 * Canary: today the hook has no Realtime subscription, so the joiner's banner
 * persists for up to 30s after the creator ends. After the fix, a
 * clarity_sessions UPDATE with sessionEnded=true dismisses the banner
 * promptly (within 100ms).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useActiveSession } from '@/hooks/use-active-session';
import type { ClaritySession } from '@/app/types';

// ── Hoisted mocks (must be before vi.mock factories) ─────────────────────────

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

describe('P743: useActiveSession — Realtime dismissal when creator ends session', () => {
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
    mocks.getActiveSessionByCode.mockResolvedValue(baseSession);
    // P1057: the handler moved to the third position — subscribeToClaritySession now takes
    // (sessionId, knownCode, onUpdate). The code is required because Realtime re-fetches no
    // longer carry it.
    mocks.subscribeToClaritySession.mockImplementation(
      (_id: string, _knownCode: string, cb: (session: ClaritySession) => void) => {
        capturedCallback = cb;
        return vi.fn(); // unsubscribe
      }
    );
  });

  // Canary 1: subscription must be wired up at all
  it('subscribes to clarity_sessions Realtime updates on mount', async () => {
    renderHook(() => useActiveSession());

    await waitFor(() => {
      expect(mocks.subscribeToClaritySession).toHaveBeenCalledWith(
        'session-uuid-1',
        // P1057: the hook must hand over the stored code, not an empty string — an empty
        // code here would silently blank ClaritySession.code on every Realtime update.
        'ABC123',
        expect.any(Function)
      );
    });
  });

  // Canary 2: creator ends — banner clears promptly, not after 30s poll
  it('clears session promptly when Realtime update has sessionEnded=true', async () => {
    renderHook(() => useActiveSession());

    await waitFor(() => { expect(capturedCallback).not.toBeNull(); });

    capturedCallback!({ ...baseSession, liveState: { sessionEnded: true } });

    await waitFor(
      () => { expect(mocks.clearActiveSession).toHaveBeenCalled(); },
      { timeout: 100 }
    );
    expect(mocks.clearActiveSessionFromStorage).toHaveBeenCalled();
  });

  // Canary 3: joiner ends on another tab — same Realtime path
  it('clears session promptly when Realtime update has joinerEnded=true', async () => {
    renderHook(() => useActiveSession());

    await waitFor(() => { expect(capturedCallback).not.toBeNull(); });

    capturedCallback!({ ...baseSession, liveState: { joinerEnded: true } });

    await waitFor(
      () => { expect(mocks.clearActiveSession).toHaveBeenCalled(); },
      { timeout: 100 }
    );
    expect(mocks.clearActiveSessionFromStorage).toHaveBeenCalled();
  });
});
