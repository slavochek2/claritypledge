import { getThumbnailUrl, formatTimecode } from '@/lib/video';

interface VideoThumbnailCardProps {
  videoUrl: string;
  /** Where the whole card links. The story page — never the video source. */
  href?: string;
  durationSeconds?: number | null;
  /** Blocked-player mode links straight to the source instead of to the story. */
  sourceHref?: string;
  className?: string;
  alt?: string;
  /**
   * Shown on the card itself. The blocked-player state passes "Watch on
   * YouTube" so the play button reads as the working control it is — blind
   * review round 3 found an unlabelled button under a "could not load"
   * caption reads as a dead control.
   */
  actionLabel?: string;
}

/**
 * P1141 — what every surface that cannot run a player shows instead.
 *
 * This is a fallback, not a degradation: the reader loses the inline player and
 * nothing else. The whole card links back to the story, where it plays.
 *
 * Used on feed and profile cards, in letters, and as the blocked-embed state of
 * StoryVideoPlayer. The crawler's og:image points at the same derived thumbnail
 * but gets no overlay — a static meta-tag card cannot carry one, which is an
 * industry-wide limit rather than a deviation from the UI Contract.
 */
export function VideoThumbnailCard({
  videoUrl,
  href,
  durationSeconds,
  sourceHref,
  className = '',
  alt = 'Video thumbnail',
  actionLabel,
}: VideoThumbnailCardProps) {
  const thumbnail = getThumbnailUrl(videoUrl);
  if (!thumbnail) return null;

  const target = sourceHref ?? href;

  const inner = (
    <div className={`relative overflow-hidden rounded-lg bg-black ${className}`}>
      <img
        src={thumbnail}
        alt={alt}
        loading="lazy"
        className="w-full aspect-video object-cover"
        data-testid="video-thumbnail-image"
      />
      <span
        className="absolute inset-0 flex items-center justify-center"
        aria-hidden="true"
        data-testid="video-play-affordance"
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60">
          <svg viewBox="0 0 24 24" className="h-7 w-7 translate-x-0.5 fill-white">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </span>
      {actionLabel && (
        <span
          className="absolute bottom-2 left-2 rounded bg-black/75 px-2 py-1 text-xs font-medium text-white"
          data-testid="video-action-label"
        >
          {actionLabel}
        </span>
      )}
      {typeof durationSeconds === 'number' && durationSeconds > 0 && (
        <span
          className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-xs font-medium text-white"
          data-testid="video-duration-badge"
        >
          {formatTimecode(durationSeconds)}
        </span>
      )}
    </div>
  );

  if (!target) return inner;

  const isExternal = /^https?:\/\//i.test(target);
  return (
    <a
      href={target}
      data-testid="video-thumbnail-link"
      aria-label={actionLabel ?? 'Play video'}
      {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {inner}
    </a>
  );
}

export default VideoThumbnailCard;
