/**
 * P1300: the site-wide terms re-acceptance popup renders over arbitrary routes, so it may make
 * claims about the documents only. Before the fix it told a stale-terms user on a groups page
 * "This session is recorded for AI Insights", and its "View Terms" link pointed at /terms,
 * a route that has never resolved (the legal page is /terms-of-service).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockNeedsTermsAcceptance = vi.fn();

vi.mock('@/app/data/api', () => ({
  needsTermsAcceptance: (...args: unknown[]) => mockNeedsTermsAcceptance(...args),
  recordTermsAcceptance: vi.fn(),
}));

const authedUser = {
  user: { id: 'user-id-1234' },
  isLoading: false,
  signOut: vi.fn(),
};

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => authedUser,
}));

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}));

async function renderGateOn(path: string) {
  const { TermsAcceptanceGate } = await import('@/app/components/auth/terms-acceptance-gate');
  render(
    <MemoryRouter initialEntries={[path]}>
      <TermsAcceptanceGate>
        <div>Group page content</div>
      </TermsAcceptanceGate>
    </MemoryRouter>
  );
  return screen.findByRole('dialog');
}

describe('P1300 — terms re-acceptance popup on a non-session page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNeedsTermsAcceptance.mockResolvedValue(true);
  });

  it('makes no claim about a session or a recording', async () => {
    const dialog = await renderGateOn('/groups/example-group');
    await waitFor(() => expect(dialog).toHaveTextContent('Updated Terms'));

    expect(dialog.textContent ?? '').not.toMatch(/session/i);
    expect(dialog.textContent ?? '').not.toMatch(/record/i);
  });

  it('links "View Terms" to the Terms of Service page that actually exists', async () => {
    await renderGateOn('/groups/example-group');

    expect(screen.getByRole('link', { name: /view terms/i })).toHaveAttribute(
      'href',
      '/terms-of-service'
    );
    expect(screen.getByRole('link', { name: /view privacy policy/i })).toHaveAttribute(
      'href',
      '/privacy-policy'
    );
  });
});
