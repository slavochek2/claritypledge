import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FounderCredibility } from '@/app/components/landing/founder-credibility';

// Spy on the analytics wrapper — the play event must fire on first play (P1005 AC).
const trackMock = vi.fn();
vi.mock('@/lib/mixpanel', () => ({
  analytics: { track: (...args: unknown[]) => trackMock(...args) },
}));

const VIDEO = {
  src: '/founder-credibility-clip-v1.mp4',
  poster: '/founder-credibility-poster-v1.jpg',
  fullTalkUrl: 'https://www.youtube.com/watch?v=goFs8tuw1qc',
};

describe('FounderCredibility', () => {
  beforeEach(() => trackMock.mockClear());

  it('renders the credibility copy and cred points in text-only mode', () => {
    render(<FounderCredibility />);
    expect(screen.getByText('Built by someone who paid for the lesson')).toBeInTheDocument();
    expect(
      screen.getByText(/Published a 60-page research paper on trust-building/)
    ).toBeInTheDocument();
    // No talk clip / play affordance in text-only mode.
    expect(screen.queryByRole('button', { name: /play the founder talk clip/i })).toBeNull();
    expect(screen.queryByText(/See full presentation/)).toBeNull();
  });

  it('renders a click-to-play facade (no autoplay video) in video mode', () => {
    render(<FounderCredibility video={VIDEO} />);
    // Poster + play button, but no <video> element mounted until clicked (facade).
    expect(
      screen.getByRole('button', { name: /play the founder talk clip/i })
    ).toBeInTheDocument();
    expect(document.querySelector('video')).toBeNull();
    // Always-visible full-talk link-out.
    const link = screen.getByRole('link', { name: /See full presentation/ });
    expect(link).toHaveAttribute('href', VIDEO.fullTalkUrl);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('mounts the video and fires a single Mixpanel play event on first play', async () => {
    const user = userEvent.setup();
    render(<FounderCredibility video={VIDEO} />);
    await user.click(screen.getByRole('button', { name: /play the founder talk clip/i }));

    // Video element now mounted with the clip src.
    const video = document.querySelector('video');
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute('src', VIDEO.src);

    // Exactly one play event fired.
    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith('founder_clip_play', {
      location: 'founder_credibility',
    });
  });
});
