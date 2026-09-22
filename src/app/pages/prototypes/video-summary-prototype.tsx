/**
 * @file video-summary-prototype.tsx
 * @description DEV-only prototype for P1349 (/tree/video-summary and /tree/video-summary/page).
 *
 * Two screens, so the founder can see the whole loop:
 *   1. A story surface: one player, "Read the full summary →" directly under it, then the
 *      stories drawn from that video. The link shows once per player, never once per story.
 *   2. The summary page: a neutral summary of the whole video (all speakers), with timestamps
 *      that seek the player in place. The browser's Back button returns to screen 1.
 *
 * The summary is one real output of the readfirst generator (video-summary-sample.ts), shown
 * unchecked. The stories are mock placeholders. Nothing reads or writes app data.
 */
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Flag, Sparkles } from 'lucide-react';
import { StoryVideoPlayer, type StoryVideoPlayerHandle } from '@/app/components/shared/story-video-player';
import { SAMPLE_SUMMARY } from './video-summary-sample';

const VIDEO_URL = `https://www.youtube.com/watch?v=${SAMPLE_SUMMARY.id}`;
const PAGE_PATH = '/tree/video-summary/page';

const MOCK_STORIES = [
  { author: 'Participant A', text: '[Mock story 1: one or two sentences from a participant, then a timestamped quote.]', quote: '8:15' },
  { author: 'Participant B', text: '[Mock story 2: a different participant drawing on the same video.]', quote: '34:50' },
];

/** "mm:ss" or "h:mm:ss" → seconds. */
function toSeconds(t: string): number {
  return t.split(':').map(Number).reduce((acc, n) => acc * 60 + n, 0);
}

function SummaryLink() {
  return (
    <Link
      to={PAGE_PATH}
      className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 text-sm font-medium text-primary hover:underline"
    >
      Read the full summary <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

export function VideoSummaryStorySurface() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <p className="mb-6 text-xs uppercase tracking-wide text-muted-foreground">
        P1349 prototype · a story list, grouped by video
      </p>
      <section className="rounded-lg border border-border bg-card p-4">
        <StoryVideoPlayer videoUrl={VIDEO_URL} />
        <SummaryLink />
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          {MOCK_STORIES.map((s) => (
            <article key={s.author} className="text-sm">
              <p className="font-medium">{s.author}</p>
              <p className="mt-1 text-muted-foreground">{s.text}</p>
              <p className="mt-1 text-xs text-muted-foreground">▶ {s.quote}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export function VideoSummaryPage() {
  const playerRef = useRef<StoryVideoPlayerHandle>(null);
  const seek = (t: string) => playerRef.current?.seekTo(toSeconds(t));
  const paragraphs = SAMPLE_SUMMARY.summary.split(/\n\n+/);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <button
        type="button"
        onClick={() => window.history.back()}
        className="mb-4 inline-flex min-h-[40px] items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to the story
      </button>

      <h1 className="text-2xl font-semibold leading-tight">{SAMPLE_SUMMARY.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{SAMPLE_SUMMARY.channel}</p>

      <div className="sticky top-0 z-10 mt-4 bg-background py-2">
        <StoryVideoPlayer ref={playerRef} videoUrl={VIDEO_URL} durationSeconds={SAMPLE_SUMMARY.duration} />
      </div>

      <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" /> AI-generated summary of the whole video, all speakers. [Prototype sample: not yet checked against the transcript]
      </p>

      <p className="mt-4 text-lg leading-relaxed">{SAMPLE_SUMMARY.tldr}</p>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Moments</h2>
      <ul className="mt-2 space-y-1">
        {SAMPLE_SUMMARY.moments.map((m) => (
          <li key={m.t}>
            <button
              type="button"
              onClick={() => seek(m.t)}
              className="flex min-h-[40px] w-full items-start gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
            >
              <span className="shrink-0 font-mono text-primary">{m.t}</span>
              <span>{m.note}</span>
            </button>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Full summary</h2>
      <div className="mt-2 space-y-4 leading-relaxed">
        {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Key points</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {SAMPLE_SUMMARY.key_points.map((k) => <li key={k}>{k}</li>)}
      </ul>

      <p className="mt-10 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Flag className="h-3.5 w-3.5" /> Something wrong? [Report an error — not wired in the prototype]
      </p>
    </div>
  );
}
