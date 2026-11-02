/**
 * @file CanvasClosedLine.tsx
 * @description P1536 3c X11 / J11 / S3c.15: what takes the composer's place in a CLOSED canvas thread read in the mirror chat's own thread panel
 * (a published or discarded draft's thread, opened from its "N replies"): no composer, upload or voice, only the line that says what became of it.
 *  - published: "Published as v3." with **Open canvas** (that published version, plain: no `ws=1`);
 *  - discarded: "This draft was discarded." and no button.
 * Read through the THREAD's draft (getCanvasRootCard), never the attached version: a clone's root attaches its base.
 *
 * SEAM for step 8 (S5, J10 offer rows): a closed thread's live offer rows ("Start an agencies canvas") belong in this component, above the line, so a
 * closed panel shows them without a new surface. Nothing is drawn for them here, because their server reads are not built yet.
 */
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CANVAS_SECONDARY_PILL } from '@/app/components/canvas/canvas-pill-styles';
import { getCanvasRootCard, type CanvasVersionCardData } from '@/app/data/canvas-draft-service';
import { OPEN_CANVAS_LABEL } from './canvas-publish-reply';
import { DISCARDED_THREAD_LINE, publishedAsLine } from './canvas-thread-copy';

type Read = { status: 'loading' } | { status: 'ready'; card: CanvasVersionCardData | null };

export function CanvasClosedLine({ rootId, versionId, viewerId, draftState }: { rootId: string; versionId: string; viewerId: string; draftState: 'published' | 'discarded' }) {
  const { pathname, search } = useLocation();
  const [read, setRead] = useState<Read>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    getCanvasRootCard(rootId, versionId, viewerId).then(
      (card) => { if (live) setRead({ status: 'ready', card }); },
      () => { if (live) setRead({ status: 'ready', card: null }); }, // an unread card still says what became of the thread
    );
    return () => { live = false; };
  }, [rootId, versionId, viewerId, draftState]);
  const card = read.status === 'ready' ? read.card : null;
  const published = draftState === 'published';
  // A published line names its number, which the thread's read gives: hold the place (no composer, no flash of "Published.") until it has answered.
  if (published && read.status === 'loading') return <div className="min-h-[4.25rem] shrink-0 border-t" aria-hidden="true" data-testid="canvas-closed-line-loading" />;
  const href = published ? card?.href ?? null : null;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" data-testid="canvas-closed-line">
      <p className="min-w-0 flex-1 text-sm text-muted-foreground">{published ? publishedAsLine(card?.seq) : DISCARDED_THREAD_LINE}</p>
      {href && (
        <Link to={href} state={{ from: `${pathname}${search}` }} className={CANVAS_SECONDARY_PILL} data-testid="canvas-closed-open">{OPEN_CANVAS_LABEL}</Link>
      )}
    </div>
  );
}
