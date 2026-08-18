/**
 * @file p717-wrong-user-token-guard.test.tsx
 * @description P717 canary: wrong authenticated user visiting a token link must see
 * the wrong-account screen, not the letter cover.
 *
 * Bug: The wrong_user guard in LetterReadingPage only checks receiver_profile_id.
 * Unclaimed deliveries have receiver_profile_id = null, so a different authenticated
 * user slips through to pageState = 'ready' and sees the letter cover without any warning.
 *
 * Canary gate:
 *   Before fix: LetterReadingPage renders "Open the Letter" (letter cover) when
 *               current user email ≠ delivery.receiver_email and receiver_profile_id = null.
 *   After fix:  renders "This link is for a different account" (wrong-account screen).
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';

// ── Router mock helpers ──────────────────────────────────────────────────────

// We render via MemoryRouter with the actual route so useParams/useSearchParams work.
const DELIVERY_ID = 'delivery-p717';
const TOKEN = 'token-p717';
const WRONG_USER_EMAIL = 'alice@example.com';
const INTENDED_EMAIL = 'bob@example.com';
const LETTER_ID = 'letter-p717';
const SENDER_ID = 'sender-p717';

// ── Auth mock ────────────────────────────────────────────────────────────────

vi.mock('@/auth', () => ({
  useAuth: vi.fn(),
}));

// ── Letters service mock ─────────────────────────────────────────────────────

vi.mock('@/app/data/letters-service', () => ({
  getLetterForReading: vi.fn().mockResolvedValue(null),       // RLS returns null for wrong user
  getLetterForReadingByToken: vi.fn(),                        // P1071: returns is_intended_recipient, not receiver_email
  getLetterForPublicReading: vi.fn().mockResolvedValue(null),
  claimLetterDelivery: vi.fn().mockResolvedValue(true),
  updateDeliveryStatus: vi.fn().mockResolvedValue(undefined),
  updateDeliveryStatusByToken: vi.fn().mockResolvedValue(undefined),
  submitLetterResponseAuthenticated: vi.fn(),
  getLetterPointResponses: vi.fn().mockResolvedValue({}),
  getLetterPointResponsesByToken: vi.fn().mockResolvedValue({}),
}));

// ── Supabase mock (for stale-terms check) ────────────────────────────────────

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
vi.mock('@/app/components/letters/letter-completion-summary', () => ({
  LetterCompletionSummary: () => null,
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

// ── Component + service imports (after vi.mock hoisting) ─────────────────────

import { useAuth } from '@/auth';
import { getLetterForReading, getLetterForReadingByToken } from '@/app/data/letters-service';
import { LetterReadingPage } from '@/app/pages/letter-reading-page';
import userEvent from '@testing-library/user-event';

const mockUseAuth = vi.mocked(useAuth);
const mockGetLetterForReadingByToken = vi.mocked(getLetterForReadingByToken);
const mockGetLetterForReading = vi.mocked(getLetterForReading);

/**
 * Table-path shape (`getLetterForReading`, direct RLS read). Still carries the
 * real receiver_email — P1071 changed the anon token RPC only, not this path.
 */
function makeDelivery(overrides: Record<string, unknown> = {}) {
  return {
    id: DELIVERY_ID,
    letter_id: LETTER_ID,
    receiver_email: INTENDED_EMAIL,
    receiver_profile_id: null,           // unclaimed delivery
    receiver_name: 'Bob',
    status: 'pending',
    access_token_expires_at: null,
    completed_at: null,
    ...overrides,
  };
}

/**
 * P1071 token-RPC shape (`get_letter_for_reading`). The RPC redacts
 * receiver_email and invitation_token and returns the comparison verdict
 * instead, so this fixture must NOT carry the address — a fixture that still
 * supplied it would let the guard pass here while failing against the real RPC,
 * which is the P717 class of defect (green unit tests, guard skipped in prod).
 *
 * Defaults to false: the suite's default caller is the wrong user.
 */
