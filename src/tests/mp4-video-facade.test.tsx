/**
 * Mp4VideoFacade — the click-to-play mp4 player shared by founder-credibility (landing look,
 * covered by founder-credibility.test.tsx) and the P1336 onboarding clips (story look).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Mp4VideoFacade } from '@/app/components/shared/mp4-video-facade';

const BASE = {
  src: '/clips/example.mp4',
  poster: '/clips/example-poster.jpg',
  posterAlt: 'Example poster',
  playLabel: 'Play the example video',
};

describe('Mp4VideoFacade', () => {
  it('shows only the poster until played: no <video>, no pulse, no badge by default', () => {
    render(<Mp4VideoFacade {...BASE} />);
    expect(screen.getByRole('button', { name: 'Play the example video' })).toBeInTheDocument();
    expect(screen.getByAltText('Example poster')).toHaveAttribute('src', BASE.poster);
    expect(document.querySelector('video')).toBeNull();
    expect(screen.queryByTestId('play-pulse')).toBeNull();
    expect(screen.queryByTestId('video-duration-badge')).toBeNull();
  });

  it('story look: the story player\'s pulsing play button and an m:ss duration badge', () => {
    render(<Mp4VideoFacade {...BASE} look="story" pulse durationSeconds={139} />);
    expect(screen.getByTestId('play-pulse')).toHaveClass('animate-ping');
    expect(screen.getByTestId('video-duration-badge')).toHaveTextContent('2:19');
  });

  it('pulse also works in the landing look', () => {
    render(<Mp4VideoFacade {...BASE} pulse />);
    expect(screen.getByTestId('play-pulse')).toHaveClass('animate-ping');
  });

  it('mounts an inline, controllable <video> on click and calls onPlay once', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    render(<Mp4VideoFacade {...BASE} look="story" onPlay={onPlay} captions="/clips/example.vtt" />);
    await user.click(screen.getByRole('button', { name: 'Play the example video' }));

    const video = document.querySelector('video');
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute('src', BASE.src);
    expect(video).toHaveAttribute('controls');
    expect(video).toHaveAttribute('playsinline');
    expect(video?.querySelector('track')).toHaveAttribute('src', '/clips/example.vtt');
    expect(screen.queryByRole('button', { name: 'Play the example video' })).toBeNull();
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('renders no <track> when there are no captions', async () => {
    const user = userEvent.setup();
    render(<Mp4VideoFacade {...BASE} />);
    await user.click(screen.getByRole('button', { name: 'Play the example video' }));
    expect(document.querySelector('video track')).toBeNull();
  });
});
