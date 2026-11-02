/**
 * @file canvas-draft-offers.ts
 * @description P1536 S5 (D10, D16, J7 to J10): the offers of a mixed-material draft, and the three things the owner does with one.
 *  - `readCanvasOffers`: the offers of ONE draft (the open draft, or a closed one by its id) out of the owner's single state read (`get_canvas_draft_state`). An offer is a durable
 *    relation the server keeps, never message text; the revision it is read at is what a later action passes.
 *  - `switchCanvasFocus` ("Make it about this"): one `focus` run. The run it returns is started (its id is invoked).
 *  - `forkCanvasFromOffer` ("Start a canvas"): a new canvas, draft and thread, and a queued first run, started here. A second tap of a started offer returns the canvas that
 *    already exists and starts nothing (idempotent per offer, on the server).
 *  - `dismissCanvasOffer` (the small ×).
 * Refusals about the state of things (busy, busy_elsewhere, cap_reached, stale_view, not_offered, expired) are typed results, never throws; an authorization failure throws, and so
 * does "too many open drafts" (`CanvasDraftRefusal`, the one the person can act on).
 */
import { supabase } from '@/lib/supabase';
import { clearListReturnCache } from '@/lib/list-return-cache';
import { failRpc, refusalOf, startCanvasRun, staleToEvent, type CanvasRefused, type RunStart, type Row } from './canvas-draft-calls';
import { readCanvasDraftState } from './canvas-draft-state-read';

export type CanvasOfferState = 'offered' | 'focused' | 'started' | 'dismissed';

export interface CanvasOffer {
  id: string;
  /** The other group the material is about, names-filtered by the server. */
  group: string;
  why: string | null;
  state: CanvasOfferState;
  /** The canvas a `started` offer began. */
  startedCanvasId: string | null;
}

export interface CanvasOffersRead {
  draftId: string;
  /** The revision these offers were read at: what an action on one of them passes. */
  revision: number;
  closed: boolean;
  /** A closed draft's kept material has passed its time while an offer is still open: Start is replaced by "Send the material again". */
  materialExpired: boolean;
  /** An open draft only: another of the owner's canvases is updating (one active run per owner). */
  activeElsewhere: boolean;
  offers: CanvasOffer[];
}

const STATES: ReadonlySet<string> = new Set(['offered', 'focused', 'started', 'dismissed']);

function mapOffer(r: Row): CanvasOffer {
  return {
    id: String(r.id), group: String(r.group_label ?? ''), why: typeof r.why === 'string' && r.why ? r.why : null,
    state: STATES.has(String(r.state)) ? (r.state as CanvasOfferState) : 'dismissed', startedCanvasId: typeof r.started_canvas_id === 'string' ? r.started_canvas_id : null,
  };
}
const offersOf = (d: Row): CanvasOffer[] => (Array.isArray(d.offers) ? (d.offers as Row[]).map(mapOffer) : []);

/**
 * The offers of draft `draftId` of `canvasId`, or null when the answer does not list that draft (a discarded draft keeps no offers; a closed one with none left is not listed).
 * A failed read is an error, never "no offers". `fresh`: the read must see a write made a moment ago (it never joins a request sent before it).
 */
export async function readCanvasOffers(canvasId: string, draftId: string, opts: { fresh?: boolean } = {}): Promise<CanvasOffersRead | null> {
  const data = await readCanvasDraftState(canvasId, opts);
  const open = data.draft as Row | null;
  if (open && open.id === draftId && typeof open.revision === 'number') {
    return { draftId, revision: open.revision, closed: false, materialExpired: false, activeElsewhere: open.active_elsewhere === true, offers: offersOf(open) };
  }
  const closed = ((Array.isArray(data.closed_drafts) ? data.closed_drafts : []) as Row[]).find((c) => c.id === draftId);
  if (!closed || typeof closed.revision !== 'number') return null;
  return { draftId, revision: closed.revision, closed: true, materialExpired: closed.material_expired === true, activeElsewhere: false, offers: offersOf(closed) };
}

interface OfferCallArgs {
  draftId: string;
  offerId: string;
  /** The revision the person last saw (the one the offers were read at). */
  expectedRevision: number;
  /** Makes the call idempotent: a repeat returns the first result. */
  clientId: string;
}

export type SwitchResult = { ok: true; runId: string; revision: number; replayed: boolean; start: RunStart | null } | CanvasRefused;

/** "Make it about this": a `focus` run on the open draft. The run it made is started here (a replay of an earlier call starts nothing again). */
export async function switchCanvasFocus(a: OfferCallArgs): Promise<SwitchResult> {
  try {
    const { data, error } = await supabase.rpc('canvas_draft_switch_focus', { p_draft: a.draftId, p_offer: a.offerId, p_expected_revision: a.expectedRevision, p_client_id: a.clientId });
    if (error || !data) failRpc('switchCanvasFocus', error, 'Could not switch this canvas');
    const r = data as Row;
    const refused = refusalOf(r);
    if (refused) return staleToEvent(refused, a.draftId);
    const replayed = r.replayed === true;
    const runId = String(r.run_id);
    return { ok: true, runId, revision: Number(r.revision), replayed, start: replayed ? null : await startCanvasRun(runId) };
  } finally {
    clearListReturnCache();
  }
}

export type ForkResult =
  | { ok: true; alreadyStarted: boolean; canvasId: string; canvasName: string; versionName: string | null; draftId: string | null; threadRootId: string | null; runId: string | null; start: RunStart | null }
  | CanvasRefused;

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/**
 * "Start a canvas": the server makes the new canvas, draft and thread and queues its first run; that run is started here. An offer that is already `started` answers with the
 * canvas it started (`alreadyStarted`, no run, `draftId` null once that canvas has no open draft), so a second tap and a second tab open the same canvas.
 */
export async function forkCanvasFromOffer(a: OfferCallArgs): Promise<ForkResult> {
  try {
    const { data, error } = await supabase.rpc('canvas_draft_fork', { p_draft: a.draftId, p_offer: a.offerId, p_expected_revision: a.expectedRevision, p_client_id: a.clientId });
    if (error || !data) failRpc('forkCanvasFromOffer', error, 'Could not start this canvas');
    const r = data as Row;
    const refused = refusalOf(r);
    if (refused) return staleToEvent(refused, a.draftId);
    const runId = str(r.run_id);
    const alreadyStarted = r.already_started === true;
    return {
      ok: true, alreadyStarted, canvasId: String(r.canvas_id), canvasName: String(r.canvas_name ?? ''), versionName: str(r.version_name), draftId: str(r.draft_id),
      threadRootId: str(r.thread_root_id), runId, start: runId && r.replayed !== true ? await startCanvasRun(runId) : null,
    };
  } finally {
    clearListReturnCache();
  }
}

export type DismissResult = { ok: true; revision: number } | CanvasRefused;

/** The small ×: the offer becomes `dismissed`. A repeat on a dismissed offer is ok and writes nothing. */
export async function dismissCanvasOffer(a: Omit<OfferCallArgs, 'clientId'>): Promise<DismissResult> {
  try {
    const { data, error } = await supabase.rpc('canvas_draft_offer_dismiss', { p_draft: a.draftId, p_offer: a.offerId, p_expected_revision: a.expectedRevision });
    if (error || !data) failRpc('dismissCanvasOffer', error, 'Could not dismiss this offer');
    const r = data as Row;
    const refused = refusalOf(r);
    if (refused) return staleToEvent(refused, a.draftId);
    return { ok: true, revision: Number(r.revision) };
  } finally {
    clearListReturnCache();
  }
}
