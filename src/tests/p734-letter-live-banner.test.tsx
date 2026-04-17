/**
 * P734: Letter-sourced /live session lifecycle — banner + End Session
 *
 * Canary tests for:
 * - Bug 1: setActiveSession called when creator arrives via URL (live-page integration)
 * - Bug 2: cancelLiveInvite called on End Session for letter-sourced sessions
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
const mockEndClaritySession = vi.fn();
const mockCancelLiveInvite = vi.fn();

vi.mock('@/app/data/api', () => ({
  getClaritySession: (...args: unknown[]) => mockGetClaritySession(...args),
  endClaritySession: (...args: unknown[]) => mockEndClaritySession(...args),
  cancelLiveInvite: (...args: unknown[]) => mockCancelLiveInvite(...args),
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
    mockEndClaritySession.mockResolvedValue(undefined);
    mockCancelLiveInvite.mockResolvedValue(undefined);
  });

  // Bug 2 canary: letter-sourced sessions must cancel the invite on End Session
  it('calls cancelLiveInvite when session has targetListenerId (letter-sourced)', async () => {
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
      expect(mockCancelLiveInvite).toHaveBeenCalledWith('session-id-1');
    });
  });

  // Regression guard: non-letter sessions must NOT call cancelLiveInvite
  it('does NOT call cancelLiveInvite when session has no targetListenerId', async () => {
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
      expect(mockEndClaritySession).toHaveBeenCalled();
    });
    expect(mockCancelLiveInvite).not.toHaveBeenCalled();
  });

  // Bug 2 resilience: cancelLiveInvite called even when endClaritySession fails
  it('calls cancelLiveInvite even when endClaritySession throws (letter-sourced)', async () => {
    const user = userEvent.setup();
    mockGetClaritySession.mockResolvedValue({
      id: 'session-id-err',
      code: 'ABC123',
      targetListenerId: 'listener-user-id',
    });
    mockEndClaritySession.mockRejectedValue(new Error('network error'));

    renderBanner();

    await user.click(screen.getByRole('button', { name: /end session/i }));

    await waitFor(() => {
      expect(mockCancelLiveInvite).toHaveBeenCalledWith('session-id-err');
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
