/**
 * @file org-join-part1.tsx
 * @description P1549: the screens /groups/:slug/join shows before the terms: Part 1 (not learned, or partly learned)
 * and the failed-read screen. The learning itself is /prepare?then=join.
 */
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { forgetInFlight } from '@/lib/share-in-flight';
import { withDeadline } from '@/lib/with-deadline';
import { SEO } from '@/app/components/seo';
import { cn } from '@/lib/utils';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { Button } from '@/components/ui/button';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { LetterPrimaryCta } from '@/app/components/letters/letter-primary-cta';
import type { PrepPartRow } from '@/app/data/event-prep-service';
import { CMP7_TAG, isPartDone, minutesFor, STEP_LABELS, stepMinutes, type PlanStep } from '@/app/prototypes/events/prep/prep-plan';
import { PrepWhy } from '@/app/prototypes/events/prep/PrepWhy';
import { WHY_COMMUNITY } from '@/app/prototypes/events/prep/prep-why';
import { loadTagPoints } from '@/app/prototypes/events/prep/use-prep-state';

const READ_DEADLINE_MS = 6000;
const TERMS_MINUTES = 1;
/** Joining asks no opt-in, so the step reads differently from the event learning's. */
const JOIN_LABELS: Partial<Record<PlanStep, string>> = { principle: 'See the Clarity Meeting Principle' };
const JOIN_STEPS: PlanStep[] = ['story', 'principle', 'cmp7'];

/** A failed read is never treated as "not a member" or "no progress". */
export function JoinReadError({ onRetry, fallback }: { onRetry: () => void; fallback: string }) {
  return (
    <div className="min-h-screen px-4 pt-6 pb-16" data-testid="join-read-error">
      <div className="mx-auto max-w-2xl space-y-6">
        <FocusHeader fallback={fallback} />
        <p className="text-center text-base text-foreground">We could not load this page.</p>
        <div className="mx-auto w-full max-w-sm"><Button className="min-h-11 w-full" onClick={onRetry}>Try again</Button></div>
      </div>
    </div>
  );
}

export function JoinPart1({ groupName, parts, viewerId, onStart, fallback }: {
  groupName: string;
  parts: PrepPartRow[];
  viewerId: string | undefined;
  onStart: () => void;
  fallback: string;
}) {
  const [cards, setCards] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setCards(null);
    // A failed read arrives as an empty list, so no statements means the read failed.
    withDeadline(loadTagPoints(CMP7_TAG, viewerId), READ_DEADLINE_MS, 'statements read')
      .then((pts) => { if (cancelled) return; if (pts.length === 0) setFailed(true); else setCards(pts.length); })
      .catch(() => { forgetInFlight('tag-points:'); if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [viewerId, attempt]);

  if (failed) return <JoinReadError onRetry={() => setAttempt((n) => n + 1)} fallback={fallback} />;
  if (cards === null) return <ClarityPageLoader />;

  const counts = { cmp7: cards, stake: 0 };
  // The principle's decision is not stored, so it never shows as done here (spec: the tick and the gate agree).
  const isDone = (s: PlanStep) => (s === 'story' && isPartDone(parts, 'cognitive_video')) || (s === 'cmp7' && isPartDone(parts, 'cmp7'));
  const started = JOIN_STEPS.some(isDone);
  const minutes = minutesFor(JOIN_STEPS.filter((s) => !isDone(s)), counts, true) + TERMS_MINUTES;

  return (
    <div className="min-h-screen px-4 pt-6 pb-16" data-testid="join-part-1">
      <SEO title={`Join ${groupName}`} description={`Learn how ${groupName} works, then decide if you want to join.`} />
      <div className="mx-auto max-w-2xl space-y-6">
        <FocusHeader fallback={fallback} />
        <div className="space-y-3">
          <h1 className="text-2xl font-bold" data-testid="join-part-1-title">Join {groupName}</h1>
          <span className="inline-flex rounded-full bg-muted px-3 py-1 text-sm font-medium text-foreground" data-testid="join-minutes">
            {started ? `${minutes} min left` : `${minutes} min`}
          </span>
          <PrepWhy paragraphs={WHY_COMMUNITY} />
        </div>
        <ol data-testid="join-steps">
          {JOIN_STEPS.map((s, i) => {
            const done = isDone(s);
                        return (
              <li key={s} className="flex gap-3" data-testid={`join-step-${s}`} data-done={done ? 'true' : 'false'}>
                <div className="flex flex-col items-center">
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold', done ? 'bg-blue-500 text-white' : 'bg-muted text-foreground/70')}>
                    {done ? <Check className="h-4 w-4" aria-label="Done" /> : i + 1}
                  </span>
                  <span className="my-1 w-px flex-1 bg-border" aria-hidden="true" />
                </div>
                <div className={'flex min-w-0 flex-1 items-start justify-between gap-3 pb-6 pt-1'}>
                  <p className={cn('min-w-0 text-base font-medium leading-snug text-foreground', done && 'text-muted-foreground')}>{JOIN_LABELS[s] ?? STEP_LABELS[s]}</p>
                  <span className="shrink-0 pt-0.5 text-sm tabular-nums text-muted-foreground">{stepMinutes(s, counts, true)} min</span>
                </div>
              </li>
            );
          })}
          <li className="flex gap-3" data-testid="join-step-terms">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground/70">4</span>
            <div className="flex min-w-0 flex-1 items-start justify-between gap-3 pt-1">
              <p className="min-w-0 text-base font-medium leading-snug text-foreground">Read the group terms and decide</p>
              <span className="shrink-0 pt-0.5 text-sm tabular-nums text-muted-foreground">{TERMS_MINUTES} min</span>
            </div>
          </li>
        </ol>
        <div className="mx-auto w-full max-w-sm">
          <LetterPrimaryCta label={started ? 'Continue' : 'Start learning'} onClick={onStart} />
        </div>
      </div>
    </div>
  );
}
