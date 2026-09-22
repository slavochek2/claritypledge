/**
 * @file video-summary-prototype.tsx
 * @description DEV-only prototype for P1349 (/tree/video-summary and /tree/video-summary/page).
 *
 * Two screens, so the founder can see the whole loop:
 *   1. A story surface: one player, "Read the full summary →" directly under it, then the
 *      stories drawn from that video. The link shows once per player, never once per story.
 *   2. The summary page (v3): site chrome, Back top + bottom, video in normal flow (not pinned),
 *      3 short key points, the summary, then timestamps using the story-quote ▶ pill.
 *
 * The summary is one real output of the readfirst generator (video-summary-sample.ts), shown
 * unchecked. The stories are mock placeholders. Nothing reads or writes app data.
 */
import { useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { TimecodePill } from '@/app/components/shared/timecode-pill';
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

/**
 * Top 3, short. The generator returns 6 long sentences; the real prompt will ask for 3 of at most
 * ~12 words. These three are hand-shortened from the sample's own key_points for the prototype.
 */
const KEY_POINTS_SHORT = [
  'All legitimate therapies produce roughly the same outcomes.',
  'Outcomes have not improved in decades, and therapists do not get better with experience.',
  'What works is the relationship plus a plan the client believes in.',
];

export function VideoSummaryPage() {
  const navigate = useNavigate();
  const playerRef = useRef<StoryVideoPlayerHandle>(null);
  const playerBoxRef = useRef<HTMLDivElement>(null);
  const paragraphs = SAMPLE_SUMMARY.summary.split(/\n\n+/).map((p) => p.trim().replace(/\*([^*]+)\*/g, '$1')).filter(Boolean);
  const words = SAMPLE_SUMMARY.summary.split(/\s+/).length;
  const readMin = Math.max(1, Math.round(words / 200));
  const videoMin = Math.round(SAMPLE_SUMMARY.duration / 60);
  // Same leave-the-page rule as /stake: no in-app history (a cold arrival) goes to the feed.
  const back = () => {
    const idx = (window.history.state as { idx?: unknown } | null)?.idx;
    if (idx === 0 && window.history.length <= 1) navigate('/feed', { replace: true });
    else navigate(-1);
  };

  // Scroll the player into view, then seek — the video is not pinned, so a timestamp at the
  // bottom of the page brings you back up to it.
  const seek = (seconds: number) => {
    playerBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    playerRef.current?.seekTo(seconds);
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-8">
      <FocusHeader onBack={back} />

      <h1 className="text-xl font-semibold leading-snug sm:text-3xl sm:leading-tight">{SAMPLE_SUMMARY.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {SAMPLE_SUMMARY.channel} · {videoMin}-min video
      </p>

      <div ref={playerBoxRef} className="mt-5 scroll-mt-20">
        <StoryVideoPlayer ref={playerRef} videoUrl={VIDEO_URL} durationSeconds={SAMPLE_SUMMARY.duration} />
      </div>
      <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        AI summary of the full video
      </p>

      <section className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key points</h2>
        <ol className="mt-3 space-y-3">
          {KEY_POINTS_SHORT.map((k, i) => (
            <li key={k} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                {i + 1}
              </span>
              <span className="leading-relaxed">{k}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10 border-t border-border pt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Summary <span className="font-normal normal-case tracking-normal">· {readMin}-min read</span>
        </h2>
        <div className="mt-3 max-w-[65ch] space-y-6 font-serif text-[17px] leading-[1.75] text-foreground sm:text-lg">
          {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      </section>

      <section className="mt-10 border-t border-border pt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timestamps</h2>
        <ul className="mt-3 space-y-3">
          {SAMPLE_SUMMARY.moments.map((m) => (
            <li key={m.t} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
              <TimecodePill videoUrl={VIDEO_URL} seconds={toSeconds(m.t)} onSeek={seek} />
              <span className="min-w-0 flex-1 text-sm text-gray-700 dark:text-gray-300">{m.note}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Bottom exit, copied from /stake (stake-page.tsx "stake-bottom-back"): centred blue outline
          pill. The real build should share one component between the two pages. */}
      <div className="mt-10 flex justify-center">
        <button
          type="button"
          onClick={back}
          aria-label="Go back from the end of the summary"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-blue-200 bg-card px-5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-blue-900 dark:text-blue-400 dark:hover:bg-blue-950/40"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Go back
        </button>
      </div>
    </div>
  );
}
