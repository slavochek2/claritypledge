/**
 * P1392/P1397/P1401 (founder): story 1 featured for signed-out visitors. Collapsed it is one
 * compact bar that already says what the story is — the author's photo, the title, and the
 * video's own thumbnail with a play button. Tapping the bar expands the full card in place;
 * tapping PLAY expands it AND starts the video (founder, 2026-10-04: "so they don't need to
 * uncollapse and then click on play"). No pin icon: across the app the pin marks a Point.
 * Renders nothing on any failure; the feed never waits on it.
 */
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDownIcon, PlayIcon } from "lucide-react";
import { storiesService } from "@/app/data/stories-service";
import { resolveStorySlug } from "@/app/data/stories-service-real";
import { FeedStoryCard } from "@/app/components/feed/feed-story-card";
import { GravatarAvatar } from "@/components/ui/gravatar-avatar";
import { getThumbnailUrl } from "@/lib/video";
import type { PointSummary, StoryWithAuthor } from "@/app/types";

export const PINNED_STORY_SLUG = "st1";
/** Founder-approved label for st1 (event-links.ts, 2026-09-16). */
const PINNED_STORY_TITLE = "Three kinds of understanding";

export function PinnedStory({ onResolved }: { onResolved?: (storyId: string) => void }) {
  const [story, setStory] = useState<StoryWithAuthor | null>(null);
  const [open, setOpen] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [points, setPoints] = useState<PointSummary[] | undefined>(undefined);
  const pointsRequested = useRef(false);
  const panelId = useId();

  // The story itself loads up front: the collapsed bar shows its author and video.
  useEffect(() => {
    let cancelled = false;
    resolveStorySlug(PINNED_STORY_SLUG)
      .then(async (id) => {
        if (!id) return;
        const s = await storiesService.getStory(id);
        if (cancelled || !s) return;
        setStory(s);
        onResolved?.(s.id);
      })
      .catch(() => {
        /* no featured story is the fallback */
      });
    return () => {
      cancelled = true;
    };
    // onResolved is a stable state setter from the caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Its points load on first open only.
  useEffect(() => {
    if (!open || !story || pointsRequested.current) return;
    pointsRequested.current = true;
    storiesService
      .getPointsForStories([story.id])
      .then((map) => setPoints(map.get(story.id) ?? []))
      .catch(() => {
        /* the card hides its points expander, as in the feed */
      });
  }, [open, story]);

  if (!story) return null;
  // Only a playable story video earns a play button (story cards play YouTube; a hosted MP4,
  // as on test's st1, renders as the picture). A play button that cannot play would mislead.
  const thumb = getThumbnailUrl(story.videoUrl);

  return (
    <section data-testid="pinned-story" className="rounded-lg border border-blue-200 bg-blue-50">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={() => {
            // Reopening by the bar never replays: autoplay belongs to the play button only.
            setAutoPlay(false);
            setOpen((v) => !v);
          }}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <GravatarAvatar
            name={story.authorName}
            photoUrl={story.authorAvatarUrl}
            avatarColor={story.authorAvatarColor}
            size="sm"
            isPledger={story.authorHasPledged ?? false}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium uppercase tracking-wide text-blue-700">Featured story</span>
            <span className="block line-clamp-2 text-sm font-semibold text-foreground">{PINNED_STORY_TITLE}</span>
          </span>
          <ChevronDownIcon
            className={`h-5 w-5 shrink-0 text-blue-700 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
        {thumb && !open && (
          <button
            type="button"
            onClick={() => {
              setAutoPlay(true);
              setOpen(true);
            }}
            aria-label={`Play the video: ${PINNED_STORY_TITLE}`}
            data-testid="pinned-story-play"
            className="relative h-12 w-20 shrink-0 overflow-hidden rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <img src={thumb} alt="" className="h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-black/25">
              <PlayIcon className="h-5 w-5 fill-white text-white" aria-hidden />
            </span>
          </button>
        )}
      </div>
      {open && (
        <div id={panelId} className="px-2 pb-2 sm:px-3 sm:pb-3" data-testid="pinned-story-expanded">
          <FeedStoryCard story={story} linkedPoints={points} autoPlay={autoPlay} />
        </div>
      )}
    </section>
  );
}
