/**
 * @file p915-coach-reframe.test.tsx
 * @description P915: coach landing reframe. Asserts the new hero safety-hook arc, the
 * WhatsApp-style unsent-message illustration (refund scenario), and the removal of the
 * "Meet the Pledgers" SignatureWall. (Venn labels were intentionally kept — no relabel;
 * the relocated which-gap caption was dropped as misplaced.) Copy = spec UI Contract.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { CoachPartnershipPage } from '@/app/pages/coach-partnership-page';
import { AuthProvider } from '@/auth';

// Defensive: prevent any real network call from the render tree (async callbacks that
// fire after JSDOM teardown throw "window is not defined"). analytics.track is already
// prod-gated, so no mixpanel mock is needed.
vi.mock('@/app/data/api', () => ({
  getFeaturedProfiles: vi.fn().mockResolvedValue([]),
  getVerifiedProfileCount: vi.fn().mockResolvedValue(0),
}));

function renderPage() {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <CoachPartnershipPage />
      </AuthProvider>
    </BrowserRouter>
  );
}

describe('P915: coach landing reframe', () => {
  it('hero shows the safety-hook arc (lines 2 + 3)', () => {
    renderPage();
    // Text is present in the DOM even while the reveal spans start at opacity-0.
    expect(screen.getByText('Honesty is risky when the stakes are high.')).toBeInTheDocument();
    expect(screen.getByText('Make the hard truth safe to say.')).toBeInTheDocument();
  });

  it('renders the unsent-message illustration as a chat (refund scenario)', () => {
    renderPage();
    expect(screen.getByText('Your Customer')).toBeInTheDocument();
    expect(screen.getByText(/I want a refund/)).toBeInTheDocument();
    expect(screen.getByText(/Honestly, I think 1-on-1 would fix this/)).toBeInTheDocument();
    expect(screen.getByText(/dodging the refund/)).toBeInTheDocument();
    expect(screen.getByText(/Of course\. I'll process your refund today/)).toBeInTheDocument();
    expect(screen.getByText(/Customer lost/)).toBeInTheDocument();
    expect(screen.getByText('Unsent')).toBeInTheDocument();
  });

  it('no longer renders the "Meet the Pledgers" SignatureWall', () => {
    renderPage();
    expect(screen.queryByText(/Meet the Pledgers/i)).not.toBeInTheDocument();
  });

  it('keeps the "Take the Pledge" CTA (hero + final)', () => {
    renderPage();
    expect(screen.getAllByText('Take the Pledge').length).toBeGreaterThanOrEqual(2);
  });
});
