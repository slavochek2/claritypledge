/**
 * @file p1536-x15-publish-toast.test.tsx
 * @description P1536 3c X15 (S3c.12): the Publish toast is the reply's FIRST LINE (W1, D17 stand), because the panel closes at Publish and the toast is then the only place the
 * retention sentence is seen without opening anything. With an open offer it carries "See offer", which opens the thread (X11: the chat's own thread panel on that root). A rename goes
 * live to readers at once, and saving says so: "Name updated for everyone." The real hooks; only the database calls and the toast are faked.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const publish = vi.hoisted(() => vi.fn());
const getMessage = vi.hoisted(() => vi.fn());
const renameCanvas = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: toastSuccess, error: toastError }) }));
vi.mock('@/app/data/canvas-draft-service', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-draft-service')), publishCanvasDraft: publish }));
vi.mock('@/app/data/chat-service', async () => ({ ...(await vi.importActual<object>('@/app/data/chat-service')), getMessage }));
vi.mock('@/app/data/canvas-service', () => ({ canvasService: { renameCanvas } }));

import { useWorkspacePublish } from '@/app/pages/canvas/use-workspace-publish';
import { useCanvasRename } from '@/app/pages/canvas/use-canvas-rename';

const ready = {
  isOwner: true, version: 'canvas_dabc', publishedNone: false, canvasId: 'cv-1', title: null, points: [{ id: 'p', systemTags: ['canvas:problem'] }],
  versions: [{ name: 'canvas_dabc', draft: true, seq: null }, { name: 'canvas_d111', draft: false, seq: 1 }],
  draft: { id: 'draft-1', version: 'canvas_dabc', questions: {}, threadRootId: 'root-1', conversationId: 'conv-1', baseSeq: 1, runCount: 1, revision: 4, changedBoxes: ['canvas:problem'] },
} as unknown as CanvasReady;

const Where = { current: '' };
function Probe({ children }: { children: ReactNode }) {
  const l = useLocation();
  Where.current = l.pathname + l.search;
  return <>{children}</>;
}
const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={['/p/ana/canvas/canvas?v=canvas_dabc&ws=1']}><Probe>{children}</Probe></MemoryRouter>;

const setup = () => renderHook(() => useWorkspacePublish({ ready, runActive: false, pendingClone: false, setParams: vi.fn(), state: null }), { wrapper });
const done = async (hook: ReturnType<typeof setup>) => { await act(async () => { hook.result.current.publish(); }); };

beforeEach(() => {
  vi.clearAllMocks();
  Where.current = '';
  publish.mockResolvedValue({ ok: true, seq: 2, skippedLinks: 0, replyMessageId: 'msg-reply', openOffers: 0 });
  getMessage.mockResolvedValue({ id: 'msg-reply', body: 'Published v2. I deleted the text of your uploads; the canvas keeps what I drew from them.' });
});

describe('X15: the Publish toast is the reply\'s first line', () => {
  it('shows the first line of the reply the server posted (the retention sentence included), not a fixed "Published v2."', async () => {
    const hook = setup();
    await done(hook);
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    expect(getMessage).toHaveBeenCalledWith('msg-reply');
    expect(toastSuccess.mock.calls[0]![0]).toBe('Published v2. I deleted the text of your uploads; the canvas keeps what I drew from them.');
    expect(toastSuccess.mock.calls[0]).toHaveLength(1); // no open offer: no options, no See offer
  });

  it('only the FIRST line: a reply that continues on further lines shows the first', async () => {
    getMessage.mockResolvedValue({ id: 'msg-reply', body: 'Published v2. Your material also covers agencies. I keep the text of your uploads for this until you start it or for 30 days, then delete it.\nSecond line.' });
    const hook = setup();
    await done(hook);
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    expect(toastSuccess.mock.calls[0]![0]).toBe('Published v2. Your material also covers agencies. I keep the text of your uploads for this until you start it or for 30 days, then delete it.');
  });

  it('with an open offer the toast carries "See offer", which opens the thread (the chat\'s own thread panel on that root, X11)', async () => {
    publish.mockResolvedValue({ ok: true, seq: 2, skippedLinks: 0, replyMessageId: 'msg-reply', openOffers: 1 });
    const hook = setup();
    await done(hook);
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    const action = toastSuccess.mock.calls[0]![1]?.action as { label: string; onClick: () => void };
    expect(action.label).toBe('See offer');
    act(() => action.onClick());
    expect(Where.current).toBe('/chats/c/conv-1/t/root-1'); // the same address X11's "N replies" uses for a published thread
  });

  it('a reply that cannot be read (or none was reported) still toasts what is certain: the number it got, never a silent skip', async () => {
    getMessage.mockRejectedValue(new Error('down'));
    const hook = setup();
    await done(hook);
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Published v2.'));
    toastSuccess.mockClear();
    publish.mockResolvedValue({ ok: true, seq: 3, skippedLinks: 0, replyMessageId: null, openOffers: 0 });
    const again = setup();
    await done(again);
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Published v3.'));
    expect(getMessage).toHaveBeenCalledTimes(1); // no id, no read
  });
});

describe('X15: a rename says it went live', () => {
  const rename = () => renderHook(() => useCanvasRename(ready, 'canvas'), { wrapper });
  it('after the database confirms, "Name updated for everyone."', async () => {
    renameCanvas.mockResolvedValue('Series A plan');
    const hook = rename();
    act(() => hook.result.current.save('Series A plan'));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Name updated for everyone.'));
    expect(toastError).not.toHaveBeenCalled();
  });
  it('a refusal says the failure, not the success', async () => {
    renameCanvas.mockRejectedValue(new Error('no'));
    const hook = rename();
    act(() => hook.result.current.save('Series A plan'));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
  });
  it('two quick saves say it once, for the title that ended on screen', async () => {
    renameCanvas.mockImplementation(async (_id: string, t: string) => t);
    const hook = rename();
    act(() => { hook.result.current.save('First'); hook.result.current.save('Second'); });
    await waitFor(() => expect(renameCanvas).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    expect(hook.result.current.title).toBe('Second');
  });
});
