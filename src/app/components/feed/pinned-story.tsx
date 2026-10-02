/**
 * P1392 (founder, 2026-10-02): story 1 pinned at the top of the Stories tab for signed-out
 * visitors on the default view, with a way on to its letter. Fetched on its own: st1 is old,
 * so it is never in the newest-50 page the feed loads. Renders nothing on any failure —
 * the feed below must never wait on, or break because of, the pin.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PinIcon } from "lucide-react";
import { storiesService } from "@/app/data/stories-service";
import { resolveStorySlug } from "@/app/data/stories-service-real";
import { FeedStoryCard } from "@/app/components/feed/feed-story-card";
import type { StoryWithAuthor } from "@/app/types";

export const PINNED_STORY_SLUG = "st1";

export function PinnedStory({ onResolved }: { onResolved?: (storyId: string) => void }) {
  const [story, setStory] = useState<StoryWithAuthor | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await resolveStorySlug(PINNED_STORY_SLUG);
        if (!id) return;
        const s = await storiesService.getStory(id);
        if (!cancelled && s) {
          setStory(s);
          onResolved?.(s.id);
        }
      } catch {
        /* no pin is the fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
    // onResolved is a stable setter from the caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!story) return null;
  return (
    <section aria-label="Pinned story" data-testid="pinned-story" className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground">
          <PinIcon className="w-3.5 h-3.5" aria-hidden /> Pinned
        </span>
        <Link to={`/letter/${PINNED_STORY_SLUG}`} className="text-blue-600 hover:underline">
          Read the letter →
        </Link>
      </div>
      <FeedStoryCard story={story} />
    </section>
  );
}
