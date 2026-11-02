/**
 * @file canvas-publish-spot.tsx
 * @description P1536 D3, 3c X4/X7: the status or Publish half of the header's one fixed spot. The box has one size in every state and in both views
 * (Canvas and Chat), shared with Share (canvas-owner-bar puts Share in the same SPOT_BOX): a filled auto-width `<button>` in the Publish state, and in
 * every other state a status in the same footprint ("Nothing to publish yet", "Updating…", "Publishing…"). Never `disabled` (design-system rule 9).
 */
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SPOT_BOX, statusText, type PublishSpotState } from './canvas-publish-spot-state';

// Two lines at most: "Nothing to publish yet" is wider than the box in one line at 12px, and the box is 44px tall.
const STATUS = 'flex w-full items-center justify-end gap-1.5 text-right text-xs font-medium leading-4 text-muted-foreground';
/** The states where something is going on (a run, a publish) show a small muted spinner: they read as work, not as a disabled button. */
const BUSY = new Set(['updating', 'publishing']);

export function CanvasPublishSpot({ state, publishing = false, onPublish }: { state: PublishSpotState; publishing?: boolean; onPublish: () => void }) {
  const text = statusText(state, publishing);
  return (
    <div className={SPOT_BOX} data-testid="publish-spot" data-state={publishing ? 'publishing' : state.kind} aria-busy={state.kind === 'loading'}>
      {state.kind === 'loading' ? (
        // P1586: a part that is still being read waits as a Skeleton in its own footprint.
        <Skeleton className="h-4 w-20" />
      ) : text === null ? (
        <Button type="button" className="h-11 px-4" onClick={onPublish} data-testid="canvas-draft-publish">
          Publish
        </Button>
      ) : (
        <p role="status" className={STATUS} data-testid="publish-spot-status">
          {BUSY.has(publishing ? 'publishing' : state.kind) && <Loader2 aria-hidden className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" data-testid="publish-spot-spinner" />}
          <span className="line-clamp-2">{text}</span>
        </p>
      )}
    </div>
  );
}
