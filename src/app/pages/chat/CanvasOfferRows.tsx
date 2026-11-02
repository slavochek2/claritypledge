/**
 * @file CanvasOfferRows.tsx
 * @description P1536 S5 (D10, J7 to J10): the offer rows of a mixed-material draft's thread, drawn from the server's offers (never from message text).
 *   `<Group>  [Make it about this] [Start a canvas]  ×`
 *  - an OPEN draft shows both buttons (the focus switch is a run of the open draft); a CLOSED draft's thread (J10) shows only Start;
 *  - a started offer reads "<Group> canvas started" with Open (the same call a second tap makes: it opens the canvas that exists);
 *  - after the kept material expired the buttons of an open offer are replaced by "Send the material again to start this canvas." (the × stays);
 *  - while an update runs (or another of the owner's canvases updates), or while the row's own action is out, a STATUS takes the buttons' place: never a disabled button (D15);
 *  - buttons are the canvas page's one secondary pill (never filled: the send slot is the only main action here), the × is ghost, 44px.
 * `focused` and `dismissed` offers draw nothing.
 */
import { X } from 'lucide-react';
import { CANVAS_CANCEL_TEXT, CANVAS_SECONDARY_PILL } from '@/app/components/canvas/canvas-pill-styles';
import type { CanvasOffer, CanvasOffersRead } from '@/app/data/canvas-draft-offers';
import {
  OFFER_ELSEWHERE_LABEL, OFFER_EXPIRED_LINE, OFFER_LOAD_FAILED_TEXT, OFFER_MAKE_LABEL, OFFER_OPEN_LABEL, OFFER_RETRY_LABEL, OFFER_STARTING_LABEL, OFFER_START_LABEL,
  OFFER_SWITCHING_LABEL, OFFER_UPDATING_LABEL, offerDismissLabel, offerStartedLine,
} from './canvas-offer-copy';
import type { PendingOffer } from './use-canvas-offer-actions';
import { liveOffers } from './use-canvas-offers';

/** Why the row's controls give way to a status (null: they show). */
export type OfferRowsStatus = 'updating' | 'elsewhere' | null;

export interface CanvasOfferRowsProps {
  read: CanvasOffersRead | null;
  /** The read failed (or stalled past its deadline): said, with Try again. */
  failed: boolean;
  onRetry: () => void;
  status: OfferRowsStatus;
  pending: PendingOffer | null;
  onSwitch: (offerId: string) => void;
  onStart: (offerId: string) => void;
  onDismiss: (offerId: string) => void;
  /** Where the rows sit: a message column in a thread (indented under the words) or a footer. */
  placement: 'thread' | 'footer';
}

/** A message row's text starts 62px in (its margin and padding, the avatar column and the gap): the rows line up under the words, not under the avatar. */
const PLACE: Record<CanvasOfferRowsProps['placement'], string> = { thread: 'pl-[62px] pr-4 py-1', footer: 'px-4 py-1' };

function Status({ children }: { children: string }) {
  return <p role="status" className="flex h-10 items-center text-sm text-muted-foreground" data-testid="canvas-offer-status">{children}</p>;
}

function Controls(p: CanvasOfferRowsProps & { offer: CanvasOffer }) {
  const { offer, read, status, pending } = p;
  const mine = pending?.id === offer.id ? pending.action : null;
  if (offer.state === 'started') {
    return <button type="button" className={CANVAS_SECONDARY_PILL} data-testid="canvas-offer-open" onClick={() => p.onStart(offer.id)}>{mine === 'start' ? OFFER_STARTING_LABEL : OFFER_OPEN_LABEL}</button>;
  }
  if (read?.materialExpired) return <p className="text-sm text-muted-foreground" data-testid="canvas-offer-expired">{OFFER_EXPIRED_LINE}</p>;
  if (mine === 'switch') return <Status>{OFFER_SWITCHING_LABEL}</Status>;
  if (mine === 'start') return <Status>{OFFER_STARTING_LABEL}</Status>;
  if (status === 'updating') return <Status>{OFFER_UPDATING_LABEL}</Status>;
  if (status === 'elsewhere') return <Status>{OFFER_ELSEWHERE_LABEL}</Status>;
  return (
    <>
      {!read?.closed && <button type="button" className={CANVAS_SECONDARY_PILL} data-testid="canvas-offer-switch" onClick={() => p.onSwitch(offer.id)}>{OFFER_MAKE_LABEL}</button>}
      <button type="button" className={CANVAS_SECONDARY_PILL} data-testid="canvas-offer-start" onClick={() => p.onStart(offer.id)}>{OFFER_START_LABEL}</button>
    </>
  );
}

/** Nothing at all when there is nothing to say: no rows and no failed read. */
export function CanvasOfferRows(p: CanvasOfferRowsProps) {
  const offers = liveOffers(p.read);
  if (!offers.length && !p.failed) return null;
  return (
    <div className={PLACE[p.placement]} data-testid="canvas-offers">
      {p.failed && (
        <div className="flex flex-wrap items-center gap-x-1" data-testid="canvas-offers-failed">
          <p role="status" className="text-sm text-muted-foreground">{OFFER_LOAD_FAILED_TEXT}</p>
          <button type="button" className={CANVAS_CANCEL_TEXT} data-testid="canvas-offers-retry" onClick={p.onRetry}>{OFFER_RETRY_LABEL}</button>
        </div>
      )}
      <ul className="m-0 list-none p-0">
        {offers.map((o) => (
          <li key={o.id} className="flex flex-col gap-1 py-2" data-testid="canvas-offer-row" data-offer-state={o.state}>
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 break-words text-sm font-medium text-foreground" data-testid="canvas-offer-group">{o.state === 'started' ? offerStartedLine(o.group) : o.group}</span>
              {o.state === 'offered' && !p.pending && !p.status && (
                <button type="button" className={`${CANVAS_CANCEL_TEXT} -my-2 w-11 px-0`} aria-label={offerDismissLabel(o.group)} data-testid="canvas-offer-dismiss" onClick={() => p.onDismiss(o.id)}>
                  <X className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Controls {...p} offer={o} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
