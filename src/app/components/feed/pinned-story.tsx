/**
 * P1392/P1397 (founder): story 1 featured for signed-out visitors. Collapsed it is one
 * compact bar; tapping it expands the FULL story card in place — video, text and its
 * points — because sending the visitor to another page for a featured item felt like
 * leaving the feed. No pin icon: across the app the pin marks a Point (PointHeader),
 * so it would mislabel a story. Renders nothing on any failure; the feed never waits.
 */
import { useEffect, useState } from "react";
import { PlayCircleIcon, ChevronDownIcon } from "lucide-react";
import { storiesService } from "@/app/data/stories-service";
import { resolveStorySlug } from "@/app/data/stories-service-real";
import { FeedStoryCard } from "@/app/components/feed/feed-story-card";
import type { PointSummary, StoryWithAuthor } from "@/app/types";

export const PINNED_STORY_SLUG = "st1";
/** Founder-approved label for st1 (event-links.ts, 2026-09-16). */
const PINNED_STORY_TITLE = "Three kinds of understanding";

export function PinnedStory({ onResolved }: { onResolved?: (storyId: string) => void }) {
  const [storyId, setStoryId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [story, setStory] = useState<StoryWithAuthor | null>(null);
  const [points, setPoints] = useState<PointSummary[] | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    resolveStorySlug(PINNED_STORY_SLUG)
      .then((id) => {
        if (!cancelled && id) {
          setStoryId(id);
          onResolved?.(id);
        }
      })
      .catch(() => {
        /* no feature is the fallback */
      });
    return () => {
      cancelled = true;
    };
    // onResolved is a stable state setter from the caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the full story and its points once, on first open. The effect must not depend on
  // `story`: setting it would re-run the effect and its cleanup would cancel the points
  // request still in flight (the card then never showed its "N points" button).
  const [requested, setRequested] = useState(false);
  useEffect(() => {
    if (!open || !storyId || requested) return;
    setRequested(true);
    storiesService
      .getStory(storyId)
      .then((s) => setStory(s))
      .catch(() => {});
    storiesService
      .getPointsForStories([storyId])
      .then((map) => setPoints(map.get(storyId) ?? []))
      .catch(() => {
        /* the card hides its points expander, as in the feed */
      });
  }, [open, storyId, requested]);

  if (!storyId) return null;
  return (
    <section data-testid="pinned-story" className="rounded-lg border border-blue-200 bg-blue-50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full min-h-12 items-center gap-3 rounded-lg px-4 py-2.5 text-left transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <PlayCircleIcon className="h-5 w-5 shrink-0 text-blue-600" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium uppercase tracking-wide text-blue-700">Featured story</span>
          <span className="block line-clamp-2 text-sm font-semibold text-foreground">{PINNED_STORY_TITLE}</span>
        </span>
        <ChevronDownIcon
          className={`h-5 w-5 shrink-0 text-blue-700 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="px-2 pb-2 sm:px-3 sm:pb-3" data-testid="pinned-story-expanded">
          {story ? (
            <FeedStoryCard story={story} linkedPoints={points} />
          ) : (
            <div className="h-40 rounded-lg bg-background animate-pulse" />
          )}
        </div>
      )}
    </section>
  );
}
