import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  formatTimecode,
  getEmbedUrl,
  getPosterUrl,
  getThumbnailUrl,
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
  /** Poster for the click-to-play facade; falls back to the video's own thumbnail. */
  posterUrl?: string | null;
  /** P1336: show `durationSeconds` as a badge on the click-to-play poster. Default false. */
  showDurationOnPoster?: boolean;
  /** P1336: onboarding's play cue. Default undefined: the facade behaves as it always has. */
  playCue?: PlayCue;
  onBlockedChange?: (blocked: boolean) => void;
  className?: string;
}

/**
 * P1336 — lets a host (event onboarding) draw attention to the poster and drive it from its
 * own bar. Every field is optional; an absent cue changes nothing.
 */
export interface PlayCue {
  /** A pulsing ring behind the play button while the poster is showing. */
  pulse?: boolean;
  /** Bump to start playback from outside (e.g. a "Play video" button in the host's bar). */
  request?: number;
  /** Called once when playback is requested, from the poster or through `request`. */
  onPlay?: () => void;
}

/**
 * The click-to-play disc on the poster. Exported so a host that has no video yet (the
 * onboarding's welcome slot) shows the same button rather than a lookalike.
 * `pulse` (P1336, default false) adds Tailwind's animate-ping ring behind it.
 */
