/**
 * @file p1536-undo-calls.test.ts
 * @description P1536 D7 (S1.8, client): the two calls Undo makes, with the Supabase client mocked.
 *  - `readCanvasUndoTarget`: the server's own answer (`get_canvas_draft_state`) to "which run does Undo undo, and which reply carries it", never guessed on the client
 *    (the step table is closed to clients, and a run that changed no box has no step)
 *  - `undoCanvasRun`: `canvas_draft_undo` with the run and the revision the person saw; every refusal the server can give comes back typed (busy, busy_elsewhere,
 *    stale_view), an authorization failure throws, and a success tells the canvas page beside the thread to re-read
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sb = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: sb.rpc, functions: { invoke: vi.fn() }, from: vi.fn() } }));
const clearCache = vi.hoisted(() => vi.fn());
vi.mock('@/lib/list-return-cache', () => ({ clearListReturnCache: clearCache }));

import { nextTargetAfterUndo, readCanvasUndoTarget, undoCanvasRun } from '@/app/data/canvas-draft-undo';
import { subscribeCanvasDraftEvents, type CanvasDraftEvent } from '@/app/data/canvas-draft-events';

const run = (over: Record<string, unknown>) => ({
  id: 'r', kind: 'message', state: 'done', input_kind: 'text', error_code: null, trigger_message_id: 'm-r', reply_message_id: 'a-r', scope: [], target_offer_id: null,
  created_at: '2026-11-02T09:00:00Z', finished_at: '2026-11-02T09:00:05Z', ...over,
});
const state = (draft: Record<string, unknown> | null) => ({ data: { canvas_id: 'cv-1', canvas_name: 'canvas', draft, closed_draft: null }, error: null });
const draftWith = (over: Record<string, unknown> = {}) => ({
  id: 'draft-1', revision: 7, undo_run_id: 'r2',
  runs: [run({ id: 'r1', trigger_message_id: 'm-1', reply_message_id: 'a-1' }), run({ id: 'r2', trigger_message_id: 'm-2', reply_message_id: 'a-2' })],
  ...over,
});

let events: CanvasDraftEvent[] = [];
let stop = () => undefined;
beforeEach(() => {
  vi.clearAllMocks();
  events = [];
  stop = subscribeCanvasDraftEvents(e => events.push(e));
});
afterEach(() => stop());

describe('D7: readCanvasUndoTarget', () => {
  it('asks the server for the canvas, and returns the run Undo would undo, its reply and the revision the answer is for', async () => {
    sb.rpc.mockResolvedValue(state(draftWith()));
    const t = await readCanvasUndoTarget('cv-1', 'draft-1');
    expect(sb.rpc).toHaveBeenCalledWith('get_canvas_draft_state', { p_canvas: 'cv-1' });
    expect(t).toEqual({ draftId: 'draft-1', revision: 7, runId: 'r2', replyMessageId: 'a-2', undoneMessageIds: [], handClosed: false, replies: { r1: 'a-1', r2: 'a-2' }, triggers: { r1: 'm-1', r2: 'm-2' } });
  });

  it('P1621: handClosed is true only when the server says the owner closed Undo by hand', async () => {
    sb.rpc.mockResolvedValue(state(draftWith({ undo_run_id: null, undo_closed_by_hand: true })));
    expect((await readCanvasUndoTarget('cv-1', 'draft-1')).handClosed).toBe(true);
    sb.rpc.mockResolvedValue(state(draftWith({ undo_closed_by_hand: false })));
    expect((await readCanvasUndoTarget('cv-1', 'draft-1')).handClosed).toBe(false);
    sb.rpc.mockResolvedValue(state(draftWith()));   // a server before the migration: no key
    expect((await readCanvasUndoTarget('cv-1', 'draft-1')).handClosed).toBe(false);
  });

  it('the owner messages of undone runs are returned, to be marked "Undone"', async () => {
    sb.rpc.mockResolvedValue(state(draftWith({ runs: [run({ id: 'r1', state: 'undone', trigger_message_id: 'm-1', reply_message_id: 'a-1' }), run({ id: 'r2', trigger_message_id: 'm-2', reply_message_id: 'a-2' })], undo_run_id: 'r2' })));
    expect((await readCanvasUndoTarget('cv-1', 'draft-1'))?.undoneMessageIds).toEqual(['m-1']);
  });

  it('no run has a step (undo_run_id null): nothing to undo, but the undone marks are still there', async () => {
    sb.rpc.mockResolvedValue(state(draftWith({ undo_run_id: null, runs: [run({ id: 'r1', state: 'undone', trigger_message_id: 'm-1' })] })));
    expect(await readCanvasUndoTarget('cv-1', 'draft-1')).toEqual({ draftId: 'draft-1', revision: 7, runId: null, replyMessageId: null, undoneMessageIds: ['m-1'], handClosed: false, replies: { r1: 'a-r' }, triggers: { r1: 'm-1' } });
  });

  it('the run has no reply message: the target has a run and no reply (nothing to hang Undo on)', async () => {
    sb.rpc.mockResolvedValue(state(draftWith({ runs: [run({ id: 'r2', reply_message_id: null })] })));
    expect((await readCanvasUndoTarget('cv-1', 'draft-1'))?.replyMessageId).toBeNull();
  });

  it('an open draft that is another draft than the thread\'s: nothing is borrowed from it (an empty target for this draft, never its runs)', async () => {
    sb.rpc.mockResolvedValue(state(draftWith({ id: 'draft-other' })));
    expect(await readCanvasUndoTarget('cv-1', 'draft-1')).toMatchObject({ draftId: 'draft-1', runId: null, replyMessageId: null, undoneMessageIds: [] });
  });

  it('a failed read is an error, never "nothing to undo"', async () => {
    sb.rpc.mockResolvedValue({ data: null, error: { message: 'boom', code: 'XX000' } });
    await expect(readCanvasUndoTarget('cv-1', 'draft-1')).rejects.toThrow();
  });
});

describe('J6 review: the undone marks of a CLOSED draft (published or discarded), from closed_undone', () => {
  const closed = (map: Record<string, string[]>, draft: Record<string, unknown> | null = null) => ({ data: { canvas_id: 'cv-1', draft, closed_draft: null, closed_undone: map }, error: null });

  it('no open draft: the marks come from closed_undone under this draft id, and nothing can be undone', async () => {
    sb.rpc.mockResolvedValue(closed({ 'draft-1': ['m-1', 'm-2'], 'draft-other': ['m-9'] }));
    expect(await readCanvasUndoTarget('cv-1', 'draft-1')).toMatchObject({ draftId: 'draft-1', runId: null, replyMessageId: null, undoneMessageIds: ['m-1', 'm-2'] });
  });

  it('a closed draft with nothing undone: an empty target (the read happened), never null', async () => {
    sb.rpc.mockResolvedValue(closed({ 'draft-other': ['m-9'] }));
    expect(await readCanvasUndoTarget('cv-1', 'draft-1')).toMatchObject({ draftId: 'draft-1', runId: null, undoneMessageIds: [] });
  });

  it('an answer from a server without closed_undone (before the migration): an empty target, never a throw', async () => {
    sb.rpc.mockResolvedValue({ data: { canvas_id: 'cv-1', draft: null, closed_draft: null }, error: null });
    expect(await readCanvasUndoTarget('cv-1', 'draft-1')).toMatchObject({ runId: null, undoneMessageIds: [] });
  });
});

describe('D7 review: nextTargetAfterUndo (Undo moves on with no read)', () => {
  const t = { draftId: 'draft-1', revision: 7, runId: 'r2', replyMessageId: 'a-2', undoneMessageIds: [] as string[], handClosed: false, replies: { r1: 'a-1', r2: 'a-2' }, triggers: { r1: 'm-1', r2: 'm-2' } };
  it('the next run is the one the undo call named: its reply, the new revision, and the undone run\'s owner message marked', () => {
    expect(nextTargetAfterUndo(t, { revision: 8, undoneRunId: 'r2', nextUndoRunId: 'r1' })).toMatchObject({ runId: 'r1', replyMessageId: 'a-1', revision: 8, undoneMessageIds: ['m-2'] });
  });
  it('no next run: nothing to undo, the message is still marked', () => {
    expect(nextTargetAfterUndo(t, { revision: 9, undoneRunId: 'r2', nextUndoRunId: null })).toMatchObject({ runId: null, replyMessageId: null, undoneMessageIds: ['m-2'] });
  });
  it('a run the last read did not list has no reply to hang Undo on (null, never a guess)', () => {
    expect(nextTargetAfterUndo(t, { revision: 8, undoneRunId: 'r2', nextUndoRunId: 'r0' }).replyMessageId).toBeNull();
  });
});

describe('D7: undoCanvasRun', () => {
  const args = { draftId: 'draft-1', expectedRunId: 'r2', expectedRevision: 7 };

  it('passes the draft, the run and the revision the person saw; a success carries the next run Undo would undo, tells the page to re-read and clears the cache', async () => {
    sb.rpc.mockResolvedValue({ data: { status: 'ok', revision: 8, undone_run_id: 'r2', next_undo_run_id: 'r1' }, error: null });
    await expect(undoCanvasRun(args)).resolves.toEqual({ ok: true, revision: 8, undoneRunId: 'r2', nextUndoRunId: 'r1' });
    expect(sb.rpc).toHaveBeenCalledWith('canvas_draft_undo', { p_draft: 'draft-1', p_expected_run: 'r2', p_expected_revision: 7 });
    expect(events).toEqual([{ kind: 'updated', draftId: 'draft-1' }]);
    expect(clearCache).toHaveBeenCalled();
  });

  it('the last Undo has no next run', async () => {
    sb.rpc.mockResolvedValue({ data: { status: 'ok', revision: 9, undone_run_id: 'r1', next_undo_run_id: null }, error: null });
    await expect(undoCanvasRun({ ...args, expectedRunId: 'r1' })).resolves.toMatchObject({ ok: true, nextUndoRunId: null });
  });

  it.each(['busy', 'busy_elsewhere'] as const)('%s: a typed refusal, nothing announced', async code => {
    sb.rpc.mockResolvedValue({ data: { status: 'refused', code, revision: 7 }, error: null });
    await expect(undoCanvasRun(args)).resolves.toEqual({ ok: false, refused: code, revision: 7 });
    expect(events).toEqual([]);
  });

  it('stale_view (another window undid, or ran, since): a typed refusal, and the screens beside re-read because the screen is behind', async () => {
    sb.rpc.mockResolvedValue({ data: { status: 'refused', code: 'stale_view', revision: 9 }, error: null });
    await expect(undoCanvasRun(args)).resolves.toEqual({ ok: false, refused: 'stale_view', revision: 9 });
    expect(events).toEqual([{ kind: 'updated', draftId: 'draft-1' }]);
  });

  it('not authorized (42501) throws, it is not a refusal about the state of things', async () => {
    sb.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'not authorized for this canvas' } });
    await expect(undoCanvasRun(args)).rejects.toThrow();
    expect(events).toEqual([]);
  });
});
