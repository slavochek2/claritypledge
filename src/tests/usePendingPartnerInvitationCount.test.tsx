/**
 * @file usePendingPartnerInvitationCount.test.tsx
 * @description P885: badge-count hook for the Partners nav item.
 *
 * Parity contract: the hook MUST count via the same service call the partners
 * page uses (agreementsService.getIncomingInvitations) so the badge and the
 * page's "Incoming invitations" section can never drift apart.
 * Freshness mirrors useUnreadLetterCount: fetch on mount + refetch on
 * visibilitychange (no realtime subscription).
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUseAuth = vi.fn();
vi.mock('@/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockGetIncomingInvitations = vi.fn();
vi.mock('@/app/data/agreements-service', () => ({
  agreementsService: {
    getIncomingInvitations: (...args: unknown[]) => mockGetIncomingInvitations(...args),
  },
}));

import { usePendingPartnerInvitationCount } from '@/app/hooks/usePendingPartnerInvitationCount';

const loggedInUser = {
  id: 'test-user-id',
  email: 'invitee@example.com',
  name: 'Test User',
};

// Minimal stand-in rows — the hook only counts them
const invitation = (id: string) => ({ id, status: 'pending' });

// jsdom defaults visibilityState to 'visible'; stub it explicitly so the
// hook's `=== 'visible'` guard is falsifiable (p705 pattern).
function stubVisibilityState(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    value,
    writable: true,
    configurable: true,
  });
}

describe('usePendingPartnerInvitationCount (P885)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubVisibilityState('visible');
  });

  it('counts incoming invitations via agreementsService.getIncomingInvitations (shared filter logic)', async () => {
    mockUseAuth.mockReturnValue({ user: loggedInUser });
    mockGetIncomingInvitations.mockResolvedValue([invitation('a'), invitation('b')]);

    const { result } = renderHook(() => usePendingPartnerInvitationCount());

    await waitFor(() => expect(result.current.count).toBe(2));
    // Parity: same method + same arguments the partners page passes (P933: now includes profileId)
    expect(mockGetIncomingInvitations).toHaveBeenCalledWith('invitee@example.com', 'test-user-id');
  });

  it('returns 0 and never calls the service when logged out', async () => {
    mockUseAuth.mockReturnValue({ user: null });

    const { result } = renderHook(() => usePendingPartnerInvitationCount());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.count).toBe(0);
    expect(mockGetIncomingInvitations).not.toHaveBeenCalled();
  });

  it('refetches when the tab regains visibility (matches Letters badge freshness)', async () => {
    mockUseAuth.mockReturnValue({ user: loggedInUser });
    mockGetIncomingInvitations.mockResolvedValue([invitation('a')]);

    const { result } = renderHook(() => usePendingPartnerInvitationCount());
    await waitFor(() => expect(result.current.count).toBe(1));

    // Invitation accepted elsewhere → next fetch returns none
    mockGetIncomingInvitations.mockResolvedValue([]);
    stubVisibilityState('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => expect(result.current.count).toBe(0));
    expect(mockGetIncomingInvitations).toHaveBeenCalledTimes(2);
  });

  it('does NOT refetch on visibilitychange while the tab is hidden', async () => {
    mockUseAuth.mockReturnValue({ user: loggedInUser });
    mockGetIncomingInvitations.mockResolvedValue([invitation('a')]);

    const { result } = renderHook(() => usePendingPartnerInvitationCount());
    await waitFor(() => expect(result.current.count).toBe(1));

    stubVisibilityState('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGetIncomingInvitations).toHaveBeenCalledTimes(1);
  });

  it('keeps the previous count when the service call fails', async () => {
    mockUseAuth.mockReturnValue({ user: loggedInUser });
    mockGetIncomingInvitations.mockResolvedValue([invitation('a'), invitation('b'), invitation('c')]);

    const { result } = renderHook(() => usePendingPartnerInvitationCount());
    await waitFor(() => expect(result.current.count).toBe(3));

    mockGetIncomingInvitations.mockRejectedValue(new Error('network down'));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.count).toBe(3);
  });
});
