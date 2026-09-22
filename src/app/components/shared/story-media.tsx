import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { parseVideoUrl } from '@/lib/video';
import { useHasVideoSummary, videoSummaryPath } from '@/app/data/video-summaries-service';
import { StoryImage } from './story-image';
import { StoryVideoPlayer, type StoryVideoPlayerHandle } from './story-video-player';
import { VideoThumbnailCard } from './video-thumbnail-card';

type StoryImageProps = React.ComponentProps<typeof StoryImage>;

interface StoryMediaProps {
  videoUrl?: string | null;
  durationSeconds?: number | null;
  /**
   * `player` mounts a live embed — only a story's dedicated detail surface does
   * that. Every card, feed and preview surface passes `thumbnail`.
   */
  mode?: 'player' | 'thumbnail';
  /** Where a thumbnail card links. The story page, never the video source. */
  storyHref?: string;
  onBlockedChange?: (blocked: boolean) => void;
  className?: string;
  /** Everything below is forwarded untouched to the existing image path. */
  imageProps?: StoryImageProps;
}

/**
 * P1141 — picks video or image, and touches neither existing image column.
 *
 * The Non-Goal is literal: `StoryImage`, `image_url` and `banner_url` are never
 * edited, only wrapped. A story with no parseable video renders through exactly
 * the code path it renders through today, so "renders exactly as it does today"
 * is satisfied by construction rather than by matching behaviour.
 */
/**
 * P1349 — "Read video summary", right-aligned directly under the video. Rendered here because
 * every player on every surface goes through StoryMedia, so each surface gets it once per
 * player. Only when the video has an operator-confirmed summary: no dead links.
 */
function VideoSummaryLink({ videoId }: { videoId: string }) {
  const href = videoSummaryPath(videoId);
  const className = 'ml-auto flex h-10 w-fit items-center gap-1 text-sm text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-blue-400';
  const content = <><FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Read video summary</>;
  // Inside an embed (iframe on someone else's page), open a new tab: navigating the iframe would
  // squeeze the summary into the embed box, and "back" could not return the reader.
  if (window.self !== window.top) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className={className}>
        {content}
      </a>
    );
  }
  return (
    <Link to={href} onClick={(e) => e.stopPropagation()} className={className}>
      {content}
    </Link>
  );
}

/**
 * With a link, the caller's spacing classes move to a wrapper around player + link, so the
 * margins surround the pair instead of being dropped. Without one, the media renders bare.
 */
function MediaWithSummaryLink({ className, link, children }: { className?: string; link: React.ReactNode; children: React.ReactNode }) {
  if (!link) return <>{children}</>;
  return (
    <div className={className} data-testid="story-media-with-summary-link">
      {children}
      {link}
    </div>
  );
}

export const StoryMedia = forwardRef<StoryVideoPlayerHandle, StoryMediaProps>(
  function StoryMedia(
    { videoUrl, durationSeconds, mode = 'thumbnail', storyHref, onBlockedChange, className, imageProps },
    ref
  ) {
    const video = parseVideoUrl(videoUrl);
    const hasSummary = useHasVideoSummary(video?.videoId);

    if (!video) {
      // Absent OR unparseable — both are "this story has no video", identically.
      return imageProps ? <StoryImage {...imageProps} /> : null;
    }

    const summaryLink = hasSummary ? <VideoSummaryLink videoId={video.videoId} /> : null;

    if (mode === 'player') {
      return (
        <MediaWithSummaryLink className={className} link={summaryLink}>
          <StoryVideoPlayer
            ref={ref}
            videoUrl={videoUrl as string}
            durationSeconds={durationSeconds}
            onBlockedChange={onBlockedChange}
            className={summaryLink ? undefined : className}
          />
        </MediaWithSummaryLink>
      );
    }

    return (
      <MediaWithSummaryLink className={className} link={summaryLink}>
        <VideoThumbnailCard
          videoUrl={videoUrl as string}
          href={storyHref}
          durationSeconds={durationSeconds}
          className={summaryLink ? undefined : className}
        />
      </MediaWithSummaryLink>
    );
  }
);

export default StoryMedia;
