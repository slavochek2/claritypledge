/**
 * P969 Canary — header nav CTA is not event-aware.
 *
 * Root cause: LoggedOutPrimaryCta (simple-navigation.tsx) renders the static constant
 * WEBINAR_CTA_LABEL → WEBINAR_REGISTER_URL unconditionally for every non-/coach route.
 * It never consults the events DB, so when no upcoming webinar exists the header keeps
 * promising "Join the next Clarity Experiment" while the landing hero correctly degrades
 * to "Try a Clarity Letter".
 *
 * BEFORE FIX: this test FAILS — the header CTA always shows "Join the next Clarity
 *   Experiment", regardless of DB state.
 * AFTER FIX: the nav consumes the shared event source; with no upcoming event it relabels
 *   to "Try a Clarity Letter" → /letter/ck (mirroring the hero and the /coach branch).
 */
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Anonymous (logged-out) user — the public CTA surface.
const mockUseAuth = vi.fn();
vi.mock('@/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Nav unread-count fetch is irrelevant here — stub it (mirrors navigation-acceptance-full).
vi.mock('@/app/hooks/useUnreadLetterCount', () => ({
  useUnreadLetterCount: () => ({ count: 0, loading: false }),
}));

// Analytics — no-op.
vi.mock('@/lib/mixpanel', () => ({
  analytics: { track: vi.fn() },
}));

// The crux: events DB has NO upcoming event (current prod state). The fix wires the nav
// to this same service the hero already reads.
vi.mock('@/app/data/events-service', () => ({
  eventsService: {
    getUpcomingEvents: vi.fn().mockResolvedValue([]),
  },
}));

import { SimpleNavigation } from '@/app/components/layout/simple-navigation';
import { __resetNextWebinarCacheForTest } from '@/app/hooks/useNextWebinar';

describe('p969: header nav CTA is event-aware (no-event fallback)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetNextWebinarCacheForTest();
    mockUseAuth.mockReturnValue({
      session: null,
      user: null,
      isLoading: false,
      sessionChecked: true,
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    });
    // jsdom path defaults to "/" — the public landing where the bug shows.
    window.history.pushState({}, '', '/');
  });

  it('with no upcoming event, header CTA reads "Try a Clarity Letter" → /letter/ck', async () => {
    render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);

    await waitFor(() => {
      const cta = screen.getByRole('link', { name: /try a clarity letter/i });
      expect(cta).toHaveAttribute('href', '/letter/ck');
    });
  });

  it('with no upcoming event, header does NOT promise "Join the next Clarity Experiment"', async () => {
    render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);

    await waitFor(() => {
      expect(
        screen.queryByRole('link', { name: /join the next clarity experiment/i })
      ).not.toBeInTheDocument();
    });
  });
});
