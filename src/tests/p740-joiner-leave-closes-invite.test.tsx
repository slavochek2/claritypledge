/**
 * P740: Joiner-leave does not close letter-sourced invite — canary tests
 *
 * The exit handler in clarity-live-page.tsx has an if/else on isCreator.
 * The creator-leave branch calls completeClaritySession (to close the invite).
 * The joiner-leave else branch currently only calls clearSessionJoiner — it
 * does NOT call completeClaritySession. The fix adds that call guarded by
 * session.targetListenerId so non-letter sessions are unaffected.
 *
 * T1 (failing canary): joiner exit from letter-sourced session calls completeClaritySession
 * T2 (regression): clearSessionJoiner is still called (partner-left signal preserved)
 * T3 (regression): non-letter session does NOT call completeClaritySession
 * T4 (regression): creator-leave path still calls completeClaritySession
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ClarityLivePage } from '@/app/pages/clarity-live-page';

// ─── Component stubs ─────────────────────────────────────────────────────────

vi.mock('@/app/components/partners/live-mode-view', () => ({
  LiveModeView: ({ onExitMeeting }: { onExitMeeting: () => void }) => (
    <button data-testid="test-exit" onClick={onExitMeeting}>Leave</button>
  ),
  PartnerLeftScreen: ({ sessionEnded }: { sessionEnded: boolean }) => (
    <div data-testid="partner-left">{sessionEnded ? 'Session ended' : 'Partner left'}</div>
  ),
}));

vi.mock('@/app/components/session/reconnecting-countdown', () => ({
  ReconnectingCountdown: () => null,
}));

vi.mock('@/app/components/session/rejoin-prompt', () => ({
  RejoinPrompt: () => null,
}));

vi.mock('@/app/components/live-meeting/terms-update-dialog', () => ({
  TermsUpdateDialog: () => null,
}));

vi.mock('@/app/components/live-meeting/microphone-permission-dialog', () => ({
  MicrophonePermissionDialog: () => null,
}));

vi.mock('@/app/components/shared/remove-position-dialog', () => ({
  RemovePositionDialog: () => null,
  useRemovePositionGuard: () => ({
    show: false,
    pointName: '',
    handleRemove: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
  }),
}));

vi.mock('@/app/components/auth/google-auth-button', () => ({
  GoogleAuthButton: () => null,
}));

// ─── Infrastructure stubs ────────────────────────────────────────────────────

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
  setContext: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

vi.mock('@/lib/mixpanel', () => ({
  analytics: {
    track: vi.fn(),
    registerMLCollector: vi.fn(),
    unregisterMLCollector: vi.fn(),
  },
}));

vi.mock('@/lib/session-events-collector', () => ({
  SessionEventsCollector: class {
    start() {}
    stop() { return []; }
    reset() {}
    getEvents() { return []; }
    hasStarted() { return false; }
    isStarted() { return false; }
  },
}));

vi.mock('@/hooks/use-audio-recorder', () => ({
  useAudioRecorder: () => ({
    isRecording: false,
    startRecording: vi.fn().mockResolvedValue(undefined),
    stopRecording: vi.fn().mockResolvedValue(undefined),
    requestImmediateFlush: vi.fn(),
  }),
}));

vi.mock('@/hooks/useMicrophonePermission', () => ({
  useMicrophonePermission: () => ({
    status: 'granted',
    error: null,
    attemptCount: 0,
    requestPermission: vi.fn().mockResolvedValue(true),
    reset: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-session-heartbeat', () => ({
  useSessionHeartbeat: () => undefined,
}));

vi.mock('@/hooks/use-sound', () => ({
  useSoundEnabled: () => [true, vi.fn()],
}));

vi.mock('@/lib/live-state-merge', () => ({
  mergeInFlight: vi.fn((a) => a),
}));

vi.mock('@/lib/chunk-store', () => ({
  createChunkStore: () => Promise.resolve({ chunks: [], addChunk: vi.fn(), getAll: vi.fn().mockReturnValue([]) }),
}));

vi.mock('@/app/components/layout/navigation-menu-items', () => ({
  NavigationMenuItems: () => null,
}));

// ─── Context mocks ────────────────────────────────────────────────────────────

const mockClearActiveSession = vi.fn();
const mockSetActiveSession = vi.fn();
const mockSetIsLive = vi.fn();

vi.mock('@/app/contexts/live-session-context', () => ({
  useLiveSession: () => ({
    setIsLive: mockSetIsLive,
    setActiveSession: mockSetActiveSession,
    clearActiveSession: mockClearActiveSession,
    activeSessionCode: null,
  }),
  getActiveSessionFromStorage: () => null,
  clearActiveSessionFromStorage: vi.fn(),
}));

// ─── Auth mock ────────────────────────────────────────────────────────────────

// User is the target listener (recipient who joins the letter-sourced session)
const JOINER_USER = {
  id: 'user-listener-123',
  email: 'listener@test.com',
  name: 'Listener Name',
};

vi.mock('@/auth', () => ({
  useAuth: () => ({
    user: JOINER_USER,
    isLoading: false,
    session: null,
    sessionChecked: true,
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  }),
}));

// ─── Supabase direct calls ─────────────────────────────────────────────────────

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
    })),
  },
}));

// ─── Service mocks ────────────────────────────────────────────────────────────

vi.mock('@/app/data/points-service', () => ({
  pointsService: { getPoints: vi.fn(), submitPoint: vi.fn() },
}));

vi.mock('@/app/data/events-service', () => ({
  eventsService: {
    closePracticeRoomBySessionId: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/app/data/stories-service', () => ({
  storiesService: { getStory: vi.fn() },
}));

vi.mock('@/app/data/calibration-service', () => ({
  calibrationService: { getEarsCount: vi.fn().mockResolvedValue(0) },
}));

vi.mock('@/app/data/badge-service', () => ({
  badgeService: { getBadge: vi.fn() },
}));

// ─── API mocks ────────────────────────────────────────────────────────────────

const mockJoinClaritySession = vi.fn();
const mockCompleteClaritySession = vi.fn();
const mockClearSessionJoiner = vi.fn();
const mockGetClaritySession = vi.fn();
const mockNeedsTermsAcceptance = vi.fn();
const mockRecordSessionConsent = vi.fn();
const mockSubscribeToClaritySession = vi.fn();
const mockCheckSessionRequiresAuth = vi.fn();
const mockEndClaritySession = vi.fn();

vi.mock('@/app/data/api', () => ({
  joinClaritySession: (...args: unknown[]) => mockJoinClaritySession(...args),
  completeClaritySession: (...args: unknown[]) => mockCompleteClaritySession(...args),
  clearSessionJoiner: (...args: unknown[]) => mockClearSessionJoiner(...args),
  getClaritySession: (...args: unknown[]) => mockGetClaritySession(...args),
  needsTermsAcceptance: (...args: unknown[]) => mockNeedsTermsAcceptance(...args),
  recordSessionConsent: (...args: unknown[]) => mockRecordSessionConsent(...args),
  subscribeToClaritySession: (...args: unknown[]) => mockSubscribeToClaritySession(...args),
  checkSessionRequiresAuth: (...args: unknown[]) => mockCheckSessionRequiresAuth(...args),
  endClaritySession: (...args: unknown[]) => mockEndClaritySession(...args),
  getActiveSessionByCode: vi.fn().mockResolvedValue(null),
  updateClaritySessionLiveState: vi.fn().mockResolvedValue(undefined),
  patchClaritySessionLiveState: vi.fn().mockResolvedValue(undefined),
  createTranscriptionJob: vi.fn().mockResolvedValue(undefined),
  getLetterBaselineRatings: vi.fn().mockResolvedValue({}),
  cancelLiveInvite: vi.fn().mockResolvedValue(undefined),
  uploadSessionRecording: vi.fn().mockResolvedValue(undefined),
  uploadEventsSnapshot: vi.fn().mockResolvedValue(undefined),
  uploadSingleChunk: vi.fn().mockResolvedValue(undefined),
  recordChunkUploadComplete: vi.fn().mockResolvedValue(undefined),
  recordTermsAcceptance: vi.fn().mockResolvedValue(undefined),
  MAX_NAME_LENGTH: 50,
  SESSION_GRACE_PERIOD_SECONDS: 30,
}));

// ─── Test session fixtures ────────────────────────────────────────────────────

const LETTER_SESSION = {
  id: 'session-letter-abc',
  code: 'ABC123',
  creatorProfileId: 'user-creator-999', // different from JOINER_USER.id
  targetListenerId: JOINER_USER.id,      // joiner IS the target listener
  sourceStoryId: 'story-1',
  sourceLetterId: 'letter-1',
  joinerName: null,
  creatorName: 'Creator Name',
  isPrivate: true, // skip transcription job in tests
  liveState: null,
};

const NON_LETTER_SESSION = {
  ...LETTER_SESSION,
  targetListenerId: null,
  sourceStoryId: null,
  sourceLetterId: null,
};

// ─── Render helper ────────────────────────────────────────────────────────────

function renderLivePage(urlCode = 'ABC123') {
  return render(
    <MemoryRouter initialEntries={[`/live/${urlCode}`]}>
      <Routes>
        <Route path="/live/:code" element={<ClarityLivePage />} />
        <Route path="/live" element={<div>Live landing</div>} />
      </Routes>
    </MemoryRouter>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('P740: joiner-leave closes letter-sourced invite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: letter-sourced session, user is the joiner (target listener)
    mockGetClaritySession.mockResolvedValue(LETTER_SESSION);
    mockJoinClaritySession.mockResolvedValue(LETTER_SESSION);
    mockNeedsTermsAcceptance.mockResolvedValue(false);
    mockRecordSessionConsent.mockResolvedValue(undefined);
    mockSubscribeToClaritySession.mockReturnValue(vi.fn()); // unsubscribe fn
    mockClearSessionJoiner.mockResolvedValue(undefined);
    mockCompleteClaritySession.mockResolvedValue(undefined);
    mockCheckSessionRequiresAuth.mockResolvedValue(false);
    mockEndClaritySession.mockResolvedValue(undefined);
  });

  it('T1 (canary): joiner exit from letter-sourced session calls completeClaritySession', async () => {
    // Pre-fix: completeClaritySession is NOT called in joiner else-branch → assertion FAILS
    // Post-fix: completeClaritySession IS called with targetListenerId guard → assertion PASSES
    const user = userEvent.setup();
    renderLivePage();

    // Wait for auto-join to complete and live view to appear
    const leaveButton = await screen.findByTestId('test-exit', {}, { timeout: 5000 });

    await user.click(leaveButton);

    await waitFor(() => {
      expect(mockCompleteClaritySession).toHaveBeenCalledWith('session-letter-abc');
    }, { timeout: 3000 });
  });

  it('T2: clearSessionJoiner is still called (partner-left signal regression guard)', async () => {
    const user = userEvent.setup();
    renderLivePage();

    const leaveButton = await screen.findByTestId('test-exit', {}, { timeout: 5000 });
    await user.click(leaveButton);

    await waitFor(() => {
      expect(mockClearSessionJoiner).toHaveBeenCalledWith('session-letter-abc');
    }, { timeout: 3000 });
  });

  it('T3: non-letter session does NOT call completeClaritySession on joiner exit', async () => {
    mockGetClaritySession.mockResolvedValue(NON_LETTER_SESSION);
    mockJoinClaritySession.mockResolvedValue(NON_LETTER_SESSION);

    const user = userEvent.setup();
    renderLivePage();

    const leaveButton = await screen.findByTestId('test-exit', {}, { timeout: 5000 });
    await user.click(leaveButton);

    await waitFor(() => {
      expect(mockClearSessionJoiner).toHaveBeenCalled();
    }, { timeout: 3000 });

    expect(mockCompleteClaritySession).not.toHaveBeenCalled();
  });

  // T4 (creator-leave calls completeClaritySession) is covered by p703/p735 test suites.
  // Creator auto-join sets view: 'waiting' — reaching live view requires a simulated partner
  // arrival event, which is outside the scope of this joiner-path canary.
});
