/**
 * P955 gate fixture parts (P1536 S6.5): the three screens of the canvas workspace's fixture that are not the page's frame, each built from the
 * REAL part the app draws: the J4 sheet (CloneDraftSheet), a mixed-material draft's thread (a mirror reply that names two groups, then the offer
 * rows, CanvasOfferRows, in a message column) and a published draft's thread read in the chat's own panel (J10: the offer rows with Start only, then
 * the closed line). The closed line's own read (CanvasClosedLine asks the database which version the draft became) is the one part not drawn
 * here: its words and its Open canvas pill come from the same constants and pill style it uses. Obviously fake data only.
 */
import { Link } from 'react-router-dom';
import { CANVAS_SECONDARY_PILL } from '@/app/components/canvas/canvas-pill-styles';
import { CloneDraftSheet } from '@/app/pages/canvas/clone-draft-sheet';
import { CanvasOfferRows } from '@/app/pages/chat/CanvasOfferRows';
import { OPEN_CANVAS_LABEL } from '@/app/pages/chat/canvas-publish-reply';
import { publishedAsLine } from '@/app/pages/chat/canvas-thread-copy';
import type { CanvasOffersRead } from '@/app/data/canvas-draft-offers';

const NOOP = () => undefined;

/** J4: another base's draft with a message is open, and the owner cloned v1. */
export function J4Sheet() {
  return (
    <CloneDraftSheet
      sheet={{ draft: { id: 'draft-id-5678', revision: 1, baseSeq: 2, version: 'canvas_dabc123', threadRootId: 'thread-root-id-1234' }, fromSeq: 1, reask: false }}
      onAdd={NOOP}
      onStartOver={NOOP}
      onClose={NOOP}
    />
  );
}

const offers = (closed: boolean): CanvasOffersRead => ({
  draftId: 'draft-id-1234', revision: 1, closed, materialExpired: false,
  offers: [
    { id: 'offer-id-1', group: 'Example agencies (fake data)', why: null, state: 'offered', startedCanvasId: null },
    { id: 'offer-id-2', group: 'Example investors (fake data)', why: null, state: 'offered', startedCanvasId: null },
  ],
});

/** The mirror's first line after a mixed pack: both groups named, the chosen one and why (fake words), then one row per other group (J8). */
export function MixedReply() {
  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 text-sm" data-testid="gate-thread">
      <p className="rounded-lg bg-muted p-2">Here are my notes on two businesses: a cafe bookkeeping service and an agency (fake data).</p>
      <p className="rounded-lg border p-2" data-testid="gate-mixed-reply">I found two businesses in this material, example cafes and example agencies. I drafted the cafes: most of the notes are about them (fake reply).</p>
      <CanvasOfferRows read={offers(false)} failed={false} onRetry={NOOP} status={null} pending={null} onSwitch={NOOP} onStart={NOOP} onDismiss={NOOP} placement="thread" />
    </div>
  );
}

/** J10: a published draft's thread in the chat's own panel: its offer rows (Start only: a closed draft has no focus switch), then the closed line. No composer. */
export function ClosedPublishedThread() {
  return (
    <div className="mx-auto flex h-[calc(100dvh-5rem)] max-w-md flex-col border-x bg-background" data-testid="gate-closed-thread">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 text-sm" data-testid="gate-thread">
        <p className="rounded-lg bg-muted p-2">Here are my notes on two businesses (fake data).</p>
        <p className="rounded-lg border p-2" data-testid="gate-publish-reply">Published v2. Your cafes canvas is live; the agencies offer is still here for 30 days (fake reply).</p>
      </div>
      <div className="shrink-0 border-t" data-testid="gate-closed-footer">
        <CanvasOfferRows read={offers(true)} failed={false} onRetry={NOOP} status={null} pending={null} onSwitch={NOOP} onStart={NOOP} onDismiss={NOOP} placement="footer" />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3" data-testid="canvas-closed-line">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">{publishedAsLine(2)}</p>
          <Link to="/p/test-owner/canvas/example_canvas?v=canvas_d222222" className={CANVAS_SECONDARY_PILL} data-testid="canvas-closed-open">{OPEN_CANVAS_LABEL}</Link>
        </div>
      </div>
    </div>
  );
}
