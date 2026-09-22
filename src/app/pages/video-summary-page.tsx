/**
 * @file video-summary-page.tsx
 * @description P1349: /video/:videoId — one neutral, AI-written summary of a whole source video,
 * all speakers. Linked from "Read video summary" under every player of that video.
 *
 * Order (founder, decided on the prototype): Back · title · channel + length · player (normal
 * flow, not pinned) · AI label · 3 key points · Summary + read time · Timestamps · Go back.
 * RLS serves confirmed rows only, so a draft or checked-but-unconfirmed summary 404s here.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { TimecodePill } from '@/app/components/shared/timecode-pill';
import { StoryVideoPlayer, type StoryVideoPlayerHandle } from '@/app/components/shared/story-video-player';
import { getVideoSummary, readMinutes, summaryParagraphs, type VideoSummary } from '@/app/data/video-summaries-service';
import { NotFoundPage } from './not-found-page';

export function VideoSummaryPage() {
  const { videoId = '' } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const playerRef = useRef<StoryVideoPlayerHandle>(null);
  const playerBoxRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ status: 'loading' } | { status: 'missing' } | { status: 'ready'; data: VideoSummary }>({
    status: 'loading',
  });

  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    getVideoSummary(videoId)
      .then((data) => live && setState(data ? { status: 'ready', data } : { status: 'missing' }))
      .catch(() => live && setState({ status: 'missing' }));
    return () => {
      live = false;
    };
  }, [videoId]);

  // Same leave-the-page rule as /stake: no in-app history (a cold arrival) goes to the feed.
  const back = () => {
    const idx = (window.history.state as { idx?: unknown } | null)?.idx;
    if (idx === 0 && window.history.length <= 1) navigate('/feed', { replace: true });
    else navigate(-1);
  };

  // The video is not pinned, so a timestamp far down the page scrolls back up to it, then seeks.
  const seek = (seconds: number) => {
    playerBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    playerRef.current?.seekTo(seconds);
  };

  if (state.status === 'missing') return <NotFoundPage />;
  if (state.status === 'loading') {
    return <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-8" aria-busy="true" />;
  }

  const s = state.data;
  const videoUrl = `https://www.youtube.com/watch?v=${s.videoId}`;
  const videoMin = Math.max(1, Math.round(s.durationSeconds / 60));

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-8" data-testid="video-summary-page">
      <FocusHeader onBack={back} />

      <h1 className="text-xl font-semibold leading-snug sm:text-3xl sm:leading-tight">{s.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {s.channel} · {videoMin}-min video
      </p>

      <div ref={playerBoxRef} className="mt-5 scroll-mt-20" data-testid="video-summary-player">
        <StoryVideoPlayer ref={playerRef} videoUrl={videoUrl} durationSeconds={s.durationSeconds} />
      </div>
      <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          AI summary of the full video. Video by {s.channel}; not endorsed by the creator.
        </span>
      </p>

      <section className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key points</h2>
        <ol className="mt-3 space-y-3">
          {s.keyPoints.map((k, i) => (
            <li key={i} className="flex gap-3">
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
          Summary <span className="font-normal normal-case tracking-normal">· {readMinutes(s.summary)}-min read</span>
        </h2>
        <div className="mt-3 max-w-[65ch] space-y-6 text-base leading-[1.75] text-foreground">
          {summaryParagraphs(s.summary).map((p, i) => <p key={i}>{p}</p>)}
        </div>
      </section>

      {s.moments.length > 0 && (
        <section className="mt-10 border-t border-border pt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timestamps</h2>
          <ul className="mt-3 space-y-3">
            {s.moments.map((m) => (
              <li key={m.t} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
                <TimecodePill videoUrl={videoUrl} seconds={m.t} onSeek={seek} />
                <span className="min-w-0 flex-1 text-sm text-gray-700 dark:text-gray-300">{m.note}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

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

export default VideoSummaryPage;
