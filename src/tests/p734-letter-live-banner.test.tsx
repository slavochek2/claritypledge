/**
 * P734: Letter-sourced /live session lifecycle — banner + End Session
 *
 * P769 update: ActiveSessionBanner now uses useTerminateSession() which calls
 * completeClaritySession (extended RPC) atomically for all sessions. The separate
 * cancelLiveInvite + endClaritySession sequence no longer exists.
 *
 * Canary tests for:
 * - Bug 2 (updated): completeClaritySession called on End Session (atomic termination)
 * - Bug 3: clearActiveSession called in handleCancelWaiting (live-page integration)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ActiveSessionBanner } from '@/app/components/session/active-session-banner';

// --- Mocks ---

const mockClearActiveSession = vi.fn();
const mockActiveSessionCode = 'ABC123';

vi.mock('@/app/contexts/live-session-context', () => ({
  useLiveSession: () => ({
    activeSessionCode: mockActiveSessionCode,
    activeSessionPartnerName: null,
    clearActiveSession: mockClearActiveSession,
  }),
}));

const mockGetClaritySession = vi.fn();
const mockCompleteClaritySession = vi.fn();

vi.mock('@/app/data/api', () => ({
  getClaritySession: (...args: unknown[]) => mockGetClaritySession(...args),
  completeClaritySession: (...args: unknown[]) => mockCompleteClaritySession(...args),
}));

const renderBanner = () =>
  render(
    <MemoryRouter>
      <ActiveSessionBanner />
    </MemoryRouter>
  );

describe('P734: ActiveSessionBanner — End Session lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCompleteClaritySession.mockResolvedValue(undefined);
  });

  // P769: All End Session paths use terminateSession → completeClaritySession (atomic RPC).
  // Invite closure is handled inside the extended RPC — no separate cancelLiveInvite call.
  it('calls completeClaritySession atomically for letter-sourced session', async () => {
    const user = userEvent.setup();
    mockGetClaritySession.mockResolvedValue({
      id: 'session-id-1',
      code: 'ABC123',
      targetListenerId: 'listener-user-id',
    });

    renderBanner();

    const endButton = screen.getByRole('button', { name: /end session/i });
    await user.click(endButton);

    await waitFor(() => {
      expect(mockCompleteClaritySession).toHaveBeenCalledWith('session-id-1');
    });
  });

  // P769: Non-letter sessions also call completeClaritySession (RPC is a no-op for invite closure).
  it('calls completeClaritySession for non-letter session', async () => {
    const user = userEvent.setup();
    mockGetClaritySession.mockResolvedValue({
      id: 'session-id-2',
      code: 'ABC123',
      targetListenerId: null,
    });

    renderBanner();

    const endButton = screen.getByRole('button', { name: /end session/i });
    await user.click(endButton);

    await waitFor(() => {
      expect(mockCompleteClaritySession).toHaveBeenCalledWith('session-id-2');
    });
  });

  // Resilience: clearActiveSession called even when completeClaritySession throws.
  it('calls clearActiveSession even when completeClaritySession throws', async () => {
    const user = userEvent.setup();
    mockGetClaritySession.mockResolvedValue({
      id: 'session-id-err',
      code: 'ABC123',
      targetListenerId: 'listener-user-id',
    });
    mockCompleteClaritySession.mockRejectedValue(new Error('network error'));

    renderBanner();

    await user.click(screen.getByRole('button', { name: /end session/i }));

    await waitFor(() => {
      expect(mockClearActiveSession).toHaveBeenCalled();
    });
  });

  // Shared behavior: clearActiveSession always called on End Session
  it('calls clearActiveSession after ending session', async () => {
    const user = userEvent.setup();
    mockGetClaritySession.mockResolvedValue({
      id: 'session-id-3',
      code: 'ABC123',
      targetListenerId: 'listener-user-id',
    });

    renderBanner();

    await user.click(screen.getByRole('button', { name: /end session/i }));

    await waitFor(() => {
      expect(mockClearActiveSession).toHaveBeenCalled();
    });
  });
});
