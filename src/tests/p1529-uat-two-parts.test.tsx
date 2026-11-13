/**
 * P1529 UAT 2026-11-13 (b): the projector's mic icon (F3), the recording bar's states (F5), the canvas page's one back (F6) and the share
 * dialog after Publish (F7). The steps lists and the two-part timing are pinned in p1529-reading-helpers.test.ts and p1529-host-helpers.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const h = vi.hoisted(() => ({
  capture: {} as Record<string, unknown>,
  getMyEventCanvas: vi.fn(),
  setEventCanvas: vi.fn(),
  shareCanvas: vi.fn(),
}));
vi.mock('@/app/contexts/room-capture-context', () => ({ useRoomCapture: () => h.capture }));
vi.mock('@/app/contexts/offline-status-context', () => ({ useConnectivity: () => ({ offline: false }) }));
vi.mock('@/app/data/event-mastermind-service', async importOriginal => ({
  ...(await importOriginal<typeof import('@/app/data/event-mastermind-service')>()),
  getMyEventCanvas: h.getMyEventCanvas,
  setEventCanvas: h.setEventCanvas,
}));
vi.mock('@/app/data/canvas-service', async importOriginal => {
  const real = await importOriginal<typeof import('@/app/data/canvas-service')>();
  return { ...real, canvasService: { ...real.canvasService, shareCanvas: h.shareCanvas } };
});
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { RoomCaptureBar, RoomTranscribeIdleBar } from '@/app/components/session/room-capture-bar';
import { BarRow1 } from '@/app/components/canvas/canvas-bar-parts';
import { MastermindScreen } from '@/app/prototypes/events/rounds/MastermindScreen';
import { EventShareDialog } from '@/app/pages/canvas/EventShareDialog';
import { useEventShareOffer } from '@/app/pages/canvas/use-event-share-offer';
import { isRoundEvent, markRoundEvent } from '@/lib/round-event-registry';
import { afterPublishEventOf } from '@/lib/canvas-hrefs';
import { roundClock, roundTiming } from '@/lib/round-clock';
import { TableStatus } from '@/app/prototypes/events/rounds/table-card-parts';
import { bannerTarget, ownerBarBack } from '@/app/pages/canvas/canvas-workspace-back';
import { PreparationBanner } from '@/app/pages/canvas/PreparationBanner';
import { CanvasPageBack } from '@/app/components/canvas/canvas-page-back';
import { CanvasWorkspaceContext, type CanvasWorkspaceValue } from '@/app/components/canvas/canvas-workspace-context';
import { useEventReturn } from '@/app/pages/canvas/use-preparation-return';
import type { EventRound } from '@/app/data/event-rounds-service';
import type { EventRoomMember } from '@/app/types';

const capturing = (over: Record<string, unknown> = {}) => ({
  phase: 'capturing', roomId: 'r1', open: vi.fn(), endMyCapture: vi.fn(), manualPaused: false, pauseMine: vi.fn(), resumeMine: vi.fn(),
  subscribeLevel: () => () => {}, inputSilent: false, micLost: false, micSwitched: false, stopping: false, pausedByLiveRecord: false,
  reconnectMic: vi.fn(), tapDown: false, audioLost: false, eventId: 'e1', destination: null, conversationId: null,
  isCapturingForEvent: () => true, startCapture: vi.fn(), ...over,
});
beforeEach(() => { h.capture = capturing(); vi.clearAllMocks(); });

describe('F5: the recording bar says only what someone can act on', () => {
  it('on, a round event: the waveform, the word Transcribing, Pause and Stop; no arrival line', () => {
    markRoundEvent('e1');
    render(<RoomCaptureBar short />);
    expect(screen.getByTestId('capture-level-meter')).toBeInTheDocument();
    expect(screen.getByText('Transcribing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop transcribing' })).toBeInTheDocument();
    expect(screen.queryByText(/text arrives after the round/i)).toBeNull();
    expect(screen.queryByTestId('capture-event-hint')).toBeNull();
  });
  it('the waveform moves with the voice', async () => {
    let push: (rms: number) => void = () => {};
    h.capture = capturing({ subscribeLevel: (cb: (rms: number) => void) => { push = cb; return () => {}; } });
    render(<RoomCaptureBar short />);
    expect(screen.getByTestId('capture-level-meter').getAttribute('data-level')).toBe('0');
    act(() => push(0.15));
    await waitFor(() => expect(Number(screen.getByTestId('capture-level-meter').getAttribute('data-level'))).toBeGreaterThan(0));
  });
  it('audio lost is not shown: the bar still says Transcribing, with no warning', () => {
    h.capture = capturing({ audioLost: true });
    render(<RoomCaptureBar short />);
    expect(screen.getByText('Transcribing')).toBeInTheDocument();
    expect(screen.queryByText(/audio gap|could not be saved/i)).toBeNull();
  });
  it('a lost mic and a pause are still said', () => {
    h.capture = capturing({ micLost: true });
    const { unmount } = render(<RoomCaptureBar short />);
    expect(screen.getByText('Mic lost')).toBeInTheDocument();
    unmount();
    h.capture = capturing({ phase: 'paused', manualPaused: true });
    render(<RoomCaptureBar short />);
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });
  it('off: only the Start transcribing button and the info; the info says where the words go', () => {
    h.capture = capturing({ phase: 'idle', isCapturingForEvent: () => false });
    render(<RoomTranscribeIdleBar eventId="e1" displayName="A" onFailed={() => {}} roundUpdates emphasize />);
    expect(screen.getByRole('button', { name: 'Start transcribing' })).toBeInTheDocument();
    expect(screen.queryByText(/not transcribing|text arrives/i)).toBeNull();
    fireEvent.click(screen.getByTestId('capture-info'));
    expect(screen.getByTestId('capture-info-sheet').textContent).toBe("Your table's words appear in your round's chat thread after the round.");
  });
});

describe('F5 non-round events keep their words', () => {
  it('the running bar keeps its arrival hint and the idle bar its status words', () => {
    sessionStorage.clear();
    h.capture = capturing({ eventId: 'plain-night' });
    render(<RoomCaptureBar short />);
    expect(screen.getByTestId('capture-event-hint').textContent).toBe('Text arrives after the round');
    cleanup();
    h.capture = capturing({ phase: 'idle', isCapturingForEvent: () => false });
    render(<RoomTranscribeIdleBar eventId="plain-night" displayName="A" onFailed={() => {}} />);
    expect(screen.getByText('Not transcribing')).toBeInTheDocument();
  });
  it('the canvas page\'s bar (no room around it) says the round-event info for a round event, found by the event\'s id', () => {
    markRoundEvent('e1');
    h.capture = capturing({ eventId: 'e1' });
    render(<RoomCaptureBar short />);
    fireEvent.click(screen.getByTestId('capture-info'));
    expect(screen.getByTestId('capture-info-sheet').textContent).toBe("Your table's words appear in your round's chat thread after the round.");
    expect(screen.queryByTestId('capture-event-hint')).toBeNull();
  });
  it('the registry answers per event and survives a reload (sessionStorage)', () => {
    sessionStorage.clear();
    expect(isRoundEvent('x1')).toBe(false);
    markRoundEvent('x1');
    expect(isRoundEvent('x1')).toBe(true);
    expect(isRoundEvent('x2')).toBe(false);
    expect(JSON.parse(sessionStorage.getItem('round-event-ids')!)).toContain('x1');
  });
});

describe('F3: the projector shows who is transcribing', () => {
  const round = { id: 'r1', roundNo: 1, groupSize: 4, startedAt: new Date().toISOString(), endedAt: null, seatingS: 0, readingS: 0, firstS: 450, secondS: 450, observerS: 180, splitSpeakers: false, matchTag: null, showcase: false } as EventRound;
  const seats = [{ id: 'a', table: 1, role: 'first' as const }, { id: 'b', table: 1, role: 'second' as const }, { id: 'c', table: 1, role: 'observer' as const }];
  const member = (id: string, name: string) => ({ id, displayName: name, profileId: `p-${id}` }) as unknown as EventRoomMember;
  const byId = new Map([['a', member('a', 'Haru Tanaka')], ['b', member('b', 'Erin Wu')], ['c', member('c', 'Sam Lee')]]);
  const renderScreen = (recordingOf?: (id: string) => 'off' | 'silent' | 'words') =>
    render(<MemoryRouter><MastermindScreen round={round} rounds={[round]} seats={seats} byId={byId} room={[]} ended={false} recordingOf={recordingOf} /></MemoryRouter>);

  it('a mic shows beside each person whose transcription is on (silent or words), and none for off', () => {
    renderScreen(id => ({ a: 'words', b: 'off', c: 'silent' } as const)[id as 'a']);
    const seatsEls = screen.getAllByTestId('screen-seat');
    const hasMic = (role: string) => !!seatsEls.find(s => s.getAttribute('data-role') === role)!.querySelector('[data-testid="screen-seat-mic"]');
    expect([hasMic('first'), hasMic('second'), hasMic('observer')]).toEqual([true, false, true]);
  });
  it('no state read yet: no mic anywhere', () => {
    renderScreen(undefined);
    expect(screen.queryByTestId('screen-seat-mic')).toBeNull();
  });
  it('the part with the time left, and the next line naming only the next real part; no finding-tables or reading words', () => {
    renderScreen(() => 'off');
    // ONE countdown: the big clock, with the part beside it; the line under it only names what comes next.
    expect(screen.getByTestId('screen-part-line').textContent).toBe('Talk');
    expect(screen.getAllByTestId('round-clock')).toHaveLength(1);
    expect(screen.getByTestId('round-clock').textContent).toMatch(/^1[45]:\d\d$/);
    expect(screen.getByTestId('screen-next-line').textContent).toBe('then 3 min observer');
    expect(document.body.textContent?.match(/\d+:\d\d/g)).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(/find your table|reading|finding tables|undefined/i);
  });
  it('a round saved before the change (finding the table, reading) shows its own part name, never "undefined" or "Talk"', () => {
    const old = { ...round, seatingS: 120, readingS: 180 } as EventRound;
    const view = render(<MemoryRouter><MastermindScreen round={old} rounds={[old]} seats={seats} byId={byId} room={[]} ended={false} recordingOf={() => 'off'} /></MemoryRouter>);
    expect(view.getByTestId('screen-part-line').textContent).toBe('Find your table');
    expect(view.container.textContent).not.toMatch(/undefined/);
  });
  it('no icons when the state reader is withheld (between rounds the page passes none)', () => {
    renderScreen(undefined);
    expect(screen.queryByTestId('screen-seat-mic')).toBeNull();
  });
});

describe('F6: one back on the canvas page when it is opened from the event', () => {
  const row = (onBack?: () => void) => render(<MemoryRouter><BarRow1 ready={null} row={null} title="" canRename={false} onRename={() => {}} onPick={() => {}} onBack={onBack} /></MemoryRouter>);
  it('the header has no back of its own when the banner above carries it', () => {
    row(undefined);
    expect(screen.queryByTestId('workspace-back')).toBeNull();
  });
  it('anywhere else the header keeps its back', () => {
    const onBack = vi.fn();
    row(onBack);
    fireEvent.click(screen.getByTestId('workspace-back'));
    expect(onBack).toHaveBeenCalled();
  });
});

describe('F7: the share dialog after Publish', () => {
  it('reads the event from the navigation state', () => {
    expect(afterPublishEventOf({ afterPublishEvent: 'e1' })).toBe('e1');
    expect(afterPublishEventOf({})).toBeNull();
  });
  const mount = () => {
    const leave = vi.fn();
    const hook = renderHook(() => useEventShareOffer(leave));
    return { leave, hook };
  };
  const dialog = (hook: ReturnType<typeof mount>['hook']) => render(<EventShareDialog open={!!hook.result.current.offer} busy={false} onShare={() => void hook.result.current.share()} onNotNow={hook.result.current.notNow} />);

  it('asks with the two words, and Share uses the event\'s share action, then leaves', async () => {
    h.getMyEventCanvas.mockResolvedValue({ name: 'canvas_1', shared: false, fixed: false });
    h.setEventCanvas.mockResolvedValue({ status: 'ok', name: 'canvas_1' });
    const { leave, hook } = mount();
    await act(async () => { hook.result.current.ask('e1', 'canvas_1'); });
    await waitFor(() => expect(hook.result.current.offer).not.toBeNull());
    dialog(hook);
    expect(screen.getByText("Published. Share your Clarity Canvas with this event's attendees?")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(h.setEventCanvas).toHaveBeenCalledWith('e1', 'canvas_1'));
    await waitFor(() => expect(leave).toHaveBeenCalledTimes(1));
  });
  it('once round 1 has started the same Share goes through share_canvas', async () => {
    h.getMyEventCanvas.mockResolvedValue({ name: 'canvas_1', shared: false, fixed: true });
    h.shareCanvas.mockResolvedValue({ skipped: [] });
    const { hook } = mount();
    await act(async () => { hook.result.current.ask('e1', 'canvas_1'); });
    await waitFor(() => expect(hook.result.current.offer).not.toBeNull());
    await act(async () => { await hook.result.current.share(); });
    expect(h.shareCanvas).toHaveBeenCalledWith('canvas_1', 'event', 'e1');
    expect(h.setEventCanvas).not.toHaveBeenCalled();
  });
  it('Not now closes it, shares nothing and leaves', async () => {
    h.getMyEventCanvas.mockResolvedValue(null);
    const { leave, hook } = mount();
    await act(async () => { hook.result.current.ask('e1', 'canvas_1'); });
    await waitFor(() => expect(hook.result.current.offer).not.toBeNull());
    dialog(hook);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(leave).toHaveBeenCalledTimes(1));
    expect(h.setEventCanvas).not.toHaveBeenCalled();
    expect(h.shareCanvas).not.toHaveBeenCalled();
  });
  it('a canvas already shared with the event asks nothing and leaves', async () => {
    h.getMyEventCanvas.mockResolvedValue({ name: 'canvas_1', shared: true, fixed: false });
    const { leave, hook } = mount();
    await act(async () => { hook.result.current.ask('e1', 'canvas_1'); });
    await waitFor(() => expect(leave).toHaveBeenCalledTimes(1));
    expect(hook.result.current.offer).toBeNull();
  });
});

describe('F1 phone header: time left and part name', () => {
  const clockAt = (s: number, timing: ReturnType<typeof roundTiming>) => roundClock('2026-11-11T10:00:00Z', new Date('2026-11-11T10:00:00Z').getTime() + s * 1000, true, timing);
  it('a round with a swap at half time shows the whole talk left, as the projector does', () => {
    const t = roundTiming({ seatingS: 0, readingS: 0, firstS: 450, secondS: 450, splitSpeakers: true, observerS: 180 });
    render(<TableStatus table={1} clock={clockAt(30, t)} timing={t} hasObserver />);
    expect(screen.getByTestId('round-card-part').textContent).toBe('Talk');
    expect(screen.getByTestId('round-card-time').textContent).toBe('14:30');
  });
  it('a round saved before the change names its finding-the-table and reading parts, never "Talk"', () => {
    const t = roundTiming({ seatingS: 120, readingS: 180, firstS: 450, secondS: 450, splitSpeakers: false, observerS: 180 });
    const { unmount } = render(<TableStatus table={1} clock={clockAt(30, t)} timing={t} hasObserver />);
    expect(screen.getByTestId('round-card-part').textContent).toBe('Find your table');
    unmount();
    render(<TableStatus table={1} clock={clockAt(130, t)} timing={t} hasObserver />);
    expect(screen.getByTestId('round-card-part').textContent).toBe('Reading');
  });
});

describe('F6: exactly one back in every from-event case', () => {
  it('the owner via the banner: the bar draws none (the banner has the back); via the table: the bar goes to the table; elsewhere: history', () => {
    expect(ownerBarBack({ banner: true, table: { to: '/events/x/meet' } })).toEqual({ kind: 'banner' });
    expect(ownerBarBack({ banner: false, table: { to: '/events/x/meet' } })).toEqual({ kind: 'table', to: '/events/x/meet' });
    // The round-return bar shown: its "Back to your table" link is the one way back, the bar draws none.
    expect(ownerBarBack({ banner: false, returnBar: true, table: { to: '/events/x/meet' } })).toEqual({ kind: 'returnBar' });
    expect(ownerBarBack({ banner: true, returnBar: true, table: null })).toEqual({ kind: 'banner' });
    expect(ownerBarBack({ banner: false, table: null })).toEqual({ kind: 'history' });
  });
  it('the banner itself has a back that goes to the room', () => {
    const where = vi.fn();
    render(<MemoryRouter initialEntries={['/canvas']}><Routes><Route path="/canvas" element={<PreparationBanner to="/events/x/meet" />} /><Route path="/events/x/meet" element={<>{where()}room</>} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByTestId('preparation-banner-back'));
    expect(screen.getByText('room')).toBeInTheDocument();
  });
  const pageBack = (value: Partial<CanvasWorkspaceValue>) => render(
    <MemoryRouter><CanvasWorkspaceContext.Provider value={{ active: false, ownerBar: false, ...value } as CanvasWorkspaceValue}><CanvasPageBack /></CanvasWorkspaceContext.Provider></MemoryRouter>);
  it('a reader via the table: the page\'s own back is the one back', () => {
    pageBack({ tableBack: '/events/x/meet' });
    expect(screen.getAllByRole('button', { name: /back/i }).length).toBe(1);
  });
  it('a reader while the round-return bar shows: the page draws no back (the bar\'s link is the way back)', () => {
    const { container } = pageBack({ tableBack: '/events/x/meet', roundBarShown: true });
    expect(container.textContent).toBe('');
  });
  it('the owner (bar or workspace): the page draws no back of its own', () => {
    const { container, unmount } = pageBack({ ownerBar: true });
    expect(container.textContent).toBe('');
    unmount();
    const second = pageBack({ active: true });
    expect(second.container.textContent).toBe('');
  });
});

describe('F7 follow-ups', () => {
  it('a table link\'s event is the same as the started-from event, kept for the canvas when the state is replaced', () => {
    expect(afterPublishEventOf({ tableEvent: 'e2' })).toBe('e2');
    expect(afterPublishEventOf({ afterPublishEvent: 'e1', tableEvent: 'e2' })).toBe('e1');
    const hook = renderHook(({ state }) => useEventReturn(state, 'ana/canvas'), { initialProps: { state: { afterPublishEvent: 'e1' } as unknown } });
    expect(hook.result.current).toBe('e1');
    hook.rerender({ state: { canvasPanel: true } });
    expect(hook.result.current).toBe('e1');
    const other = renderHook(({ state }) => useEventReturn(state, 'ana/other'), { initialProps: { state: { tableEvent: 'e2' } as unknown } });
    other.rerender({ state: null });
    expect(other.result.current).toBe('e2');
  });
  it('a refused set_event_canvas falls back to share_canvas', async () => {
    h.getMyEventCanvas.mockResolvedValue({ name: 'canvas_1', shared: false, fixed: false });
    h.setEventCanvas.mockResolvedValue({ status: 'refused', code: 'fixed' });
    h.shareCanvas.mockResolvedValue({ skipped: [] });
    const leave = vi.fn();
    const hook = renderHook(() => useEventShareOffer(leave));
    await act(async () => { hook.result.current.ask('e1', 'canvas_1'); });
    await waitFor(() => expect(hook.result.current.offer).not.toBeNull());
    await act(async () => { await hook.result.current.share(); });
    expect(h.shareCanvas).toHaveBeenCalledWith('canvas_1', 'event', 'e1');
    expect(leave).toHaveBeenCalledTimes(1);
  });
  it('an unreadable share state still asks: Share runs the normal path', async () => {
    h.getMyEventCanvas.mockRejectedValue(new Error('network'));
    h.setEventCanvas.mockResolvedValue({ status: 'ok', name: 'canvas_1' });
    const leave = vi.fn();
    const hook = renderHook(() => useEventShareOffer(leave));
    await act(async () => { hook.result.current.ask('e1', 'canvas_1'); });
    await waitFor(() => expect(hook.result.current.offer).not.toBeNull());
    expect(leave).not.toHaveBeenCalled();
    await act(async () => { await hook.result.current.share(); });
    expect(h.setEventCanvas).toHaveBeenCalledWith('e1', 'canvas_1');
    expect(leave).toHaveBeenCalledTimes(1);
  });
  it('after a share that works the page is told to re-read (its Share status was read before)', async () => {
    h.getMyEventCanvas.mockResolvedValue({ name: 'canvas_1', shared: false, fixed: false });
    h.setEventCanvas.mockResolvedValue({ status: 'ok', name: 'canvas_1' });
    const onShared = vi.fn();
    const hook = renderHook(() => useEventShareOffer(() => {}, onShared));
    await act(async () => { hook.result.current.ask('e1', 'canvas_1'); });
    await waitFor(() => expect(hook.result.current.offer).not.toBeNull());
    await act(async () => { await hook.result.current.share(); });
    expect(onShared).toHaveBeenCalledTimes(1);
  });
  it('a failed share keeps the dialog open with an inline error, and Share tries again; nothing is left until it works or Not now', async () => {
    h.getMyEventCanvas.mockResolvedValue({ name: 'canvas_1', shared: false, fixed: true });
    h.shareCanvas.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ skipped: [] });
    const leave = vi.fn();
    const hook = renderHook(() => useEventShareOffer(leave));
    await act(async () => { hook.result.current.ask('e1', 'canvas_1'); });
    await waitFor(() => expect(hook.result.current.offer).not.toBeNull());
    await act(async () => { await hook.result.current.share(); });
    expect(hook.result.current.offer).not.toBeNull();
    expect(hook.result.current.error).toBe("Couldn't share your Clarity Canvas. Try again.");
    expect(leave).not.toHaveBeenCalled();
    render(<EventShareDialog open busy={false} error={hook.result.current.error} onShare={() => {}} onNotNow={() => {}} />);
    expect(screen.getByText("Couldn't share your Clarity Canvas. Try again.")).toBeInTheDocument();
    await act(async () => { await hook.result.current.share(); });
    expect(hook.result.current.error).toBeNull();
    expect(leave).toHaveBeenCalledTimes(1);
  });
  it('the dialog without an error draws no description (none announced); the colour is the Button variant\'s own', () => {
    render(<EventShareDialog open busy={false} onShare={() => {}} onNotNow={() => {}} />);
    expect(screen.getByRole('dialog').getAttribute('aria-describedby')).toBeNull();
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
  });
  it('a read that lands after the page is gone changes nothing', async () => {
    let resolve: (v: unknown) => void = () => {};
    h.getMyEventCanvas.mockReturnValue(new Promise(r => { resolve = r; }));
    const leave = vi.fn();
    const hook = renderHook(() => useEventShareOffer(leave));
    act(() => { hook.result.current.ask('e1', 'canvas_1'); });
    hook.unmount();
    await act(async () => { resolve({ name: 'canvas_1', shared: true, fixed: false }); });
    expect(leave).not.toHaveBeenCalled();
  });
});

describe('F5 info text', () => {
  it('a non-round event keeps its own idle info (the full explanation)', () => {
    h.capture = capturing({ phase: 'idle', isCapturingForEvent: () => false });
    render(<RoomTranscribeIdleBar eventId="e1" displayName="A" onFailed={() => {}} />);
    fireEvent.click(screen.getByTestId('capture-info'));
    expect(screen.getByTestId('capture-info-sheet').textContent).toMatch(/What.s recorded/);
  });
  it('the running bar of a round event carries the same one line, not the 2-minutes copy', () => {
    render(<RoomCaptureBar short roomEventId="e1" roundEvent />);
    fireEvent.click(screen.getByTestId('capture-info'));
    expect(screen.getByTestId('capture-info-sheet').querySelector('p')!.textContent).toBe("Your table's words appear in your round's chat thread after the round.");
    expect(screen.queryByText(/2 minutes/)).toBeNull();
    // Inside the room the arrow is hidden, so the popover keeps the one quiet way to the live text.
    expect(screen.getByTestId('capture-info-open-room')).toBeInTheDocument();
  });
  it('a running bar of another event keeps its full info', () => {
    h.capture = capturing({ eventId: 'plain-night' });
    render(<RoomCaptureBar short roomEventId="plain-night" />);
    fireEvent.click(screen.getByTestId('capture-info'));
    expect(screen.getByTestId('capture-info-sheet').textContent).toMatch(/What.s recorded/);
  });
});

describe('round-3 follow-ups', () => {
  it('the owner\'s canvas opened from the room gets the banner with the room as its back, unless the return bar shows', () => {
    const table = { to: '/events/x/meet' };
    expect(bannerTarget({ backTo: null, ownerBar: true, table, roundBar: false })).toBe('/events/x/meet');
    expect(bannerTarget({ backTo: null, ownerBar: true, table, roundBar: true })).toBeNull();
    expect(bannerTarget({ backTo: null, ownerBar: false, table, roundBar: false })).toBeNull(); // a reader has no banner
    expect(bannerTarget({ backTo: '/events/x/prepare?step=4', ownerBar: true, table, roundBar: false })).toBe('/events/x/prepare?step=4');
    expect(bannerTarget({ backTo: null, ownerBar: true, table: null, roundBar: false })).toBeNull();
    // and the bar then draws no back of its own: one back, the banner's
    expect(ownerBarBack({ banner: true, table })).toEqual({ kind: 'banner' });
  });
  it('the full (non-compact) bar of a round event says the same one line', () => {
    markRoundEvent('e1');
    h.capture = capturing({ eventId: 'e1' });
    render(<RoomCaptureBar />);
    fireEvent.click(screen.getByTestId('capture-info'));
    expect(screen.getByTestId('capture-info-sheet').textContent).toBe("Your table's words appear in your round's chat thread after the round.");
  });
  it('the share dialog\'s error is announced and drawn in the error colour', () => {
    render(<EventShareDialog open busy={false} error="Couldn't share your Clarity Canvas. Try again." onShare={() => {}} onNotNow={() => {}} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe("Couldn't share your Clarity Canvas. Try again.");
    expect(alert.className).toContain('text-destructive');
    expect(alert.className).not.toMatch(/amber|yellow|orange/);
  });
});
