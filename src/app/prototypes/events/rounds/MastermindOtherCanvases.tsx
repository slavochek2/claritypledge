/**
 * @file MastermindOtherCanvases.tsx
 * @description P1529: the backup under the waiting state: the Clarity Canvases shared with the event, as one collapsed line
 * ("Clarity Canvases at this event") that opens to a native select and, once one is chosen, one Open. Nothing is read until it is
 * opened, and every opening reads afresh (the list is its own component, mounted per opening, so a failure is never carried over) (the same read behind EventSharedCanvases), so a person waiting for a round sees the state, then their task, and
 * only then this. Opening a canvas here is never recorded as evidence (that is the table's assigned canvas only).
 * Wording is a draft: [FOUNDER DECISION: copy, proposed].
 */
import { Skeleton } from '@/components/ui/skeleton';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { canvasPageHref } from '@/app/pages/chat/canvas-links';
import { tableLinkState } from '@/lib/canvas-hrefs';
import { shortName } from './use-event-rounds';
import { useEventCanvasChoices } from './use-mastermind-round';
import { MISSING_NAME } from './mastermind-round-helpers';

/** Every canvas shared with the event, the viewer's own included (like the round card's selector, which lets you open your own), hence not "Other". */
export function MastermindOtherCanvases({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="px-1" data-testid="mastermind-other-canvases">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm text-muted-foreground"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        data-testid="mastermind-other-canvases-toggle"
      >
        Clarity Canvases at this event
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && <CanvasPicker eventId={eventId} />}
    </section>
  );
}

function CanvasPicker({ eventId }: { eventId: string }) {
  const { pathname } = useLocation();
  const [ownerId, setOwnerId] = useState('');
  const { list, failed, loaded } = useEventCanvasChoices(eventId, true, null);
  const chosen = list.find(c => c.ownerId === ownerId) ?? null;
  if (!loaded) return <div className="pb-2" aria-busy="true" data-testid="mastermind-other-canvases-loading"><Skeleton className="h-11 w-full" /></div>;
  if (failed) return <p className="pb-2 text-sm text-muted-foreground" role="status" data-testid="mastermind-other-canvases-failed">Could not load the Clarity Canvases. Close this and open it again.</p>;
  if (list.length === 0) return <p className="pb-2 text-sm text-muted-foreground" data-testid="mastermind-other-canvases-empty">No Clarity Canvas is shared with this event yet.</p>;
  return (
    <div className="pb-2">
      <select
        aria-label="Clarity Canvas to open"
        className="min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-base"
        value={ownerId}
        onChange={e => setOwnerId(e.target.value)}
        data-testid="mastermind-other-canvases-select"
      >
        <option value="">Choose a Clarity Canvas</option>
        {list.map(c => (
          <option key={c.ownerId} value={c.ownerId}>{shortName(c.ownerName) || MISSING_NAME}&rsquo;s Clarity Canvas</option>
        ))}
      </select>
      {chosen && (
        <Button asChild className="mt-2 min-h-12 w-full text-base">
          <Link to={canvasPageHref(chosen.ownerSlug ?? chosen.ownerId, chosen.name)} state={tableLinkState(pathname, eventId)} data-testid="mastermind-other-canvases-open">Open the canvas</Link>
        </Button>
      )}
    </div>
  );
}
