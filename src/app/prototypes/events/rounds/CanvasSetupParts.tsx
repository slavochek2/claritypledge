/**
 * @file CanvasSetupParts.tsx
 * @description P1529 E5: what the room's Canvas tab shows: the phone's Canvas card. Wording is a draft: [FOUNDER DECISION: copy, proposed].
 */
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { EventRoomSelf } from '@/app/types';
import { CanvasStepBody } from '../prep/EventCanvasCard';
import { useEventCanvasStep } from '../prep/use-event-canvas-step';
import { useMyRegistrationArrivalRead } from '../use-my-arrival';
import { CANVAS_SETUP_COPY as COPY } from './canvas-setup';

/** An owner's card: one primary. The canvas step opens the mirror agent and Publish returns to this room (it starts from this page). */
function CanvasSetupOwner({ eventId, onShared }: { eventId: string; onShared?: (shared: boolean) => void }) {
  const step = useEventCanvasStep(eventId, { returnToPreparation: true });
  const { view, dialog } = step;
  const isShared = view?.state === 'E' || view?.state === 'F';
  // The same read the card uses tells the room's tab: sharing while staying here ticks it.
  useEffect(() => { if (view) onShared?.(isShared); }, [view, isShared, onShared]);
  if (!step.loaded) return <div className="mt-3 space-y-3" data-testid="canvas-setup-loading" aria-busy="true"><Skeleton className="h-11 w-full" /></div>;
  if (step.readFailed || !view) {
    return (
      <div role="alert" className="mt-3" data-testid="canvas-setup-error">
        <p className="text-sm text-muted-foreground">Could not load your Clarity Canvas for this event.</p>
        <Button variant="outline" size="sm" className="mt-2 min-h-11" onClick={() => void step.retry()} data-testid="canvas-setup-retry">Retry</Button>
      </div>
    );
  }
  if (view.state === 'E' || view.state === 'F') return <p className="mt-3 text-base font-medium text-green-700" data-testid="canvas-setup-shared">{COPY.shared}</p>;
  // No canvas or an open draft: the mirror agent. A published canvas not yet shared: its own share action (and the picker for several).
  const makes = view.state === 'A' || view.state === 'B';
  const primary = view.primary;
  return (
    <div className="mt-3 space-y-3">
      {!makes && <CanvasStepBody body={view.body} published={step.published} selected={step.selected} onSelect={step.setPicked} showList={view.state === 'D'} locked={step.busy} />}
      {primary && (
        <Button className="min-h-12 w-full text-base" disabled={primary.disabled} onClick={primary.run} data-testid="canvas-setup-primary">
          {makes && !primary.disabled ? COPY.open : primary.label}
        </Button>
      )}
      {dialog}
    </div>
  );
}

/** The phone's Canvas card, open from arrival. Observers ("help") have no canvas to make: they are asked to help the people next to them. */
export function CanvasSetupPhoneCard({ eventId, event, self, onShared }: { eventId: string; event: { id: string; flow?: string | null; seriesSlug?: string | null }; self: EventRoomSelf; onShared?: (shared: boolean) => void }) {
  const { arrival, failed, retry } = useMyRegistrationArrivalRead(event, self.profileId);
  const observer = arrival?.owner === false;
  // The role is known only from an answer: while it is read, a quiet line; when it could not be read, the neutral card (the title and
  // the button, no role-specific words) with a Retry, never the owner's workflow assumed.
  const loading = arrival === undefined && !failed;
  return (
    <section className="rounded-xl border border-blue-200 bg-card p-5" data-testid="canvas-setup-card" data-role={observer ? 'observer' : 'owner'}>
      <h2 className="text-xl font-semibold">{COPY.title}</h2>
      {observer
        ? <p className="mt-2 text-base" data-testid="canvas-setup-observer">{COPY.observer}</p>
        : loading ? <p className="mt-2 text-sm text-muted-foreground" data-testid="canvas-setup-loading">{COPY.loading}</p>
        : <>
            <CanvasSetupOwner eventId={eventId} onShared={onShared} />
            {failed && <Button variant="ghost" size="sm" className="mt-2 min-h-11" onClick={retry} data-testid="canvas-setup-role-retry">{COPY.retry}</Button>}
          </>}
    </section>
  );
}
