/**
 * @file use-canvas-offer-actions.ts
 * @description P1536 S5 (J7 to J10, client): the three things the owner does with an offer row.
 *  - Make it about this: `canvas_draft_switch_focus`, then its `focus` run is started; the thread re-reads so the update shows at once.
 *  - Start a canvas: `canvas_draft_fork`, its first run is started, and the owner lands in the NEW canvas's workspace. A second tap, or the Open of a started row, is the same call:
 *    the server answers the canvas that already exists (a started offer never forks twice).
 *  - the small ×: `canvas_draft_offer_dismiss`.
 * Every call passes the revision the offers were read at. A refusal changes nothing, is said once (a toast, the way Undo says it) and the rows are read again; a stale answer never
 * decides navigation (the owner only lands anywhere on a success the server just gave). One action at a time (`pending`), and a lost answer retries under the SAME client id.
 */
import { useCallback, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CanvasDraftRefusal } from '@/app/data/canvas-draft-calls';
import { dismissCanvasOffer, forkCanvasFromOffer, switchCanvasFocus, type CanvasOffersRead } from '@/app/data/canvas-draft-offers';
import { canvasStartErrorText } from './canvas-start';
import { canvasPageHref, workspaceHref } from './canvas-links';
import { registerCanvasThread } from './canvas-thread-registry';
import { DRAFT_ERROR_TEXT } from './canvas-thread-copy';
import { offerRefusedText } from './canvas-offer-copy';
import { useChat } from './chat-state';
import { createUnresolvedClientIds } from './unresolved-client-ids';

/** The client id of each switch or start whose outcome is not known (a lost response): the retry replays instead of making a second run or canvas. */
const unresolved = createUnresolvedClientIds();

export type OfferAction = 'switch' | 'start' | 'dismiss';
export interface PendingOffer { id: string; action: OfferAction }

export interface CanvasOfferActions {
  pending: PendingOffer | null;
  switchTo: (offerId: string) => void;
  start: (offerId: string) => void;
  dismiss: (offerId: string) => void;
}

export function useCanvasOfferActions(a: {
  read: CanvasOffersRead | null;
  /** Read the offers again after a write. */
  reread: () => void;
  /** An open draft's thread: re-read it so a run this made shows at once (the closed thread has none). */
  reload?: () => Promise<void>;
}): CanvasOfferActions {
  const { read, reread, reload } = a;
  const chat = useChat();
  const navigate = useNavigate();
  const location = useLocation();
  const [pending, setPending] = useState<PendingOffer | null>(null);
  const busy = useRef(false);
  const slug = chat.authors[chat.userId]?.slug ?? null;
  const here = `${location.pathname}${location.search}`;

  /** Runs one action: one at a time, never a throw out of the click, a refusal said and the rows read again. */
  const run = useCallback(async (offerId: string, action: OfferAction, call: (r: CanvasOffersRead) => Promise<{ refused: string | null; leave?: () => void }>) => {
    if (busy.current || !read) return;
    busy.current = true;
    setPending({ id: offerId, action });
    let left = false;
    try {
      const r = await call(read);
      if (r.refused) {
        const text = offerRefusedText(r.refused);
        if (text) toast.error(text);
      } else if (r.leave) {
        r.leave(); // only a success the server just gave takes the owner anywhere
        left = true;
      }
    } catch (e) {
      toast.error(e instanceof CanvasDraftRefusal ? canvasStartErrorText(e) : DRAFT_ERROR_TEXT.FAILED);
    } finally {
      busy.current = false;
      setPending(null);
      if (!left) {
        reread(); // a refusal means the screen is behind; a success changed the offers
        await reload?.().catch(() => undefined);
      }
    }
  }, [read, reread, reload]);

  const switchTo = useCallback((offerId: string) => void run(offerId, 'switch', async (r) => {
    const key = `${r.draftId}|focus|${offerId}`;
    const res = await switchCanvasFocus({ draftId: r.draftId, offerId, expectedRevision: r.revision, clientId: unresolved.idFor(key) });
    unresolved.settle(key); // an answer, a refusal included: the next switch is a new one
    if (!res.ok) return { refused: res.refused };
    if (res.start && !res.start.ok && DRAFT_ERROR_TEXT[res.start.code]) toast.error(DRAFT_ERROR_TEXT[res.start.code]); // the run is made; the thread's own restart tries again
    return { refused: null };
  }), [run]);

  const start = useCallback((offerId: string) => void run(offerId, 'start', async (r) => {
    const key = `${r.draftId}|fork|${offerId}`;
    const res = await forkCanvasFromOffer({ draftId: r.draftId, offerId, expectedRevision: r.revision, clientId: unresolved.idFor(key) });
    unresolved.settle(key);
    if (!res.ok) return { refused: res.refused };
    if (res.threadRootId) registerCanvasThread(res.threadRootId); // the mirror stays silent in the new canvas's thread
    return {
      refused: null,
      leave: () => {
        if (!slug || !res.canvasName) throw new Error('canvas offer: no address for the started canvas');
        // The canvas that was started: its open draft's workspace, or (its draft is closed) the canvas page. `from`: ← goes back to where the owner tapped.
        const href = res.draftId && res.versionName ? workspaceHref(slug, res.canvasName, res.versionName) : canvasPageHref(slug, res.canvasName);
        if (!href) throw new Error('canvas offer: no address for the started canvas');
        navigate(href, { state: { from: here } });
      },
    };
  }), [run, slug, navigate, here]);

  const dismiss = useCallback((offerId: string) => void run(offerId, 'dismiss', async (r) => {
    const res = await dismissCanvasOffer({ draftId: r.draftId, offerId, expectedRevision: r.revision });
    return { refused: res.ok ? null : res.refused };
  }), [run]);

  return { pending, switchTo, start, dismiss };
}
