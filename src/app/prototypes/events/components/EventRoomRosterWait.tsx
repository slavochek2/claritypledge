/**
 * @file EventRoomRosterWait.tsx
 * @description P1586 §4: what the room roster card shows while it has no rows. The card is
 * already drawn, so this is the section look (skeleton rows), never the page loader.
 *
 * P1114: the roster never shows an error state or an empty wall. A failed first read is a quiet
 * readable line, with the next poll as the retry; a loaded-but-empty roster is a readable line too.
 */
import { Skeleton } from '@/components/ui/skeleton';
import type { RosterStatus } from '@/app/data/event-room-service';

const SKELETON_ROWS = 3;

export function RosterWait({ status }: { status: RosterStatus }) {
  if (status === 'pending') {
    return (
      <div
        data-testid="room-roster-skeleton"
        role="status"
        aria-label="Loading who is here"
        className="space-y-4"
      >
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 flex-shrink-0 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
    );
  }
  if (status === 'failed') {
    return (
      // [FOUNDER DECISION: room roster unavailable copy is a placeholder.]
      <p data-testid="room-roster-unavailable" className="text-sm text-muted-foreground">
        Who is here will show in a moment.
      </p>
    );
  }
  return (
    // [FOUNDER DECISION: room roster empty copy is a placeholder.]
    <p data-testid="room-roster-empty" className="text-sm text-muted-foreground">
      No one is here yet.
    </p>
  );
}
