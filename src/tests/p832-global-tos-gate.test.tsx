/**
 * P832 change #4: Global ToS re-acceptance gate.
 *
 * The gate must render the existing TermsUpdateDialog whenever the authed
 * user's accepted_terms_version lags CURRENT_TERMS_VERSION — on any authed
 * route, not only /live.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const mockNeedsTermsAcceptance = vi.fn();
const mockRecordTermsAcceptance = vi.fn();
const mockSignOut = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('@/app/data/api', () => ({
  needsTermsAcceptance: (...args: unknown[]) => mockNeedsTermsAcceptance(...args),
  recordTermsAcceptance: (...args: unknown[]) => mockRecordTermsAcceptance(...args),
}));

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}));

const renderWithRouter = (children: ReactNode, initialPath = '/feed') =>
  render(<MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>);

const authedUser = {
  user: { id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' },
  isLoading: false,
  signOut: mockSignOut,
};

describe('TermsAcceptanceGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children and shows TermsUpdateDialog when v1.2 user lands on any authed route', async () => {
    mockUseAuth.mockReturnValue(authedUser);
    mockNeedsTermsAcceptance.mockResolvedValue(true);

    const { TermsAcceptanceGate } = await import(
      '@/app/components/auth/terms-acceptance-gate'
    );

    renderWithRouter(
      <TermsAcceptanceGate>
        <div>Some authed route content</div>
      </TermsAcceptanceGate>
    );

    expect(screen.getByText('Some authed route content')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Updated Terms')).toBeInTheDocument();
    });
  });

  it('does not show dialog when user is up-to-date (v1.3)', async () => {
    mockUseAuth.mockReturnValue(authedUser);
    mockNeedsTermsAcceptance.mockResolvedValue(false);

    const { TermsAcceptanceGate } = await import(
      '@/app/components/auth/terms-acceptance-gate'
    );

    renderWithRouter(
      <TermsAcceptanceGate>
        <div>Some authed route content</div>
      </TermsAcceptanceGate>
    );

    expect(screen.getByText('Some authed route content')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockNeedsTermsAcceptance).toHaveBeenCalled();
    });

    expect(screen.queryByText('Updated Terms')).not.toBeInTheDocument();
  });

  it('does not call needsTermsAcceptance when no user is logged in', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, signOut: mockSignOut });

    const { TermsAcceptanceGate } = await import(
      '@/app/components/auth/terms-acceptance-gate'
    );

    renderWithRouter(
      <TermsAcceptanceGate>
        <div>Public landing</div>
      </TermsAcceptanceGate>
    );

    expect(screen.getByText('Public landing')).toBeInTheDocument();
    expect(mockNeedsTermsAcceptance).not.toHaveBeenCalled();
    expect(screen.queryByText('Updated Terms')).not.toBeInTheDocument();
  });

  it('skips the check while auth is still loading', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true, signOut: mockSignOut });

    const { TermsAcceptanceGate } = await import(
      '@/app/components/auth/terms-acceptance-gate'
    );

    renderWithRouter(
      <TermsAcceptanceGate>
        <div>Anything</div>
      </TermsAcceptanceGate>
    );

    expect(mockNeedsTermsAcceptance).not.toHaveBeenCalled();
  });

  it('keeps dialog visible across auth re-validation (isLoading flips back to true)', async () => {
    mockUseAuth.mockReturnValue(authedUser);
    mockNeedsTermsAcceptance.mockResolvedValue(true);

    const { TermsAcceptanceGate } = await import(
      '@/app/components/auth/terms-acceptance-gate'
    );

    const { rerender } = renderWithRouter(
      <TermsAcceptanceGate>
        <div>Authed content</div>
      </TermsAcceptanceGate>
    );

    await waitFor(() => {
      expect(screen.getByText('Updated Terms')).toBeInTheDocument();
    });

    // Simulate Supabase session re-validation: AuthContext flips isLoading: true,
    // then back to false with the same user. Modal must stay visible — the user
    // has not accepted or signed out.
    mockUseAuth.mockReturnValue({ ...authedUser, isLoading: true });
    rerender(
      <MemoryRouter initialEntries={['/feed']}>
        <TermsAcceptanceGate>
          <div>Authed content</div>
        </TermsAcceptanceGate>
      </MemoryRouter>
    );

    expect(screen.getByText('Updated Terms')).toBeInTheDocument();

    mockUseAuth.mockReturnValue(authedUser);
    rerender(
      <MemoryRouter initialEntries={['/feed']}>
        <TermsAcceptanceGate>
          <div>Authed content</div>
        </TermsAcceptanceGate>
      </MemoryRouter>
    );

    expect(screen.getByText('Updated Terms')).toBeInTheDocument();
  });

  it('stays dormant on /auth/* paths (race with AuthCallbackPage upsert)', async () => {
    mockUseAuth.mockReturnValue(authedUser);
    mockNeedsTermsAcceptance.mockResolvedValue(true);

    const { TermsAcceptanceGate } = await import(
      '@/app/components/auth/terms-acceptance-gate'
    );

    renderWithRouter(
      <TermsAcceptanceGate>
        <div>Callback landing</div>
      </TermsAcceptanceGate>,
      '/auth/callback'
    );

    expect(screen.getByText('Callback landing')).toBeInTheDocument();

    // Wait for any async — the modal must not appear and the gate must not
    // even call needsTermsAcceptance while on /auth/*.
    await waitFor(() => {
      expect(screen.queryByText('Updated Terms')).not.toBeInTheDocument();
    });
    expect(mockNeedsTermsAcceptance).not.toHaveBeenCalled();
  });

  it('handleAccept failure: surfaces error and keeps dialog open', async () => {
    mockUseAuth.mockReturnValue(authedUser);
    mockNeedsTermsAcceptance.mockResolvedValue(true);
    mockRecordTermsAcceptance.mockRejectedValue(new Error('RLS denied'));

    const { TermsAcceptanceGate } = await import(
      '@/app/components/auth/terms-acceptance-gate'
    );

    renderWithRouter(
      <TermsAcceptanceGate>
        <div>Authed content</div>
      </TermsAcceptanceGate>
    );

    await waitFor(() => {
      expect(screen.getByText('Updated Terms')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    // Dialog still open
    expect(screen.getByText('Updated Terms')).toBeInTheDocument();
    expect(screen.getByRole('alert').textContent).toMatch(/could not save/i);
  });

  it('handleCancel: calls signOut without flipping dialog up front (TOCTOU guard)', async () => {
    mockUseAuth.mockReturnValue(authedUser);
    mockNeedsTermsAcceptance.mockResolvedValue(true);
    // signOut returns a never-settling promise so we can assert state during the gap
    let resolveSignOut!: () => void;
    mockSignOut.mockImplementation(
      () => new Promise<void>((res) => (resolveSignOut = res))
    );

    const { TermsAcceptanceGate } = await import(
      '@/app/components/auth/terms-acceptance-gate'
    );

    renderWithRouter(
      <TermsAcceptanceGate>
        <div>Authed content</div>
      </TermsAcceptanceGate>
    );

    await waitFor(() => {
      expect(screen.getByText('Updated Terms')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    // signOut has been called and is in flight; dialog must remain visible
    // (it should NOT be eagerly hidden before signOut completes).
    expect(mockSignOut).toHaveBeenCalled();
    expect(screen.getByText('Updated Terms')).toBeInTheDocument();

    resolveSignOut();
  });
});

describe('AuthCallbackPage — accepted_terms_version preservation', () => {
  // Regression guard for P832: AuthCallbackPage previously wrote
  // `accepted_terms_version: CURRENT_TERMS_VERSION` unconditionally in its
  // profile upsert, which silently bumped returning users to v1.3 on every
  // OAuth callback. That defeats the TermsAcceptanceGate — the row never
  // appears stale, so the modal never shows.
  it('does not unconditionally overwrite accepted_terms_version on login', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../auth/AuthCallbackPage.tsx'),
      'utf-8'
    );
    // The dangerous pattern: a bare assignment with no fallback to an existing
    // value. Returning users must keep their stored version so the gate can
    // detect them as stale when CURRENT_TERMS_VERSION moves forward.
    expect(source).not.toMatch(/accepted_terms_version:\s*CURRENT_TERMS_VERSION,/);
  });
});
