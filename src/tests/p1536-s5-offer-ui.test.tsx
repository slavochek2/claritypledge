/**
 * @file p1536-s5-offer-ui.test.tsx
 * @description P1536 S5 (J7 to J10, client): the offer rows in the two places a thread can show them, with the server calls mocked.
 *  - an OPEN draft's thread (`useOpenOfferRows`): one block under the thread's newest message, read once per change of the draft, never while a run is going or the tab is hidden;
 *    a status in place of the buttons while an update runs; Make it about this and Start a canvas call the server with the revision the rows were read at.
 *  - a CLOSED thread (`CanvasClosedLine`, X11 / J10): Start only, a started offer's Open, the expired line, the ×; the read ends in a readable line with Try again.
 *  - a stale or refused answer never decides navigation: the owner lands in the new canvas only on a success the server just gave.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasOffersRead } from '@/app/data/canvas-draft-offers';
import type { ChatMessage } from '@/app/data/chat-service';
import type { CanvasThread } from '@/app/pages/chat/use-canvas-thread';

const svc = vi.hoisted(() => ({ readCanvasOffers: vi.fn(), switchCanvasFocus: vi.fn(), forkCanvasFromOffer: vi.fn(), dismissCanvasOffer: vi.fn(), getCanvasRootCard: vi.fn(), toastError: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/app/data/canvas-draft-offers', () => ({ readCanvasOffers: svc.readCanvasOffers, switchCanvasFocus: svc.switchCanvasFocus, forkCanvasFromOffer: svc.forkCanvasFromOffer, dismissCanvasOffer: svc.dismissCanvasOffer }));
vi.mock('@/app/data/canvas-draft-service', async () => ({ ...(await vi.importActual<object>('@/app/data/canvas-draft-service')), getCanvasRootCard: svc.getCanvasRootCard }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: svc.toastError }) }));
const chat = vi.hoisted(() => ({ value: { userId: 'me', authors: { me: { slug: 'ana' } } } }));
vi.mock('@/app/pages/chat/chat-state', () => ({ useChat: () => chat.value }));

import { CanvasClosedLine } from '@/app/pages/chat/CanvasClosedLine';
import { newestThreadMessageId, useOpenOfferRows, withOfferRows } from '@/app/pages/chat/use-canvas-open-offers';
import { OFFERS_READ_DEADLINE_MS } from '@/app/pages/chat/use-canvas-offers';

const read = (over: Partial<CanvasOffersRead> = {}): CanvasOffersRead => ({
  draftId: 'draft-1', revision: 7, closed: false, materialExpired: false,
  offers: [{ id: 'o-1', group: 'Agencies', why: null, state: 'offered', startedCanvasId: null }], ...over,
});
const closedRead = (over: Partial<CanvasOffersRead> = {}) => read({ closed: true, ...over });

const msg = (id: string, createdAt: string, over: Partial<ChatMessage> = {}) => ({ id, createdAt, isDeleted: false, ...over }) as ChatMessage;
const MESSAGES = [msg('root', '2026-11-02T09:00:00Z'), msg('m-1', '2026-11-02T09:01:00Z'), msg('m-2', '2026-11-02T09:02:00Z')];
const thread = (over: { running?: boolean; runState?: string; revision?: number; state?: string; reload?: () => Promise<void> } = {}): CanvasThread => ({
  draft: { id: 'draft-1', canvasId: 'cv-1', state: over.state ?? 'open', revision: over.revision ?? 7, runCount: 1 } as CanvasThread['draft'],
  run: { id: 'run-1', state: over.runState ?? 'done', kind: 'message' } as CanvasThread['run'],
  running: over.running ?? false, lastDraftAt: null, reload: over.reload ?? (async () => undefined),
});

function Where() {
  const l = useLocation();
  return <p data-testid="where">{`${l.pathname}${l.search}`}</p>;
}
function OpenRows({ t }: { t: CanvasThread }) {
  const rows = useOpenOfferRows(t, MESSAGES, 'root');
  return <MemoryRouterFree rows={rows} />;
}
function MemoryRouterFree({ rows }: { rows: { afterId: string; node: React.ReactNode } | null }) {
  return <div data-testid="host" data-after={rows?.afterId ?? ''}>{rows?.node}</div>;
}
const mountOpen = (t: CanvasThread) => render(<MemoryRouter initialEntries={['/chat']}><Routes><Route path="*" element={<><OpenRows t={t} /><Where /></>} /></Routes></MemoryRouter>);
const mountClosed = () => render(
  <MemoryRouter initialEntries={['/chat/c1']}>
    <Routes><Route path="*" element={<><CanvasClosedLine rootId="root-1" versionId="ver-1" viewerId="me" draftState="published" canvasId="cv-1" draftId="draft-1" /><Where /></>} /></Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  vi.clearAllMocks();
  svc.readCanvasOffers.mockResolvedValue(read());
  svc.getCanvasRootCard.mockResolvedValue({ title: 'Canvas', label: 'v1', state: 'published', draft: false, href: '/p/ana/canvas/canvas_4?v=v1', openHref: '/p/ana/canvas/canvas_4?v=v1', seq: 1, hasThread: true, draftId: 'draft-1' });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers(); // a test that failed under fake timers must not leave them on for the next
  vi.restoreAllMocks();
});

describe('an OPEN draft\'s thread: one block under the newest message', () => {
  it('reads the offers once the newest run has settled and draws one row per live offer under the newest message, with both buttons and a ×', async () => {
    mountOpen(thread());
    expect(await screen.findByTestId('canvas-offer-row')).toHaveTextContent('Agencies');
    expect(screen.getByTestId('host')).toHaveAttribute('data-after', 'm-2');
    expect(svc.readCanvasOffers).toHaveBeenCalledTimes(1);
    expect(svc.readCanvasOffers).toHaveBeenCalledWith('cv-1', 'draft-1');
    expect(screen.getByRole('button', { name: 'Make it about this' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start a canvas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss Agencies' })).toBeInTheDocument();
  });

  it('a focused or dismissed offer draws nothing; with no live offer the thread has no block at all', async () => {
    svc.readCanvasOffers.mockResolvedValue(read({ offers: [{ id: 'o-2', group: 'Cafes', why: null, state: 'focused', startedCanvasId: null }, { id: 'o-3', group: 'Schools', why: null, state: 'dismissed', startedCanvasId: null }] }));
    mountOpen(thread());
    await waitFor(() => expect(svc.readCanvasOffers).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByTestId('canvas-offers')).toBeNull();
    expect(screen.getByTestId('host')).toHaveAttribute('data-after', '');
  });

  it('a run is going: NO read, and a status ("Updating…") takes the buttons\' place once the offers are known; never a disabled button', async () => {
    const { rerender } = render(<MemoryRouter><OpenRows t={thread()} /></MemoryRouter>);
    await screen.findByTestId('canvas-offer-row');
    rerender(<MemoryRouter><OpenRows t={thread({ running: true, runState: 'running' })} /></MemoryRouter>);
    expect(screen.getByTestId('canvas-offer-status')).toHaveTextContent('Updating…');
    expect(screen.queryByRole('button', { name: 'Make it about this' })).toBeNull();
    expect(screen.queryByTestId('canvas-offer-dismiss')).toBeNull();
    expect(svc.readCanvasOffers).toHaveBeenCalledTimes(1);
  });

  it('a read that says nothing about other canvases never hides the buttons; another canvas updating is said AFTER a refusal, for a moment, then the buttons are back (a status that always ends)', async () => {
    vi.useFakeTimers();
    svc.switchCanvasFocus.mockResolvedValue({ ok: false, refused: 'busy_elsewhere', revision: 7 });
    mountOpen(thread());
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    fireEvent.click(screen.getByRole('button', { name: 'Make it about this' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(screen.getByTestId('canvas-offer-status')).toHaveTextContent('Another of your canvases is updating.');
    expect(screen.queryByRole('button', { name: 'Make it about this' })).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_500); });
    expect(screen.queryByTestId('canvas-offer-status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Make it about this' })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('coming back to the tab reads once more even when the draft did not change (what was read before may be behind), and the rows follow it', async () => {
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    mountOpen(thread());
    await screen.findByTestId('canvas-offer-row');
    expect(svc.readCanvasOffers).toHaveBeenCalledTimes(1);
    vis.mockReturnValue('hidden');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(svc.readCanvasOffers).toHaveBeenCalledTimes(1); // hidden: nothing
    svc.readCanvasOffers.mockResolvedValue(read({ offers: [{ id: 'o-5', group: 'Schools', why: null, state: 'offered', startedCanvasId: null }] }));
    vis.mockReturnValue('visible');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(svc.readCanvasOffers).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Schools')).toBeInTheDocument();
    vis.mockRestore();
  });

  it('a tab hidden while the read is out does not leave the wait without an end: coming back reads again, and that read has its own deadline', async () => {
    vi.useFakeTimers();
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    svc.readCanvasOffers.mockImplementation(() => new Promise(() => undefined)); // every read stalls
    mountOpen(thread());
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    vis.mockReturnValue('hidden');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); }); // hidden for 30 seconds: nothing says anything
    vis.mockReturnValue('visible');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(100); });
    expect(svc.readCanvasOffers).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('The other canvases did not load.')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(OFFERS_READ_DEADLINE_MS + 500); });
    expect(screen.getByText('The other canvases did not load.')).toBeInTheDocument();
    vis.mockRestore();
    vi.useRealTimers();
  });

  it('an OLDER read that answers late never overwrites the read a Try again made (the newest request wins)', async () => {
    vi.useFakeTimers();
    let answerA: (v: unknown) => void = () => undefined;
    svc.readCanvasOffers.mockImplementationOnce(() => new Promise((r) => { answerA = r; }));
    svc.readCanvasOffers.mockResolvedValueOnce(read({ offers: [{ id: 'o-b', group: 'Agencies B', why: null, state: 'offered', startedCanvasId: null }] }));
    mountOpen(thread());
    await act(async () => { await vi.advanceTimersByTimeAsync(OFFERS_READ_DEADLINE_MS + 500); });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(screen.getByText('Agencies B')).toBeInTheDocument();
    await act(async () => { answerA(read({ offers: [{ id: 'o-a', group: 'Old answer A', why: null, state: 'offered', startedCanvasId: null }] })); await vi.advanceTimersByTimeAsync(50); });
    expect(screen.getByText('Agencies B')).toBeInTheDocument();
    expect(screen.queryByText('Old answer A')).toBeNull();
    vi.useRealTimers();
  });

  it('a read that failed and a run that then starts and settles at the SAME key: the failure is not lost (it is asked again, or still said)', async () => {
    svc.readCanvasOffers.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(read());
    const { rerender } = render(<MemoryRouter><OpenRows t={thread()} /></MemoryRouter>);
    expect(await screen.findByText('The other canvases did not load.')).toBeInTheDocument();
    rerender(<MemoryRouter><OpenRows t={thread({ running: true, runState: 'running' })} /></MemoryRouter>);
    rerender(<MemoryRouter><OpenRows t={thread()} /></MemoryRouter>);
    await waitFor(() => expect(screen.queryByText('The other canvases did not load.') !== null || screen.queryByTestId('canvas-offer-row') !== null).toBe(true));
  });

  it('the same draft re-rendered reads nothing more; a new revision (any mutation moves it) reads once', async () => {
    const { rerender } = render(<MemoryRouter><OpenRows t={thread()} /></MemoryRouter>);
    await screen.findByTestId('canvas-offer-row');
    rerender(<MemoryRouter><OpenRows t={thread()} /></MemoryRouter>);
    await act(async () => {});
    expect(svc.readCanvasOffers).toHaveBeenCalledTimes(1);
    rerender(<MemoryRouter><OpenRows t={thread({ revision: 8 })} /></MemoryRouter>);
    await waitFor(() => expect(svc.readCanvasOffers).toHaveBeenCalledTimes(2));
  });

  it('a hidden tab reads nothing; coming back reads once', async () => {
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    mountOpen(thread());
    await act(async () => {});
    expect(svc.readCanvasOffers).not.toHaveBeenCalled();
    vis.mockReturnValue('visible');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(svc.readCanvasOffers).toHaveBeenCalledTimes(1));
    vis.mockRestore();
  });

  it('Make it about this: the server gets the offer and the revision the rows were read at; the thread is re-read; a refusal says why and changes nothing', async () => {
    const reload = vi.fn(async () => undefined);
    svc.switchCanvasFocus.mockResolvedValue({ ok: true, runId: 'run-9', revision: 8, replayed: false, start: { ok: true } });
    mountOpen(thread({ reload }));
    fireEvent.click(await screen.findByRole('button', { name: 'Make it about this' }));
    await waitFor(() => expect(svc.switchCanvasFocus).toHaveBeenCalledWith(expect.objectContaining({ draftId: 'draft-1', offerId: 'o-1', expectedRevision: 7, clientId: expect.any(String) })));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(svc.toastError).not.toHaveBeenCalled();
    expect(screen.getByTestId('where')).toHaveTextContent('/chat');
  });

  it('while the switch is out the row says so in place of its buttons (a status, never a disabled button), and a second tap starts nothing', async () => {
    let finish: (v: unknown) => void = () => undefined;
    svc.switchCanvasFocus.mockImplementationOnce(() => new Promise((r) => { finish = r; }));
    mountOpen(thread());
    fireEvent.click(await screen.findByRole('button', { name: 'Make it about this' }));
    expect(await screen.findByText('Switching…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make it about this' })).toBeNull();
    expect(screen.queryByTestId('canvas-offer-dismiss')).toBeNull();
    expect(svc.switchCanvasFocus).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ ok: true, runId: 'run-9', revision: 8, replayed: false, start: { ok: true } }); });
    await waitFor(() => expect(screen.queryByText('Switching…')).toBeNull());
  });

  it.each([['busy', 'A draft is already being written'], ['stale_view', 'This draft changed since you last looked'], ['cap_reached', 'used all its revisions']])('a %s refusal on the switch is said once and the owner stays where they are', async (code, said) => {
    svc.switchCanvasFocus.mockResolvedValue({ ok: false, refused: code, revision: 9 });
    mountOpen(thread());
    fireEvent.click(await screen.findByRole('button', { name: 'Make it about this' }));
    await waitFor(() => expect(svc.toastError).toHaveBeenCalledWith(expect.stringContaining(said)));
    expect(screen.getByTestId('where')).toHaveTextContent('/chat');
    // the screen is behind: the rows are read again
    await waitFor(() => expect(svc.readCanvasOffers).toHaveBeenCalledTimes(2));
  });

  it('Start a canvas: the new canvas\'s workspace opens on the success the server gave (its own draft and version), with a way back', async () => {
    svc.forkCanvasFromOffer.mockResolvedValue({ ok: true, alreadyStarted: false, canvasId: 'cv-new', canvasName: 'canvas_5', versionName: 'canvas_v5', draftId: 'draft-new', threadRootId: 'root-new', runId: 'run-f', start: { ok: true } });
    mountOpen(thread());
    fireEvent.click(await screen.findByRole('button', { name: 'Start a canvas' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/p/ana/canvas/canvas_5?v=canvas_v5&ws=1'));
    expect(svc.forkCanvasFromOffer).toHaveBeenCalledWith(expect.objectContaining({ draftId: 'draft-1', offerId: 'o-1', expectedRevision: 7 }));
  });

  it.each(['busy', 'busy_elsewhere', 'stale_view', 'expired', 'not_offered'])('a %s refusal on Start NEVER navigates', async (code) => {
    svc.forkCanvasFromOffer.mockResolvedValue({ ok: false, refused: code, revision: 9 });
    mountOpen(thread());
    fireEvent.click(await screen.findByRole('button', { name: 'Start a canvas' }));
    await waitFor(() => expect(svc.readCanvasOffers).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('where')).toHaveTextContent('/chat');
  });

  it('a Start whose run could not be started says so (the way Make it about this does) and still lands in the new canvas, whose own thread starts the run again', async () => {
    svc.forkCanvasFromOffer.mockResolvedValue({ ok: true, alreadyStarted: false, canvasId: 'cv-new', canvasName: 'canvas_5', versionName: 'canvas_v5', draftId: 'draft-new', threadRootId: 'root-new', runId: 'run-f', start: { ok: false, code: 'BUSY' } });
    mountOpen(thread());
    fireEvent.click(await screen.findByRole('button', { name: 'Start a canvas' }));
    await waitFor(() => expect(svc.toastError).toHaveBeenCalledWith(expect.stringContaining('A draft is already being written')));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/p/ana/canvas/canvas_5?v=canvas_v5&ws=1'));
  });

  it('a lost answer (the call throws) is said, and the retry carries the SAME client id (never a second canvas)', async () => {
    svc.forkCanvasFromOffer.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: false, refused: 'busy', revision: 7 });
    mountOpen(thread());
    fireEvent.click(await screen.findByRole('button', { name: 'Start a canvas' }));
    await waitFor(() => expect(svc.toastError).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole('button', { name: 'Start a canvas' }));
    await waitFor(() => expect(svc.forkCanvasFromOffer).toHaveBeenCalledTimes(2));
    const [first, second] = svc.forkCanvasFromOffer.mock.calls.map((c) => c[0].clientId);
    expect(first).toBe(second);
  });

  it('the small ×: dismisses with the revision the rows were read at, then the rows are read again', async () => {
    svc.dismissCanvasOffer.mockResolvedValue({ ok: true, revision: 8 });
    svc.readCanvasOffers.mockResolvedValueOnce(read()).mockResolvedValueOnce(read({ revision: 8, offers: [{ id: 'o-1', group: 'Agencies', why: null, state: 'dismissed', startedCanvasId: null }] }));
    mountOpen(thread());
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss Agencies' }));
    await waitFor(() => expect(svc.dismissCanvasOffer).toHaveBeenCalledWith({ draftId: 'draft-1', offerId: 'o-1', expectedRevision: 7 }));
    await waitFor(() => expect(screen.queryByTestId('canvas-offers')).toBeNull());
  });

  it('a read that is refused is said with Try again, and Try again reads again', async () => {
    svc.readCanvasOffers.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(read());
    mountOpen(thread());
    expect(await screen.findByText('The other canvases did not load.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('canvas-offer-row')).toBeInTheDocument();
    expect(screen.queryByText('The other canvases did not load.')).toBeNull();
  });

  it('a read that STALLS ends in the same line at the deadline (a wait never hangs), and a late answer still replaces it', async () => {
    vi.useFakeTimers();
    let answer: (v: unknown) => void = () => undefined;
    svc.readCanvasOffers.mockImplementationOnce(() => new Promise((r) => { answer = r; }));
    mountOpen(thread());
    await act(async () => { await vi.advanceTimersByTimeAsync(OFFERS_READ_DEADLINE_MS - 500); });
    expect(screen.queryByText('The other canvases did not load.')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(screen.getByText('The other canvases did not load.')).toBeInTheDocument();
    await act(async () => { answer(read()); });
    expect(screen.getByTestId('canvas-offer-row')).toBeInTheDocument();
    expect(screen.queryByText('The other canvases did not load.')).toBeNull();
    vi.useRealTimers();
  });

  it('renders as a thread: the rows sit in the message column (a 62px indent), one secondary look, and a 44px ×', async () => {
    mountOpen(thread());
    const block = await screen.findByTestId('canvas-offers');
    expect(block.className).toContain('pl-[62px]');
    expect(screen.getByRole('button', { name: 'Start a canvas' }).className).toContain('border-blue-600'); // the one secondary pill, never filled
    expect(screen.getByRole('button', { name: 'Dismiss Agencies' }).className).toContain('h-11');
  });
});

describe('a CLOSED thread (X11, J10): live offer rows above the closed line', () => {
  it('Start only (a closed draft has no focus to switch), above "Published as v1."', async () => {
    svc.readCanvasOffers.mockResolvedValue(closedRead());
    mountClosed();
    expect(await screen.findByTestId('canvas-offer-row')).toHaveTextContent('Agencies');
    expect(screen.queryByRole('button', { name: 'Make it about this' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Start a canvas' })).toBeInTheDocument();
    expect(screen.getByTestId('canvas-closed-line')).toHaveTextContent('Published as v1.');
    const rows = screen.getByTestId('canvas-offers');
    expect(rows.compareDocumentPosition(screen.getByTestId('canvas-closed-line')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(svc.readCanvasOffers).toHaveBeenCalledTimes(1); // once, when opened
  });

  it('Start opens the new canvas\'s workspace; a refusal does not', async () => {
    svc.readCanvasOffers.mockResolvedValue(closedRead());
    svc.forkCanvasFromOffer.mockResolvedValue({ ok: true, alreadyStarted: false, canvasId: 'cv-new', canvasName: 'canvas_5', versionName: 'canvas_v5', draftId: 'draft-new', threadRootId: 'root-new', runId: 'run-f', start: { ok: true } });
    mountClosed();
    fireEvent.click(await screen.findByRole('button', { name: 'Start a canvas' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/p/ana/canvas/canvas_5?v=canvas_v5&ws=1'));
    expect(svc.forkCanvasFromOffer).toHaveBeenCalledWith(expect.objectContaining({ draftId: 'draft-1', offerId: 'o-1', expectedRevision: 7 }));
  });

  it('a started offer reads "Agencies canvas started" with Open, and Open lands in that canvas (its draft closed: the canvas page, no workspace)', async () => {
    svc.readCanvasOffers.mockResolvedValue(closedRead({ offers: [{ id: 'o-1', group: 'Agencies', why: null, state: 'started', startedCanvasId: 'cv-new' }] }));
    svc.forkCanvasFromOffer.mockResolvedValue({ ok: true, alreadyStarted: true, canvasId: 'cv-new', canvasName: 'canvas_5', versionName: null, draftId: null, threadRootId: null, runId: null, start: null });
    mountClosed();
    expect(await screen.findByText('Agencies canvas started')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start a canvas' })).toBeNull();
    expect(screen.queryByTestId('canvas-offer-dismiss')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/p/ana/canvas/canvas_5'));
    expect(screen.getByTestId('where').textContent).not.toContain('ws=1');
  });

  it('an action is out: the started row\'s Open and the other rows\' buttons give way to a status too (never a live button that fires twice); a double tap on Open starts one call', async () => {
    let finish: (v: unknown) => void = () => undefined;
    svc.readCanvasOffers.mockResolvedValue(closedRead({ offers: [
      { id: 'o-1', group: 'Agencies', why: null, state: 'offered', startedCanvasId: null },
      { id: 'o-2', group: 'Schools', why: null, state: 'started', startedCanvasId: 'cv-9' },
      { id: 'o-3', group: 'Clinics', why: null, state: 'offered', startedCanvasId: null },
    ] }));
    svc.forkCanvasFromOffer.mockImplementationOnce(() => new Promise((r) => { finish = r; }));
    mountClosed();
    const open = await screen.findByRole('button', { name: 'Open' });
    fireEvent.click(open);
    fireEvent.click(open); // a double tap
    expect(await screen.findByText('Starting…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start a canvas' })).toBeNull(); // the other rows wait too
    expect(svc.forkCanvasFromOffer).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ ok: false, refused: 'not_offered', revision: 7 }); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument());
  });

  it('material expired: the buttons are replaced by "Send the material again to start this canvas." (the × stays)', async () => {
    svc.readCanvasOffers.mockResolvedValue(closedRead({ materialExpired: true }));
    mountClosed();
    expect(await screen.findByText('Send the material again to start this canvas.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start a canvas' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Dismiss Agencies' })).toBeInTheDocument();
  });

  it('a Start refused as expired reads again, and the row then says it', async () => {
    svc.readCanvasOffers.mockResolvedValueOnce(closedRead()).mockResolvedValueOnce(closedRead({ materialExpired: true }));
    svc.forkCanvasFromOffer.mockResolvedValue({ ok: false, refused: 'expired', revision: 7 });
    mountClosed();
    fireEvent.click(await screen.findByRole('button', { name: 'Start a canvas' }));
    expect(await screen.findByText('Send the material again to start this canvas.')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/chat/c1');
  });

  it('dismissing the last offer leaves only the closed line', async () => {
    svc.dismissCanvasOffer.mockResolvedValue({ ok: true, revision: 8 });
    svc.readCanvasOffers.mockResolvedValueOnce(closedRead()).mockResolvedValueOnce(closedRead({ revision: 8, offers: [{ id: 'o-1', group: 'Agencies', why: null, state: 'dismissed', startedCanvasId: null }] }));
    mountClosed();
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss Agencies' }));
    await waitFor(() => expect(screen.queryByTestId('canvas-offers')).toBeNull());
    expect(screen.getByTestId('canvas-closed-line')).toHaveTextContent('Published as v1.');
  });

  it('a thread opened without its canvas (no ids) reads no offers and draws none', async () => {
    render(<MemoryRouter><CanvasClosedLine rootId="root-1" versionId="ver-1" viewerId="me" draftState="published" /></MemoryRouter>);
    await screen.findByTestId('canvas-closed-line');
    expect(svc.readCanvasOffers).not.toHaveBeenCalled();
    expect(screen.queryByTestId('canvas-offers')).toBeNull();
  });

  it('a discarded draft keeps no offers: nothing is read', async () => {
    render(<MemoryRouter><CanvasClosedLine rootId="root-1" versionId="ver-1" viewerId="me" draftState="discarded" canvasId="cv-1" draftId="draft-1" /></MemoryRouter>);
    expect(screen.getByTestId('canvas-closed-line')).toHaveTextContent('This draft was discarded.');
    expect(svc.readCanvasOffers).not.toHaveBeenCalled();
  });
});

describe('the placement helper', () => {
  it('is the newest message that is not the hidden root or deleted', () => {
    expect(newestThreadMessageId([...MESSAGES, msg('m-3', '2026-11-02T09:03:00Z', { isDeleted: true })], 'root')).toBe('m-2');
    expect(newestThreadMessageId([msg('root', '2026-11-02T09:00:00Z')], 'root')).toBeNull();
  });

  it('Undo and the offer block under the same message both show, the offer rows first and Undo last (J7); with no block the nodes are untouched', () => {
    const undo = <p data-testid="u">Undo</p>;
    const rows = { afterId: 'm-2', node: <p data-testid="o">rows</p> };
    const merged = withOfferRows({ 'm-2': undo, 'm-1': <p>x</p> }, rows);
    const { container } = render(<>{merged['m-2']}</>);
    expect(container.textContent).toBe('rowsUndo'); // J7: the buttons, then "Draft ready... Undo"
    expect(Object.keys(merged).sort()).toEqual(['m-1', 'm-2']);
    const same = { 'm-1': undo };
    expect(withOfferRows(same, null)).toBe(same);
    expect(withOfferRows({}, rows)['m-2']).toBe(rows.node);
  });

  it('nothing read yet: no block (never an empty one)', () => {
    const { result } = renderHook(() => useOpenOfferRows(thread(), MESSAGES, 'root'));
    expect(result.current).toBeNull();
  });
});
