/**
 * P762 Canary — Symptom 1: useActiveSession must clear banner when Realtime fires
 * with sessionEnded: true. subscribeToClaritySession now does a fresh DB SELECT on
 * every UPDATE, so the callback always receives authoritative liveState.
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

describe('P762: useActiveSession — Realtime clears banner on sessionEnded', () => {
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
    // P1057: handler is now the third argument — (sessionId, knownCode, onUpdate).
    mocks.subscribeToClaritySession.mockImplementation(
      (_id: string, _knownCode: string, cb: (session: ClaritySession) => void) => {
        capturedCallback = cb;
        return vi.fn();
      }
    );
  });

  it('clears banner when Realtime fires with sessionEnded: true', async () => {
    // subscribeToClaritySession now does a fresh DB SELECT — the callback always
    // receives current liveState. Simulate creator ending session.
    renderHook(() => useActiveSession());

    await waitFor(() => { expect(capturedCallback).not.toBeNull(); });

    capturedCallback!({ ...baseSession, liveState: { sessionEnded: true } });

    await waitFor(
      () => { expect(mocks.clearActiveSession).toHaveBeenCalled(); },
      { timeout: 200 }
    );
    expect(mocks.clearActiveSessionFromStorage).toHaveBeenCalled();
  });

  it('clears banner when Realtime fires with joinerEnded: true', async () => {
    renderHook(() => useActiveSession());

    await waitFor(() => { expect(capturedCallback).not.toBeNull(); });

    capturedCallback!({ ...baseSession, liveState: { joinerEnded: true } });

    await waitFor(
      () => { expect(mocks.clearActiveSession).toHaveBeenCalled(); },
      { timeout: 200 }
    );
    expect(mocks.clearActiveSessionFromStorage).toHaveBeenCalled();
  });

  it('does not clear banner on non-ended Realtime updates (demo steps, live state mutations)', async () => {
    renderHook(() => useActiveSession());

    await waitFor(() => { expect(capturedCallback).not.toBeNull(); });

    // Fire with active liveState — no ended flags
    capturedCallback!({ ...baseSession, liveState: { demoStep: 2 } as ClaritySession['liveState'] });

    // Banner should stay — no spurious clear
    expect(mocks.clearActiveSession).not.toHaveBeenCalled();
    expect(mocks.clearActiveSessionFromStorage).not.toHaveBeenCalled();
  });

  it('does not re-populate state when session was already cleared', async () => {
    mocks.getActiveSessionFromStorage.mockReturnValue(null);

    renderHook(() => useActiveSession());

    await waitFor(() => {
      expect(mocks.clearActiveSession).toHaveBeenCalled();
    });

    if (capturedCallback) {
      capturedCallback({ ...baseSession, liveState: { sessionEnded: true } });
    }

    expect(mocks.setActiveSession).not.toHaveBeenCalled();
  });
});
