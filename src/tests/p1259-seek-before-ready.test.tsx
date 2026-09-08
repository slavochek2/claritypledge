/**
 * @file p1259-seek-before-ready.test.tsx
 * @description P1259 change 1 — a timecode clicked before the player is ready is HONOURED.
 *
 * From the spec's UX Notes, which is unusually specific because the failure is unusually
 * quiet: "Timecode clicked BEFORE the lazy mount completes: the click must be honoured, not
 * dropped — queue the requested seconds and seek once the player is ready. A click that
 * silently does nothing, or that plays from 0, reproduces change 6's defect on a different
 * control. A second click while pending replaces the queued value rather than queuing twice."
 *
 * WHY THIS ONLY BECAME REACHABLE NOW. `StoryVideoPlayer.seekTo` has always returned early
 * when the YouTube player did not exist yet, and said nothing. On the story detail page that
 * gap was invisible: the player mounts with the page, so a reader could not physically reach
 * a timecode before it was ready. P1259 mounts players on the feed, the profile and the point
 * card — surfaces a reader scrolls past — and the very first click after a card scrolls into
 * view lands inside that window.
 *
 * TWO GAPS, TWO OWNERS. They are tested separately here because they fail separately:
 *   1. mounted, embed not ready  → StoryVideoPlayer's own pending-seek ref, flushed onReady.
 *      Only the player knows what "ready" means.
 *   2. not mounted at all        → useLazyStoryPlayer forces the mount and dispatches once
 *      the ref populates. Only the hook knows the card is still a thumbnail.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { createRef, useRef } from 'react';
import { StoryVideoPlayer, type StoryVideoPlayerHandle } from '@/app/components/shared/story-video-player';
import { StoryMedia } from '@/app/components/shared/story-media';
import { StoryVideoQuotes } from '@/app/components/shared/story-video-quotes';
import { useLazyStoryPlayer } from '@/app/hooks/use-lazy-story-player';
import { __resetYouTubeApiLoader } from '@/lib/video';

const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const QUOTES = [
  { text: 'the first thing said', seconds: 42 },
  { text: 'the second thing said', seconds: 605 },
];

/** Installs a fake YT.Player and hands back its spies plus the onReady it captured. */
function installYouTube() {
  const seekTo = vi.fn();
  const playVideo = vi.fn();
  const ready: { fire?: () => void } = {};
  (window as unknown as { YT: unknown }).YT = {
    Player: class {
      seekTo = seekTo;
      playVideo = playVideo;
      destroy = vi.fn();
      constructor(_el: Element, opts: { events: { onReady: () => void } }) {
        ready.fire = opts.events.onReady;
      }
    },
  };
  return { seekTo, playVideo, ready };
}

