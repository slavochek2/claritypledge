/**
 * @file p1336-video-facade.test.tsx
 * @description The click-to-play facade (founder, 2026-09-28) and the two player
 * lifecycle defects a hostile review found in it the same day.
 *
 * WHY THE FACADE EXISTS. A resting YouTube embed carries YouTube's own chrome: the
 * video title, the channel, a copy-link button and a "Watch on YouTube" pill. None of
 * it can be removed by player parameters, and all of it leads a reader off the site at
 * the moment they are meant to be reading a story. So the embed is not mounted until
 * the reader asks for playback.
 *
 * WHY THE LIFECYCLE TESTS SIT HERE TOO. Both defects predate the facade but were
 * reachable only through it, because the facade is the first state the player can leave
 * and return to.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { StoryVideoPlayer } from '@/app/components/shared/story-video-player';
import { VideoThumbnailCard } from '@/app/components/shared/video-thumbnail-card';
import { __resetYouTubeApiLoader } from '@/lib/video';

const VIDEO_A = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const VIDEO_B = 'https://www.youtube.com/watch?v=k4zpMYIKK5A';

function installYouTube() {
  const built: string[] = [];
  const ready: { fire?: () => void } = {};
  const destroy = vi.fn();
  (window as unknown as { YT: unknown }).YT = {
    Player: class {
      seekTo = vi.fn();
      playVideo = vi.fn();
      destroy = destroy;
      constructor(_el: Element, opts: { videoId: string; events: { onReady: () => void } }) {
        built.push(opts.videoId);
        ready.fire = opts.events.onReady;
      }
    },
  };
  return { built, ready, destroy };
}

beforeEach(() => {
  __resetYouTubeApiLoader();
  delete (window as unknown as { YT?: unknown }).YT;
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the embed is not built until the reader presses play', () => {
  it('builds no YT.Player while the facade is showing', async () => {
    const { built } = installYouTube();
    render(<StoryVideoPlayer videoUrl={VIDEO_A} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('story-video-facade')).toBeTruthy();
    expect(built, 'nothing is constructed before the click').toEqual([]);
  });

  it('builds it on the click, and only then', async () => {
    const { built } = installYouTube();
    render(<StoryVideoPlayer videoUrl={VIDEO_A} />);
    fireEvent.click(screen.getByTestId('story-video-facade'));
    await waitFor(() => expect(built).toEqual(['dQw4w9WgXcQ']));
  });
});

describe('a blocked player is terminal for that instance', () => {
  it('a late onReady does not resurrect a player attached to a removed container', async () => {
    const { ready, destroy } = installYouTube();
    render(<StoryVideoPlayer videoUrl={VIDEO_A} />);
    fireEvent.click(screen.getByTestId('story-video-facade'));
    await waitFor(() => expect(ready.fire).toBeTypeOf('function'));

    await act(async () => { vi.advanceTimersByTime(31_000); });
    expect(screen.getByTestId('story-video-blocked')).toBeTruthy();
    expect(destroy, 'the stranded instance is torn down, not left attached').toHaveBeenCalled();

    // The embed answers after the backstop fired. It must not take the fallback away:
    // the container it was given no longer exists, so the reader would get a black frame.
    act(() => ready.fire?.());
    expect(screen.getByTestId('story-video-blocked')).toBeTruthy();
    expect(screen.queryByTestId('story-video-player')).toBeNull();
  });
});

describe('a new video id resets the player', () => {
  it('clears a previous blocked state instead of showing the old fallback forever', async () => {
    const { built } = installYouTube();
    const { rerender } = render(<StoryVideoPlayer videoUrl={VIDEO_A} />);
    fireEvent.click(screen.getByTestId('story-video-facade'));
    await act(async () => { vi.advanceTimersByTime(31_000); });
    expect(screen.getByTestId('story-video-blocked')).toBeTruthy();

    rerender(<StoryVideoPlayer videoUrl={VIDEO_B} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('story-video-facade'), 'the new video starts from its poster').toBeTruthy();
    expect(screen.queryByTestId('story-video-blocked')).toBeNull();

    fireEvent.click(screen.getByTestId('story-video-facade'));
    await waitFor(() => expect(built).toContain('k4zpMYIKK5A'));
  });

  it('does not autoplay the new video just because the old one was playing', async () => {
    installYouTube();
    const { rerender } = render(<StoryVideoPlayer videoUrl={VIDEO_A} />);
    fireEvent.click(screen.getByTestId('story-video-facade'));
    await waitFor(() => expect(screen.getByTestId('story-video-player')).toBeTruthy());

    rerender(<StoryVideoPlayer videoUrl={VIDEO_B} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('story-video-facade')).toBeTruthy();
  });
});

describe('a still on a card plays in place rather than navigating', () => {
  it('renders a play button, not a link, when the surface can host the player', () => {
    const onActivate = vi.fn();
    render(<VideoThumbnailCard videoUrl={VIDEO_A} href="/story/abc" onActivate={onActivate} />);
    expect(screen.queryByTestId('video-thumbnail-link'), 'no navigation away from the page').toBeNull();
    fireEvent.click(screen.getByTestId('video-thumbnail-play'));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('keeps the link into the story where no player can run', () => {
    render(<VideoThumbnailCard videoUrl={VIDEO_A} href="/story/abc" />);
    expect(screen.getByTestId('video-thumbnail-link').getAttribute('href')).toBe('/story/abc');
  });
});

describe('an unparseable video is treated as no video, everywhere', () => {
  it('renders nothing rather than a facade for a URL with no video id', async () => {
    installYouTube();
    const { container } = render(<StoryVideoPlayer videoUrl="https://www.youtube.com/watch?v=" />);
    await act(async () => { await Promise.resolve(); });
    expect(container.querySelector('[data-testid="story-video-facade"]')).toBeNull();
    expect(container.querySelector('[data-testid="story-video-player"]')).toBeNull();
  });
});

describe('a player that errors is torn down, not left attached', () => {
  it('destroys the instance when YouTube reports an error', async () => {
    const { destroy } = installYouTube();
    // The fake player reports the error itself, the way an unavailable video does.
    (window as unknown as { YT: { Player: unknown } }).YT = {
      Player: class {
        seekTo = vi.fn();
        playVideo = vi.fn();
        destroy = destroy;
        constructor(_el: Element, opts: { events: { onError: () => void } }) {
          setTimeout(() => opts.events.onError(), 0);
        }
      },
    };
    render(<StoryVideoPlayer videoUrl={VIDEO_A} />);
    fireEvent.click(screen.getByTestId('story-video-facade'));
    await waitFor(() => expect(screen.getByTestId('story-video-blocked')).toBeTruthy());
    expect(destroy).toHaveBeenCalled();
  });
});
