/**
 * @file p722-reproduce.test.tsx
 * @description P722 canary: anon/race-condition user must NOT see confetti when
 * landing on a completed 1-to-1 delivery via invitation token.
 *
 * Bug: When currentUser is briefly null (SIGNED_OUT race from expired OTP hash),
 * the P717 email guard at line 292 is skipped (`if (currentUser && ...)` is false).
 * Code hits line 322 which has no currentUser check — sets viewState='complete' and
 * renders LetterCompletionSummary (confetti) for a user who has not been verified.
 *
 * Canary gate:
 *   Before fix: LetterCompletionSummary renders (confetti shown to unverified user).
 *   After fix:  LetterCompletionSummary does NOT render.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';

// ── Router mock helpers ──────────────────────────────────────────────────────

const DELIVERY_ID = 'delivery-p722';
const TOKEN = 'token-p722';
const SENDER_EMAIL = 'sender@example.com';
const LETTER_ID = 'letter-p722';
const SENDER_ID = 'sender-p722';

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
    auth: {
      setSession: vi.fn(),
      verifyOtp: vi.fn(),
    },
    functions: {
      invoke: vi.fn(),
    },
  },
}));

// ── Mixpanel mock ────────────────────────────────────────────────────────────

vi.mock('@/lib/mixpanel', () => ({
  analytics: { track: vi.fn() },
}));

// ── Heavy sub-component mocks ────────────────────────────────────────────────

vi.mock('@/app/components/letters/letter-cover', () => ({
  LetterCover: () => <button>Open the Letter</button>,
}));
vi.mock('@/app/components/letters/letter-stale-terms-modal', () => ({
  LetterStaleTermsModal: () => null,
}));
// P722: render something identifiable so we can assert it was NOT shown
vi.mock('@/app/components/letters/letter-completion-summary', () => ({
  LetterCompletionSummary: () => <div data-testid="confetti-completion">Confetti: Completion</div>,
}));
vi.mock('@/app/components/letters/letter-flow-content', () => ({
  LetterFlowContent: () => null,
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
vi.mock('@/app/hooks/useUnreadLetterCount', () => ({ useUnreadLetterCount: () => ({ count: 0, loading: false }) }));

// ── Component + service imports (after vi.mock hoisting) ─────────────────────

import { useAuth } from '@/auth';
import { getLetterForReadingByToken } from '@/app/data/letters-service';
import { LetterReadingPage } from '@/app/pages/letter-reading-page';

const mockUseAuth = vi.mocked(useAuth);
const mockGetLetterForReadingByToken = vi.mocked(getLetterForReadingByToken);

/**
 * P1071 token-RPC shape. `get_letter_for_reading` redacts receiver_email and
 * invitation_token; the wrong-user comparison happens in-DB and arrives as
 * is_intended_recipient. Defaults to null — this suite's scenarios are mostly
 * anonymous or transient-signed-out callers, which is exactly when the real RPC
 * returns null (no auth.uid() to compare against).
 */
function makeDelivery(overrides: Record<string, unknown> = {}) {
  return {
    id: DELIVERY_ID,
    letter_id: LETTER_ID,
    receiver_profile_id: null,
    receiver_name: 'Recipient',
    is_intended_recipient: null,
    status: 'pending',
    access_token_expires_at: null,
    completed_at: null,
    ...overrides,
  };
}