export function PosterPlayButton({ pulse = false }: { pulse?: boolean }) {
  return (
    <span className="relative flex h-16 w-16 items-center justify-center">
      {pulse && (
        <span
          className="absolute inset-0 rounded-full bg-black/50 animate-ping"
          aria-hidden="true"
          data-testid="play-pulse"
        />
      )}
      <span
        className={`relative flex h-16 w-16 items-center justify-center rounded-full bg-black/75 text-white ring-2 ring-white/80 shadow-lg shadow-black/40 transition group-hover:bg-black`}
      >
        <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7 fill-current" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
    </span>
  );
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
  function StoryVideoPlayer({ videoUrl, durationSeconds, posterUrl, showDurationOnPoster = false, playCue, onBlockedChange, className = '' }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<{ seekTo?: (s: number, allowSeekAhead: boolean) => void; playVideo?: () => void; destroy?: () => void } | null>(null);
    const readyRef = useRef(false);
    /**
     * P1259 — a seek requested before the embed is ready, held until it is.
     *
     * The old `seekTo` returned early when the YouTube player did not exist yet and said
     * nothing. On the story detail page that gap was invisible: the player mounts with the
     * page and a reader cannot reach a timecode before it is ready. P1259 mounts players on
     * the feed, the profile and the point card, where a reader CAN — the first click after
     * the card scrolls into view lands in exactly that window. A click that silently does
     * nothing reproduces change 6's dead-control defect on a different control (spec, UX
     * Notes: "the click must be honoured, not dropped").
     *
     * A single ref, never a queue: "a second click while pending replaces the queued value
     * rather than queuing twice" (same UX note). Two queued seeks would play the first,
     * then jump to the second a moment later, which is worse than either alone.
     */
    const pendingSeekRef = useRef<number | null>(null);
    const [blocked, setBlocked] = useState(false);
    const [ready, setReady] = useState(false);
    /**
     * Click-to-play facade (founder, 2026-09-28: the resting embed advertised
     * "Watch on YouTube" and a copy-link button, both of which lead readers off
     * the site). YouTube's chrome cannot be removed by player parameters, so the
     * embed is not mounted at all until the reader asks for playback. The poster is
     * the story's own image when it has one; otherwise it is YouTube's still, which
     * is one image request rather than the player's scripts, cookies and chrome.
     */
    const [activated, setActivated] = useState(false);

    /**
     * P1336 play cue: a bumped `request` starts playback exactly as a click on the poster does,
     * and `onPlay` hears about either. A ref holds the callback so a new function each render
     * does not re-fire it. Without a cue neither effect does anything.
     */
    const playRequest = playCue?.request ?? 0;
    useEffect(() => {
      if (playRequest > 0) setActivated(true);
    }, [playRequest]);
    const onPlayRef = useRef(playCue?.onPlay);
    useEffect(() => {
      onPlayRef.current = playCue?.onPlay;
    });
    useEffect(() => {
      if (activated) onPlayRef.current?.();
    }, [activated]);

    const video = parseVideoUrl(videoUrl);
    const embedUrl = getEmbedUrl(videoUrl);

    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number) => {
        const target = Math.max(0, Math.floor(seconds));
        const player = playerRef.current;
        if (!readyRef.current || !player?.seekTo) {
          // A timecode click is a request to play: hold the seek and mount the embed.
          pendingSeekRef.current = target;
          setActivated(true);
          return;
        }
        player.seekTo(target, true);
        player.playVideo?.();
      },
      isBlocked: () => blocked,
    }), [blocked]);

    useEffect(() => {
      onBlockedChange?.(blocked);
    }, [blocked, onBlockedChange]);

    /**
     * A new video in the same mounted component starts from scratch (Codex review,
     * 2026-09-28): without this, a story swapped in after the previous one was blocked
     * kept showing the previous fallback, and no player was ever built for the new id.
     * Activation resets too, so changing the story never autoplays a video nobody asked for.
     */
    const lastVideoIdRef = useRef<string | null>(video?.videoId ?? null);
    useEffect(() => {
      const id = video?.videoId ?? null;
      if (lastVideoIdRef.current === id) return;
      lastVideoIdRef.current = id;
      readyRef.current = false;
      pendingSeekRef.current = null;
      setActivated(false);
      setBlocked(false);
      setReady(false);
    }, [video?.videoId]);

    useEffect(() => {
      if (!video || !activated || !containerRef.current) return;

      let cancelled = false;
      /**
       * Blocked is TERMINAL for this player instance (Codex review, 2026-09-28). The
       * fallback replaces the container React gave to `YT.Player`, so a late `onReady`
       * that cleared `blocked` handed the reader a fresh, empty div while the only
       * player object stayed attached to a detached node: a permanently black frame.
       * A new instance is created only by a new video id, which resets the state below.
       */
      let terminated = false;
      const timeout = window.setTimeout(() => {
        if (cancelled) return;
        terminated = true;
        playerRef.current?.destroy?.();
        playerRef.current = null;
        readyRef.current = false;
        setBlocked(true);
      }, blockedThresholdMs());

      loadYouTubeApi()
        .then(() => {
          if (cancelled || !containerRef.current) return;
          const YT = (window as unknown as { YT: { Player: new (el: Element, opts: unknown) => typeof playerRef.current } }).YT;
          playerRef.current = new YT.Player(containerRef.current, {
            videoId: video.videoId,
            host: YOUTUBE_PLAYER_ORIGIN,
            playerVars: { rel: 0, modestbranding: 1, autoplay: 1, origin: window.location.origin },
            events: {
              onReady: () => {
                if (cancelled || terminated) return;
                window.clearTimeout(timeout);
                readyRef.current = true;
                setReady(true);
                setBlocked(false);
                // The embed mounts only on a click, so playback is what was asked for.
                playerRef.current?.playVideo?.();
                // Flush a seek requested while the embed was still loading. Cleared
                // before dispatch so a failure cannot leave it to fire again later.
                const pending = pendingSeekRef.current;
                if (pending !== null) {
                  pendingSeekRef.current = null;
                  playerRef.current?.seekTo?.(pending, true);
                  playerRef.current?.playVideo?.();
                }
              },
              onError: () => {
                if (cancelled) return;
                // Same teardown as the backstop timer: the fallback replaces the container,
                // so the instance attached to it must go with it rather than linger.
                terminated = true;
                window.clearTimeout(timeout);
                playerRef.current?.destroy?.();
                playerRef.current = null;
                readyRef.current = false;
                setBlocked(true);
              },
            },
          });
        })
        .catch(() => {
          if (cancelled) return;
          terminated = true;
          setBlocked(true);
        });

      return () => {
        cancelled = true;
        window.clearTimeout(timeout);
        readyRef.current = false;
        pendingSeekRef.current = null;
        playerRef.current?.destroy?.();
        playerRef.current = null;
      };
      // videoUrl is the only input that should re-create the player.
    }, [video?.videoId, activated]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!video || !embedUrl) return null;

    if (blocked) {
      return (
        <div data-testid="story-video-blocked" className={className}>
          <VideoThumbnailCard
            videoUrl={videoUrl}
            sourceHref={videoUrl}
            durationSeconds={durationSeconds}
            alt="Video thumbnail — the player is blocked here; opens the source"
            actionLabel="Watch on YouTube"
          />
          {/*
            Blind review, round 2 defect 7: the fallback was structurally
            identical to a working embed, so a reader pressed play expecting
            inline playback and was sent off-site with no warning.

            Round 3 defects 2-4: the FIRST fix over-corrected. It said "could
            not load" directly under a large play button and put the working
            control in a 12px grey inline link — so the biggest, most clickable
            thing in the frame was the one the caption had just called broken,
            and the only real escape hatch was styled as a footnote that wrapped
            mid-phrase. Hierarchy inverted.

            The card IS the control and always was: it links to the source. So
            say that on the card, and let the sentence below explain rather than
            compete. One action, and it is the prominent one.
          */}
          <p
            data-testid="story-video-blocked-notice"
            className="mt-2 text-xs text-gray-500 dark:text-gray-400"
          >
            The player is blocked here, probably by an extension or a network
            policy. The thumbnail above opens the video at its source.
          </p>
        </div>
      );
    }

    if (!activated) {
      const poster = posterUrl || getPosterUrl(videoUrl);
      const posterFallback = getThumbnailUrl(videoUrl);
      return (
        <button
          type="button"
          onClick={() => setActivated(true)}
          aria-label="Play video"
          data-testid="story-video-facade"
          className={`group relative block w-full overflow-hidden rounded-lg ${posterUrl ? 'bg-white' : 'bg-black'} aspect-video ${className}`}
        >
          {poster && (
            <img
              src={poster}
              alt=""
              // P1368: a story's own image is any aspect ratio — show it whole on the black
              // box. YouTube's posters are 16:9 already, so cover crops nothing there.
              className={`h-full w-full ${posterUrl ? 'object-contain' : 'object-cover'}`}
              loading="lazy"
              onError={(e) => {
                // maxresdefault is absent for sub-720p uploads; drop to the 480x360 one.
                const img = e.currentTarget;
                if (posterFallback && img.src !== posterFallback) img.src = posterFallback;
              }}
            />
          )}
          <span className="absolute inset-0 flex items-center justify-center">
            <PosterPlayButton pulse={playCue?.pulse} />
          </span>
          {showDurationOnPoster && typeof durationSeconds === 'number' && durationSeconds > 0 && (
            // Same badge as VideoThumbnailCard.
            <span
              className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-xs font-medium text-white"
              data-testid="video-duration-badge"
            >
              {formatTimecode(durationSeconds)}
            </span>
          )}
        </button>
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
