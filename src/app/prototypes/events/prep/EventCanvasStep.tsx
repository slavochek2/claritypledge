/**
 * @file EventCanvasStep.tsx
 * @description P1529 UAT round 2: preparation's step 4 (owners). One centred column: title, one line, the picker when there are several
 * canvases, then the actions directly below (no pinned bar): the ONE primary and, when there is a real alternative, a secondary drawn like
 * "Skip and proceed". States A..G live in `useEventCanvasStep`. Wording is DRAFT: [FOUNDER DECISION: copy].
 */
import { LetterPrimaryCta } from '@/app/components/letters/letter-primary-cta';
import { Skeleton } from '@/components/ui/skeleton';
import { CanvasStepBody, CanvasStepError } from './EventCanvasCard';
import { ActionRow, Title } from './prep-ui';
import { useEventCanvasStep } from './use-event-canvas-step';

export function EventCanvasStep({ eventId, onContinue, position }: { eventId: string; onContinue: () => void; /** This step's place in the plan, for the workspace banner. */ position?: { step: number; total: number } }) {
  const step = useEventCanvasStep(eventId, { returnToPreparation: true, onContinue, prepStep: position });
  const { view } = step;
  return (
    <section className="mx-auto flex min-h-[55dvh] w-full max-w-sm flex-col justify-center space-y-5" data-testid="prep-canvas-step">
      {!step.loaded && <div className="space-y-3" data-testid="event-canvas-loading" aria-busy="true"><Skeleton className="h-7 w-3/4" /><Skeleton className="h-4 w-full" /></div>}
      {step.loaded && (step.readFailed || !view) && <CanvasStepError onRetry={() => void step.retry()} />}
      {view && (
        <>
          <div className="space-y-3 text-center" data-testid="event-canvas-card" data-state={view.state}>
            <Title>{view.title}</Title>
            <CanvasStepBody body={view.body} published={step.published} selected={step.selected} onSelect={step.setPicked} showList={view.state === 'D'} locked={step.busy} />
          </div>
          {view.primary && (
            <ActionRow
              primary={<div className="w-full" data-testid="event-canvas-primary"><LetterPrimaryCta label={view.primary.label} onClick={view.primary.run} disabled={view.primary.disabled} /></div>}
              secondary={view.secondary ? <div className="w-full" data-testid="event-canvas-secondary"><LetterPrimaryCta label={view.secondary.label} onClick={view.secondary.run} disabled={view.secondary.disabled} variant="secondary" /></div> : undefined}
            />
          )}
        </>
      )}
      {step.dialog}
    </section>
  );
}
