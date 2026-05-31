/**
 * @file p859-reproduce.test.tsx
 * @description P859 canary: a logged-out recipient opening an emailed 1-to-1 letter
 * (/letter/{id}?token=…) must be able to open it without a runtime crash.
 *
 * Bug: LetterReadingFlow (the token / authed 1-to-1 reading flow, rendered at
 * letter-reading-page.tsx:875) destructures `const { user } = useAuth()` but its
 * readerProfileOwner block (lines 1102-1108) references undeclared `currentUser`.
 * Evaluating that identifier throws `ReferenceError: currentUser is not defined`
 * during render, so LetterFlowContent never mounts. (LetterReadingFlowPublic was
 * already fixed in P852 commit 182713b7; LetterReadingFlow was left referencing
 * the undeclared name — the same bug class in the sibling component.)
 *
 * Canary gate:
 *   Before fix: clicking "Open the Letter" mounts LetterReadingFlow, which throws —
 *               the error boundary trips and LetterFlowContent is never rendered.
 *   After fix:  LetterReadingFlow renders; LetterFlowContent mounts.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';

// ── Identifiers ───────────────────────────────────────────────────────────────

const DELIVERY_ID = 'delivery-p859';
const TOKEN = 'token-p859';
const INTENDED_EMAIL = 'recipient@example.com';
const LETTER_ID = 'letter-p859';
const SENDER_ID = 'sender-p859';

// ── Auth mock ────────────────────────────────────────────────────────────────

vi.mock('@/auth', () => ({
  useAuth: vi.fn(),
}));

// ── Letters service mock ─────────────────────────────────────────────────────

vi.mock('@/app/data/letters-service', () => ({
  getLetterForReading: vi.fn().mockResolvedValue(null),
  getLetterForReadingByToken: vi.fn(),
  getLetterForPublicReading: vi.fn().mockResolvedValue(null),
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
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { accepted_terms_version: 'v1' }, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    auth: { setSession: vi.fn(), verifyOtp: vi.fn() },
    functions: { invoke: vi.fn() },
  },
}));

// ── Analytics mock ───────────────────────────────────────────────────────────

vi.mock('@/lib/mixpanel', () => ({
  analytics: { track: vi.fn() },
}));

// ── Sub-component mocks ──────────────────────────────────────────────────────

// LetterCover: wire onOpen so the test can transition viewState 'cover' → 'reading'.
vi.mock('@/app/components/letters/letter-cover', () => ({
  LetterCover: ({ onOpen }: { onOpen: () => void }) => (
    <button onClick={onOpen}>Open the Letter</button>
  ),
}));
// LetterFlowContent: the element LetterReadingFlow renders AFTER the throw site.
// Its presence proves LetterReadingFlow rendered without crashing.
vi.mock('@/app/components/letters/letter-flow-content', () => ({
  LetterFlowContent: () => <div data-testid="letter-flow-content">reading flow</div>,
}));
vi.mock('@/app/components/letters/letter-stale-terms-modal', () => ({
  LetterStaleTermsModal: () => null,
}));
vi.mock('@/app/components/letters/letter-completion-summary', () => ({
  LetterCompletionSummary: () => <div data-testid="confetti-completion" />,
}));
vi.mock('@/app/components/letters/letter-live-banner', () => ({
  LetterLiveBanner: () => null,
}));
vi.mock('@/app/components/letters/letter-live-overlay', () => ({
  LetterLiveOverlay: () => null,
}));

// ── Hook mocks ───────────────────────────────────────────────────────────────

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
vi.mock('@/app/hooks/useOpenLiveInvite', () => ({
  useOpenLiveInvite: vi.fn().mockReturnValue({ invite: null }),
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
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));
vi.mock('@/app/hooks/useUnreadLetterCount', () => ({
  useUnreadLetterCount: () => ({ count: 0, loading: false }),
}));

// ── Imports (after vi.mock hoisting) ─────────────────────────────────────────

import { useAuth } from '@/auth';
import { getLetterForReadingByToken } from '@/app/data/letters-service';
import { LetterReadingPage } from '@/app/pages/letter-reading-page';

const mockUseAuth = vi.mocked(useAuth);
const mockGetLetterForReadingByToken = vi.mocked(getLetterForReadingByToken);

// ── Error boundary to capture render-time throws cleanly ──────────────────────

let caughtError: Error | null = null;

class CaptureBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    caughtError = error;
  }
  render() {
    if (this.state.hasError) return <div data-testid="render-crash">crashed</div>;
    return this.props.children;
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeDelivery(overrides: Record<string, unknown> = {}) {
  return {
    id: DELIVERY_ID,
    letter_id: LETTER_ID,
    receiver_email: INTENDED_EMAIL,
    receiver_profile_id: null,
    receiver_name: 'Recipient',
    status: 'pending',
    access_token_expires_at: null,
    completed_at: null,
    saved_story_index: null,
    ...overrides,
  };
}

function makeLetter() {
  return {
    id: LETTER_ID,
    sender_id: SENDER_ID,
    sender_display_name: 'Sender',
    sender_slug: 'sender',
    sender_avatar_url: null,
    sender_avatar_color: null,
    sender_has_pledged: false,
    mode: 'one-to-one',
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

function renderPage() {
  return render(
    <CaptureBoundary>
      <MemoryRouter initialEntries={[`/letter/${DELIVERY_ID}?token=${TOKEN}`]}>
        <Routes>
          <Route path="/letter/:id" element={<LetterReadingPage />} />
        </Routes>
      </MemoryRouter>
    </CaptureBoundary>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('P859: emailed 1-to-1 letter reading flow renders without ReferenceError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    caughtError = null;
    // Recipient of an emailed 1-to-1 letter, authenticated with the intended email.
    // NOTE: the bug is auth-independent — `currentUser` is an *undeclared* identifier
    // in LetterReadingFlow, so it throws ReferenceError on render regardless of value.
    // The authenticated recipient is simply the deterministic path that reaches
    // setViewState('reading') (the logged-out path routes through account creation first).
    mockUseAuth.mockReturnValue({
      user: {
        id: 'recipient-id',
        email: INTENDED_EMAIL,
        name: 'Recipient',
        avatarUrl: null,
        avatarColor: '#4488cc',
        hasPledged: false,
        slug: 'recipient',
        isVerified: true,
      },
      session: { access_token: 'tok' } as unknown as ReturnType<typeof useAuth>['session'],
      sessionChecked: true,
      isLoading: false,
      signOut: vi.fn().mockResolvedValue(undefined),
    } as ReturnType<typeof useAuth>);

    mockGetLetterForReadingByToken.mockResolvedValue({
      letter: makeLetter() as unknown as import('@/app/types').ClarityLetter,
      snapshots: makeSnapshots() as unknown as import('@/app/types').LetterStorySnapshot[],
      delivery: makeDelivery() as unknown as import('@/app/types').LetterDelivery,
    });
  });

  it('renders the reading flow when the recipient clicks "Open the Letter"', async () => {
    renderPage();

    // Cover loads once the token read resolves (pageState → ready, viewState → cover).
    await screen.findByRole('button', { name: /open the letter/i });

    // Open → onOpen else-branch → setViewState('reading') → LetterReadingFlow mounts
    // (token present + matching email → not bufferOnly). The stale-terms check resolves
    // asynchronously, so poll the click until the page leaves the cover — either the
    // reading flow renders (fixed) or the error boundary trips (bug present).
    await waitFor(() => {
      const btn = screen.queryByRole('button', { name: /open the letter/i });
      if (btn) fireEvent.click(btn);
      const settled =
        screen.queryByTestId('letter-flow-content') ?? screen.queryByTestId('render-crash');
      expect(settled).not.toBeNull();
    });

    // SYMPTOM: the reading flow must render.
    // Before fix: LetterReadingFlow throws `ReferenceError: currentUser is not defined`
    //             at line 1102 → boundary trips (render-crash), LetterFlowContent never mounts.
    // After fix:  LetterFlowContent renders.
    expect(screen.getByTestId('letter-flow-content')).toBeInTheDocument();
    expect(screen.queryByTestId('render-crash')).not.toBeInTheDocument();
    expect(caughtError).toBeNull();
  });
});
