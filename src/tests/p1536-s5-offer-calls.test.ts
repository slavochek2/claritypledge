/**
 * @file p1536-s5-offer-calls.test.ts
 * @description P1536 S5 (client, D10 / D16 / J7 to J10): the calls a mixed-material canvas makes, with the Supabase client mocked.
 *  - `readCanvasOffers`: the offers of ONE draft (open, or a closed one by its id) out of the owner's single state read, with `material_expired`;
 *    an open draft and a closed draft that share a canvas are never confused.
 *  - one batched read: the Undo read and the offers read in the same moment make ONE `get_canvas_draft_state` request; a read that follows a write is fresh.
 *  - `switchCanvasFocus`, `forkCanvasFromOffer`, `dismissCanvasOffer`: the server's own arguments, a run that is returned is started (its id is invoked),
 *    every refusal comes back typed, a second tap of a started offer returns the canvas that already exists and starts nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sb = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: sb.rpc, functions: { invoke: sb.invoke }, from: vi.fn() } }));
const clearCache = vi.hoisted(() => vi.fn());
vi.mock('@/lib/list-return-cache', () => ({ clearListReturnCache: clearCache }));

import { dismissCanvasOffer, forkCanvasFromOffer, readCanvasOffers, switchCanvasFocus } from '@/app/data/canvas-draft-offers';
import { readCanvasUndoTarget } from '@/app/data/canvas-draft-undo';

const offer = (over: Record<string, unknown> = {}) => ({ id: 'o-1', group_label: 'Agencies', why: 'Half of it is about agencies', state: 'offered', started_canvas_id: null, ...over });
const stateOf = (over: Record<string, unknown> = {}) => ({
  data: {
    canvas_id: 'cv-1',
    draft: { id: 'draft-1', revision: 7, offers: [offer(), offer({ id: 'o-2', group_label: 'Cafe owners', state: 'focused' })], active_elsewhere: false, runs: [] },
    closed_draft: null,
    closed_drafts: [
      { id: 'closed-1', revision: 4, thread_root_id: 'root-c', material_expired: false, offers: [offer({ id: 'o-9', group_label: 'Investors' }), offer({ id: 'o-8', group_label: 'Referrers', state: 'started', started_canvas_id: 'cv-9' })] },
      { id: 'closed-2', revision: 3, thread_root_id: 'root-d', material_expired: true, offers: [offer({ id: 'o-7', group_label: 'Schools' })] },
    ],
    ...over,
  },
  error: null,
});

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => vi.restoreAllMocks());

describe('readCanvasOffers: the offers of one draft, from the one state read', () => {
  it('an OPEN draft: its offers (a focused one included, so the row logic can drop it), the revision they were read at, and who is busy', async () => {
    sb.rpc.mockResolvedValue(stateOf());
    const r = await readCanvasOffers('cv-1', 'draft-1');
    expect(sb.rpc).toHaveBeenCalledWith('get_canvas_draft_state', { p_canvas: 'cv-1' });
    expect(r).toEqual({
      draftId: 'draft-1', revision: 7, closed: false, materialExpired: false, activeElsewhere: false,
      offers: [
        { id: 'o-1', group: 'Agencies', why: 'Half of it is about agencies', state: 'offered', startedCanvasId: null },
        { id: 'o-2', group: 'Cafe owners', why: 'Half of it is about agencies', state: 'focused', startedCanvasId: null },
      ],
    });
  });

  it('a CLOSED draft is found by its own id among the closed drafts: its offers, its revision and whether its kept material has expired', async () => {
    sb.rpc.mockResolvedValue(stateOf());
    expect(await readCanvasOffers('cv-1', 'closed-2')).toMatchObject({ draftId: 'closed-2', revision: 3, closed: true, materialExpired: true, offers: [{ id: 'o-7', group: 'Schools' }] });
    expect(await readCanvasOffers('cv-1', 'closed-1')).toMatchObject({ draftId: 'closed-1', closed: true, materialExpired: false });
  });

  it('a started offer keeps the canvas it started', async () => {
    sb.rpc.mockResolvedValue(stateOf());
    const r = await readCanvasOffers('cv-1', 'closed-1');
    expect(r?.offers.find((o) => o.id === 'o-8')).toMatchObject({ state: 'started', startedCanvasId: 'cv-9' });
  });

  it('a draft the answer does not list (a discarded one, or one with no offers left) has no offers: an empty read, never an error', async () => {
    sb.rpc.mockResolvedValue(stateOf());
    expect(await readCanvasOffers('cv-1', 'closed-unknown')).toBeNull();
  });

  it('a failed read is an error, never "no offers"', async () => {
    sb.rpc.mockResolvedValue({ data: null, error: { message: 'boom', code: 'XX000' } });
    await expect(readCanvasOffers('cv-1', 'draft-1')).rejects.toThrow();
  });

  it('a server without the key (before its migration) has no offers and no error', async () => {
    sb.rpc.mockResolvedValue({ data: { canvas_id: 'cv-1', draft: { id: 'draft-1', revision: 1 }, closed_draft: null }, error: null });
    expect(await readCanvasOffers('cv-1', 'draft-1')).toMatchObject({ offers: [], revision: 1 });
    expect(await readCanvasOffers('cv-1', 'closed-1')).toBeNull();
  });
});

describe('one batched read (metered-services): the Undo read and the offers read share one request', () => {
  it('both asked in the same moment: ONE get_canvas_draft_state', async () => {
    sb.rpc.mockResolvedValue(stateOf());
    const [u, o] = await Promise.all([readCanvasUndoTarget('cv-1', 'draft-1'), readCanvasOffers('cv-1', 'draft-1')]);
    expect(sb.rpc).toHaveBeenCalledTimes(1);
    expect(u.revision).toBe(7);
    expect(o?.revision).toBe(7);
  });

  it('a read made AFTER a write asks again, and never joins one that was already in flight before it', async () => {
    let release: (v: unknown) => void = () => undefined;
    sb.rpc.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const before = readCanvasOffers('cv-1', 'draft-1'); // in flight, started before the write
    sb.rpc.mockResolvedValueOnce(stateOf({ draft: { id: 'draft-1', revision: 8, offers: [] } }));
    const after = await readCanvasOffers('cv-1', 'draft-1', { fresh: true });
    expect(sb.rpc).toHaveBeenCalledTimes(2);
    expect(after?.revision).toBe(8);
    release(stateOf());
    await before;
  });

  it('two reads one after the other (nothing in flight) are two requests: the read is shared, never cached', async () => {
    sb.rpc.mockResolvedValue(stateOf());
    await readCanvasOffers('cv-1', 'draft-1');
    await readCanvasOffers('cv-1', 'draft-1');
    expect(sb.rpc).toHaveBeenCalledTimes(2);
  });
});

describe('switchCanvasFocus: "Make it about this"', () => {
  const ok = { data: { status: 'ok', replayed: false, run_id: 'run-9', kind: 'focus', revision: 8, draft_id: 'draft-1', canvas_id: 'cv-1', canvas_name: 'canvas', version_name: 'canvas_x', thread_root_id: 'root-1', conversation_id: 'conv-1', message_id: null }, error: null };

  it('calls the server with the offer, the revision the person saw and a client id; then STARTS the run it returned', async () => {
    sb.rpc.mockResolvedValue(ok);
    sb.invoke.mockResolvedValue({ data: { run_id: 'run-9', kind: 'focus' }, error: null });
    const r = await switchCanvasFocus({ draftId: 'draft-1', offerId: 'o-1', expectedRevision: 7, clientId: 'c-1' });
    expect(sb.rpc).toHaveBeenCalledWith('canvas_draft_switch_focus', { p_draft: 'draft-1', p_offer: 'o-1', p_expected_revision: 7, p_client_id: 'c-1' });
    expect(sb.invoke).toHaveBeenCalledWith('canvas-draft', { body: { run_id: 'run-9' } });
    expect(r).toMatchObject({ ok: true, runId: 'run-9', revision: 8, start: { ok: true } });
    expect(clearCache).toHaveBeenCalled();
  });

  it.each(['busy', 'busy_elsewhere', 'cap_reached', 'stale_view', 'not_offered'])('a %s refusal is a typed result with the revision to re-read against, and starts nothing', async (code) => {
    sb.rpc.mockResolvedValue({ data: { status: 'refused', code, revision: 9 }, error: null });
    expect(await switchCanvasFocus({ draftId: 'draft-1', offerId: 'o-1', expectedRevision: 7, clientId: 'c-1' })).toEqual({ ok: false, refused: code, revision: 9 });
    expect(sb.invoke).not.toHaveBeenCalled();
  });

  it('a REPLAY (the first answer was lost) returns the first result and starts no second run', async () => {
    sb.rpc.mockResolvedValue({ data: { ...ok.data, replayed: true }, error: null });
    const r = await switchCanvasFocus({ draftId: 'draft-1', offerId: 'o-1', expectedRevision: 7, clientId: 'c-1' });
    expect(r).toMatchObject({ ok: true, replayed: true });
    expect(sb.invoke).not.toHaveBeenCalled();
  });

  it('an authorization failure throws', async () => {
    sb.rpc.mockResolvedValue({ data: null, error: { message: 'not authorized for this canvas', code: '42501' } });
    await expect(switchCanvasFocus({ draftId: 'draft-1', offerId: 'o-1', expectedRevision: 7, clientId: 'c-1' })).rejects.toThrow();
  });
});

describe('forkCanvasFromOffer: "Start a canvas"', () => {
  const forked = { data: { status: 'ok', replayed: false, run_id: 'run-f', kind: 'fork_first', revision: 1, draft_id: 'draft-new', canvas_id: 'cv-new', canvas_name: 'canvas_5', version_name: 'canvas_v5', thread_root_id: 'root-new', conversation_id: 'conv-1', message_id: null }, error: null };
  const args = { draftId: 'draft-1', offerId: 'o-1', expectedRevision: 7, clientId: 'c-2' };

  it('calls canvas_draft_fork and INVOKES the first run it queued; says where the new canvas is', async () => {
    sb.rpc.mockResolvedValue(forked);
    sb.invoke.mockResolvedValue({ data: { run_id: 'run-f', kind: 'fork_first' }, error: null });
    const r = await forkCanvasFromOffer(args);
    expect(sb.rpc).toHaveBeenCalledWith('canvas_draft_fork', { p_draft: 'draft-1', p_offer: 'o-1', p_expected_revision: 7, p_client_id: 'c-2' });
    expect(sb.invoke).toHaveBeenCalledWith('canvas-draft', { body: { run_id: 'run-f' } });
    expect(r).toMatchObject({ ok: true, alreadyStarted: false, canvasId: 'cv-new', canvasName: 'canvas_5', versionName: 'canvas_v5', draftId: 'draft-new', threadRootId: 'root-new', runId: 'run-f' });
    expect(clearCache).toHaveBeenCalled();
  });

  it('a SECOND TAP (the offer is already started) returns the canvas that exists, starts NOTHING and says so', async () => {
    sb.rpc.mockResolvedValue({ data: { status: 'ok', already_started: true, replayed: true, run_id: null, canvas_id: 'cv-new', canvas_name: 'canvas_5', draft_id: 'draft-new', thread_root_id: 'root-new', conversation_id: 'conv-1', version_name: 'canvas_v5', revision: 2 }, error: null });
    const r = await forkCanvasFromOffer(args);
    expect(r).toMatchObject({ ok: true, alreadyStarted: true, canvasName: 'canvas_5', versionName: 'canvas_v5', draftId: 'draft-new', runId: null });
    expect(sb.invoke).not.toHaveBeenCalled();
  });

  it('the started canvas has no open draft any more (it was published): the answer names the canvas and no draft', async () => {
    sb.rpc.mockResolvedValue({ data: { status: 'ok', already_started: true, replayed: true, run_id: null, canvas_id: 'cv-new', canvas_name: 'canvas_5', draft_id: null, thread_root_id: null, conversation_id: null, version_name: null, revision: null }, error: null });
    expect(await forkCanvasFromOffer(args)).toMatchObject({ ok: true, alreadyStarted: true, canvasName: 'canvas_5', draftId: null, versionName: null, threadRootId: null });
  });

  it.each(['busy', 'busy_elsewhere', 'stale_view', 'expired', 'not_offered'])('a %s refusal is typed and nothing starts', async (code) => {
    sb.rpc.mockResolvedValue({ data: { status: 'refused', code, revision: 9 }, error: null });
    expect(await forkCanvasFromOffer(args)).toEqual({ ok: false, refused: code, revision: 9 });
    expect(sb.invoke).not.toHaveBeenCalled();
  });

  it('too many open drafts (54000) is the refusal the person can act on, thrown as such', async () => {
    sb.rpc.mockResolvedValue({ data: null, error: { message: 'too many open drafts', code: '54000' } });
    await expect(forkCanvasFromOffer(args)).rejects.toMatchObject({ code: 'TOO_MANY_DRAFTS' });
  });
});

describe('dismissCanvasOffer: the small ×', () => {
  it('calls the server with the offer and revision; ok carries the new revision', async () => {
    sb.rpc.mockResolvedValue({ data: { status: 'ok', revision: 8 }, error: null });
    expect(await dismissCanvasOffer({ draftId: 'draft-1', offerId: 'o-1', expectedRevision: 7 })).toEqual({ ok: true, revision: 8 });
    expect(sb.rpc).toHaveBeenCalledWith('canvas_draft_offer_dismiss', { p_draft: 'draft-1', p_offer: 'o-1', p_expected_revision: 7 });
    expect(clearCache).toHaveBeenCalled();
  });

  it('a repeat on a dismissed offer is ok and writes nothing', async () => {
    sb.rpc.mockResolvedValue({ data: { status: 'ok', repeated: true, revision: 8 }, error: null });
    expect(await dismissCanvasOffer({ draftId: 'draft-1', offerId: 'o-1', expectedRevision: 7 })).toEqual({ ok: true, revision: 8 });
  });

  it.each(['busy', 'busy_elsewhere', 'stale_view'])('a %s refusal is typed', async (code) => {
    sb.rpc.mockResolvedValue({ data: { status: 'refused', code, revision: 9 }, error: null });
    expect(await dismissCanvasOffer({ draftId: 'draft-1', offerId: 'o-1', expectedRevision: 7 })).toEqual({ ok: false, refused: code, revision: 9 });
  });
});
