/**
 * @file canvas-publish-spot.tsx
 * @description P1536 D3: Publish's one fixed spot in the workspace's sticky bar. The box has one size in every state and in both
 * views (Canvas and Chat): a filled `<button>` in the Publish state, and in every other state a status in the same footprint.
 * Never `disabled`: when Publish cannot run, a status takes its place (design-system rule 9).
 */
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SPOT_BOX, statusText, type PublishSpotState } from './canvas-publish-spot-state';

const STATUS = 'flex w-full items-center justify-end gap-1.5 text-right text-xs font-medium text-muted-foreground';
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
        <Button type="button" className="h-11 w-full px-2" onClick={onPublish} data-testid="canvas-draft-publish">
          Publish
        </Button>
      ) : (
        <p role="status" className={STATUS} data-testid="publish-spot-status">
          {BUSY.has(publishing ? 'publishing' : state.kind) && <Loader2 aria-hidden className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" data-testid="publish-spot-spinner" />}
          <span className="truncate">{text}</span>
        </p>
      )}
    </div>
  );
}
