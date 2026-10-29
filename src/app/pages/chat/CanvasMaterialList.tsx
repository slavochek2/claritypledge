/**
 * @file CanvasMaterialList.tsx
 * @description P1536: the rows of the tray above the composer in a canvas thread: what the owner has added to this draft.
 * A row is an icon state and a label, nothing more: a spinner while a file is being read, a green check once it was, a red
 * "!" with one short reason when it could not be, a neutral dot for a link not fetched yet and for the notes. Compact: a few
 * lines tall, scrolling inside itself when long, wrapping at 320px.
 */
import { Check, CircleAlert, Loader2 } from 'lucide-react';
import type { CanvasItemRow } from './canvas-items';

/** The one spinner of a canvas thread: the same shape and colour in the rows, the progress line and the first read. */
export const SPINNER = 'animate-spin text-gray-600';

const ICON = 'mt-[3px] h-3.5 w-3.5 shrink-0';

/** The words a screen reader gets for the icon (never drawn). */
const ICON_NAME: Record<CanvasItemRow['status'], string> = { reading: 'Reading', read: 'Done', failed: 'Problem', pending: 'Waiting' };

function StatusIcon({ status }: { status: CanvasItemRow['status'] }) {
  const name = ICON_NAME[status];
  if (status === 'reading') return <Loader2 role="img" aria-label={name} className={`${ICON} ${SPINNER}`} />;
  if (status === 'read') return <Check role="img" aria-label={name} className={`${ICON} text-green-700`} />;
  if (status === 'failed') return <CircleAlert role="img" aria-label={name} className={`${ICON} text-destructive`} />;
  return (
    <span role="img" aria-label={name} className={`${ICON} flex items-center justify-center`}>
      <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
    </span>
  );
}

export function CanvasMaterialList({ rows }: { rows: CanvasItemRow[] }) {
  if (rows.length === 0) return null;
  return (
    <ul aria-label="Added to your canvas" className="max-h-28 space-y-1 overflow-y-auto overscroll-contain pr-1" data-testid="canvas-material">
      {rows.map((r) => (
        <li key={r.key} className="flex min-w-0 items-start gap-2 text-sm leading-5 text-foreground" data-status={r.status}>
          <StatusIcon status={r.status} />
          <span className="min-w-0 break-words">
            <span className="font-medium">{r.label}</span>
            {r.status === 'failed' && <span className="text-destructive"> · couldn&apos;t read{r.reason ? `, ${r.reason}` : ''}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
