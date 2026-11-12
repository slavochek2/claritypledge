/**
 * @file CanvasSetupParts.tsx
 * @description P1529 E5: what the three surfaces show during the "Make your Clarity Canvas" part: the host's status line, the projector's
 * screen and the phone's card. Wording is a draft: [FOUNDER DECISION: copy, proposed]. Nothing here blocks the host.
 */
import { useEffect } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatClock } from '@/lib/round-clock';
import type { EventRoomSelf } from '@/app/types';
import { CanvasStepBody } from '../prep/EventCanvasCard';
import { useEventCanvasStep } from '../prep/use-event-canvas-step';
import { useMyRegistrationArrivalRead } from '../use-my-arrival';
import { CANVAS_SETUP_COPY as COPY, setupCountLine } from './canvas-setup';

/** The host's line above the button while the part runs: the time left and who has shared a canvas so far. */
export function CanvasSetupHostStatus({ leftMs, n, m }: { leftMs: number; n: number; m: number }) {
  return (
    <div className="mt-4 rounded-lg border border-border p-3 text-sm" data-testid="host-canvas-setup">
      <p className="font-medium">{COPY.title} <span className="whitespace-nowrap text-muted-foreground" data-testid="host-canvas-setup-left">{'·'} {formatClock(leftMs)} {COPY.left}</span></p>
      <p className="mt-1 text-muted-foreground" data-testid="host-canvas-setup-count">{setupCountLine(n, m)}</p>
    </div>
  );
}

/** The first read of the setup failed: the host is told, never silently sent past the part. */
export function CanvasSetupReadFailed({ onSkip }: { onSkip: () => void }) {
  return (
    <p role="alert" className="mt-4 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground" data-testid="host-canvas-setup-read-failed">
      <span>{COPY.readFailed}</span>
      <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={onSkip} data-testid="host-canvas-setup-skip">{COPY.skip}</Button>
    </p>
  );
}

/** The host's setting in Next round settings: minutes for the part, 0 skips it. */
export function CanvasSetupSetting({ seconds, onChange }: { seconds: number; onChange: (seconds: number) => void }) {
  const label = seconds === 0 ? 'Skipped' : `${seconds / 60} min`;
  return (
    <div className="flex items-center justify-between gap-3" data-testid="host-canvas-setup-setting">
      <span className="text-sm">{COPY.setting}</span>
      <div className="inline-flex items-center gap-1">
        <Button type="button" variant="outline" size="sm" className="h-11 w-11 p-0" onClick={() => onChange(Math.max(0, seconds - 60))} disabled={seconds <= 0} aria-label={`${COPY.setting}: one minute less`}>
          <Minus className="h-4 w-4" />
        </Button>
        <span className="w-16 text-center text-sm tabular-nums" data-testid="host-canvas-setup-minutes">{label}</span>
        <Button type="button" variant="outline" size="sm" className="h-11 w-11 p-0" onClick={() => onChange(Math.min(120 * 60, seconds + 60))} disabled={seconds >= 120 * 60} aria-label={`${COPY.setting}: one minute more`}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/** The projector during the part: the title, ONE countdown and one line. Readable from a distance. */
export function CanvasSetupScreen({ leftMs }: { leftMs: number }) {
  return (
    <div className="grid min-h-[80vh] place-items-center text-center" data-testid="screen-canvas-setup">
      <div>
        <h1 className="text-5xl font-semibold sm:text-7xl" data-testid="screen-part">{COPY.title}</h1>
        <p className="mt-8 text-7xl font-semibold tabular-nums sm:text-9xl" data-testid="screen-canvas-setup-clock">{formatClock(leftMs)}</p>
        <p className="mx-auto mt-8 max-w-4xl text-2xl text-foreground/80 sm:text-4xl">{COPY.screenLine}</p>
      </div>
    </div>
  );
}

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

/** The phone's card while the part runs. Observers ("help") have no canvas to make: they are asked to help the people next to them. */
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