beforeEach(() => {
  __resetYouTubeApiLoader();
  delete (window as unknown as { YT?: unknown }).YT;
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('P1259 — gap 1: mounted, but the embed is not ready yet', () => {
  it('holds the seek and applies it when the player becomes ready', async () => {
    const { seekTo, playVideo, ready } = installYouTube();
    const ref = createRef<StoryVideoPlayerHandle>();
    render(<StoryVideoPlayer ref={ref} videoUrl={VIDEO} />);
    await waitFor(() => expect(ready.fire).toBeTypeOf('function'));

    // The click lands BEFORE onReady — the whole point.
    act(() => ref.current?.seekTo(605));
    expect(seekTo, 'nothing can be sent to a player that does not exist yet').not.toHaveBeenCalled();

    act(() => ready.fire?.());

    expect(
      seekTo,
      'the click was honoured late, not dropped — a silently dead timecode is the defect this closes',
    ).toHaveBeenCalledWith(605, true);
    expect(playVideo).toHaveBeenCalled();
  });

  /**
   * "A second click while pending replaces the queued value rather than queuing twice."
   * Two queued seeks would play the first and jump to the second a moment later, which reads
   * as the player ignoring the reader entirely.
   */
  it('a second click while pending replaces the first', async () => {
    const { seekTo, ready } = installYouTube();
    const ref = createRef<StoryVideoPlayerHandle>();
    render(<StoryVideoPlayer ref={ref} videoUrl={VIDEO} />);
    await waitFor(() => expect(ready.fire).toBeTypeOf('function'));

    act(() => ref.current?.seekTo(42));
    act(() => ref.current?.seekTo(605));
    act(() => ready.fire?.());

    expect(seekTo).toHaveBeenCalledTimes(1);
    expect(seekTo).toHaveBeenCalledWith(605, true);
  });

  it('does not re-fire a flushed seek if the player readies again', async () => {
    const { seekTo, ready } = installYouTube();
    const ref = createRef<StoryVideoPlayerHandle>();
    render(<StoryVideoPlayer ref={ref} videoUrl={VIDEO} />);
    await waitFor(() => expect(ready.fire).toBeTypeOf('function'));

    act(() => ref.current?.seekTo(42));
    act(() => ready.fire?.());
    act(() => ready.fire?.());

    expect(seekTo, 'the pending value is cleared before dispatch, so it cannot fire twice').toHaveBeenCalledTimes(1);
  });

  it('never seeks to a negative or fractional second', async () => {
    const { seekTo, ready } = installYouTube();
    const ref = createRef<StoryVideoPlayerHandle>();
    render(<StoryVideoPlayer ref={ref} videoUrl={VIDEO} />);
    await waitFor(() => expect(ready.fire).toBeTypeOf('function'));

    act(() => ref.current?.seekTo(-5));
    act(() => ready.fire?.());
    expect(seekTo).toHaveBeenCalledWith(0, true);
  });
});

/**
 * Gap 2. The card is still a thumbnail because it has not scrolled into view, so there is no
 * player ref at all. `IntersectionObserver` is stubbed in `src/tests/setup.tsx` as a mock
 * that never fires, which is exactly the state we need: the hook can only leave `thumbnail`
 * if the click itself forces the mount.
 */
function LazyHarness() {
  const player = useLazyStoryPlayer(true);
  const modeSeen = useRef<string[]>([]);
  modeSeen.current.push(player.mode);
  return (
    <>
      <div ref={player.containerRef}>
        <StoryMedia ref={player.playerRef} videoUrl={VIDEO} mode={player.mode} onBlockedChange={player.onBlockedChange} />
      </div>
      <span data-testid="mode">{player.mode}</span>
      <StoryVideoQuotes
        videoUrl={VIDEO}
        quotes={QUOTES}
        subjectName="Yann LeCun"
        onSeek={player.onSeek}
        playerBlocked={player.playerBlocked}
      />
    </>
  );
}

describe('P1259 — gap 2: the card is still a thumbnail', () => {
  it('starts as a thumbnail so a scrolling feed does not mount every embed', () => {
    installYouTube();
    render(<LazyHarness />);
    expect(screen.getByTestId('mode').textContent).toBe('thumbnail');
    expect(screen.queryByTestId('story-video-player')).toBeNull();
  });

  it('clicking a timecode forces the mount and seeks to that second', async () => {
    const { seekTo, ready } = installYouTube();
    render(<LazyHarness />);

    const timecodes = screen.getAllByTestId('story-video-quote-timecode');
    const second = timecodes[1];
    expect(second, 'the fixture renders two timecodes').toBeTruthy();
    expect(second!.getAttribute('data-seconds')).toBe('605');

    fireEvent.click(second!);

    // The mount is forced by the click, not by scrolling.
    await waitFor(() => expect(screen.getByTestId('mode').textContent).toBe('player'));
    await waitFor(() => expect(ready.fire).toBeTypeOf('function'));
    act(() => ready.fire?.());

    expect(
      seekTo,
      'a timecode clicked before the lazy mount must still reach the player — not be dropped, and not play from 0',
    ).toHaveBeenCalledWith(605, true);
  });

  it('brings the player into view rather than seeking somewhere the reader cannot see', async () => {
    const { ready } = installYouTube();
    render(<LazyHarness />);
    fireEvent.click(screen.getAllByTestId('story-video-quote-timecode')[0]!);
    await waitFor(() => expect(ready.fire).toBeTypeOf('function'));
    act(() => ready.fire?.());

    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    // 'instant', not 'smooth' — measured in Chrome 2026-08-24: with the player 677px above
    // the viewport, 'smooth' left scrollY unchanged while 'instant' scrolled correctly.
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'instant' })
    );
  });
});
