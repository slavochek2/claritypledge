import { forwardRef } from 'react';
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

    if (mode === 'player') {
      return (
        <StoryVideoPlayer
          ref={ref}
          videoUrl={videoUrl as string}
          durationSeconds={durationSeconds}
          onBlockedChange={onBlockedChange}
          className={className}
        />
      );
    }

    return (
      <VideoThumbnailCard
        videoUrl={videoUrl as string}
        href={storyHref}
        durationSeconds={durationSeconds}
        className={className}
      />
    );
  }
);

export default StoryMedia;
