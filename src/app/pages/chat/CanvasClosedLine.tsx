/**
 * @file CanvasClosedLine.tsx
 * @description P1536 3c X11 / J11 / S3c.15: what takes the composer's place in a CLOSED canvas thread read in the mirror chat's own thread panel
 * (a published or discarded draft's thread, opened from its "N replies"): no composer, upload or voice, only the line that says what became of it.
 *  - published: "Published as v3." with **Open canvas** (that published version, plain: no `ws=1`);
 *  - discarded: "This draft was discarded." and no button.
 * Read through the THREAD's draft (getCanvasRootCard), never the attached version: a clone's root attaches its base.
 *
 * S5 (J10): a PUBLISHED draft's live offer rows ("Start a canvas", an Open for a started one, ×) sit above the line, so a closed panel shows them without a new surface. They are the
 * server's offers read once when the thread opens (use-canvas-offers), independent of the card read: neither waits on the other.
 */
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CANVAS_SECONDARY_PILL } from '@/app/components/canvas/canvas-pill-styles';
import { getCanvasRootCard, type CanvasVersionCardData } from '@/app/data/canvas-draft-service';
import { SectionWait } from '@/components/ui/section-wait';
import { Skeleton } from '@/components/ui/skeleton';
import { OPEN_CANVAS_LABEL } from './canvas-publish-reply';
import { DISCARDED_THREAD_LINE, publishedAsLine } from './canvas-thread-copy';
import { CanvasOffersPanel } from './CanvasOffersPanel';
import { closedOffersKey, useCanvasOffers } from './use-canvas-offers';

/** The footer: the offer rows (when there are any) then the line, under one rule; the line keeps the bottom inset. */
const FOOTER = 'shrink-0 border-t';
const LINE = 'px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]';

type Read = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; card: CanvasVersionCardData | null };

/** A published thread's number and address come from its own read, which can stall or be refused: the wait ends in a readable line with Retry (P1586's SectionWait). A discarded thread reads nothing. */
function usePublishedCard(args: { rootId: string; versionId: string; viewerId: string; enabled: boolean }): { read: Read; retry: () => void } {
  const { rootId, versionId, viewerId, enabled } = args;
  const [read, setRead] = useState<Read>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setRead({ status: 'loading' });
    getCanvasRootCard(rootId, versionId, viewerId).then(
      (card) => { if (live) setRead({ status: 'ready', card }); },
      () => { if (live) setRead({ status: 'failed' }); },
    );
    return () => { live = false; };
  }, [rootId, versionId, viewerId, enabled, attempt]);
  return { read, retry: () => setAttempt((n) => n + 1) };
}

export function CanvasClosedLine({ rootId, versionId, viewerId, draftState, canvasId, draftId }: {
  rootId: string; versionId: string; viewerId: string; draftState: 'published' | 'discarded';
  /** The thread's own canvas and draft: with them a published thread reads and draws its offer rows. Without them it draws only the line. */
  canvasId?: string; draftId?: string;
}) {
  const { pathname, search } = useLocation();
  const published = draftState === 'published';
  const { read, retry } = usePublishedCard({ rootId, versionId, viewerId, enabled: published });
  const offers = useCanvasOffers({ canvasId: published && canvasId ? canvasId : null, draftId: published && draftId ? draftId : null, key: published && draftId ? closedOffersKey(draftId) : null });
  const rows = <CanvasOffersPanel view={offers} status={null} placement="footer" />;
  if (published && read.status !== 'ready') {
    // The number is the read's: hold the place with a skeleton (no premature "Published.", never a composer) until it answers, fails or the deadline passes.
    return (
      <div className={FOOTER}>
        {rows}
        <div className={LINE} data-testid="canvas-closed-line-wait">
          <SectionWait onRetry={retry} failed={read.status === 'failed'}>
            <Skeleton className="h-10 w-2/3" />
          </SectionWait>
        </div>
      </div>
    );
  }
  const card = read.status === 'ready' ? read.card : null;
  const href = published ? card?.href ?? null : null;
  return (
    <div className={FOOTER}>
      {rows}
      <div className={`${LINE} flex flex-wrap items-center gap-x-3 gap-y-1`} data-testid="canvas-closed-line">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">{published ? publishedAsLine(card?.seq) : DISCARDED_THREAD_LINE}</p>
        {href && (
          <Link to={href} state={{ from: `${pathname}${search}` }} className={CANVAS_SECONDARY_PILL} data-testid="canvas-closed-open">{OPEN_CANVAS_LABEL}</Link>
        )}
      </div>
    </div>
  );
}
