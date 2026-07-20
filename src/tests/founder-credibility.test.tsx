import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    const link = screen.getByRole('link', { name: /Watch the full talk on YouTube/ });
    expect(link).toHaveAttribute('href', FOUNDER_FULL_TALK_URL);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders a click-to-play facade (no autoplay video on render)', () => {
    render(<FounderCredibility />);
    expect(
      screen.getByRole('button', { name: /play the founder talk clip/i })
    ).toBeInTheDocument();
    // No <video> element mounted until clicked (facade).
    expect(document.querySelector('video')).toBeNull();
  });

  it('mounts the video and fires a single Mixpanel play event on first play', async () => {
    const user = userEvent.setup();
    render(<FounderCredibility />);
    await user.click(screen.getByRole('button', { name: /play the founder talk clip/i }));

    const video = document.querySelector('video');
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute(
      'src',
      'https://storage.googleapis.com/claritypledge-story-images/founder/founder-credibility-clip-v1.mp4'
    );

    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith('founder_clip_play', {
      location: 'founder_credibility',
    });
  });
});
