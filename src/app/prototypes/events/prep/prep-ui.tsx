/**
 * @file prep-ui.tsx
 * @description P1336 pieces shared by the event preparation (/events/:slug/prepare) and the
 * standalone one (/prepare, P1402): pinned step actions, the clip + transcript, the step title.
 * Moved out of EventPrepPage.tsx unchanged so both pages render the same thing.
 */
import { forwardRef, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FixedBottomBar } from '@/app/components/shared/fixed-bottom-bar';
import { Mp4VideoFacade } from '@/app/components/shared/mp4-video-facade';
import { LetterPrimaryCta } from '@/app/components/letters/letter-primary-cta';
import { LetterProgressBar } from '@/app/components/letters/letter-progress-bar';
import { CLIP_PLAY_LABELS, CLIP_POSTER_ALT, clipUrl, TRANSCRIPTS } from './prep-content';
import { PLAYBACK_RATE, watchSeconds, type ClipKey } from './prep-plan';
// ─── small pieces ──────────────────────────────────────────────────────────────────────

/**
 * P1387 (founder, 2026-10-02): every step's actions are pinned at the bottom of a phone, in ONE
 * slim bar — the question and explanation scroll in the page above it. The first build stacked
 * progress + two buttons (134-166px at 320px) under the fixed step header, a ~40% scroll slot;
 * ActionRow puts the two buttons side by side. On desktop the bar sits in the page under the
 * content (pinned, it floated far below a short step).
 */
export const StepActions = forwardRef<HTMLDivElement, { children: ReactNode; className?: string }>(
  function StepActions({ children, className }, ref) {
    return (
      <FixedBottomBar
        ref={ref}
        className={cn('lg:static lg:mt-6 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0', className)}
      >
        <div className="flex w-full flex-col items-center" data-testid="step-actions">{children}</div>
      </FixedBottomBar>
    );
  },
);

/** The main action as the blue button, the alternative as a small link under it (founder,
 *  2026-10-02 — one rule; equal choices like the volunteer Yes / No are two buttons instead). */
export function ActionRow({ primary, secondary }: { primary: ReactNode; secondary?: ReactNode }) {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-1">
      {primary}
      {secondary}
    </div>
  );
}



/** lg and up: the step actions sit in the page, so no space is reserved for a pinned bar. */
export function useIsDesktop(): boolean {
  const query = '(min-width: 1024px)';
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return matches;
}

/** Height of a fixed element, kept current (same approach as MeetingPrincipleView's bar). */
export function useMeasuredHeight(): [(node: HTMLDivElement | null) => void, number] {
  const [height, setHeight] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node) {
      setHeight(0);
      return;
    }
    setHeight(node.getBoundingClientRect().height);
    if (typeof ResizeObserver !== 'undefined') {
      const o = new ResizeObserver(([entry]) => {
        if (entry) setHeight(entry.target.getBoundingClientRect().height);
      });
      o.observe(node);
      observer.current = o;
    }
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
  return [ref, height];
}

export function Title({ children }: { children: ReactNode }) {
  return <h1 className="text-2xl font-bold leading-tight text-foreground">{children}</h1>;
}

/** "Read the transcript" under every clip — StoryMedia's "Read video summary" link pattern (P1349). */
export function Transcript({ clip }: { clip: ClipKey }) {
  const [open, setOpen] = useState(false);
  const id = `transcript-${clip}`;
  return (
    <div data-testid={id}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`${id}-text`}
        className="ml-auto flex h-10 w-fit items-center gap-1 text-sm text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-blue-400"
      >
        <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {open ? 'Hide the transcript' : 'Read the transcript'}
      </button>
      {open && (
        <div id={`${id}-text`} className="mt-1 space-y-3 text-base leading-relaxed text-muted-foreground animate-in fade-in duration-300">
          {TRANSCRIPTS[clip].map((para) => (
            <p key={para.slice(0, 32)}>{para}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export function Clip({ clip, pulse = false, onPlay, playRequest = 0 }: { clip: ClipKey; pulse?: boolean; onPlay?: () => void; playRequest?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  // The bar's "Play the video" bumps playRequest; the poster's own button starts it.
  useEffect(() => {
    if (playRequest > 0) ref.current?.querySelector<HTMLButtonElement>('button')?.click();
  }, [playRequest]);
  return (
    <div>
      <div ref={ref} data-testid={`clip-${clip}`}>
        <Mp4VideoFacade
          look="story"
          src={clipUrl(clip, 'video')}
          poster={clipUrl(clip, 'poster')}
          posterAlt={CLIP_POSTER_ALT[clip]}
          playLabel={CLIP_PLAY_LABELS[clip]}
          durationSeconds={watchSeconds(clip)}
          pulse={pulse}
          onPlay={onPlay}
          playbackRate={PLAYBACK_RATE}
        />
      </div>
      <Transcript clip={clip} />
    </div>
  );
}

export interface StatementsCount { answered: number; total: number }

const answerHintText = (total: number) => `Set your position on all ${total} points to continue.`;

/**
 * A statements step's pinned actions (moved from EventPrepPage, P1402): "N of M answered", Continue
 * dimmed until every point is answered, Skip as a small link. A fresh instance per step, so the
 * hint never carries over from the previous step.
 */
export const StatementsActions = forwardRef<HTMLDivElement, {
  count: StatementsCount;
  loaded: boolean;
  firstUnansweredId: string | null;
  onContinue: () => void;
  onSkip: () => void;
}>(function StatementsActions({ count, loaded, firstUnansweredId, onContinue, onSkip }, ref) {
  const [answerHint, setAnswerHint] = useState(false);
  const allSet = loaded && count.answered >= count.total;
  return (
    <StepActions ref={ref}>
      {loaded && (
        <div
          key={count.answered}
          className={cn('mb-3 w-full max-w-sm', count.answered > 0 && 'animate-in zoom-in-95 duration-300')}
          aria-live="polite"
          data-testid="answered-count"
        >
          <LetterProgressBar
            currentChapter={0}
            totalChapters={1}
            stepCount={Math.max(count.total, 1)}
            committedSteps={count.answered}
            label={`${count.answered} of ${count.total} answered`}
            tone="subtle"
          />
        </div>
      )}
      {/* Founder (2026-10-02): Continue is the main action, dimmed until every point is answered —
          a tap (phone) or hover (desktop) says what is missing — with Skip as a small link under
          it, so more people answer. Not `disabled`: a disabled button cannot explain itself. */}
      <div className="w-full max-w-sm" title={allSet ? undefined : answerHintText(count.total)}>
        <LetterPrimaryCta
          label="Continue"
          onClick={() => {
            if (allSet) return onContinue();
            setAnswerHint(true);
            // P1391: bring the first unanswered point into view with the hint, so the person
            // sees where to answer (on a phone the list is 4-5 screens long).
            if (firstUnansweredId) {
              document.querySelector(`[data-point-id="${firstUnansweredId}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
          }}
          className={allSet ? undefined : 'opacity-50 hover:bg-blue-600'}
        />
      </div>
      {!allSet && answerHint && (
        <p role="status" className="pt-1 text-center text-sm text-foreground" data-testid="answer-hint">
          {answerHintText(count.total)}
        </p>
      )}
      {!allSet && <LetterPrimaryCta label="Skip and proceed" onClick={onSkip} variant="secondary" />}
    </StepActions>
  );
});
