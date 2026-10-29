/**
 * @file prep-ui.tsx
 * @description P1336 pieces shared by the event preparation (/events/:slug/prepare) and the
 * standalone one (/prepare, P1402): pinned step actions, the clip + transcript, the step title.
 * Moved out of EventPrepPage.tsx unchanged so both pages render the same thing.
 */
import { forwardRef, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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
 * ActionRow puts the two buttons side by side. Pinned on desktop too (founder UAT 2026-10-05):
 * the actions stay in one place on every step, short or long.
 */
export const StepActions = forwardRef<HTMLDivElement, { children: ReactNode; className?: string }>(
  function StepActions({ children, className }, ref) {
    return (
      <FixedBottomBar ref={ref} className={className}>
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

/**
 * P1542 round 6e: a hike's pinned footer (the room's Opt in / Opt out bar and the group terms' "Accept and join").
 *  - PINNED_FADE_CLASS: the fade above the bar is 128px and EASED (round 7c): solid for the first 28px above the bar,
 *    then barely lifting (95% at 36px, 90% at 64px) before easing out to transparent at 128px. Why this shape: a line
 *    reads as "cut" when its top is still visible (< 90% covered) while its bottom is already gone (≥ 95% covered);
 *    the flat 95→90% stretch is longer than a line, so that never happens at any scroll position, and the tail is
 *    gentle enough (at most a 0.34 change of cover within one line). A 96px fade cannot do both: measured for every
 *    scroll offset, the linear 28→96px ramp flags ~40 offsets, and a 96px version of this curve needs a 0.68 tail.
 *  - PINNED_FADE_OFF_CLASS: once the content is scrolled to its end there is nothing behind the bar to fade, so the fade
 *    goes (the certificate's bottom border is not washed out), and on desktop the flat bar turns transparent too, so its
 *    background does not cut the certificate's drop shadow in a hard line (round 7b). Driven by useScrolledToEnd.
 *  - PINNED_FLAT_DESKTOP_CLASS: from lg the bar is flat (no rounded, bordered card edge against the sidebar); a phone
 *    keeps its card.
 */
export const PINNED_FADE_CLASS =
  "before:content-[''] before:absolute before:inset-x-0 before:-top-32 before:h-32 before:bg-[linear-gradient(to_top,hsl(var(--background))_0px,hsl(var(--background))_28px,hsl(var(--background)/0.95)_36px,hsl(var(--background)/0.9)_64px,transparent_128px)] before:pointer-events-none before:transition-opacity before:duration-200";
export const PINNED_FADE_OFF_CLASS = 'before:opacity-0 lg:bg-transparent';
export const PINNED_FLAT_DESKTOP_CLASS = 'lg:rounded-none lg:border-0 lg:shadow-none';

/**
 * Round 6e: true once the end of the content (a sentinel element placed after it) has scrolled into view above a
 * pinned bar of `barHeight` px. Without IntersectionObserver (old browsers, tests) it stays false: the fade simply stays.
 */
export function useScrolledToEnd(barHeight: number): [(node: HTMLDivElement | null) => void, boolean] {
  const [atEnd, setAtEnd] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const node = useRef<HTMLDivElement | null>(null);
  const observe = useCallback(() => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node.current || typeof IntersectionObserver === 'undefined') return;
    const o = new IntersectionObserver(([entry]) => setAtEnd(!!entry?.isIntersecting), {
      rootMargin: `0px 0px -${Math.max(0, Math.round(barHeight))}px 0px`,
      threshold: 0,
    });
    o.observe(node.current);
    observer.current = o;
  }, [barHeight]);
  // Round 7c (Gemini): when the sentinel unmounts there is no "end" in view any more — the fade comes back.
  const ref = useCallback((n: HTMLDivElement | null) => { node.current = n; if (!n) setAtEnd(false); observe(); }, [observe]);
  useEffect(() => { observe(); return () => observer.current?.disconnect(); }, [observe]);
  return [ref, atEnd];
}

export function Title({ children }: { children: ReactNode }) {
  return <h1 className="text-2xl font-bold leading-tight text-foreground">{children}</h1>;
}

/**
 * The clip's words, always on screen under it (founder UAT, 2026-10-04: "some people need to read
 * transcripts … maybe it's always visible"). Not behind a toggle any more; the video's Play and
 * Continue stay pinned, so the text scrolls freely above them.
 */
/** Renders `**…**` spans as bold; the rest stays plain text. */
function withBold(text: string) {
  return text.split(/\*\*(.+?)\*\*/).map((part, i) =>
    i % 2 ? <strong key={i} className="font-semibold">{part}</strong> : part,
  );
}

export function Transcript({ clip }: { clip: ClipKey }) {
  const id = `transcript-${clip}`;
  return (
    <section data-testid={id} aria-label="The video in writing" className="mt-4 space-y-3">
      <div className="max-w-prose space-y-3 text-base leading-relaxed text-foreground">
        {TRANSCRIPTS[clip].map((block, i) =>
          typeof block === 'string' ? (
            <p key={i}>{withBold(block)}</p>
          ) : (
            <ul key={i} className="list-disc space-y-1.5 pl-5">
              {block.items.map((item) => (
                <li key={item.text}>
                  {item.label && <strong className="font-semibold">{item.label}</strong>} {item.text}
                </li>
              ))}
            </ul>
          ),
        )}
      </div>
    </section>
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
 * Founder UAT (2026-10-04): a statements list is long on every screen, so its progress ("3 of 7
 * answered") and Continue stay pinned on desktop too — the one exception to P1387's "in the page on
 * desktop". Callers reserve the bar's height at every width on these steps.
 *
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
  /** A dimmed Continue tap re-reads the answers: the last position write may have landed after
   *  the list's own re-reads, so "not all answered" could be stale. */
  onRecheck?: () => void;
}>(function StatementsActions({ count, loaded, firstUnansweredId, onContinue, onSkip, onRecheck }, ref) {
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
            onRecheck?.();
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
