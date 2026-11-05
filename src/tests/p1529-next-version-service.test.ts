/**
 * P1529 §6: `makeMyNextVersion` must make the queued run actually reach the canvas-draft function (the database only queues it),
 * and give every server answer a typed result. The server is faked at the RPC boundary.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ rpc: vi.fn(), startCanvasRun: vi.fn(), startQueuedCanvasRun: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: h.rpc, from: vi.fn() } }));
vi.mock('@/lib/list-return-cache', () => ({ clearListReturnCache: vi.fn() }));
vi.mock('@/app/data/canvas-draft-calls', () => ({ startCanvasRun: h.startCanvasRun, startQueuedCanvasRun: h.startQueuedCanvasRun }));

import { getMyNextVersionOffer, getMyUpdateState, makeMyNextVersion } from '@/app/data/event-mastermind-service';

const STARTED = { ok: true, runId: 'run1', kind: 'message' };

beforeEach(() => {
  vi.clearAllMocks();
  h.startCanvasRun.mockResolvedValue(STARTED);
  h.startQueuedCanvasRun.mockResolvedValue({ ok: false, code: 'NOT_AVAILABLE' });
});

describe('makeMyNextVersion', () => {
  it('starts the new run by its id after the database queued it', async () => {
    h.rpc.mockResolvedValue({ data: { status: 'ok', replayed: false, run_id: 'run1', draft_id: 'd1' }, error: null });
    const r = await makeMyNextVersion('round1');
    expect(h.rpc).toHaveBeenCalledWith('make_my_next_version', { p_round: 'round1' });
    expect(h.startCanvasRun).toHaveBeenCalledWith('run1');
    expect(r).toEqual({ status: 'started', draftId: 'd1', runId: 'run1', repeat: false, start: STARTED });
  });

  it('a repeat tap starts nothing new but picks up a run a lost start left queued', async () => {
    h.rpc.mockResolvedValue({ data: { status: 'started', repeat: true, draft_id: 'd1' }, error: null });
    const r = await makeMyNextVersion('round1');
    expect(h.startCanvasRun).not.toHaveBeenCalled();
    expect(h.startQueuedCanvasRun).toHaveBeenCalledWith('d1');
    expect(r).toMatchObject({ status: 'started', draftId: 'd1', repeat: true });
  });

  it.each([['transcript_pending'], ['no_recording'], ['no_canvas']])('%s is its own typed outcome and starts nothing', async status => {
    h.rpc.mockResolvedValue({ data: { status }, error: null });
    expect(await makeMyNextVersion('round1')).toEqual({ status });
    expect(h.startCanvasRun).not.toHaveBeenCalled();
  });

  it('carries a refusal code, and an unreadable answer is a refusal too, never a start', async () => {
    h.rpc.mockResolvedValueOnce({ data: { status: 'refused', code: 'round_still_on' }, error: null });
    expect(await makeMyNextVersion('round1')).toEqual({ status: 'refused', code: 'round_still_on' });
    h.rpc.mockResolvedValueOnce({ data: { status: 'surprise' }, error: null });
    expect(await makeMyNextVersion('round1')).toEqual({ status: 'refused', code: 'unknown' });
    expect(h.startCanvasRun).not.toHaveBeenCalled();
  });

  it('a database error throws, so the card can say so', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: 'nope', code: '42501' } });
    await expect(makeMyNextVersion('round1')).rejects.toBeTruthy();
  });
});

describe('the two reads', () => {
  it('reads an update state, with a safe default for a shape it does not know', async () => {
    h.rpc.mockResolvedValueOnce({ data: { state: 'ready', draft_id: 'd1', revision: 4, run_id: 'run1' }, error: null });
    expect(await getMyUpdateState('e1')).toEqual({ state: 'ready', draftId: 'd1', revision: 4, runId: 'run1' });
    h.rpc.mockResolvedValueOnce({ data: { state: 'mystery' }, error: null });
    expect((await getMyUpdateState('e1')).state).toBe('not_tapped');
  });

  it('reads the offer before any tap, and an unknown state is none', async () => {
    h.rpc.mockResolvedValueOnce({ data: { state: 'no_recording', round_id: 'r1' }, error: null });
    expect(await getMyNextVersionOffer('e1')).toEqual({ state: 'no_recording', roundId: 'r1' });
    h.rpc.mockResolvedValueOnce({ data: { state: 'mystery' }, error: null });
    expect(await getMyNextVersionOffer('e1')).toEqual({ state: 'none', roundId: null });
  });
});
