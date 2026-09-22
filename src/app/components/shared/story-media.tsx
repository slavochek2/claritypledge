import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { parseVideoUrl } from '@/lib/video';
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
 * P1349 PROTOTYPE — DEV-only. With `?p1349` in the URL, every video (player or thumbnail) gets a
 * one-line "Read video summary" link directly under it, so the placement can be judged on the
 * real feed, groups, profile, point and story surfaces. Off in prod by construction.
 */
function p1349SummaryLink(videoId: string) {
  if (!import.meta.env.DEV || !new URLSearchParams(window.location.search).has('p1349')) return null;
  const href = `/tree/video-summary/page?v=${videoId}`;
  const className = 'mb-1 ml-auto flex h-10 w-fit items-center gap-1 text-sm text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-blue-400';
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

export const StoryMedia = forwardRef<StoryVideoPlayerHandle, StoryMediaProps>(
  function StoryMedia(
    { videoUrl, durationSeconds, mode = 'thumbnail', storyHref, onBlockedChange, className, imageProps },
    ref
  ) {
    const video = parseVideoUrl(videoUrl);

    if (!video) {
      // Absent OR unparseable — both are "this story has no video", identically.
      return imageProps ? <StoryImage {...imageProps} /> : null;
    }

    const summaryLink = p1349SummaryLink(video.videoId);

    if (mode === 'player') {
      return (
        <>
        <StoryVideoPlayer
          ref={ref}
          videoUrl={videoUrl as string}
          durationSeconds={durationSeconds}
          onBlockedChange={onBlockedChange}
          className={summaryLink ? '' : className}
        />
        {summaryLink}
        </>
      );
    }

    return (
      <>
      <VideoThumbnailCard
        videoUrl={videoUrl as string}
        href={storyHref}
        durationSeconds={durationSeconds}
        className={summaryLink ? '' : className}
      />
      {summaryLink}
      </>
    );
  }
);

export default StoryMedia;
