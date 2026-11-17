import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FounderCredibility, FOUNDER_FULL_TALK_URL } from '@/app/components/landing/founder-credibility';

// Spy on the analytics wrapper — the play event must fire on first play (P1005 AC).
const trackMock = vi.fn();
vi.mock('@/lib/mixpanel', () => ({
  analytics: { track: (...args: unknown[]) => trackMock(...args) },
}));

describe('FounderCredibility', () => {
  beforeEach(() => trackMock.mockClear());

  it('renders the credibility copy (ClarityPledge bullet removed)', () => {
    render(<FounderCredibility />);
    expect(screen.getByText('Built by someone who paid for the lesson')).toBeInTheDocument();
    expect(
      screen.getByText(/Published a 60-page research paper on trust-building/)
    ).toBeInTheDocument();
    // The "Built ClarityPledge" bullet was removed (P1005 change request).
    expect(screen.queryByText(/Built ClarityPledge/)).toBeNull();
  });

  it('renders the YouTube full-talk link', () => {
    render(<FounderCredibility />);
    const link = screen.getByRole('link', { name: 'Watch my talk on YouTube' });
    expect(link).toHaveAttribute('href', FOUNDER_FULL_TALK_URL);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('shows the founder photo from the media bucket, square, and no video or play button (P1704)', () => {
    render(<FounderCredibility />);
    const img = screen.getByRole('img', { name: 'Vyacheslav Ladischenski, founder of Clarity Pledge' });
    expect(img).toHaveAttribute(
      'src',
      'https://storage.googleapis.com/claritypledge-story-images/founder/founder-photo-640-v1.jpg'
    );
    expect(img).toHaveAttribute('width', '640');
    expect(img).toHaveAttribute('height', '640');
    expect(img.className).toContain('aspect-square');
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.querySelector('video')).toBeNull();
    expect(trackMock).not.toHaveBeenCalledWith('founder_clip_play', expect.anything());
  });
});
