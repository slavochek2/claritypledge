// @vitest-environment jsdom
/**
 * P1586 §2 "Page → ClarityPageLoader" (text): /live checking for a session to rejoin draws nothing
 * of the page yet, so it shows the page loader, not pulsing "Checking session..." text.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@/auth', () => ({
  useAuth: () => ({
    user: { id: 'creator-uid', name: 'Alice', email: 'alice@example.com' },
    isLoading: false,
    session: {},
    sessionChecked: true,
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  }),
}));
vi.mock('@/app/contexts/live-session-context', () => ({
  useLiveSession: () => ({
    setIsLive: vi.fn(),
    setActiveSession: vi.fn(),
    clearActiveSession: vi.fn(),
    activeSessionCode: null,
    activeSessionPartnerName: null,
  }),
  // A stored session exists, so the page checks whether it is still active.
  getActiveSessionFromStorage: () => ({ code: 'ABC123', role: 'creator' }),
  clearActiveSessionFromStorage: vi.fn(),
}));
vi.mock('@/app/data/api', () => ({
  getClaritySession: vi.fn().mockResolvedValue(null),
  joinClaritySession: vi.fn().mockResolvedValue(null),
  createClaritySession: vi.fn().mockResolvedValue(null),
  getActiveSessionByCode: vi.fn(() => new Promise(() => {})),
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
vi.mock('@/lib/mixpanel', () => ({
  analytics: { track: vi.fn(), identify: vi.fn(), stopSessionRecording: vi.fn() },
}));
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
vi.mock('@sentry/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sentry/react')>();
  return { ...actual, captureException: vi.fn(), withScope: vi.fn(), setContext: vi.fn(), setTag: vi.fn(), init: vi.fn() };
});
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
vi.mock('@/hooks/use-session-heartbeat', () => ({ useSessionHeartbeat: () => {} }));
vi.mock('@/hooks/use-upload-health', () => ({ useUploadHealth: () => ({ uploadHealth: null }) }));
vi.mock('@/lib/chunk-store', () => ({
  createChunkStore: vi.fn().mockResolvedValue({ add: vi.fn(), getAll: vi.fn().mockReturnValue([]), clear: vi.fn() }),
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

import { ClarityLivePage } from '@/app/pages/clarity-live-page';

describe('P1586 /live: checking for a session to rejoin', () => {
  it('shows the page loader, not pulsing "Checking session..." text', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/live']}>
        <Routes>
          <Route path="/live" element={<ClarityLivePage />} />
        </Routes>
      </MemoryRouter>,
    );
    // The check starts in an effect (flushed by render); the page loader holds the frame meanwhile.
    expect(container.querySelector('.clarity-page-loader')).not.toBeNull();
    expect(screen.queryByText(/Checking session/)).toBeNull();
    expect(container.querySelector('.animate-pulse')).toBeNull();
  });
});
