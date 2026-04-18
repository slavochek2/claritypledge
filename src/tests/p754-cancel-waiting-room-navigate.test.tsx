/**
 * P754 canary: handleCancelWaiting must navigate correctly when Cancel is clicked.
 *
 * Original bug: setView('start') alone left the URL at /live/ABC123, keeping isJoinViaLink=true
 * and immediately re-showing the "Joining session..." spinner — stuck forever.
 *
 * Follow-up: when returnTo is present (e.g. from letters inbox), Cancel must return
 * to that URL instead of /live.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// ── useNavigate mock (must be first, before component import) ─────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// ── Auth ──────────────────────────────────────────────────────────────────────
const mockUser = { id: 'creator-uid', name: 'Alice', email: 'alice@example.com' };
vi.mock('@/auth', () => ({
  useAuth: () => ({
    user: mockUser,
    isLoading: false,
    session: {},
    sessionChecked: true,
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  }),
}));

// ── Live session context ──────────────────────────────────────────────────────
const mockSetIsLive = vi.fn();
const mockSetActiveSession = vi.fn();
const mockClearActiveSession = vi.fn();
vi.mock('@/app/contexts/live-session-context', () => ({
  useLiveSession: () => ({
    setIsLive: mockSetIsLive,
    setActiveSession: mockSetActiveSession,
    clearActiveSession: mockClearActiveSession,
    activeSessionCode: null,
    activeSessionPartnerName: null,
  }),
  getActiveSessionFromStorage: () => null,
  clearActiveSessionFromStorage: vi.fn(),
}));

// ── API ───────────────────────────────────────────────────────────────────────
const mockGetClaritySession = vi.fn();
vi.mock('@/app/data/api', () => ({
  getClaritySession: (...args: unknown[]) => mockGetClaritySession(...args),
  joinClaritySession: vi.fn().mockResolvedValue(null),
  createClaritySession: vi.fn().mockResolvedValue(null),
  getActiveSessionByCode: vi.fn().mockResolvedValue(null),
  subscribeToClaritySession: vi.fn().mockReturnValue(() => {}),
  updateClaritySessionLiveState: vi.fn().mockResolvedValue(undefined),
  patchClaritySessionLiveState: vi.fn().mockResolvedValue(undefined),
  clearSessionJoiner: vi.fn().mockResolvedValue(undefined),
  endClaritySession: vi.fn().mockResolvedValue(undefined),
  completeClaritySession: vi.fn().mockResolvedValue(undefined),
  uploadSessionRecording: vi.fn().mockResolvedValue(undefined),
  uploadEventsSnapshot: vi.fn().mockResolvedValue(undefined),
  uploadSingleChunk: vi.fn().mockResolvedValue(undefined),
  recordChunkUploadComplete: vi.fn().mockResolvedValue(undefined),
  MAX_NAME_LENGTH: 50,
  SESSION_GRACE_PERIOD_SECONDS: 30,
  recordTermsAcceptance: vi.fn().mockResolvedValue(undefined),
  recordSessionConsent: vi.fn().mockResolvedValue(undefined),
  needsTermsAcceptance: vi.fn().mockResolvedValue(false),
  createTranscriptionJob: vi.fn().mockResolvedValue(undefined),
  getLetterBaselineRatings: vi.fn().mockResolvedValue([]),
  cancelLiveInvite: vi.fn().mockResolvedValue(undefined),
  checkSessionRequiresAuth: vi.fn().mockResolvedValue({ requiresAuth: false }),
}));

// ── Mixpanel ──────────────────────────────────────────────────────────────────
vi.mock('@/lib/mixpanel', () => ({
  analytics: { track: vi.fn(), identify: vi.fn() },
}));

// ── Supabase ──────────────────────────────────────────────────────────────────
vi.mock('@/lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  const noop = () => chain;
  chain.from = noop;
  chain.select = noop;
  chain.eq = noop;
  chain.single = () => new Promise(() => {});
  chain.then = undefined;
  return { supabase: chain };
});

// ── Sentry ────────────────────────────────────────────────────────────────────
vi.mock('@sentry/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sentry/react')>();
  return {
    ...actual,
    captureException: vi.fn(),
    withScope: vi.fn(),
    setContext: vi.fn(),
    setTag: vi.fn(),
    init: vi.fn(),
  };
});

// ── Audio / mic hooks ─────────────────────────────────────────────────────────
vi.mock('@/hooks/use-audio-recorder', () => ({
  useAudioRecorder: () => ({
    isRecording: false,
    startRecording: vi.fn(),
    stopRecording: vi.fn().mockResolvedValue(undefined),
    requestImmediateFlush: vi.fn(),
  }),
}));
vi.mock('@/hooks/useMicrophonePermission', () => ({
  useMicrophonePermission: () => ({
    micStatus: 'granted',
    requestMicPermission: vi.fn().mockResolvedValue(true),
    showMicDialog: false,
    setShowMicDialog: vi.fn(),
  }),
}));

// ── Other hooks ───────────────────────────────────────────────────────────────
vi.mock('@/hooks/use-session-heartbeat', () => ({
  useSessionHeartbeat: () => {},
}));
vi.mock('@/hooks/use-upload-health', () => ({
  useUploadHealth: () => ({ uploadHealth: null }),
}));

// ── Chunk infrastructure ──────────────────────────────────────────────────────
vi.mock('@/lib/chunk-store', () => ({
  createChunkStore: vi.fn().mockResolvedValue({
    add: vi.fn(),
    getAll: vi.fn().mockReturnValue([]),
    clear: vi.fn(),
  }),
}));
vi.mock('@/lib/chunk-upload-queue', () => {
  class ChunkUploadQueue {
    static uploadOrphanedChunks = vi.fn().mockResolvedValue(undefined);
    onProgress: unknown = null;
    start = vi.fn();
    enqueue = vi.fn();
    destroy = vi.fn();
    getPendingCount = vi.fn().mockReturnValue(0);
    getTotalCount = vi.fn().mockReturnValue(0);
    drain = vi.fn().mockResolvedValue(undefined);
  }
  return { ChunkUploadQueue };
});

// ── Component (import AFTER all vi.mock calls) ────────────────────────────────
import { ClarityLivePage } from '@/app/pages/clarity-live-page';

// ── Session fixture ───────────────────────────────────────────────────────────
const CREATOR_SESSION = {
  id: 'session-id-1',
  code: 'ABC123',
  creatorName: 'Alice',
  creatorProfileId: 'creator-uid',
  joinerName: undefined,
  joinerProfileId: null,
  state: {},
  demoStatus: 'none',
  partnershipStatus: 'none',
  createdAt: new Date().toISOString(),
  expiresAt: null,
  mode: 'live',
  isPrivate: false,
};

const renderAtJoinLink = (returnTo?: string) => {
  const url = returnTo
    ? `/live/ABC123?returnTo=${encodeURIComponent(returnTo)}`
    : '/live/ABC123';
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/live/:code" element={<ClarityLivePage />} />
        <Route path="/live" element={<ClarityLivePage />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('P754: handleCancelWaiting navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClaritySession.mockResolvedValue(CREATOR_SESSION);
  });

  it('navigates to /live when Cancel clicked on join-via-link URL (no returnTo)', async () => {
    const user = userEvent.setup();
    renderAtJoinLink();

    const cancelButton = await waitFor(
      () => screen.getByRole('button', { name: /cancel/i }),
      { timeout: 3000 }
    );

    await user.click(cancelButton);

    expect(mockNavigate).toHaveBeenLastCalledWith('/live', { replace: true });
  });

  it('navigates to returnTo URL when Cancel clicked and returnTo is present', async () => {
    const user = userEvent.setup();
    renderAtJoinLink('/letters?tab=inbox');

    const cancelButton = await waitFor(
      () => screen.getByRole('button', { name: /cancel/i }),
      { timeout: 3000 }
    );

    await user.click(cancelButton);

    expect(mockNavigate).toHaveBeenLastCalledWith('/letters?tab=inbox', { replace: true });
  });
});
