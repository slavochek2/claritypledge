/**
 * @file EventCanvasStep.tsx
 * @description P1529 UAT round 2: preparation's step 4 (owners). One title, one line, and the ONE primary in the bottom bar (never mid-card),
 * with a quiet secondary under it. States A..F live in `useEventCanvasStep`. Wording is DRAFT: [FOUNDER DECISION: copy].
 */
import type { Ref } from 'react';
import { LetterPrimaryCta } from '@/app/components/letters/letter-primary-cta';
import { Skeleton } from '@/components/ui/skeleton';
import { CanvasStepBody, CanvasStepError } from './EventCanvasCard';
import { ActionRow, StepActions, Title } from './prep-ui';
import { useEventCanvasStep } from './use-event-canvas-step';

export function EventCanvasStep({ eventId, barRef, onContinue, onSkip }: {
  eventId: string; barRef: Ref<HTMLDivElement>; onContinue: () => void; onSkip: () => void;
}) {
  const step = useEventCanvasStep(eventId, { returnToPreparation: true, onContinue, onSkip });
  const { view } = step;
  return (
    <section className="space-y-5" data-testid="prep-canvas-step">
      {!step.loaded && <div className="space-y-3" data-testid="event-canvas-loading" aria-busy="true"><Skeleton className="h-7 w-3/4" /><Skeleton className="h-4 w-full" /></div>}
      {step.loaded && (step.readFailed || !view) && <CanvasStepError onRetry={() => void step.retry()} />}
      {view && (
        <div className="space-y-3" data-testid="event-canvas-card" data-state={view.state}>
          <Title>{view.title}</Title>
          <CanvasStepBody body={view.body} published={step.published} selected={step.selected} onSelect={step.setPicked} showList={view.state === 'D'} locked={step.busy} />
        </div>
      )}
      <StepActions ref={barRef}>
        {view?.primary && (
          <ActionRow
            primary={<div className="w-full" data-testid="event-canvas-primary"><LetterPrimaryCta label={view.primary.label} onClick={view.primary.run} disabled={view.primary.disabled} /></div>}
            secondary={view.secondary || view.quiet ? <>
              {view.secondary && <div className="w-full" data-testid="event-canvas-secondary"><LetterPrimaryCta label={view.secondary.label} onClick={view.secondary.run} disabled={view.secondary.disabled} variant="outline" /></div>}
              {view.quiet && <div className="w-full" data-testid="event-canvas-quiet"><LetterPrimaryCta label={view.quiet.label} onClick={view.quiet.run} disabled={view.quiet.disabled} variant="secondary" /></div>}
            </> : undefined}
          />
        )}
      </StepActions>
      {step.dialog}
    </section>
  );
}
