import { useId, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatTimecode, getTimestampUrl, type VideoQuote } from '@/lib/video';

interface StoryVideoQuotesProps {
  videoUrl: string;
  quotes: VideoQuote[];
  /**
   * Seeks the live player in place. Absent (or blocked) means every timecode
   * becomes a new-tab link opening the source at the right second instead.
   */
  onSeek?: (seconds: number) => void;
  playerBlocked?: boolean;
}

/**
 * P1141 — the supporting quotes, sitting BELOW the argument rather than inside it.
 *
 * The separation is the honesty signal, and it does the job no disclaimer does:
 * unverified caption text sitting inside the argument hides the boundary between
 * what the machine wrote and what a transcript robot guessed. Two alternatives
 * (quotes inline in the prose; a hinge line before each quote) were built and
 * rejected for exactly that.
 *
 * P1296 item 8 — FOLDED BY DEFAULT, ON EVERY SURFACE, and the fold lives here rather
 * than in each card. Founder: *"who wants to read after the story the supporting quotes?
 * Maybe, but maybe not"*, then *"so its folded per default everywhere?"* — yes. Six call
 * sites render this component; a per-card toggle would be six chances to drift, which is
 * the defect this spec exists to close.
 *
 * The heading IS the toggle, and it states the count and nothing else. The subject's name
 * left it on every surface: the byline above already names the person (founder: *"not
 * sure we need the name of person again here? redundant?"*). The count is whatever the
 * caller passes — live sessions and letters pass only the quotes their prose does not
 * already print, so their N is the number actually behind the fold.
 *
 * FOLDING IS NOT REMOVAL. Quotes and timecodes stay one tap away on every surface, behind
 * a control that says how many there are. Deleting them is out of bounds (spec, Invariant).
 *
 * Renders nothing when there are no quotes — the argument and player stand alone.
 */
export function StoryVideoQuotes({
  videoUrl,
  quotes,
  onSeek,
  playerBlocked = false,
}: StoryVideoQuotesProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();

  if (!quotes || quotes.length === 0) return null;

  const canSeek = !!onSeek && !playerBlocked;
  const count = quotes.length;

  return (
    <section className="mt-4" data-testid="story-video-quotes">
      {/* P1141 amendment 2026-08-24: the `{n} marks · {duration}` meta line was removed.
          The count is visible by looking, and the video's total length answers a question
          nobody asked at this position. The blocked-player fallback gets its own duration
          from StoryMedia, not from here. (P1296 put a count back — in the fold toggle, where
          it says what the fold is hiding, not as a meta line.) */}
      {/* A heading that CONTAINS the button — the disclosure pattern that keeps the section
          navigable by heading while making the whole label the control. 40px tall, the
          same floor as the timecodes below. */}
      <h3 className="text-sm font-medium">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          // Only while the list exists — an idref to an element that is not rendered is invalid.
          aria-controls={open ? listId : undefined}
          data-testid="story-video-quotes-toggle"
          className="flex min-h-[40px] w-full items-center gap-1.5 rounded-md text-left text-muted-foreground transition-colors hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {open ? (
            <ChevronDown size={14} className="flex-shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight size={14} className="flex-shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0">
            {count} supporting {count === 1 ? 'quote' : 'quotes'}
          </span>
        </button>
      </h3>

      {/*
        The timecode measures 40px tall — verified by boundingBox in
        e2e/p1141-story-video.spec.ts, at 320, 375 and desktop. But TWO
        independent blind reviewers, given the renders alone, both read it as a
        label rather than a control and both reported it as an undersized touch
        target. A hit area the eye cannot see is not a hit area a reader will
        use. The measurement was never the disagreement; the affordance was.
      */}
      {open && (
        <ul id={listId} className="mt-2 space-y-3" data-testid="story-video-quotes-list">
          {quotes.map((quote, index) => {
            const timecode = formatTimecode(quote.seconds);
            const timestampUrl = getTimestampUrl(videoUrl, quote.seconds);

            return (
              <li
                key={`${quote.seconds}-${index}`}
                // Blind review, round 2, defect 5: at 320px a fixed timecode
                // column squeezed the quote to a ragged three-words-per-line
                // ribbon. The row stacks below `sm` and only becomes two columns
                // once there is width for both. Defect 8: `items-baseline` so the
                // timecode and the quote's first line read as one row.
                className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3"
                data-testid="story-video-quote"
              >
                {canSeek ? (
                  <button
                    type="button"
                    onClick={() => onSeek?.(quote.seconds)}
                    data-testid="story-video-quote-timecode"
                    data-seconds={quote.seconds}
                    aria-label={`Play from ${timecode}`}
                    className="-ml-2 flex h-10 w-fit shrink-0 items-center gap-1 rounded-full border border-blue-200 bg-blue-50/60 px-2.5 text-sm font-medium text-blue-600 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-900"
                  >
                    <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" aria-hidden="true">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    {timecode}
                  </button>
                ) : (
                  <a
                    href={timestampUrl ?? videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="story-video-quote-timecode"
                    data-seconds={quote.seconds}
                    aria-label={`Open the source at ${timecode} in a new tab`}
                    className="-ml-2 flex h-10 w-fit shrink-0 items-center gap-1 rounded-full border border-blue-200 bg-blue-50/60 px-2.5 text-sm font-medium text-blue-600 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-900"
                  >
                    <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" aria-hidden="true">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    {timecode}
                  </a>
                )}
                <blockquote className="min-w-0 flex-1 border-l-4 border-border pl-3 text-sm italic text-gray-700 dark:border-gray-700 dark:text-gray-300">
                  {quote.text}
                </blockquote>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default StoryVideoQuotes;
