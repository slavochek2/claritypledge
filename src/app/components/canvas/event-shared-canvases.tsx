/**
 * @file event-shared-canvases.tsx
 * @description P1515: on an event page, the canvases their owners shared with this event — owner
 * name and canvas name, each a link to the canvas. Only people the event admits are told anything:
 * the server returns an empty list to everyone else (not registered, registered too late, removed,
 * signed out), and this renders nothing for an empty list, so there is no hint that a canvas exists.
 * A failed read renders nothing too: it is a convenience, never an error on the event page.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { canvasService, type SharedCanvasRef } from '@/app/data/canvas-service';
import { canvasPath } from '@/lib/canvas-boxes';

export function EventSharedCanvases({ eventId, enabled }: {
  eventId: string;
  /** signed in and registered or hosting; anyone else is not asked */
  enabled: boolean;
}) {
  const [canvases, setCanvases] = useState<SharedCanvasRef[]>([]);

  useEffect(() => {
    if (!enabled) { setCanvases([]); return; }
    let live = true;
    canvasService.listSharedWithEvent(eventId)
      .then(list => { if (live) setCanvases(list); })
      .catch(() => { if (live) setCanvases([]); });
    return () => { live = false; };
  }, [eventId, enabled]);

  if (canvases.length === 0) return null;
  return (
    <section aria-labelledby="event-shared-canvases-title" className="mb-6" data-testid="event-shared-canvases">
      <h2 id="event-shared-canvases-title" className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Users aria-hidden className="h-4 w-4 text-blue-600" />
        Canvases shared with this event
      </h2>
      <ul className="flex flex-col gap-2">
        {canvases.map(c => (
          <li key={`${c.ownerId}:${c.name}`}>
            <Link
              to={canvasPath(c.ownerSlug ?? c.ownerId, c.name)}
              className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:border-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              data-testid="event-shared-canvas-link"
            >
              <span className="min-w-0 truncate">
                <span className="font-medium text-foreground">{c.ownerName}</span>
                <span className="text-muted-foreground"> · {c.name}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
