import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  getEmbedUrl,
  loadYouTubeApi,
  parseVideoUrl,
  YOUTUBE_PLAYER_ORIGIN,
} from '@/lib/video';
import { VideoThumbnailCard } from './video-thumbnail-card';

export interface StoryVideoPlayerHandle {
  /** Seeks in place — no reload — and starts playback. */
  seekTo: (seconds: number) => void;
  /** True once the player has swapped to the blocked-embed fallback. */
  isBlocked: () => boolean;
}

interface StoryVideoPlayerProps {
  videoUrl: string;
  durationSeconds?: number | null;
  onBlockedChange?: (blocked: boolean) => void;
  className?: string;
}

/**
 * P1141 — the live player, mounted only on a story's dedicated detail surface.
 *
 * Designed fresh, deliberately not copied. Every existing iframe in this repo
 * (intro-page, chiang-mai-page, letter-live-overlay, ShareDialog) sets only
 * src/size/title — none sets `sandbox`, `allow` or `referrerpolicy`, so there
 * is no secure pattern here to inherit. ShareDialog's message listener checks
 * `contentWindow === e.source` but NOT `e.origin`; adequate for a resize hint,
 * not for a seek-command channel.
 *
 * The blocked case is the point of the whole component. A cross-origin embed
 * that an ad blocker or a corporate policy stops fires no load event at all
 * (P1023) — so silence has to be treated as a signal. Story content NEVER waits
 * on that: the argument and the quotes render immediately regardless of player
 * state, and the blocked player degrades to the same thumbnail card every other
 * surface already uses.
 */
export const StoryVideoPlayer = forwardRef<StoryVideoPlayerHandle, StoryVideoPlayerProps>(
  function StoryVideoPlayer({ videoUrl, durationSeconds, onBlockedChange, className = '' }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<{ seekTo?: (s: number, allowSeekAhead: boolean) => void; playVideo?: () => void; destroy?: () => void } | null>(null);
    const [blocked, setBlocked] = useState(false);
    const [ready, setReady] = useState(false);

    const video = parseVideoUrl(videoUrl);
    const embedUrl = getEmbedUrl(videoUrl);

    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number) => {
        const player = playerRef.current;
        if (!player?.seekTo) return;
        player.seekTo(Math.max(0, Math.floor(seconds)), true);
        player.playVideo?.();
      },
      isBlocked: () => blocked,
    }), [blocked]);

    useEffect(() => {
      onBlockedChange?.(blocked);
    }, [blocked, onBlockedChange]);

    useEffect(() => {
      if (!video || !containerRef.current) return;

      let cancelled = false;
      const timeout = window.setTimeout(() => {
        if (!cancelled) setBlocked(true);
      }, blockedThresholdMs());

      loadYouTubeApi()
        .then(() => {
          if (cancelled || !containerRef.current) return;
          const YT = (window as unknown as { YT: { Player: new (el: Element, opts: unknown) => typeof playerRef.current } }).YT;
          playerRef.current = new YT.Player(containerRef.current, {
            videoId: video.videoId,
            host: YOUTUBE_PLAYER_ORIGIN,
            playerVars: { rel: 0, modestbranding: 1, origin: window.location.origin },
            events: {
              onReady: () => {
                if (cancelled) return;
                window.clearTimeout(timeout);
                setReady(true);
                setBlocked(false);
              },
              onError: () => {
                if (!cancelled) setBlocked(true);
              },
            },
          });
        })
        .catch(() => {
          if (!cancelled) setBlocked(true);
        });

      return () => {
        cancelled = true;
        window.clearTimeout(timeout);
        playerRef.current?.destroy?.();
        playerRef.current = null;
      };
      // videoUrl is the only input that should re-create the player.
    }, [video?.videoId]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!video || !embedUrl) return null;

    if (blocked) {
      return (
        <div data-testid="story-video-blocked" className={className}>
          <VideoThumbnailCard
            videoUrl={videoUrl}
            sourceHref={videoUrl}
            durationSeconds={durationSeconds}
            alt="Video thumbnail — the player could not load, opens the source"
          />
        </div>
      );
    }

    return (
      <div
        className={`relative overflow-hidden rounded-lg bg-black aspect-video ${className}`}
        data-testid="story-video-player"
        data-player-ready={ready ? 'true' : 'false'}
      >
        <div ref={containerRef} className="h-full w-full" />
      </div>
    );
  }
);

/**
 * How long silence from the player means "blocked" rather than "still loading".
 *
 * NOT a fixed constant, deliberately. `docs/decisions.md` 2026-07-31 decision
 * (3) is titled "A timing constant tuned on one connection is a latent bug" and
 * records a 2200ms constant that worked on a fast link and would have missed by
 * ~7s on slow 3G. Its prescribed fix derives the value from
 * `embedFetchDuration` — which a BLOCKED embed never produces, that being the
 * whole point of P1023. So the formula cannot be lifted as-is.
 *
 * Derived instead from a signal that exists BEFORE any load event: the
 * connection's own round-trip estimate, falling back to the page's measured
 * time-to-first-render. Clamped to the same [floor, ceiling] shape. The floor
 * sits above the ~7.6s a measured-successful cross-origin embed took, and the
 * bias is deliberately toward waiting: a false "blocked" notice on a working
 * player is worse than a few extra seconds, because the fallback it triggers
 * sends the reader off-site.
 */
function blockedThresholdMs(): number {
  const FLOOR = 10_000;
  const CEILING = 30_000;
  const connection = (navigator as unknown as { connection?: { rtt?: number; downlink?: number } }).connection;

  let estimate = FLOOR;
  if (typeof connection?.rtt === 'number' && connection.rtt > 0) {
    // An embed is several sequential round trips (script, player doc, media).
    estimate = connection.rtt * 20;
  } else if (typeof performance !== 'undefined') {
    const nav = performance.getEntriesByType?.('navigation')?.[0] as { responseEnd?: number } | undefined;
    if (nav?.responseEnd && nav.responseEnd > 0) estimate = nav.responseEnd * 8;
  }

  return Math.min(CEILING, Math.max(FLOOR, estimate));
}

export default StoryVideoPlayer;
