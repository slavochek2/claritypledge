import { formatTimecode, getTimestampUrl, type VideoQuote } from '@/lib/video';

interface StoryVideoQuotesProps {
  videoUrl: string;
  quotes: VideoQuote[];
  durationSeconds?: number | null;
  /** The subject the quotes come from. Full name — the section names who it quotes. */
  subjectName: string;
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
 * Renders nothing when there are no quotes — the argument and player stand alone.
 */
export function StoryVideoQuotes({
  videoUrl,
  quotes,
  durationSeconds,
  subjectName,
  onSeek,
  playerBlocked = false,
}: StoryVideoQuotesProps) {
  if (!quotes || quotes.length === 0) return null;

  const canSeek = !!onSeek && !playerBlocked;

  return (
    <section className="mt-6" data-testid="story-video-quotes">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Supporting quotes from {subjectName}
        </h3>
        <span
          className="text-xs text-gray-500 dark:text-gray-400"
          data-testid="story-video-quotes-meta"
        >
          {quotes.length} marks
          {typeof durationSeconds === 'number' && durationSeconds > 0
            ? ` · ${formatTimecode(durationSeconds)}`
            : ''}
        </span>
      </div>

      <ul className="mt-3 space-y-3">
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
                  className="-ml-2 flex h-10 w-fit shrink-0 items-center gap-1 rounded px-2 text-sm font-medium text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950"
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
                  className="-ml-2 flex h-10 w-fit shrink-0 items-center gap-1 rounded px-2 text-sm font-medium text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950"
                >
                  <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  {timecode}
                </a>
              )}
              <blockquote className="min-w-0 flex-1 border-l-4 border-gray-200 pl-3 text-sm italic text-gray-700 dark:border-gray-700 dark:text-gray-300">
                {quote.text}
              </blockquote>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default StoryVideoQuotes;
