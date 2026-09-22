import { formatTimecode, getTimestampUrl } from '@/lib/video';

/**
 * The blue ▶ mm:ss pill, lifted from story-video-quotes.tsx so the P1349 summary page seeks the
 * same way a story's quotes do. Seeks in place when `onSeek` is given; otherwise opens the
 * source at that second in a new tab.
 *
 * P1349: story-video-quotes.tsx still inlines its own copy — it is being edited by P1348, so
 * switching it to this component waits until P1348 ships, to avoid a cross-branch conflict.
 */
const PILL_CLASS =
  '-ml-2 flex h-10 w-fit shrink-0 items-center gap-1 rounded-full border border-blue-200 bg-blue-50/60 px-2.5 text-sm font-medium text-blue-600 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-900';

interface TimecodePillProps {
  videoUrl: string;
  seconds: number;
  onSeek?: (seconds: number) => void;
}

export function TimecodePill({ videoUrl, seconds, onSeek }: TimecodePillProps) {
  const timecode = formatTimecode(seconds);
  const icon = (
    <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );

  if (onSeek) {
    return (
      <button type="button" onClick={() => onSeek(seconds)} aria-label={`Play from ${timecode}`} className={PILL_CLASS}>
        {icon}
        {timecode}
      </button>
    );
  }
  return (
    <a
      href={getTimestampUrl(videoUrl, seconds) ?? videoUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open the source at ${timecode} in a new tab`}
      className={PILL_CLASS}
    >
      {icon}
      {timecode}
    </a>
  );
}
