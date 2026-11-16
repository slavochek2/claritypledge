/**
 * @file NextVersionChanges.tsx
 * @description P1686: the room card's `ready` face. The draft's changes, box by box, then Publish (one tap) and Open full draft. Publish is drawn
 * only under a list that is on screen and has changes: never while reading, after a failed read, or with no changes (never publish blind,
 * decisions.md 2026-11-13 [product]). Open full draft is the workspace (canvas and mirror chat); its Publish returns to the room.
 */
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CHANGES_COPY } from './next-version-changes';
import type { NextVersionChanges as Changes } from './use-next-version-changes';

const PRIMARY = 'min-h-12 px-8 text-base';
const SECONDARY = 'min-h-11 px-6';

export function NextVersionChanges({ changes, fullHref, fullState }: { changes: Changes; fullHref: string | null; fullState: unknown }) {
  const { view, note, publishing, publish, reload } = changes;
  const openFull = fullHref && (
    <Button asChild variant="outline" className={SECONDARY}>
      <Link to={fullHref} state={fullState} data-testid="next-version-open-full">{CHANGES_COPY.openFull}</Link>
    </Button>
  );
  return (
    <div data-testid="next-version-changes" data-phase={view.phase} data-reason={view.phase === 'failed' ? view.reason : undefined}>
      {view.phase === 'published' && <p className="text-sm text-muted-foreground" role="status" data-testid="next-version-published">{CHANGES_COPY.publishing}</p>}
      {view.phase === 'loading' && (
        <div role="status" data-testid="next-version-loading">
          <Skeleton className="h-4 w-2/3" />
          <p className="mt-2 text-sm text-muted-foreground">{CHANGES_COPY.loading}</p>
        </div>
      )}
      {view.phase === 'failed' && (
        <>
          <p className="text-sm" data-testid="next-version-unreadable">{CHANGES_COPY.unreadable}</p>
          <div className="mt-3 flex flex-col items-center gap-2">
            <Button type="button" variant="outline" className={SECONDARY} onClick={reload} data-testid="next-version-retry">{CHANGES_COPY.retry}</Button>
            {openFull}
          </div>
        </>
      )}
      {view.phase === 'ready' && view.changes.length === 0 && (
        <>
          <p className="text-sm" data-testid="next-version-none">{CHANGES_COPY.none}</p>
          <div className="mt-3 flex flex-col items-center">{openFull}</div>
        </>
      )}
      {view.phase === 'ready' && view.changes.length > 0 && (
        <>
          <h3 className="text-base font-semibold" data-testid="next-version-heading">{CHANGES_COPY.heading}</h3>
          <ul className="mt-2 space-y-3" data-testid="next-version-list">
            {view.changes.map(box => (
              <li key={box.tag} data-testid="next-version-box" data-box={box.tag}>
                <p className="text-sm font-medium">{box.title}</p>
                {box.sameWords && <p className="mt-1 text-sm text-muted-foreground" data-testid="next-version-same-words">{CHANGES_COPY.sameWords}</p>}
                <ul className="mt-1 space-y-1 text-sm">
                  {box.added.map((t, i) => (
                    <li key={`a${i}`} className="break-words" data-testid="next-version-added">
                      <span className="mr-1.5 text-xs font-medium uppercase tracking-wide text-foreground">{CHANGES_COPY.added}</span>{t}
                    </li>
                  ))}
                  {box.removed.map((t, i) => (
                    <li key={`r${i}`} className="break-words text-muted-foreground" data-testid="next-version-removed">
                      <span className="mr-1.5 text-xs font-medium uppercase tracking-wide">{CHANGES_COPY.removed}</span><s>{t}</s>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col items-center gap-2">
            {publish && (
              <Button type="button" className={PRIMARY} onClick={publish} disabled={publishing} aria-busy={publishing} data-testid="next-version-publish">
                {publishing ? CHANGES_COPY.publishing : CHANGES_COPY.publish}
              </Button>
            )}
            {openFull}
          </div>
        </>
      )}
      {note && <p className="mt-2 text-sm text-muted-foreground" role="status" data-testid="next-version-note">{note}</p>}
    </div>
  );
}
