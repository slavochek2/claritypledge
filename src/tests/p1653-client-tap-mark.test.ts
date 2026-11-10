/**
 * P1653 F3: a button tap is sent AND marked in ONE database call (canvas_workspace_send_tap), so no token message ever exists unmarked; the run starts only
 * after it. A typed message never goes through it. A tap that is not the open question sends nothing and says so.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sb = vi.hoisted(() => ({ invoke: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: sb.invoke }, rpc: sb.rpc, from: vi.fn() } }));
vi.mock('@/lib/list-return-cache', () => ({ clearListReturnCache: vi.fn() }));

import { sendCanvasWorkspaceMessage } from '@/app/data/canvas-draft-service';
import { CanvasTapRefused } from '@/app/data/canvas-mark-tap';

const OK = { status: 'ok', run_id: 'run-1', revision: 4, draft_id: 'd1', canvas_id: 'cv', canvas_name: 'canvas', version_name: 'canvas_d1', thread_root_id: 'r1', conversation_id: 'c1', message_id: 'm1', replayed: false };
const args = { canvasId: 'cv', expectedDraftId: 'd1', expectedRevision: 4, body: 'Not mine', clientId: 'cid-1' };
const rpcNames = () => sb.rpc.mock.calls.map((c) => c[0]);

beforeEach(() => {
  vi.clearAllMocks();
  sb.invoke.mockResolvedValue({ data: { run_id: 'run-1', kind: 'message' }, error: null });
});

describe('P1653 canvas_workspace_send_tap', () => {
  it('a tap is ONE call carrying the token and no body (the server fixes the text), and the run starts after it; no separate mark call exists', async () => {
    const order: string[] = [];
    sb.rpc.mockImplementation(async (name: string) => { order.push(name); return { data: OK, error: null }; });
    sb.invoke.mockImplementation(async () => { order.push('start'); return { data: { run_id: 'run-1', kind: 'message' }, error: null }; });
    const r = await sendCanvasWorkspaceMessage({ ...args, tap: 'no' });
    expect(r).toMatchObject({ ok: true, start: { ok: true } });
    expect(order).toEqual(['canvas_workspace_send_tap', 'start']);
    expect(sb.rpc).toHaveBeenCalledWith('canvas_workspace_send_tap', { p_canvas: 'cv', p_expected_draft: 'd1', p_expected_revision: 4, p_token: 'no', p_client_id: 'cid-1' });
    expect(rpcNames()).not.toContain('canvas_mark_tap');
    expect(rpcNames()).not.toContain('canvas_workspace_send');
  });

  it('a typed message (no tap) never goes through the tap call', async () => {
    sb.rpc.mockResolvedValueOnce({ data: OK, error: null });
    await sendCanvasWorkspaceMessage(args);
    expect(rpcNames()).toEqual(['canvas_workspace_send']);
  });

  it('a tap that is not the open question sends nothing and starts no run: CanvasTapRefused', async () => {
    sb.rpc.mockResolvedValueOnce({ data: { status: 'refused', code: 'stale_button' }, error: null });
    await expect(sendCanvasWorkspaceMessage({ ...args, tap: 'yes' })).rejects.toBeInstanceOf(CanvasTapRefused);
    expect(sb.invoke).not.toHaveBeenCalled();
    expect(rpcNames()).toEqual(['canvas_workspace_send_tap']);
  });

  it('a refusal of the send itself (the screen is behind) is the usual typed refusal, and starts no run', async () => {
    sb.rpc.mockResolvedValueOnce({ data: { status: 'refused', code: 'stale_view', revision: 5 }, error: null });
    const r = await sendCanvasWorkspaceMessage({ ...args, tap: 'no' });
    expect(r).toMatchObject({ ok: false, refused: 'stale_view', revision: 5 });
    expect(sb.invoke).not.toHaveBeenCalled();
  });

  it('a failed call throws and starts no run (nothing was sent: the send and the mark are one transaction)', async () => {
    sb.rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'boom' } });
    await expect(sendCanvasWorkspaceMessage({ ...args, tap: 'no' })).rejects.toThrow();
    expect(sb.invoke).not.toHaveBeenCalled();
  });

  it('a repeat of a tap whose first answer was lost (replayed) starts no second run', async () => {
    sb.rpc.mockResolvedValueOnce({ data: { ...OK, replayed: true }, error: null });
    const r = await sendCanvasWorkspaceMessage({ ...args, tap: 'no' });
    expect(r).toMatchObject({ ok: true, replayed: true, start: null });
    expect(sb.invoke).not.toHaveBeenCalled();
  });
});
