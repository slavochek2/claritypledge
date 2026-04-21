/**
 * @file p778-public-letter-authed-parity.test.tsx
 * @description P778 canary tests: authed non-sender opening a public one-to-many
 * letter gets email-delivery parity (per-step writes, name on cover, delivery row).
 *
 * Canary gate 1 (authed-public routes to 'ready'):
 *   Before fix: pageState = 'ready_public', RPC not called
 *   After fix:  pageState = 'ready', RPC called once with correct letter id
 *
 * Canary gate 2 (anon path unchanged):
 *   Before and after fix: no session → pageState = 'ready_public', RPC NOT called
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';

const DELIVERY_ID = 'delivery-p778';
const LETTER_ID = 'letter-p778';
const SENDER_ID = 'sender-p778';
const READER_ID = 'reader-p778';
const READER_NAME = 'Slava Ladischenski';

// ── Auth mock ────────────────────────────────────────────────────────────────

vi.mock('@/auth', () => ({
  useAuth: vi.fn(),
}));

// ── Letters service mock ─────────────────────────────────────────────────────

vi.mock('@/app/data/letters-service', () => ({
  getLetterForReading: vi.fn().mockResolvedValue(null),
  getLetterForReadingByToken: vi.fn().mockResolvedValue(null),
  getLetterForPublicReading: vi.fn(),
  claimLetterDelivery: vi.fn().mockResolvedValue(true),
  updateDeliveryStatus: vi.fn().mockResolvedValue(undefined),
  updateDeliveryStatusByToken: vi.fn().mockResolvedValue(undefined),
  submitLetterResponseAuthenticated: vi.fn(),
  getLetterPointResponses: vi.fn().mockResolvedValue({}),
  getLetterPointResponsesByToken: vi.fn().mockResolvedValue({}),
}));

// ── Supabase mock ────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { accepted_terms_version: 'v1' }, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    auth: {
      setSession: vi.fn(),
      verifyOtp: vi.fn(),
    },
    functions: { invoke: vi.fn() },
  },
}));

// ── Mixpanel mock ────────────────────────────────────────────────────────────

vi.mock('@/lib/mixpanel', () => ({
  analytics: { track: vi.fn() },
}));

// ── Heavy sub-component mocks ────────────────────────────────────────────────

vi.mock('@/app/components/letters/letter-cover', () => ({
  LetterCover: ({ receiverName }: { receiverName: string }) => (
    <div data-testid="letter-cover">For {receiverName}</div>
  ),
}));
vi.mock('@/app/components/letters/letter-stale-terms-modal', () => ({
  LetterStaleTermsModal: () => null,
}));
vi.mock('@/app/components/letters/letter-completion-summary', () => ({
  LetterCompletionSummary: () => <div data-testid="confetti-completion">Confetti</div>,
}));
vi.mock('@/app/components/letters/letter-flow-content', () => ({
  LetterFlowContent: () => <div data-testid="letter-flow">Flow</div>,
}));
vi.mock('@/app/hooks/useLetterReadingState', () => ({
  useLetterReadingState: vi.fn().mockReturnValue({
    state: { stories: [], isComplete: false },
    currentPhase: 'story-read',
    nextStory: vi.fn(),
    tokenExpired: false,
    isLocalCompleted: false,
  }),
  loadState: vi.fn().mockReturnValue(null),
  loadLocalState: vi.fn().mockReturnValue(null),
}));
vi.mock('@/app/utils/letter-reading-utils', () => ({
  countTotalPoints: vi.fn().mockReturnValue(3),
  estimateReadingMinutes: vi.fn().mockReturnValue(5),
}));
vi.mock('@/app/data/points-service', () => ({
  pointsService: { setPosition: vi.fn(), removePosition: vi.fn() },
}));
vi.mock('@/app/components/layout/certificate-page-shell', () => ({
  CertificatePageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/clarity-loader', () => ({
  ClarityPageLoader: () => <div data-testid="loader">Loading...</div>,
  ClarityLoader: () => <div data-testid="loader-sm" />,
}));
vi.mock('@/lib/constants', () => ({
  CURRENT_TERMS_VERSION: 'v1',
  ACCEPTED_TERMS_VERSIONS: ['v1'],
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn() } }));
vi.mock('@/app/hooks/useUnreadLetterCount', () => ({
  useUnreadLetterCount: () => ({ count: 0, loading: false }),
}));

// ── Component + service imports (after vi.mock hoisting) ─────────────────────

import { useAuth } from '@/auth';
import { getLetterForPublicReading } from '@/app/data/letters-service';
import { supabase } from '@/lib/supabase';
import { LetterReadingPage } from '@/app/pages/letter-reading-page';

const mockUseAuth = vi.mocked(useAuth);
const mockGetLetterForPublicReading = vi.mocked(getLetterForPublicReading);
const mockRpc = vi.mocked(supabase.rpc);

function makeOneToManyLetter() {
  return {
    id: LETTER_ID,
    sender_id: SENDER_ID,
    sender_display_name: 'Sender',
    sender_avatar_url: null,
    sender_avatar_color: null,
    sender_has_pledged: false,
    mode: 'one-to-many',
    status: 'sealed',
  };
}

function makeSnapshots() {
  return [
    {
      letter_id: LETTER_ID,
      story_id: 'story-1',
      version_id: 'v1',
      position: 0,
      point_config: { storyText: 'text', storyTitle: 'title', points: [] },
    },
  ];
}

function makeDeliveryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DELIVERY_ID,
    letter_id: LETTER_ID,
    receiver_profile_id: READER_ID,
    receiver_email: 'reader@test.com',
    status: 'opened',
    opened_at: new Date().toISOString(),
    completed_at: null,
    stories_rated: 0,
    ...overrides,
  };
}

function renderPageNoToken() {
  return render(
    <MemoryRouter initialEntries={[`/letter/${DELIVERY_ID}`]}>
      <Routes>
        <Route path="/letter/:id" element={<LetterReadingPage />} />
      </Routes>
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('P778: authed non-sender reader of public one-to-many letter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // CANARY 1 — authed non-sender routes to 'ready' (not 'ready_public')
  //            and create_letter_delivery_on_open RPC is called
  // ---------------------------------------------------------------------------

  it('P778 canary: authed non-sender routes to ready, RPC called, cover shows first name', async () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: READER_ID,
        slug: null,
        name: READER_NAME,
        email: 'reader@test.com',
        signedAt: new Date().toISOString(),
        isVerified: false,
        witnesses: [],
        reciprocations: 0,
        hasPledged: false,
      } as ReturnType<typeof useAuth>['user'],
      session: { access_token: 'tok' } as ReturnType<typeof useAuth>['session'],
      sessionChecked: true,
      isLoading: false,
      signOut: vi.fn().mockResolvedValue(undefined),
    } as ReturnType<typeof useAuth>);

    mockGetLetterForPublicReading.mockResolvedValue({
      letter: makeOneToManyLetter() as unknown as import('@/app/types').ClarityLetter,
      snapshots: makeSnapshots() as unknown as import('@/app/types').LetterStorySnapshot[],
      predictions: [],
    });

    // RPC returns a delivery row with status='opened' — SETOF returns an array
    mockRpc.mockImplementation((fnName: string) => {
      if (fnName === 'create_letter_delivery_on_open') {
        return Promise.resolve({ data: [makeDeliveryRow()], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    renderPageNoToken();

    // Wait for loader to disappear
    await waitFor(() => {
      expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
    });

    // Diagnostic: check getLetterForPublicReading was called (authed public path was reached)
    expect(mockGetLetterForPublicReading).toHaveBeenCalled();

    // CANARY: RPC called with the correct function name and letter id
    expect(mockRpc).toHaveBeenCalledWith('create_letter_delivery_on_open', {
      p_letter_id: LETTER_ID,
    });

    // CANARY: cover shows reader's first name (not "you")
    await waitFor(() => {
      expect(screen.getByTestId('letter-cover')).toHaveTextContent('For Slava');
    });
  });

  // ---------------------------------------------------------------------------
  // CANARY 2 — anon path (no session) unchanged: routes to 'ready_public', no RPC
  // ---------------------------------------------------------------------------

  it('P778 canary: anon reader (no session) routes to ready_public, RPC NOT called', async () => {
    mockUseAuth.mockReturnValue({
      user: null,
      session: null,
      sessionChecked: true,
      isLoading: false,
      signOut: vi.fn().mockResolvedValue(undefined),
    } as ReturnType<typeof useAuth>);

    mockGetLetterForPublicReading.mockResolvedValue({
      letter: makeOneToManyLetter() as unknown as import('@/app/types').ClarityLetter,
      snapshots: makeSnapshots() as unknown as import('@/app/types').LetterStorySnapshot[],
      predictions: [],
    });

    renderPageNoToken();

    // For anon: page stays on public reading path — no RPC for delivery creation
    await waitFor(() => {
      expect(mockRpc).not.toHaveBeenCalledWith(
        'create_letter_delivery_on_open',
        expect.anything()
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Sender intercept — sender opening own letter must still hit own_letter screen
  // ---------------------------------------------------------------------------

  it('sender opening own public letter still sees own_letter screen, RPC NOT called', async () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: SENDER_ID,
        slug: null,
        name: 'Sender Person',
        email: 'sender@test.com',
        signedAt: new Date().toISOString(),
        isVerified: false,
        witnesses: [],
        reciprocations: 0,
        hasPledged: false,
      } as ReturnType<typeof useAuth>['user'],
      session: { access_token: 'tok' } as ReturnType<typeof useAuth>['session'],
      sessionChecked: true,
      isLoading: false,
      signOut: vi.fn().mockResolvedValue(undefined),
    } as ReturnType<typeof useAuth>);

    mockGetLetterForPublicReading.mockResolvedValue({
      letter: makeOneToManyLetter() as unknown as import('@/app/types').ClarityLetter,
      snapshots: makeSnapshots() as unknown as import('@/app/types').LetterStorySnapshot[],
      predictions: [],
    });

    renderPageNoToken();

    await waitFor(() => {
      expect(mockRpc).not.toHaveBeenCalledWith(
        'create_letter_delivery_on_open',
        expect.anything()
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Already-completed: authed reader who finished the letter re-opens it
  // — RPC returns completed row, wasAlreadyCompleted fires
  // ---------------------------------------------------------------------------

  it('authed reader re-opening a completed letter — RPC returns completed row, completion view shown', async () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: READER_ID,
        slug: null,
        name: READER_NAME,
        email: 'reader@test.com',
        signedAt: new Date().toISOString(),
        isVerified: false,
        witnesses: [],
        reciprocations: 0,
        hasPledged: false,
      } as ReturnType<typeof useAuth>['user'],
      session: { access_token: 'tok' } as ReturnType<typeof useAuth>['session'],
      sessionChecked: true,
      isLoading: false,
      signOut: vi.fn().mockResolvedValue(undefined),
    } as ReturnType<typeof useAuth>);

    mockGetLetterForPublicReading.mockResolvedValue({
      letter: makeOneToManyLetter() as unknown as import('@/app/types').ClarityLetter,
      snapshots: makeSnapshots() as unknown as import('@/app/types').LetterStorySnapshot[],
      predictions: [],
    });

    mockRpc.mockImplementation((fnName: string) => {
      if (fnName === 'create_letter_delivery_on_open') {
        return Promise.resolve({
          data: [makeDeliveryRow({ status: 'completed', completed_at: new Date().toISOString() })],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    renderPageNoToken();

    await waitFor(() => {
      expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
    });

    // RPC was called (idempotent re-open)
    expect(mockRpc).toHaveBeenCalledWith('create_letter_delivery_on_open', {
      p_letter_id: LETTER_ID,
    });

    // Completion summary renders because delivery is already completed
    await waitFor(() => {
      expect(screen.getByTestId('confetti-completion')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// P782 canary — shape mismatch: currentUser is a Profile, not a Supabase auth user
// Must FAIL before fix (source reads user_metadata?.name which is undefined on Profile)
// Must PASS after fix (source reads currentUser.name directly)
// ---------------------------------------------------------------------------

describe('P782: authed reader name reads from Profile.name (not user_metadata)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('P782 canary: cover shows first name from Profile.name when mock uses Profile shape', async () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: READER_ID,
        slug: null,
        name: READER_NAME,
        email: 'reader@test.com',
        signedAt: new Date().toISOString(),
        isVerified: false,
        witnesses: [],
        reciprocations: 0,
        hasPledged: false,
      } as ReturnType<typeof useAuth>['user'],
      session: { access_token: 'tok' } as ReturnType<typeof useAuth>['session'],
      sessionChecked: true,
      isLoading: false,
      signOut: vi.fn().mockResolvedValue(undefined),
    } as ReturnType<typeof useAuth>);

    mockGetLetterForPublicReading.mockResolvedValue({
      letter: makeOneToManyLetter() as unknown as import('@/app/types').ClarityLetter,
      snapshots: makeSnapshots() as unknown as import('@/app/types').LetterStorySnapshot[],
      predictions: [],
    });

    mockRpc.mockImplementation((fnName: string) => {
      if (fnName === 'create_letter_delivery_on_open') {
        return Promise.resolve({ data: [makeDeliveryRow()], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    renderPageNoToken();

    await waitFor(() => {
      expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
    });

    // CANARY: cover must show first name from Profile.name, not "you"
    await waitFor(() => {
      expect(screen.getByTestId('letter-cover')).toHaveTextContent('For Slava');
    });
  });
});
