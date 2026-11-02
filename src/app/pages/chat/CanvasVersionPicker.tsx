/**
 * @file CanvasVersionPicker.tsx
 * @description P1536 3c X3: the body of the + menu's "Clone a version" dialog. Lists the owner's published canvas versions; picking one hands that version
 * back (the caller navigates to it and clones it), so a clone can begin from any version, not only the newest.
 */
import { useEffect, useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import { canvasVersionLabel, listMyCanvasVersions, type CanvasVersionOption } from '@/app/data/canvas-draft-service';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { FOCUS_RING, HOVER, InlineError } from './chat-kit';

const versionLabel = (v: Pick<CanvasVersionOption, 'seq' | 'publishedAt'>) => canvasVersionLabel(v.seq, v.publishedAt);

export function CanvasVersionPicker({ onPick }: { onPick: (version: CanvasVersionOption) => void }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ready'; items: CanvasVersionOption[] }>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    listMyCanvasVersions().then(
      (items) => live && setState({ status: 'ready', items }),
      () => live && setState({ status: 'error' }),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  if (state.status === 'loading') {
    return (
      <div role="status" aria-busy="true" aria-label="Loading your canvases" className="space-y-2 p-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    );
  }
  if (state.status === 'error') return <InlineError what="your canvases" onRetry={() => setAttempt((a) => a + 1)} />;
  const several = new Set(state.items.map((v) => v.canvasId)).size > 1;
  if (state.items.length === 0) {
    return <p className="px-3 py-8 text-center text-sm text-muted-foreground">You have no published canvas yet. Publish a draft and it shows here.</p>;
  }
  return (
    <ul className="space-y-2 p-3" data-testid="canvas-version-results">
      {state.items.map((v) => (
        <li key={v.id}>
          <button
            type="button"
            onClick={() => onPick(v)}
            aria-label={`Clone ${versionLabel(v)}`}
            className={cn('flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 text-left', HOVER, FOCUS_RING)}
          >
            <LayoutGrid className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">{versionLabel(v)}</span>
              {(several || v.hasOpenDraft) && (
                <span className="block truncate text-xs text-muted-foreground">
                  {[several ? v.canvasName : null, v.hasOpenDraft ? 'has an open draft' : null].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
