/**
 * @file p1487-first-signin-via-mailbox.test.tsx
 * @description P1487: opening an invitation (letter or agreement) never signs the browser in.
 *
 * The invitation token is not proof of owning the recipient's mailbox, so the reader-side
 * pages must never turn a server response into a session (no verifyOtp on a token the page
 * was handed), and must never call the retired one-click account endpoint. A recipient
 * without an account waits for a sign-in link in their own mailbox instead.
 *
 * Server-side behaviour (no credential, no confirmed account, link goes to the recipient's
 * address) is proven live in
 * supabase/functions/create-and-open-letter/p1487-mailbox-first-signin.test.ts.
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';

// ── Shared mocks ─────────────────────────────────────────────────────────────

const invoke = vi.fn();
const verifyOtp = vi.fn();
const signInWithOtp = vi.fn();

vi.mock('@/auth', () => ({ useAuth: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { accepted_terms_version: 'v1' }, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      setSession: vi.fn(),
      verifyOtp: (...a: unknown[]) => verifyOtp(...a),
      signInWithOtp: (...a: unknown[]) => signInWithOtp(...a),
    },
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
  },
}));

vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/constants', () => ({ CURRENT_TERMS_VERSION: 'v1', ACCEPTED_TERMS_VERSIONS: ['v1'] }));
vi.mock('@/components/ui/clarity-loader', () => ({
  ClarityPageLoader: () => <div data-testid="loader">Loading...</div>,
  ClarityLoader: () => <div data-testid="loader-sm" />,
}));
vi.mock('@/app/components/layout/certificate-page-shell', () => ({
  CertificatePageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ── Letter page mocks ────────────────────────────────────────────────────────

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
vi.mock('@/app/components/letters/letter-cover', () => ({
  LetterCover: ({ onOpen }: { onOpen: () => void }) => <button onClick={onOpen}>Open the Letter</button>,
}));
vi.mock('@/app/components/letters/letter-stale-terms-modal', () => ({ LetterStaleTermsModal: () => null }));
vi.mock('@/app/components/letters/letter-completion-summary', () => ({ LetterCompletionSummary: () => null }));
vi.mock('@/app/components/letters/letter-flow-content', () => ({ LetterFlowContent: () => null }));
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
vi.mock('@/app/data/points-service', () => ({ pointsService: { setPosition: vi.fn(), removePosition: vi.fn() } }));
vi.mock('@/app/hooks/useUnreadLetterCount', () => ({ useUnreadLetterCount: () => ({ count: 0, loading: false }) }));

// ── Agreement page mocks ─────────────────────────────────────────────────────

vi.mock('@/app/data/agreements-service', () => ({
  agreementsService: {
    getAgreementByToken: vi.fn(),
    lookupUserByEmail: vi.fn().mockResolvedValue(null),
    acceptAgreement: vi.fn(),
  },
}));
vi.mock('@/app/components/agreements/agreement-certificate', () => ({
  AgreementCertificate: ({ footer }: { footer?: React.ReactNode }) => <div data-testid="certificate">{footer}</div>,
}));
vi.mock('@/lib/agreement-emails', () => ({ invokeAgreementEmails: vi.fn() }));
vi.mock('@/lib/confetti', () => ({ triggerConfetti: vi.fn() }));
vi.mock('react-helmet-async', () => ({ Helmet: () => null }));

// ── Imports after mocks ──────────────────────────────────────────────────────

import { useAuth } from '@/auth';
import { getLetterForReadingByToken } from '@/app/data/letters-service';
import { agreementsService } from '@/app/data/agreements-service';
import { LetterReadingPage } from '@/app/pages/letter-reading-page';
import { AcceptAgreementPage } from '@/app/pages/accept-agreement-page';

const mockUseAuth = vi.mocked(useAuth);
const ANON = {
  user: null,
  session: null,
  sessionChecked: true,
  isLoading: false,
  signOut: vi.fn().mockResolvedValue(undefined),
} as unknown as ReturnType<typeof useAuth>;

const DELIVERY_ID = 'delivery-p1487';
const TOKEN = '11111111-2222-4333-8444-555555555555';

function seedLetter() {
  vi.mocked(getLetterForReadingByToken).mockResolvedValue({
    letter: {
      id: 'letter-p1487', sender_id: 'sender-p1487', sender_display_name: 'Sam Sender',
      sender_avatar_url: null, sender_avatar_color: null, sender_has_pledged: false,
      mode: 'one-to-one', status: 'sealed',
    } as unknown as import('@/app/types').ClarityLetter,
    snapshots: [{
      letter_id: 'letter-p1487', story_id: 'story-1', version_id: 'v1', position: 0,
      point_config: { storyText: 'text', storyTitle: 'title', points: [] },
    }] as unknown as import('@/app/types').LetterStorySnapshot[],
    delivery: {
      id: DELIVERY_ID, letter_id: 'letter-p1487', receiver_profile_id: null, receiver_name: 'Pat',
      is_intended_recipient: null, status: 'sent', access_token_expires_at: null, completed_at: null,
    } as unknown as import('@/app/types').LetterDelivery,
  });
}

function renderLetter() {
  return render(
    <MemoryRouter initialEntries={[`/letter/${DELIVERY_ID}?token=${TOKEN}`]}>
      <Routes>
        <Route path="/letter/:id" element={<LetterReadingPage />} />
        <Route path="/login" element={<div data-testid="login-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openLetter() {
  renderLetter();
  fireEvent.click(await screen.findByRole('button', { name: 'Open the Letter' }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('create-and-open-letter', expect.anything()));
}

describe('P1487: opening a letter invitation never signs the browser in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invoke.mockReset();
    verifyOtp.mockReset().mockResolvedValue({ error: null });
    mockUseAuth.mockReturnValue(ANON);
    seedLetter();
  });

  it('a new recipient sees "check your email" and no session is attempted', async () => {
    invoke.mockResolvedValue({ data: { ok: true, checkEmail: true }, error: null });
    await openLetter();

    expect(await screen.findByTestId('letter-check-email')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open the Letter' })).not.toBeInTheDocument();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('a credential in the response (pre-fix server shape) is never redeemed', async () => {
    invoke.mockResolvedValue({ data: { ok: true, hashedToken: 'pre-fix-hash', redirectTo: `/letter/${DELIVERY_ID}` }, error: null });
    await openLetter();

    // Give any follow-up promise a chance to run before asserting the negative.
    await waitFor(() => expect(screen.queryByTestId('loader-sm')).not.toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 0));
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('"send the link again" asks the server again and confirms the resend', async () => {
    invoke.mockResolvedValue({ data: { ok: true, checkEmail: true }, error: null });
    await openLetter();
    fireEvent.click(await screen.findByRole('button', { name: /send the link again/i }));

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/New link sent/)).toBeInTheDocument();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('a rate-limited re-send keeps the check-email panel and says why', async () => {
    const { FunctionsHttpError } = await import('@supabase/supabase-js');
    invoke
      .mockResolvedValueOnce({ data: { ok: true, checkEmail: true }, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: new FunctionsHttpError(new Response(JSON.stringify({ error: 'Too many requests. Please wait a while and try again.' }), { status: 429 })),
      });
    await openLetter();
    fireEvent.click(await screen.findByRole('button', { name: /send the link again/i }));

    expect(await screen.findByText(/Too many requests/)).toBeInTheDocument();
    expect(screen.getByTestId('letter-check-email')).toBeInTheDocument();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('control: an existing account is still sent to sign in (P1446)', async () => {
    invoke.mockResolvedValue({ data: { ok: true, signInRequired: true, redirectTo: `/letter/${DELIVERY_ID}` }, error: null });
    await openLetter();

    expect(await screen.findByTestId('login-page')).toBeInTheDocument();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('control: a server error leaves the reader on the cover (to retry), not on "check your email"', async () => {
    const { FunctionsHttpError } = await import('@supabase/supabase-js');
    const err = new FunctionsHttpError(new Response(JSON.stringify({ message: "Couldn't send your sign-in link. Please try again." }), { status: 502 }));
    invoke.mockResolvedValue({ data: null, error: err });
    await openLetter();

    expect(await screen.findByRole('button', { name: 'Open the Letter' })).toBeInTheDocument();
    expect(screen.queryByTestId('letter-check-email')).not.toBeInTheDocument();
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});

// ── Agreement ────────────────────────────────────────────────────────────────

const AGREEMENT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PARTNER_EMAIL = 'partner-p1487@example.com';

function renderAgreement() {
  return render(
    <MemoryRouter initialEntries={[`/agreements/${AGREEMENT_ID}/accept?token=${TOKEN}`]}>
      <Routes>
        <Route path="/agreements/:id/accept" element={<AcceptAgreementPage />} />
        <Route path="/agreements/confirm-email" element={<div data-testid="confirm-email-page" />} />
        <Route path="/agreements/:id" element={<div data-testid="agreement-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('P1487: signing an agreement invitation goes through the mailbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invoke.mockReset().mockResolvedValue({ data: { ok: true, hashedToken: 'pre-fix-hash' }, error: null });
    verifyOtp.mockReset().mockResolvedValue({ error: null });
    signInWithOtp.mockReset().mockResolvedValue({ error: null });
    mockUseAuth.mockReturnValue(ANON);
    vi.mocked(agreementsService.getAgreementByToken).mockResolvedValue({
      id: AGREEMENT_ID, status: 'pending', partnerEmail: PARTNER_EMAIL, partnerDisplayName: 'Pat Partner',
      creatorProfileId: 'creator-p1487', partnerProfileId: null, invitationToken: TOKEN,
    } as unknown as Awaited<ReturnType<typeof agreementsService.getAgreementByToken>>);
    vi.mocked(agreementsService.lookupUserByEmail).mockResolvedValue(null);
  });

  it('control: the agreement is viewable by token without an account', async () => {
    renderAgreement();
    expect(await screen.findByTestId('certificate')).toBeInTheDocument();
    expect(agreementsService.getAgreementByToken).toHaveBeenCalledWith(TOKEN);
  });

  it('"Seal & Sign" sends a sign-in link to the invited address — no one-click account, no session', async () => {
    renderAgreement();
    fireEvent.click(await screen.findByRole('button', { name: /seal & sign/i }));

    await waitFor(() => expect(signInWithOtp).toHaveBeenCalledTimes(1));
    expect(signInWithOtp.mock.calls[0][0]).toMatchObject({ email: PARTNER_EMAIL });
    expect(await screen.findByTestId('confirm-email-page')).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith('create-and-sign', expect.anything());
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
