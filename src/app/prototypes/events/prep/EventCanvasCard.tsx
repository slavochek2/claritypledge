/**
 * @file EventCanvasCard.tsx
 * @description P1529 §2 (D9, D17): the canvas for this event, in the live room (no bottom bar there, so the primary stays inline).
 * The state and copy come from `useEventCanvasStep`, which preparation's step 4 (EventCanvasStep) draws as a centred column.
 * A shared canvas is only named here (no Change); a first canvas can still arrive later. Nothing is shared in the background.
 * Wording is DRAFT: [FOUNDER DECISION: copy].
 */
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useEventCanvasStep, type PublishedCanvas, type StepAction } from './use-event-canvas-step';

/** One line of body copy, and for several published canvases a radio list (newest first, newest preselected). */
export function CanvasStepBody({ body, published, selected, onSelect, showList, locked = false }: {
  body: React.ReactNode; published: PublishedCanvas[]; selected: string | null; onSelect: (name: string) => void; showList: boolean;
  /** An action is in flight: the pick cannot change under it. */
  locked?: boolean;
}) {
  return (
    <>
      <p className="text-sm text-muted-foreground" data-testid="event-canvas-body">{body}</p>
      {showList && (
        <fieldset className="space-y-1" data-testid="event-canvas-picker">
          <legend className="sr-only">Clarity Canvas to share</legend>
          {published.map(c => (
            <label key={c.name} className="flex min-h-11 cursor-pointer items-center gap-3 text-left text-sm">
              <input type="radio" name="event-canvas" className="h-4 w-4" disabled={locked} checked={selected === c.name} onChange={() => onSelect(c.name)} data-testid="event-canvas-option" />
              <span className="min-w-0 flex-1 break-words">{c.label}</span>
            </label>
          ))}
        </fieldset>
      )}
    </>
  );
}

/** Read failure: an error with Retry, never "no canvas yet" and never a dead primary. */
export function CanvasStepError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" data-testid="event-canvas-error">
      <p className="text-sm text-muted-foreground">Could not load your Clarity Canvas for this event.</p>
      <Button variant="outline" size="sm" className="mt-2 min-h-11" onClick={onRetry} data-testid="event-canvas-retry">Retry</Button>
    </div>
  );
}

/** The test id names the action, never the slot it sits in. */
const TEST_IDS: Record<string, string> = {
  share: 'event-canvas-share', 'share-again': 'event-canvas-share-again', create: 'event-canvas-make', make: 'event-canvas-make',
  'continue-draft': 'event-canvas-continue-draft', continue: 'event-canvas-continue',
};
const testIdOf = (a: StepAction) => TEST_IDS[a.id] ?? `event-canvas-${a.id}`;

export function EventCanvasCard({ eventId }: { eventId: string }) {
  const step = useEventCanvasStep(eventId, {});
  const { view, dialog } = step;
  if (!step.loaded) return <section className="w-full space-y-3 rounded-lg border border-border p-4" data-testid="event-canvas-loading" aria-busy="true"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-full" /></section>;
  if (step.readFailed || !view) {
    return <section className="w-full rounded-lg border border-border p-4 text-left"><CanvasStepError onRetry={() => void step.retry()} /></section>;
  }
  const shared = view.state === 'E' || view.state === 'F';
  return (
    <section className="w-full rounded-lg border border-border p-4 text-left" data-testid="event-canvas-card">
      {shared ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span data-testid="event-canvas-chosen">Your Clarity Canvas for this event: <strong>{step.sharedLabel}</strong></span>
          {view.state === 'F' && <p className="w-full text-muted-foreground" data-testid="event-canvas-ready">{view.body}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-medium">{view.title}</h2>
          <CanvasStepBody body={view.body} published={step.published} selected={step.selected} onSelect={step.setPicked} showList={view.state === 'D'} locked={step.busy} />
          <div className="flex flex-wrap items-center gap-3">
            {view.primary && (
              <Button size="sm" className="min-h-11" disabled={view.primary.disabled} onClick={view.primary.run} data-testid={testIdOf(view.primary)}>
                {view.primary.label}
              </Button>
            )}
            {view.secondary && (
              <Button variant="outline" size="sm" className="min-h-11" disabled={view.secondary.disabled} onClick={view.secondary.run} data-testid={testIdOf(view.secondary)}>{view.secondary.label}</Button>
            )}
          </div>
        </div>
      )}
      {dialog}
    </section>
  );
}
