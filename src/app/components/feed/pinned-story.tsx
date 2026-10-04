/**
 * P1392/P1397/P1401 (founder): story 1 featured for signed-out visitors. Collapsed it is one
 * compact bar that already says what the story is — the author's photo, the title, and the
 * video's own thumbnail with a play button. Tapping the bar expands the full card in place;
 * tapping PLAY expands it AND starts the video (founder, 2026-10-04: "so they don't need to
 * uncollapse and then click on play"). No pin icon: across the app the pin marks a Point.
 * Renders nothing on any failure; the feed never waits on it.
 */
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, PlayIcon } from "lucide-react";
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
  const [failed, setFailed] = useState(false);
  const pointsRequested = useRef(false);
  const panelId = useId();

  // The story itself loads up front: the collapsed bar shows its author and video.
  useEffect(() => {
    let cancelled = false;
    resolveStorySlug(PINNED_STORY_SLUG)
      .then(async (id) => {
        if (!id) {
          if (!cancelled) setFailed(true);
          return;
        }
        const s = await storiesService.getStory(id);
        if (cancelled) return;
        if (!s) {
          setFailed(true);
          return;
        }
        setStory(s);
        onResolved?.(s.id);
      })
      .catch(() => {
        if (!cancelled) setFailed(true); // no featured story is the fallback
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

  // P1406: hold the bar's place while it loads so the cards below don't jump; a failed
  // load (failed=true) collapses to nothing.
  if (!story) return failed ? null : <div data-testid="pinned-story-placeholder" aria-hidden className="h-[70px] rounded-lg border border-blue-100 bg-blue-50/60 animate-pulse" />;
  // Only a playable story video earns a play button (story cards play YouTube; a hosted MP4,
  // as on test's st1, renders as the picture). A play button that cannot play would mislead.
  const thumb = getThumbnailUrl(story.videoUrl);

  const toggle = () => {
    // Reopening by the bar never replays: autoplay belongs to the play button only.
    setAutoPlay(false);
    setOpen((v) => !v);
  };

  // P1406 (founder): open, the blue box WRAPS the story — the bar on top (no photo: the card
  // carries it), the card inside — so it reads as one thing that opened. Chevron only, in both
  // states: a "Hide" that has no "Show" counterpart read as odd.
  if (open) {
    return (
      <section data-testid="pinned-story" className="rounded-lg border border-blue-200 bg-blue-50 p-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded
          aria-controls={panelId}
          aria-label={`Collapse featured story: ${PINNED_STORY_TITLE}`}
          className="flex min-h-12 w-full items-center gap-3 rounded-md px-1 py-0.5 text-left hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium uppercase tracking-wide text-blue-700">Featured story</span>
            <span className="block line-clamp-2 text-sm font-semibold text-foreground">{PINNED_STORY_TITLE}</span>
          </span>
          <ChevronUpIcon className="h-5 w-5 shrink-0 text-blue-700" aria-hidden />
        </button>
        <div id={panelId} data-testid="pinned-story-expanded" className="mt-2">
          <FeedStoryCard story={story} linkedPoints={points} autoPlay={autoPlay} />
        </div>
      </section>
    );
  }

  return (
    <section data-testid="pinned-story" className="rounded-lg border border-blue-200 bg-blue-50">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={false}
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
          <ChevronDownIcon className="h-5 w-5 shrink-0 text-blue-700" aria-hidden />
        </button>
        {thumb && (
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
    </section>
  );
}
