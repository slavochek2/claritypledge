/**
 * P1392 (founder, 2026-10-02): story 1 pinned for signed-out visitors, as a compact
 * pinned-message bar (the WhatsApp/Telegram pattern) — one line, clearly clickable, opens
 * the story page where the video and its points live. A full card here could not show the
 * story's points (the feed attaches points only to stories in its own page) and took a
 * screen of space. Renders nothing on any failure; the feed never waits on the pin.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PinIcon, PlayIcon, ChevronRightIcon } from "lucide-react";
import { resolveStorySlug } from "@/app/data/stories-service-real";

export const PINNED_STORY_SLUG = "st1";
/** Founder-approved label for st1 (event-links.ts, 2026-09-16). */
const PINNED_STORY_TITLE = "Three kinds of understanding";

export function PinnedStory({ onResolved }: { onResolved?: (storyId: string) => void }) {
  const [storyId, setStoryId] = useState<string | null>(null);

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
        /* no pin is the fallback */
      });
    return () => {
      cancelled = true;
    };
    // onResolved is a stable state setter from the caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!storyId) return null;
  return (
    <Link
      to={`/story/${storyId}`}
      data-testid="pinned-story"
      className="group flex min-h-12 items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <PinIcon className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium uppercase tracking-wide text-blue-700">Pinned</span>
        <span className="block line-clamp-2 text-sm font-semibold text-foreground">{PINNED_STORY_TITLE}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-blue-700">
        <PlayIcon className="h-4 w-4" aria-hidden /> Watch
        <ChevronRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}
