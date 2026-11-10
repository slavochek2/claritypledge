/**
 * P1653 F3: a button tap is marked on the server (canvas_mark_tap) AFTER the send and BEFORE the run starts; an unmarked send never calls it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sb = vi.hoisted(() => ({ invoke: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: sb.invoke }, rpc: sb.rpc, from: vi.fn() } }));
vi.mock('@/lib/list-return-cache', () => ({ clearListReturnCache: vi.fn() }));

import { sendCanvasWorkspaceMessage } from '@/app/data/canvas-draft-service';
import { CanvasTapRefused } from '@/app/data/canvas-mark-tap';

const OK = { status: 'ok', run_id: 'run-1', revision: 4, draft_id: 'd1', canvas_id: 'cv', canvas_name: 'canvas', version_name: 'canvas_d1', thread_root_id: 'r1', conversation_id: 'c1', message_id: 'm1', replayed: false };
const args = { canvasId: 'cv', expectedDraftId: 'd1', expectedRevision: 4, body: 'Not mine', clientId: 'cid-1' };
const names = () => [...sb.rpc.mock.calls.map((c) => ({ at: 'rpc', name: c[0] })), ...sb.invoke.mock.calls.map((c) => ({ at: 'invoke', name: c[0] }))];

beforeEach(() => {
  vi.clearAllMocks();
  sb.invoke.mockResolvedValue({ data: { run_id: 'run-1', kind: 'message' }, error: null });
});

describe('P1653 canvas_mark_tap', () => {
  it('a tap: send, then the mark with the message id and the token kind, then the run starts', async () => {
    const order: string[] = [];
    sb.rpc.mockImplementation(async (name: string) => { order.push(name); return { data: name === 'canvas_mark_tap' ? { status: 'ok' } : OK, error: null }; });
    sb.invoke.mockImplementation(async () => { order.push('start'); return { data: { run_id: 'run-1', kind: 'message' }, error: null }; });
    const r = await sendCanvasWorkspaceMessage({ ...args, tap: 'no' });
    expect(r).toMatchObject({ ok: true, start: { ok: true } });
    expect(order).toEqual(['canvas_workspace_send', 'canvas_mark_tap', 'start']);
    expect(sb.rpc).toHaveBeenCalledWith('canvas_mark_tap', { p_message: 'm1', p_token: 'no' });
  });

  it('a typed message (no tap) never calls the mark', async () => {
    sb.rpc.mockResolvedValueOnce({ data: OK, error: null });
    await sendCanvasWorkspaceMessage(args);
    expect(sb.rpc.mock.calls.map((c) => c[0])).toEqual(['canvas_workspace_send']);
    expect(names().some((n) => n.name === 'canvas_mark_tap')).toBe(false);
  });

  it('a refused mark starts no run and the send is reported as failed', async () => {
    sb.rpc.mockResolvedValueOnce({ data: OK, error: null }).mockResolvedValueOnce({ data: { status: 'refused' }, error: null });
    await expect(sendCanvasWorkspaceMessage({ ...args, tap: 'yes', body: 'Yes, this is my business' })).rejects.toBeInstanceOf(CanvasTapRefused);
    expect(sb.invoke).not.toHaveBeenCalled();
  });

  it('a mark call that fails starts no run either', async () => {
    sb.rpc.mockResolvedValueOnce({ data: OK, error: null }).mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'boom' } });
    await expect(sendCanvasWorkspaceMessage({ ...args, tap: 'no' })).rejects.toThrow();
    expect(sb.invoke).not.toHaveBeenCalled();
  });
});
