/**
 * Notice mode of the terms gate: when the current terms version does not require
 * fresh consent, a stale user gets a dismissible banner, not the blocking popup.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockNeedsTermsAcceptance = vi.fn();
const mockRecordTermsAcceptance = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('@/app/data/api', () => ({
  needsTermsAcceptance: (...args: unknown[]) => mockNeedsTermsAcceptance(...args),
  recordTermsAcceptance: (...args: unknown[]) => mockRecordTermsAcceptance(...args),
}));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('@sentry/react', () => ({ captureException: vi.fn() }));
vi.mock('@/app/content/terms-changes', () => ({
  TERMS_CHANGES: new Proxy({}, {
    get: () => ({ requiresConsent: false, headline: 'Headline one', highlights: ['Highlight one'] }),
  }),
}));

const { TermsAcceptanceGate } = await import('@/app/components/auth/terms-acceptance-gate');

const renderGate = (path = '/feed') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <TermsAcceptanceGate>
        <p>page content</p>
      </TermsAcceptanceGate>
    </MemoryRouter>
  );

describe('TermsAcceptanceGate — notice mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: { id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' },
      isLoading: false,
      signOut: vi.fn(),
    });
  });

  it('shows a banner with what changed, and no blocking popup', async () => {
    mockNeedsTermsAcceptance.mockResolvedValue(true);
    renderGate();
    const banner = await screen.findByRole('region', { name: 'Terms update' });
    expect(banner.textContent).toContain('Headline one');
    expect(banner.textContent).not.toMatch(/session|record/i);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('"Accept" records acceptance and hides the banner', async () => {
    mockNeedsTermsAcceptance.mockResolvedValue(true);
    mockRecordTermsAcceptance.mockResolvedValue(undefined);
    renderGate();
    fireEvent.click(await screen.findByRole('button', { name: /^accept$/i }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Terms update' })).not.toBeInTheDocument());
    expect(mockRecordTermsAcceptance).toHaveBeenCalledWith('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'notice');
  });

  it('a failed save still hides the banner instead of trapping the user', async () => {
    mockNeedsTermsAcceptance.mockResolvedValue(true);
    mockRecordTermsAcceptance.mockRejectedValue(new Error('network'));
    renderGate();
    fireEvent.click(await screen.findByRole('button', { name: /^accept$/i }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Terms update' })).not.toBeInTheDocument());
  });

  it('shows nothing to an up-to-date user', async () => {
    mockNeedsTermsAcceptance.mockResolvedValue(false);
    renderGate();
    await waitFor(() => expect(mockNeedsTermsAcceptance).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: 'Terms update' })).not.toBeInTheDocument();
  });
});
