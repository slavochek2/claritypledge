/**
 * P735: Active session UX — replace disabled Start button with Rejoin + End
 *
 * Tests for StartClaritySessionButton behavior when an open invite exists:
 * - Return to Session + End Session when banner absent
 * - Return to Session only when banner owns the session
 * - End Session calls completeClaritySession, falls back to cancelLiveInvite
 * - State re-syncs after End and on external banner clear
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { StartClaritySessionButton } from '@/app/components/letters/start-clarity-session-button';

// --- Mocks ---

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

let mockActiveSessionCode: string | null = null;
const mockClearActiveSession = vi.fn();
let mockStoredSession: { code: string } | null = null;

vi.mock('@/app/contexts/live-session-context', () => ({
  useLiveSession: () => ({
    activeSessionCode: mockActiveSessionCode,
    clearActiveSession: mockClearActiveSession,
  }),
  getActiveSessionFromStorage: () => mockStoredSession,
}));

let mockGetOpenInviteForSender = vi.fn();
const mockCompleteClaritySession = vi.fn();
const mockCancelLiveInvite = vi.fn();
const mockCreateClaritySession = vi.fn();
const mockCreateLiveInvite = vi.fn();

vi.mock('@/lib/mixpanel', () => ({
  analytics: { track: vi.fn() },
}));

vi.mock('@/app/data/api', () => ({
  getOpenInviteForSender: (...args: unknown[]) => mockGetOpenInviteForSender(...args),
  completeClaritySession: (...args: unknown[]) => mockCompleteClaritySession(...args),
  cancelLiveInvite: (...args: unknown[]) => mockCancelLiveInvite(...args),
  createClaritySession: (...args: unknown[]) => mockCreateClaritySession(...args),
  createLiveInvite: (...args: unknown[]) => mockCreateLiveInvite(...args),
}));

// --- Helpers ---

const defaultProps = {
  senderId: 'sender-1',
  receiverId: 'receiver-1',
  letterId: 'letter-1',
  storyId: 'story-1',
  senderName: 'Alice',
};

const OPEN_INVITE = { sessionId: 'session-abc', code: 'LIVE123' };

function renderButton() {
  return render(
    <MemoryRouter>
      <StartClaritySessionButton {...defaultProps} />
    </MemoryRouter>
  );
}

// --- Tests ---

describe('StartClaritySessionButton (P735)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveSessionCode = null;
    mockStoredSession = null;
    mockGetOpenInviteForSender = vi.fn().mockResolvedValue(null);
    mockCompleteClaritySession.mockResolvedValue(undefined);
    mockCancelLiveInvite.mockResolvedValue(undefined);
    mockCreateClaritySession.mockResolvedValue({ id: 'session-new', code: 'NEWCODE' });
    mockCreateLiveInvite.mockResolvedValue(undefined);
  });

  it('renders Start button when no open invite exists', async () => {
    renderButton();
    await waitFor(() =>
      expect(screen.getByTestId('start-clarity-session-btn')).toBeInTheDocument()
    );
    expect(screen.queryByTestId('return-to-session-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('end-session-btn')).not.toBeInTheDocument();
  });

  it('renders Return + End when invite exists and banner is absent', async () => {
    mockGetOpenInviteForSender = vi.fn().mockResolvedValue(OPEN_INVITE);
    mockActiveSessionCode = null;
    renderButton();
    await waitFor(() =>
      expect(screen.getByTestId('return-to-session-btn')).toBeInTheDocument()
    );
    expect(screen.getByTestId('end-session-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('start-clarity-session-btn')).not.toBeInTheDocument();
  });

  it('renders Return only when banner owns the same session', async () => {
    mockGetOpenInviteForSender = vi.fn().mockResolvedValue(OPEN_INVITE);
    mockActiveSessionCode = OPEN_INVITE.code;
    renderButton();
    await waitFor(() =>
      expect(screen.getByTestId('return-to-session-btn')).toBeInTheDocument()
    );
    expect(screen.queryByTestId('end-session-btn')).not.toBeInTheDocument();
    expect(screen.getByText('Use the top banner to end this session')).toBeInTheDocument();
  });

  it('renders Return + End when banner shows a different session', async () => {
    mockGetOpenInviteForSender = vi.fn().mockResolvedValue(OPEN_INVITE);
    mockActiveSessionCode = 'OTHER_SESSION';
    renderButton();
    await waitFor(() =>
      expect(screen.getByTestId('return-to-session-btn')).toBeInTheDocument()
    );
    expect(screen.getByTestId('end-session-btn')).toBeInTheDocument();
  });

  it('End Session calls completeClaritySession with sessionId', async () => {
    mockGetOpenInviteForSender = vi.fn().mockResolvedValue(OPEN_INVITE);
    mockActiveSessionCode = null;
    const user = userEvent.setup();
    renderButton();
    await waitFor(() => screen.getByTestId('end-session-btn'));
    await user.click(screen.getByTestId('end-session-btn'));
    await waitFor(() => expect(mockCompleteClaritySession).toHaveBeenCalledWith(OPEN_INVITE.sessionId));
  });

  it('re-syncs from DB after End Session succeeds', async () => {
    mockGetOpenInviteForSender = vi
      .fn()
      .mockResolvedValueOnce(OPEN_INVITE)
      .mockResolvedValueOnce(null);
    mockActiveSessionCode = null;
    const user = userEvent.setup();
    renderButton();
    await waitFor(() => screen.getByTestId('end-session-btn'));
    await user.click(screen.getByTestId('end-session-btn'));
    await waitFor(() => expect(mockGetOpenInviteForSender).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByTestId('start-clarity-session-btn')).toBeInTheDocument()
    );
  });

  it('clears context when stored session code matches invite code', async () => {
    mockGetOpenInviteForSender = vi.fn().mockResolvedValue(OPEN_INVITE);
    mockStoredSession = { code: OPEN_INVITE.code };
    mockActiveSessionCode = null;
    const user = userEvent.setup();
    renderButton();
    await waitFor(() => screen.getByTestId('end-session-btn'));
    await user.click(screen.getByTestId('end-session-btn'));
    await waitFor(() => expect(mockCompleteClaritySession).toHaveBeenCalled());
    await waitFor(() => expect(mockClearActiveSession).toHaveBeenCalledOnce());
  });

  it('does NOT clear context when stored session code differs from invite code', async () => {
    mockGetOpenInviteForSender = vi.fn().mockResolvedValue(OPEN_INVITE);
    mockStoredSession = { code: 'DIFFERENT_CODE' };
    mockActiveSessionCode = null;
    const user = userEvent.setup();
    renderButton();
    await waitFor(() => screen.getByTestId('end-session-btn'));
    await user.click(screen.getByTestId('end-session-btn'));
    await waitFor(() => expect(mockCompleteClaritySession).toHaveBeenCalled());
    expect(mockClearActiveSession).not.toHaveBeenCalled();
  });

  it('falls back to cancelLiveInvite when completeClaritySession fails', async () => {
    mockGetOpenInviteForSender = vi.fn().mockResolvedValue(OPEN_INVITE);
    mockCompleteClaritySession.mockRejectedValue(new Error('not authorized'));
    mockActiveSessionCode = null;
    const user = userEvent.setup();
    renderButton();
    await waitFor(() => screen.getByTestId('end-session-btn'));
    await user.click(screen.getByTestId('end-session-btn'));
    await waitFor(() =>
      expect(mockCancelLiveInvite).toHaveBeenCalledWith(OPEN_INVITE.sessionId)
    );
  });

  it('re-syncs but does NOT clear context when both RPC and fallback fail', async () => {
    mockGetOpenInviteForSender = vi.fn().mockResolvedValue(OPEN_INVITE);
    mockCompleteClaritySession.mockRejectedValue(new Error('not authorized'));
    mockCancelLiveInvite.mockRejectedValue(new Error('network error'));
    mockStoredSession = { code: OPEN_INVITE.code };
    mockActiveSessionCode = null;
    const user = userEvent.setup();
    renderButton();
    await waitFor(() => screen.getByTestId('end-session-btn'));
    await user.click(screen.getByTestId('end-session-btn'));
    await waitFor(() => expect(mockGetOpenInviteForSender).toHaveBeenCalledTimes(2));
    expect(mockClearActiveSession).not.toHaveBeenCalled();
  });
});