function makeLetter() {
  return {
    id: LETTER_ID,
    sender_id: SENDER_ID,
    sender_display_name: 'Sender',
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
    <MemoryRouter initialEntries={[`/letter/${DELIVERY_ID}?token=${TOKEN}`]}>
      <Routes>
        <Route path="/letter/:id" element={<LetterReadingPage />} />
      </Routes>
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('P722: anon/race-condition user must not see confetti on completed 1-to-1 delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Scenario 3 (race): does not show confetti when currentUser is null and delivery is completed', async () => {
    // Simulate: currentUser briefly null due to SIGNED_OUT transient event
    // (triggered by expired OTP hash: #error=access_denied&error_code=otp_expired)
    mockUseAuth.mockReturnValue({
      user: null,
      session: null,
      sessionChecked: true,
      isLoading: false,
      signOut: vi.fn().mockResolvedValue(undefined),
    } as ReturnType<typeof useAuth>);

    // Token returns completed delivery — recipient already read this letter
    mockGetLetterForReadingByToken.mockResolvedValue({
      letter: makeLetter() as unknown as import('@/app/types').ClarityLetter,
      snapshots: makeSnapshots() as unknown as import('@/app/types').LetterStorySnapshot[],
      delivery: makeDelivery({ status: 'completed' }) as unknown as import('@/app/types').LetterDelivery,
    });

    renderPage();

    // Wait for the loading state to finish (loader disappears when pageState leaves 'loading').
    // Without this gate, a negative assertion resolves immediately before the async load completes.
    await waitFor(() => {
      expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
    });

    // Canary assertion: confetti must NOT render for an unverified user.
    // This FAILS before the fix (bug: confetti is shown to wrong/anon user).
    // This PASSES after the fix (confetti suppressed for currentUser=null).
    expect(screen.queryByTestId('confetti-completion')).not.toBeInTheDocument();
  });

  it('Scenario 4 (anon unverified): anon user with token on completed 1-to-1 delivery does not see confetti', async () => {
    // Pure anon user (not a race condition — user is genuinely not logged in)
    // arriving at a completed delivery via token. Same code path as Scenario 3.
    mockUseAuth.mockReturnValue({
      user: null,
      session: null,
      sessionChecked: true,
      isLoading: false,
      signOut: vi.fn().mockResolvedValue(undefined),
    } as ReturnType<typeof useAuth>);

    mockGetLetterForReadingByToken.mockResolvedValue({
      letter: makeLetter() as unknown as import('@/app/types').ClarityLetter,
      snapshots: makeSnapshots() as unknown as import('@/app/types').LetterStorySnapshot[],
      delivery: makeDelivery({ status: 'completed' }) as unknown as import('@/app/types').LetterDelivery,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
    });

    expect(screen.queryByTestId('confetti-completion')).not.toBeInTheDocument();
  });

  it('Scenario 1 regression (P717): settled wrong-user still sees wrong-account screen', async () => {
    // Ensure P717 fix is not broken: authenticated wrong user (auth fully settled)
    // visiting a token link for a different email must still see wrong-account screen.
    mockUseAuth.mockReturnValue({
      user: {
        id: 'wrong-user-id',
        email: SENDER_EMAIL,  // sender, not the intended recipient
        user_metadata: { name: 'Sender' },
      },
      session: { access_token: 'tok' } as unknown as ReturnType<typeof useAuth>['session'],
      sessionChecked: true,
      isLoading: false,
      signOut: vi.fn().mockResolvedValue(undefined),
    } as ReturnType<typeof useAuth>);

    // Delivery addressed to someone else: the signed-in caller is the sender, so
    // the in-DB comparison returns false (P1071 — the RPC no longer hands back the
    // address for the client to compare).
    mockGetLetterForReadingByToken.mockResolvedValue({
      letter: makeLetter() as unknown as import('@/app/types').ClarityLetter,
      snapshots: makeSnapshots() as unknown as import('@/app/types').LetterStorySnapshot[],
      delivery: makeDelivery({ status: 'completed', is_intended_recipient: false }) as unknown as import('@/app/types').LetterDelivery,
    });

    renderPage();

    // P717 guard fires — wrong-account screen must show
    await waitFor(() => {
      expect(screen.getByText(/This link is for a different account/i)).toBeInTheDocument();
    });

    // And confetti must also not show (belt-and-suspenders check)
    expect(screen.queryByTestId('confetti-completion')).not.toBeInTheDocument();
  });
});
