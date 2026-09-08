import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoryVideoPlayerHandle } from '@/app/components/shared/story-video-player';

/**
 * P1259 change 1 — mount a real player on the surfaces that today render a still, without
 * making a scrolling feed download a video per card.
 *
 * THE LEAK THIS CLOSES. The timecode is the mechanism that says *don't trust the machine,
 * watch the person say it*. It seeks a player on exactly one surface out of six; everywhere
 * else it throws the reader to YouTube in a new tab, which is the moment they leave. The
 * spec's change 1 extends the `mode="player"` + `onSeek` pair StoryCardDetail already has
 * to the feed story card, the feed point card, the profile and the point card.
 *
 * WHY A HOOK AND NOT FOUR COPIES. Each of those surfaces renders the media and the quotes
 * at DIFFERENT positions in its own layout (media above the prose, quotes below it), so a
 * single component wrapping both does not fit any of them. What is identical across all
 * four is the state machine, and it has three parts that are each easy to get wrong:
 *
 * 1. LAZY MOUNT (spec, Risks: "Live players on a scrolling feed cost bandwidth and
 *    main-thread work → MITIGATE: lazy-mount on scroll into view; keep the thumbnail until
 *    then"). An IntersectionObserver on the media box, with a `rootMargin` so the swap
 *    happens just before the card is read rather than under the reader's eyes.
 *
 * 2. THE PRE-MOUNT CLICK. A timecode clicked before the player exists must be honoured, not
 *    dropped (spec, UX Notes). There are TWO gaps and they need different fixes:
 *      - not mounted at all  → handled HERE: force the mount, hold the seconds, dispatch
 *        once the ref populates.
 *      - mounted, embed not ready yet → handled INSIDE StoryVideoPlayer, which is the only
 *        place that knows what "ready" means.
 *    A single ref, not a queue: a second click replaces the pending value.
 *
 * 3. THE SCROLL. StoryCardDetail's version calls
 *    `document.querySelector('[data-testid="story-video-player"]')` — a document-wide query
 *    that was correct on a page with one story and would find some OTHER card's player on a
 *    feed of twenty. The lookup here is scoped to this hook's own container.
 *
 * The blocked path needs no work: `StoryVideoQuotes` already turns every timecode back into
 * an open-at-timestamp link when `playerBlocked` is true.
 */
export interface LazyStoryPlayer {
  /** Put this on the element WRAPPING the media. It is the intersection target. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Forward to `StoryMedia`. */
  playerRef: React.RefObject<StoryVideoPlayerHandle | null>;
  /** `thumbnail` until the card is near the viewport, then `player`. */
  mode: 'player' | 'thumbnail';
  /** Forward to `StoryMedia`'s `onBlockedChange`. */
  onBlockedChange: (blocked: boolean) => void;
  /** Forward to `StoryVideoQuotes`. */
  playerBlocked: boolean;
  /** Forward to `StoryVideoQuotes`. Seeks in place, mounting the player if needed. */
  onSeek: (seconds: number) => void;
}

/**
 * How early to swap the thumbnail for the embed. Half a viewport ahead: far enough that a
 * reader scrolling at a normal pace meets a mounted player, close enough that a long feed
 * does not mount every card's embed at once.
 */
const MOUNT_MARGIN = '50% 0px';

export function useLazyStoryPlayer(enabled: boolean = true): LazyStoryPlayer {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<StoryVideoPlayerHandle | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [playerBlocked, setPlayerBlocked] = useState(false);

  useEffect(() => {
    if (!enabled || mounted) return;
    const el = containerRef.current;
    if (!el) return;

    // No IntersectionObserver (jsdom, an old browser): mount rather than strand the
    // reader with a still that never becomes a player. Failing toward the working
    // control is the right direction — the cost is bandwidth, the alternative is a
    // timecode that cannot seek.
    if (typeof IntersectionObserver === 'undefined') {
      setMounted(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setMounted(true);
          io.disconnect();
        }
      },
      { rootMargin: MOUNT_MARGIN }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, mounted]);

  /**
   * Bring the player into view as well as seeking it — a seek the reader cannot see reads
   * as a dead click. `behavior: 'instant'`, NOT 'smooth': measured in Chrome 2026-08-24
   * with the player 677px above the viewport, 'smooth' left scrollY unchanged while
   * 'instant' scrolled correctly (see the note in StoryCardDetail).
   */
  const scrollPlayerIntoView = useCallback(() => {
    containerRef.current
      ?.querySelector('[data-testid="story-video-player"], [data-testid="story-video-blocked"]')
      ?.scrollIntoView({ behavior: 'instant', block: 'center' });
  }, []);

  // The mount gap: a seek arrived while this card was still a thumbnail. `mounted` has now
  // flipped and the player ref is populated, so dispatch it. StoryVideoPlayer holds it
  // again internally if the embed itself is not ready yet. The scroll happens here too —
  // on the click itself there was no player element to scroll to.
  useEffect(() => {
    if (!mounted) return;
    const pending = pendingSeekRef.current;
    if (pending === null) return;
    pendingSeekRef.current = null;
    playerRef.current?.seekTo(pending);
    scrollPlayerIntoView();
  }, [mounted, scrollPlayerIntoView]);

  const onSeek = useCallback((seconds: number) => {
    if (!mounted) {
      // Replaces any previously pending value rather than queuing a second one. The
      // effect above dispatches and scrolls once the player is in the tree.
      pendingSeekRef.current = seconds;
      setMounted(true);
      return;
    }
    playerRef.current?.seekTo(seconds);
    scrollPlayerIntoView();
  }, [mounted, scrollPlayerIntoView]);

  const onBlockedChange = useCallback((blocked: boolean) => {
    setPlayerBlocked(blocked);
  }, []);

  return {
    containerRef,
    playerRef,
    mode: enabled && mounted ? 'player' : 'thumbnail',
    onBlockedChange,
    playerBlocked,
    onSeek,
  };
}

export default useLazyStoryPlayer;
