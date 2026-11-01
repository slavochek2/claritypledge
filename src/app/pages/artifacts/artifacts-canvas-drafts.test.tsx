/**
 * P1536 v3 on the Artifacts page:
 *  - "New canvas" is on the Canvases tab only (and only with the chat mounted and canvas drafting on); it starts a canvas
 *    thread through the chat's own useStartCanvas
 *  - a canvas with an open draft carries a "Draft open" badge in Mine (W5) and says "v3 · Draft" in its meta on the Drafts tab;
 *    its "…" offers Open draft (the draft canvas, W1) and Discard draft (a confirm first, then the checked discard, then the list reloads)
 * Each "only" has a control showing the same thing present where it should be.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { ChatContextValue } from '@/app/pages/chat/chat-state';

const mocks = vi.hoisted(() => ({
  listMyCanvases: vi.fn(),
  listMyOpenCanvasDrafts: vi.fn(),
  discardCanvasDraft: vi.fn(),
  start: vi.fn(),
  availability: { current: true as boolean | null },
}));

const signedIn = { user: { id: 'me', slug: 'me' }, isLoading: false, sessionChecked: true };
vi.mock('@/auth', () => ({ useAuth: () => signedIn }));
vi.mock('@/app/data/docs-service', () => ({ docsService: { getDocsByUserOrThrow: vi.fn(async () => []), createDoc: vi.fn(), deleteDoc: vi.fn() } }));
vi.mock('@/app/data/letters-service', () => ({
  getAllSentLettersOrThrow: vi.fn(async () => []),
  getDeliveriesForLettersOrThrow: vi.fn(async () => ({})),
  getInboxItems: vi.fn(async () => []),
  getAllReceivedLetters: vi.fn(async () => []),
  markDeliveryRead: vi.fn(),
  deleteLetter: vi.fn(),
  clearSenderNewForDelivery: vi.fn(),
  getUnreadExplainBackCountsByDelivery: vi.fn(async () => ({})),
}));
vi.mock('@/app/data/canvas-service', () => ({
  canvasService: { listMyCanvases: mocks.listMyCanvases, listSharedWithMe: vi.fn(async () => []), getAccess: vi.fn(), markCanvasRead: vi.fn() },
}));
vi.mock('@/app/data/canvas-open-drafts', () => ({ listMyOpenCanvasDrafts: mocks.listMyOpenCanvasDrafts }));
vi.mock('@/app/data/canvas-draft-service', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-draft-service')), discardCanvasDraft: mocks.discardCanvasDraft }));
vi.mock('@/app/hooks/useOpenLiveInvite', () => ({ useOpenLiveInvite: () => ({ invite: null, loading: false }) }));
vi.mock('@/app/pages/chat/use-canvas-availability', () => ({ useCanvasDraftAvailability: () => mocks.availability.current }));
vi.mock('@/app/pages/chat/use-start-canvas', () => ({ useStartCanvas: () => ({ start: mocks.start, dialog: <div data-testid="start-dialog" /> }) }));
vi.mock('@/app/components/canvas/canvas-share-control', () => ({ CanvasShareControl: () => null }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

import { toast } from 'sonner';
import { ChatContext } from '@/app/pages/chat/chat-state';
import { ArtifactsPage } from './artifacts-page';

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const DAY = 24 * 3600_000;
const draft = (over: Record<string, unknown> = {}) => ({
  draftId: 'draft-1', canvasName: 'sales_map', versionName: 'sales_map_dabc12', conversationId: 'conv-mirror', threadRootId: 'root-9', nextSeq: 3, revision: 4, ...over,
});

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}
function renderPage(url: string, chat = true) {
  const wrap = (ui: ReactNode) => (chat ? <ChatContext.Provider value={{} as ChatContextValue}>{ui}</ChatContext.Provider> : ui);
  return render(
    <MemoryRouter initialEntries={[url]}>
      {wrap(
        <Routes>
          <Route path="/artifacts" element={<><ArtifactsPage /><LocationProbe /></>} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>,
      )}
    </MemoryRouter>,
  );
}
const badgeShown = () => waitFor(() => expect(screen.getByTestId('artifact-badge')).toHaveTextContent('Draft open'));
const openMenu = async (u: ReturnType<typeof userEvent.setup>, title: string) =>
  u.click(await screen.findByRole('button', { name: `Actions for ${title}` }));
const menuLabels = () => screen.getAllByRole('menuitem').map(m => m.firstElementChild?.textContent ?? m.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  mocks.availability.current = true;
  mocks.listMyCanvases.mockResolvedValue([
    { canvasId: 'cv-1', name: 'sales_map', generalAccess: 'restricted', hasAudience: false, lastEdit: ago(3 * DAY) },
    { canvasId: 'cv-2', name: 'q4_plan', generalAccess: 'restricted', hasAudience: false, lastEdit: ago(5 * DAY) },
  ]);
  mocks.listMyOpenCanvasDrafts.mockResolvedValue([draft()]);
  mocks.discardCanvasDraft.mockResolvedValue({ ok: true, discarded: true });
  mocks.start.mockResolvedValue(undefined);
});

describe('New canvas', () => {
  it('is on the Canvases tab, same style as New letter, and starts a canvas thread with no source version', async () => {
    const u = userEvent.setup();
    renderPage('/artifacts?tab=canvases');
    const button = await screen.findByRole('button', { name: 'New canvas' });
    expect(button.className).toMatch(/\bh-10\b/); // 40px, as New letter
    expect(within(button).getByText('New canvas').className).toContain('min-[360px]:inline'); // full label from 360px
    expect(within(button).getByText('New').className).toContain('min-[360px]:hidden'); // short label below
    expect(screen.queryByRole('button', { name: 'New letter' })).toBeNull();
    await u.click(button);
    expect(mocks.start).toHaveBeenCalledWith(null);
    expect(screen.getByTestId('start-dialog')).toBeInTheDocument(); // the chat's "continue or discard" question has a home
  });

  it('never goes disabled while starting (no dead primary): it says it is busy, and a second tap starts nothing', async () => {
    const u = userEvent.setup();
    let finish: () => void = () => undefined;
    mocks.start.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    renderPage('/artifacts?tab=canvases');
    const button = await screen.findByRole('button', { name: 'New canvas' });
    await u.click(button);
    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'true'));
    expect(button).not.toBeDisabled();
    await u.click(button);
    expect(mocks.start).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'false'));
    await u.click(button);
    expect(mocks.start).toHaveBeenCalledTimes(2); // free again once the first start ended
  });

  it('CONTROL: the Letters tab has New letter and no New canvas', async () => {
    renderPage('/artifacts?tab=letters');
    expect(await screen.findByRole('button', { name: 'New letter' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New canvas' })).toBeNull();
  });

  it('is not offered while canvas drafting is off or unknown, nor without the chat', async () => {
    mocks.availability.current = false;
    renderPage('/artifacts?tab=canvases');
    await screen.findByText('Sales map');
    expect(screen.queryByRole('button', { name: 'New canvas' })).toBeNull();
    cleanup();
    mocks.availability.current = null;
    renderPage('/artifacts?tab=canvases');
    await screen.findByText('Sales map');
    expect(screen.queryByRole('button', { name: 'New canvas' })).toBeNull();
    cleanup();
    mocks.availability.current = true;
    renderPage('/artifacts?tab=canvases', false);
    await screen.findByText('Sales map');
    expect(screen.queryByRole('button', { name: 'New canvas' })).toBeNull();
  });
});

describe('a canvas with an open draft', () => {
  it('W5: Mine says "Edited 3d ago" with a "Draft open" badge on that row only; the Drafts tab says "v3 · Draft" in its meta', async () => {
    renderPage('/artifacts?tab=canvases');
    await badgeShown();
    const rows = screen.getAllByTestId('artifact-row');
    const rowOf = (title: string) => rows.find(r => within(r).queryByText(title))!;
    expect(within(rowOf('Sales map')).getByTestId('artifact-meta')).toHaveTextContent('Edited 3d ago');
    expect(within(rowOf('Q4 plan')).queryByTestId('artifact-badge')).toBeNull();
    cleanup();
    renderPage('/artifacts?tab=canvases&list=drafts');
    await waitFor(() => expect(screen.getAllByTestId('artifact-meta').map(m => m.textContent)).toEqual(['v3 · Draft · Edited 3d ago']));
  });

  it('an unknown number says just "Draft", and an unknown history is NOT treated as never published (Opus r9 F6)', async () => {
    const u = userEvent.setup();
    mocks.listMyOpenCanvasDrafts.mockResolvedValue([draft({ nextSeq: null })]);
    renderPage('/artifacts?tab=canvases');
    await badgeShown(); // an unknown number is not "never published": the canvas stays in Mine, with its Share
    expect(screen.getByRole('button', { name: 'Share: Sales map' })).toBeInTheDocument();
    await openMenu(u, 'Sales map');
    expect(menuLabels()).toEqual(['Open', 'Open draft', 'Copy link', 'Discard draft']);
    await u.click(screen.getByRole('menuitem', { name: 'Open' }));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent(/^\/p\/me\/canvas\/sales_map$/));
  });

  it('the "…" offers Open draft and Discard draft only on that row', async () => {
    const u = userEvent.setup();
    renderPage('/artifacts?tab=canvases');
    await badgeShown();
    await openMenu(u, 'Sales map');
    expect(menuLabels()).toEqual(['Open', 'Open draft', 'Copy link', 'Discard draft']);
    await u.keyboard('{Escape}');
    await openMenu(u, 'Q4 plan');
    expect(menuLabels()).toEqual(['Open', 'Copy link']);
  });

  it('Open draft opens the DRAFT CANVAS with its thread beside it (the chat card\'s Open goes to the same place), not the chat', async () => {
    const u = userEvent.setup();
    renderPage('/artifacts?tab=canvases');
    await badgeShown();
    await openMenu(u, 'Sales map');
    await u.click(await screen.findByRole('menuitem', { name: 'Open draft' }));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/p/me/canvas/sales_map?v=sales_map_dabc12&ws=1'));
    expect(screen.getByTestId('loc').textContent).not.toContain('/chats/');
  });

  it('Discard draft asks first; Cancel discards nothing; Discard calls the checked discard and reloads the list', async () => {
    const u = userEvent.setup();
    renderPage('/artifacts?tab=canvases');
    await badgeShown();
    await openMenu(u, 'Sales map');
    await u.click(await screen.findByRole('menuitem', { name: 'Discard draft' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Discard the draft of “Sales map”? Its changes are removed. Published versions stay as they are.');
    await u.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(mocks.discardCanvasDraft).not.toHaveBeenCalled();

    await openMenu(u, 'Sales map');
    await u.click(await screen.findByRole('menuitem', { name: 'Discard draft' }));
    const reads = mocks.listMyOpenCanvasDrafts.mock.calls.length;
    mocks.listMyOpenCanvasDrafts.mockResolvedValue([]); // the server closed it
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(mocks.discardCanvasDraft).toHaveBeenCalledWith('draft-1', 4));
    expect(toast.success).toHaveBeenCalledWith('Draft discarded');
    await waitFor(() => expect(mocks.listMyOpenCanvasDrafts.mock.calls.length).toBeGreaterThan(reads));
    await waitFor(() => expect(screen.getAllByTestId('artifact-meta').map(m => m.textContent)).toEqual(['Edited 3d ago', 'Edited 5d ago']));
  });

  it('a refused discard (a run is writing) says so and leaves the draft', async () => {
    const u = userEvent.setup();
    mocks.discardCanvasDraft.mockResolvedValue({ ok: false, refused: 'busy', revision: 1 });
    renderPage('/artifacts?tab=canvases');
    await badgeShown();
    await openMenu(u, 'Sales map');
    await u.click(await screen.findByRole('menuitem', { name: 'Discard draft' }));
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('That draft is being written right now. Try again in a minute.'));
    expect(screen.getByTestId('artifact-badge')).toHaveTextContent('Draft open');
  });

  it('a stale discard re-reads the list, and the next attempt sends the draft\'s new revision', async () => {
    const u = userEvent.setup();
    mocks.discardCanvasDraft.mockResolvedValueOnce({ ok: false, refused: 'stale_view', revision: 9 });
    renderPage('/artifacts?tab=canvases');
    await badgeShown();
    const reads = mocks.listMyOpenCanvasDrafts.mock.calls.length;
    mocks.listMyOpenCanvasDrafts.mockResolvedValue([draft({ revision: 9 })]); // what the re-read finds
    await openMenu(u, 'Sales map');
    await u.click(await screen.findByRole('menuitem', { name: 'Discard draft' }));
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(mocks.discardCanvasDraft).toHaveBeenCalledWith('draft-1', 4));
    await waitFor(() => expect(mocks.listMyOpenCanvasDrafts.mock.calls.length).toBeGreaterThan(reads)); // re-read on stale_view
    // the refused discard leaves its dialog open: the same Discard is pressed again, now with the re-read revision
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(mocks.discardCanvasDraft).toHaveBeenLastCalledWith('draft-1', 9));
  });

  it('a canvas whose only version is the open draft (never published) is in Drafts and NOT in Mine: no Share and no Copy link; the row and its Open go to the draft', async () => {
    const u = userEvent.setup();
    mocks.listMyOpenCanvasDrafts.mockResolvedValue([draft({ nextSeq: 1 })]);
    renderPage('/artifacts?tab=canvases');
    await screen.findByText('Q4 plan');
    expect(screen.queryByText('Sales map')).toBeNull(); // W5: no published version, so not in Mine
    expect(screen.getByRole('button', { name: 'Share: Q4 plan' })).toBeInTheDocument(); // CONTROL: a canvas with no draft keeps Share
    cleanup();
    renderPage('/artifacts?tab=canvases&list=drafts');
    await waitFor(() => expect(screen.getAllByTestId('artifact-meta').map(m => m.textContent)).toEqual(['v1 · Draft · Edited 3d ago']));
    const row = screen.getByTestId('artifact-row');
    const buttons = within(within(row).getByTestId('row-actions')).getAllByRole('button').map(b => b.getAttribute('aria-label'));
    expect(buttons).toEqual(['Open: Sales map', 'Actions for Sales map']);
    await openMenu(u, 'Sales map');
    expect(menuLabels()).toEqual(['Open', 'Discard draft']);
    // the discard question does not mention published versions there are none of
    await u.click(screen.getByRole('menuitem', { name: 'Discard draft' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Discard the draft of “Sales map”? Nothing of this canvas was published.');
    expect(dialog).not.toHaveTextContent(/Published versions/);
    await u.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await openMenu(u, 'Sales map');
    await u.click(screen.getByRole('menuitem', { name: 'Open' }));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/p/me/canvas/sales_map?v=sales_map_dabc12&ws=1'));
  });

  it('CONTROL: a draft on a canvas that has published versions keeps Share (it shares the published version)', async () => {
    renderPage('/artifacts?tab=canvases');
    await badgeShown();
    expect(screen.getByRole('button', { name: 'Share: Sales map' })).toBeInTheDocument();
  });

  it('a failed drafts read does not hide the canvases: they list, without draft actions, with one quiet note and a Retry', async () => {
    const u = userEvent.setup();
    mocks.listMyOpenCanvasDrafts.mockRejectedValue(new Error('rls'));
    renderPage('/artifacts?tab=canvases');
    await screen.findByText('Sales map');
    expect(await screen.findByText(/Some items could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong loading your artifacts.')).toBeNull();
    expect(screen.getAllByTestId('artifact-meta').map(m => m.textContent)).toEqual(['Edited 3d ago', 'Edited 5d ago']);
    await openMenu(u, 'Sales map');
    expect(menuLabels()).toEqual(['Open', 'Copy link']);
  });

  it('CONTROL: a failed CANVASES read is still an error, even when the drafts read worked (a decoration never masks it as an empty list)', async () => {
    mocks.listMyCanvases.mockRejectedValue(new Error('down'));
    mocks.listMyOpenCanvasDrafts.mockResolvedValue([draft()]);
    renderPage('/artifacts?tab=canvases');
    expect(await screen.findByText('Something went wrong loading your artifacts.')).toBeInTheDocument();
    expect(screen.queryAllByTestId('artifact-row')).toHaveLength(0);
  });
});
