import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FounderCredibility, FOUNDER_FULL_TALK_URL } from '@/app/components/landing/founder-credibility';

// Spy on the analytics wrapper — the play event must fire on first play (P1005 AC).
const trackMock = vi.fn();
vi.mock('@/lib/mixpanel', () => ({
  analytics: { track: (...args: unknown[]) => trackMock(...args) },
}));

const VIDEO = {
  src: '/founder-credibility-clip-v1.mp4',
  poster: '/founder-credibility-poster-v1.jpg',
  captions: '/founder-credibility-clip-v1.en.vtt',
};

describe('FounderCredibility', () => {
  beforeEach(() => trackMock.mockClear());

  it('renders the credibility copy (ClarityPledge bullet removed) in text-only mode', () => {
    render(<FounderCredibility />);
    expect(screen.getByText('Built by someone who paid for the lesson')).toBeInTheDocument();
    expect(
      screen.getByText(/Published a 60-page research paper on trust-building/)
    ).toBeInTheDocument();
    // The "Built ClarityPledge" bullet was removed.
    expect(screen.queryByText(/Built ClarityPledge/)).toBeNull();
    // No talk clip / play affordance in text-only mode.
    expect(screen.queryByRole('button', { name: /play the founder talk clip/i })).toBeNull();
  });

  it('renders the YouTube full-talk link in BOTH modes (same component everywhere)', () => {
    const { unmount } = render(<FounderCredibility />);
    let link = screen.getByRole('link', { name: /Watch the full talk on YouTube/ });
    expect(link).toHaveAttribute('href', FOUNDER_FULL_TALK_URL);
    expect(link).toHaveAttribute('target', '_blank');
    unmount();

    render(<FounderCredibility video={VIDEO} />);
    link = screen.getByRole('link', { name: /Watch the full talk on YouTube/ });
    expect(link).toHaveAttribute('href', FOUNDER_FULL_TALK_URL);
  });

  it('renders a click-to-play facade (no autoplay video) in video mode', () => {
    render(<FounderCredibility video={VIDEO} />);
    expect(
      screen.getByRole('button', { name: /play the founder talk clip/i })
    ).toBeInTheDocument();
    // No <video> element mounted until clicked (facade).
    expect(document.querySelector('video')).toBeNull();
  });

  it('mounts the video and fires a single Mixpanel play event on first play', async () => {
    const user = userEvent.setup();
    render(<FounderCredibility video={VIDEO} />);
    await user.click(screen.getByRole('button', { name: /play the founder talk clip/i }));

    const video = document.querySelector('video');
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute('src', VIDEO.src);

    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith('founder_clip_play', {
      location: 'founder_credibility',
    });
  });
});
