/**
 * @file p915-coach-reframe.test.tsx
 * @description P915: coach landing reframe. Asserts the new hero safety-hook arc, the
 * relocated which-gap caption, the concrete unsent-message illustration, and the removal
 * of the "Meet the Pledgers" SignatureWall. (Venn labels were intentionally kept — no
 * relabel — so there is no venn-label assertion here.) Copy = spec UI Contract.
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
    expect(screen.getByText('Being honest when you disagree is risky.')).toBeInTheDocument();
    expect(screen.getByText('Make the hard truth safe to say.')).toBeInTheDocument();
  });

  it('relocates the which-gap lines as a caption (out of the cold hero)', () => {
    renderPage();
    expect(screen.getByText('They believe they disagree.')).toBeInTheDocument();
    expect(screen.getByText('But they misunderstood you.')).toBeInTheDocument();
  });

  it('renders the concrete unsent-message illustration', () => {
    renderPage();
    expect(screen.getByText(/Honestly, I think you're scaling too fast/)).toBeInTheDocument();
    expect(screen.getByText('I\'m going to pause our sessions.')).toBeInTheDocument();
    expect(screen.getByText('Understood.')).toBeInTheDocument();
    expect(screen.getByText('A client who needed you most, gone.')).toBeInTheDocument();
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