function makeRpcDelivery(overrides: Record<string, unknown> = {}) {
  return {
    id: DELIVERY_ID,
    letter_id: LETTER_ID,
    receiver_profile_id: null,           // unclaimed delivery
    receiver_name: 'Bob',
    is_intended_recipient: false,
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
    sender_display_name: 'Vyacheslav',
    sender_avatar_url: null,
    sender_avatar_color: null,
    sender_has_pledged: false,
    mode: 'one-to-one',
    status: 'sealed',
  };
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

describe('P717: wrong authenticated user on token link', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Current user: alice (NOT the intended recipient bob)
    mockUseAuth.mockReturnValue({
      user: {
        id: 'alice-user-id',
        email: WRONG_USER_EMAIL,
        user_metadata: { name: 'Alice' },
      },
      session: { access_token: 'tok' } as unknown as ReturnType<typeof useAuth>['session'],
      sessionChecked: true,
      isLoading: false,
      signOut: vi.fn().mockResolvedValue(undefined),
    } as ReturnType<typeof useAuth>);

    // Token-based read returns delivery addressed to bob
    mockGetLetterForReadingByToken.mockResolvedValue({
      letter: makeLetter() as unknown as import('@/app/types').ClarityLetter,
      snapshots: [
        {
          letter_id: LETTER_ID,
          story_id: 'story-1',
          version_id: 'v1',
          position: 0,
          point_config: { storyText: 'text', storyTitle: 'title', points: [] },
        },
      ],
      delivery: makeRpcDelivery() as unknown as import('@/app/types').LetterDelivery,
    });
  });

  it('shows wrong-account screen (not the letter cover) when current user email differs from delivery receiver_email', async () => {
    renderPage();

    // After async load, should show wrong-account message
    await waitFor(() => {
      // This assertion FAILS before the fix (letter cover renders instead)
      // After fix: wrong-account message renders
      expect(screen.queryByText(/Open the Letter/i)).toBeNull();
    });

    await waitFor(() => {
      expect(
        screen.getByText(/different account|wasn't sent to you|not addressed to you/i)
      ).toBeInTheDocument();
    });
  });

  it('Sign out button calls signOut and is present on wrong-account screen', async () => {
    const user = userEvent.setup();
    const mockSignOut = vi.fn().mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({
      user: {
        id: 'alice-user-id',
        email: WRONG_USER_EMAIL,
        user_metadata: { name: 'Alice' },
      },
      session: { access_token: 'tok' } as unknown as ReturnType<typeof useAuth>['session'],
      sessionChecked: true,
      isLoading: false,
      signOut: mockSignOut,
    } as ReturnType<typeof useAuth>);

    renderPage();

    const signOutButton = await screen.findByRole('button', { name: /sign out/i });
    expect(signOutButton).toBeInTheDocument();
    await user.click(signOutButton);
    expect(mockSignOut).toHaveBeenCalledOnce();
  });

  it('does NOT show wrong-account screen when current user email matches delivery receiver_email', async () => {
    // Same user as intended recipient (correct account)
    mockUseAuth.mockReturnValue({
      user: {
        id: 'bob-user-id',
        email: INTENDED_EMAIL,   // matches delivery.receiver_email
        user_metadata: { name: 'Bob' },
      },
      session: { access_token: 'tok' } as unknown as ReturnType<typeof useAuth>['session'],
      sessionChecked: true,
      isLoading: false,
      signOut: vi.fn().mockResolvedValue(undefined),
    } as ReturnType<typeof useAuth>);

    // P1071: the verdict is computed in-DB, so the correct-recipient case must be
    // re-mocked here. Without this the test would pass vacuously — a guard that
    // never fires also "does not show the wrong-account screen".
    mockGetLetterForReadingByToken.mockResolvedValue({
      letter: makeLetter() as unknown as import('@/app/types').ClarityLetter,
      snapshots: [
        {
          letter_id: LETTER_ID,
          story_id: 'story-1',
          version_id: 'v1',
          position: 0,
          point_config: { storyText: 'text', storyTitle: 'title', points: [] },
        },
      ],
      delivery: makeRpcDelivery({ is_intended_recipient: true }) as unknown as import('@/app/types').LetterDelivery,
    });

    renderPage();

    // Correct user should reach the letter cover
    await waitFor(() => {
      expect(screen.getByText(/Open the Letter/i)).toBeInTheDocument();
    });
  });

  it('P1071: signed-in caller with a null verdict still reaches the letter — null must not trip the guard', async () => {
    // The regression a naive `!delivery.is_intended_recipient` check would cause.
    // The RPC returns null when there is nothing to compare — notably a delivery
    // with no receiver_email, which is exactly the shape one-to-many link
    // deliveries carry (see e2e/p704-anon-one-to-many-token.spec.ts, which inserts
    // receiver_email: null). A signed-in reader opening such a link has a verdict
    // of null, and must still get the letter.
    //
    // This case is what makes `=== false` load-bearing: the anonymous case alone
    // cannot prove it, because the guard's `currentUser &&` prefix short-circuits
    // there whichever comparison is used.
    mockUseAuth.mockReturnValue({
      user: {
        id: 'some-signed-in-user',
        email: WRONG_USER_EMAIL,
        user_metadata: { name: 'Reader' },
      },
      session: { access_token: 'tok' } as unknown as ReturnType<typeof useAuth>['session'],
      sessionChecked: true,
      isLoading: false,
      signOut: vi.fn().mockResolvedValue(undefined),
    } as ReturnType<typeof useAuth>);

    mockGetLetterForReadingByToken.mockResolvedValue({
      letter: makeLetter() as unknown as import('@/app/types').ClarityLetter,
      snapshots: [
        {
          letter_id: LETTER_ID,
          story_id: 'story-1',
          version_id: 'v1',
          position: 0,
          point_config: { storyText: 'text', storyTitle: 'title', points: [] },
        },
      ],
      delivery: makeRpcDelivery({ is_intended_recipient: null }) as unknown as import('@/app/types').LetterDelivery,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Open the Letter/i)).toBeInTheDocument();
    });
    expect(
      screen.queryByText(/different account|wasn't sent to you|not addressed to you/i)
    ).toBeNull();
  });

  it('authed-first path: shows wrong-account screen when getLetterForReading returns data for wrong user', async () => {
    // Scenario: RLS allows authed read (receiver_profile_id is null, so RLS passes)
    // but the current user's email doesn't match delivery.receiver_email.
    // Before fix: falls through to pageState='ready'. After fix: pageState='wrong_user'.
    mockGetLetterForReading.mockResolvedValue({
      letter: makeLetter() as unknown as import('@/app/types').ClarityLetter,
      snapshots: [
        {
          letter_id: LETTER_ID,
          story_id: 'story-1',
          version_id: 'v1',
          position: 0,
          point_config: { storyText: 'text', storyTitle: 'title', points: [] },
        },
      ],
      delivery: makeDelivery() as unknown as import('@/app/types').LetterDelivery,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.queryByText(/Open the Letter/i)).toBeNull();
    });

    await waitFor(() => {
      expect(
        screen.getByText(/different account|wasn't sent to you|not addressed to you/i)
      ).toBeInTheDocument();
    });
  });
});
