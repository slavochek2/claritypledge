/**
 * @file p1536-w0-start-entries.test.tsx
 * @description P1536 §3b W0/W1 (S3b.3): every way of starting a canvas lands on the WORKSPACE, never on the chat thread.
 * Each entry's final pathname, its exact `ws`, and the selected version (`v`) are asserted separately:
 *  - Artifacts New canvas;  - the mirror chat's + > New canvas (3c X3 premise change: it was the "..." menu's New canvas, and the paperclip's Canvases tab started a draft from a
 *    picked version; that tab is gone and "Clone a version" navigates instead, see p1536-x3-*.test.tsx; `start(versionId)` stays covered below as the hook's own contract);
 *  - the "open draft elsewhere" dialog (continue / discard) lands on the workspace of the right draft;
 *  - the carried change requests still go into the new thread (the engine's thread-scoped input).
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const ME = 'user-id-me';
const svc = vi.hoisted(() => ({
  getCanvasDraftAvailability: vi.fn(),
  openCanvasDraft: vi.fn(),
  discardCanvasDraft: vi.fn(),
  getCanvasDraftRevision: vi.fn(),
  sendCanvasWorkspaceMessage: vi.fn(),
}));
const toastFn = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('sonner', () => ({ toast: toastFn }));
vi.mock('@/app/data/canvas-draft-service', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-draft-service')), ...svc }));

import { NewCanvasButton } from '@/app/pages/artifacts/artifacts-new-canvas';
import { useStartCanvas } from '@/app/pages/chat/use-start-canvas';
import { CanvasPlusMenu } from '@/app/pages/chat/CanvasPlusMenu';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
import { resetCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import { resetCanvasThreads } from '@/app/pages/chat/canvas-thread-registry';

const opened = (over: Record<string, unknown> = {}) => ({
  status: 'opened', draftId: 'draft-new', revision: 2, canvasId: 'cv-1', conversationId: 'conv-1', threadRootId: 'root-new',
  canvasName: 'canvas_7', versionName: 'canvas_7_dabc12', fromSeq: null, ...over,
});

function chatValue(slug: string | null = 'ana'): ChatContextValue {
  return {
    userId: ME, status: 'ready', error: null, chats: [], unreadCount: 0, refresh: vi.fn(async () => []), setArchived: vi.fn(), setManualUnread: vi.fn(),
    markRead: vi.fn(), subscribe: () => () => undefined, setViewing: vi.fn(), revision: 0,
    authors: { [ME]: { id: ME, name: 'Ana', slug, avatarUrl: null, avatarColor: null, hasPledged: false } }, missingAuthors: new Set(), ensureAuthors: vi.fn(),
    outbox: [], sendMessage: vi.fn(), retrySend: vi.fn(), discardSend: vi.fn(), block: vi.fn(), unblock: vi.fn(), goToChat: vi.fn(), resync: vi.fn(),
  } as unknown as ChatContextValue;
}

function Where() {
  const l = useLocation();
  const p = new URLSearchParams(l.search);
  return (
    <>
      <output data-testid="path">{l.pathname}</output>
      <output data-testid="ws">{p.get('ws') ?? 'none'}</output>
      <output data-testid="v">{p.get('v') ?? 'none'}</output>
      <output data-testid="from">{(l.state as { from?: string } | null)?.from ?? ''}</output>
    </>
  );
}
function wrap(ui: ReactNode, at: string) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <ChatContext.Provider value={chatValue()}>
        {ui}
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </ChatContext.Provider>
    </MemoryRouter>,
  );
}

function Mirror({ carry = [] as string[] }: { carry?: string[] }) {
  const { start, dialog } = useStartCanvas();
  return (
    <>
      <CanvasPlusMenu />
      <button type="button" onClick={() => void start('ver-2')}>plus-canvas</button>
      <button type="button" onClick={() => void start('ver-2', carry)}>start-with-carry</button>
      {dialog}
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resetCanvasAvailability();
  resetCanvasThreads();
  svc.getCanvasDraftAvailability.mockResolvedValue(true);
  svc.openCanvasDraft.mockResolvedValue(opened());
  svc.discardCanvasDraft.mockResolvedValue({ ok: true, discarded: true });
  svc.sendCanvasWorkspaceMessage.mockResolvedValue({ ok: true, runId: 'r', revision: 3, draftId: 'draft-new', versionName: 'x', start: null });
});
afterEach(cleanup);

const expectWorkspace = async (canvas: string, version: string) => {
  await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(`/p/ana/canvas/${canvas}`));
  expect(screen.getByTestId('ws')).toHaveTextContent('1');
  expect(screen.getByTestId('v')).toHaveTextContent(version);
};

describe('S3b.3: each start lands on the workspace of the new draft', () => {
  it('Artifacts New canvas: /p/<me>/canvas/<tag>?v=<draft>&ws=1, not the chat thread; ← returns to Artifacts', async () => {
    wrap(<NewCanvasButton searchOpen={false} />, '/artifacts?tab=canvases');
    fireEvent.click(await screen.findByTestId('artifacts-new-canvas'));
    await expectWorkspace('canvas_7', 'canvas_7_dabc12');
    expect(screen.getByTestId('path').textContent).not.toContain('/chats');
    expect(screen.getByTestId('from')).toHaveTextContent('/artifacts?tab=canvases');
    expect(svc.openCanvasDraft).toHaveBeenCalledWith(null);
  });

  it('the mirror chat\'s + > New canvas: the same', async () => {
    wrap(<Mirror />, '/chats/c/conv-1');
    fireEvent.pointerDown(await screen.findByTestId('composer-plus'), { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'New canvas' }));
    await expectWorkspace('canvas_7', 'canvas_7_dabc12');
    expect(screen.getByTestId('from')).toHaveTextContent('/chats/c/conv-1');
  });

  it('start from a picked version (the hook\'s contract; no screen calls it with a version since 3c X3): the workspace on the draft made from it', async () => {
    svc.openCanvasDraft.mockResolvedValue(opened({ canvasName: 'sales_map', versionName: 'sales_map_d99', fromSeq: 1 }));
    wrap(<Mirror />, '/chats/c/conv-1');
    fireEvent.click(await screen.findByText('plus-canvas'));
    await expectWorkspace('sales_map', 'sales_map_d99');
    expect(svc.openCanvasDraft).toHaveBeenCalledWith('ver-2');
  });

  it('an open draft elsewhere: Continue lands on THAT draft\'s workspace', async () => {
    svc.openCanvasDraft.mockResolvedValue(opened({ status: 'open_elsewhere', draftId: 'draft-open', canvasName: 'sales_map', versionName: 'sales_map_dopen', fromSeq: 1 }));
    wrap(<Mirror />, '/chats/c/conv-1');
    fireEvent.click(await screen.findByText('plus-canvas'));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue it there' }));
    await expectWorkspace('sales_map', 'sales_map_dopen');
    expect(svc.discardCanvasDraft).not.toHaveBeenCalled();
  });

  it('an open draft elsewhere: Discard then start lands on the NEW draft\'s workspace', async () => {
    svc.openCanvasDraft
      .mockResolvedValueOnce(opened({ status: 'open_elsewhere', draftId: 'draft-open', canvasName: 'sales_map', versionName: 'sales_map_dopen', fromSeq: 1 }))
      .mockResolvedValueOnce(opened({ canvasName: 'sales_map', versionName: 'sales_map_dnew', fromSeq: 1 }));
    wrap(<Mirror />, '/chats/c/conv-1');
    fireEvent.click(await screen.findByText('plus-canvas'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard it and start here' }));
    await expectWorkspace('sales_map', 'sales_map_dnew');
    expect(svc.discardCanvasDraft).toHaveBeenCalledWith('draft-open', 2);
  });

  it('change requests are still carried into the new thread as one engine message, and the owner still lands on the workspace', async () => {
    wrap(<Mirror carry={['shorter wording', 'add a pricing box']} />, '/chats/c/conv-1');
    fireEvent.click(await screen.findByText('start-with-carry'));
    await expectWorkspace('canvas_7', 'canvas_7_dabc12');
    expect(svc.sendCanvasWorkspaceMessage).toHaveBeenCalledTimes(1);
    expect(svc.sendCanvasWorkspaceMessage.mock.calls[0]![0]).toMatchObject({ canvasId: 'cv-1', expectedDraftId: 'draft-new', body: expect.stringContaining('shorter wording') });
  });

  it('a failed start is said in a sentence and nothing navigates', async () => {
    const { CanvasDraftRefusal } = await import('@/app/data/canvas-draft-service');
    svc.openCanvasDraft.mockRejectedValueOnce(new CanvasDraftRefusal('TOO_MANY_DRAFTS'));
    wrap(<NewCanvasButton searchOpen={false} />, '/artifacts?tab=canvases');
    fireEvent.click(await screen.findByTestId('artifacts-new-canvas'));
    await waitFor(() => expect(toastFn.error).toHaveBeenCalledWith(expect.stringContaining('too many open canvas drafts')));
    expect(screen.getByTestId('path')).toHaveTextContent('/artifacts');
  });

  it('CONTROL: an owner whose slug is not known gets a sentence, not a broken address', async () => {
    render(
      <MemoryRouter initialEntries={['/artifacts?tab=canvases']}>
        <ChatContext.Provider value={chatValue(null)}>
          <NewCanvasButton searchOpen={false} />
          <Routes><Route path="*" element={<Where />} /></Routes>
        </ChatContext.Provider>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByTestId('artifacts-new-canvas'));
    await waitFor(() => expect(toastFn.error).toHaveBeenCalled());
    expect(screen.getByTestId('path')).toHaveTextContent('/artifacts');
  });
});
