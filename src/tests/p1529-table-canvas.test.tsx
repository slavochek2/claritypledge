/**
 * @file p1529-table-canvas.test.tsx
 * @description P1529: a canvas opened from the table follows the host's rounds back to the table (5-second countdown, Stay here, the owner's open draft gets a
 * link only) and opens in Compare with the table's counterpart, listed even with no positions.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventRoundsState } from '@/app/data/event-rounds-service';
import { plainCanvasState, tableLinkState } from '@/lib/canvas-hrefs';
import { compareSetup, type CanvasReady } from '@/app/components/canvas/canvas-page-data';
import { pageIsBusy, roundChange, tableCounterpart } from '@/app/pages/canvas/table-round-helpers';

const rounds = vi.hoisted(() => ({ state: { rounds: [], seatsByRound: new Map(), topics: new Map() } as unknown, loaded: true }));
vi.mock('@/app/prototypes/events/rounds/use-event-rounds', () => ({ useEventRounds: () => ({ state: rounds.state, loaded: rounds.loaded, refresh: async () => undefined }) }));
vi.mock('@/app/data/event-room-service', () => ({ tryRoomRoster: vi.fn(async () => []) }));

import { RoundReturnBar, RoundReturnLive } from '@/app/pages/canvas/RoundReturnBar';
import { retryWaitMs, scopedReady, useTableCanvas } from '@/app/pages/canvas/use-table-canvas';

const round = (id: string, no: number, ended: boolean) => ({ id, roundNo: no, endedAt: ended ? 'x' : null });
const stateOf = (rs: Array<ReturnType<typeof round>>): EventRoundsState => ({ rounds: rs as never, seatsByRound: new Map(), topics: new Map() });

function Probe({ table = { to: '/events/e/room', eventId: 'ev' } as { to: string; eventId: string | null } | null, editing = false }) {
  const { roundBar } = useTableCanvas({ table, viewerId: 'me', ready: null, editing, params: new URLSearchParams(), setParams: () => undefined, canvasKey: 'k', state: null });
  return roundBar ? <RoundReturnBar {...roundBar} /> : <p>none</p>;
}
const mount = (ui: React.ReactElement) => render(<MemoryRouter initialEntries={['/canvas']}><Routes><Route path="/canvas" element={ui} /><Route path="/events/e/room" element={<p>the table</p>} /></Routes></MemoryRouter>);

beforeEach(() => { vi.useFakeTimers(); rounds.state = stateOf([round('r1', 1, false)]); rounds.loaded = true; });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('auto-return to the table', () => {
  it('a round that ended before the page opened does nothing; the host ending it later starts the countdown, which ends at the table', () => {
    const view = mount(<Probe />);
    expect(screen.getByText('none')).toBeTruthy();
    rounds.state = stateOf([round('r1', 1, true)]);
    view.rerender(<MemoryRouter initialEntries={['/canvas']}><Routes><Route path="/canvas" element={<Probe />} /><Route path="/events/e/room" element={<p>the table</p>} /></Routes></MemoryRouter>);
    expect(screen.getByTestId('round-return-line').textContent).toBe('Round 1 ended. Back to your table in 5');
    for (let i = 0; i < 3; i++) act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByTestId('round-return-line').textContent).toContain('in 2');
    for (let i = 0; i < 2; i++) act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText('the table')).toBeTruthy();
  });

  it('a first read of an already ended round is a baseline, not a change', () => {
    rounds.state = stateOf([round('r1', 1, true)]);
    mount(<Probe />);
    act(() => { vi.advanceTimersByTime(10000); });
    expect(screen.getByText('none')).toBeTruthy();
  });

  it('a new round says it started; Stay here cancels the countdown for it', () => {
    rounds.state = stateOf([round('r1', 1, true)]);
    const view = mount(<Probe />);
    rounds.state = stateOf([round('r1', 1, true), round('r2', 2, false)]);
    view.rerender(<MemoryRouter initialEntries={['/canvas']}><Routes><Route path="/canvas" element={<Probe />} /><Route path="/events/e/room" element={<p>the table</p>} /></Routes></MemoryRouter>);
    expect(screen.getByTestId('round-return-line').textContent).toBe('Round 2 started. Back to your table in 5');
    // The way back is offered during the countdown too, not only after it.
    expect(screen.getByTestId('round-return-link').textContent).toBe('Back to your table');
    fireEvent.click(screen.getByTestId('round-return-link'));
    expect(screen.getByText('the table')).toBeTruthy();
  });

  it('Stay here cancels the countdown and the bar goes (the link stays only while the bar does)', () => {
    rounds.state = stateOf([round('r1', 1, true)]);
    const view = mount(<Probe />);
    rounds.state = stateOf([round('r1', 1, true), round('r2', 2, false)]);
    view.rerender(<MemoryRouter initialEntries={['/canvas']}><Routes><Route path="/canvas" element={<Probe />} /><Route path="/events/e/room" element={<p>the table</p>} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByTestId('round-return-stay'));
    act(() => { vi.advanceTimersByTime(10000); });
    expect(screen.getByText('none')).toBeTruthy();
  });

  it('never fires for a canvas not opened from a table', () => {
    const view = mount(<Probe table={null} />);
    rounds.state = stateOf([round('r1', 1, true)]);
    view.rerender(<MemoryRouter initialEntries={['/canvas']}><Routes><Route path="/canvas" element={<Probe table={null} />} /></Routes></MemoryRouter>);
    expect(screen.getByText('none')).toBeTruthy();
  });

  it('the owner editing an open draft gets the line and a link, no countdown, no move', () => {
    const view = mount(<Probe editing />);
    rounds.state = stateOf([round('r1', 1, true)]);
    view.rerender(<MemoryRouter initialEntries={['/canvas']}><Routes><Route path="/canvas" element={<Probe editing />} /><Route path="/events/e/room" element={<p>the table</p>} /></Routes></MemoryRouter>);
    expect(screen.getByTestId('round-return-line').textContent).toBe('Round 1 ended.');
    expect(screen.getByTestId('round-return-link')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(10000); });
    expect(screen.queryByText('the table')).toBeNull();
  });
});

describe('Compare opens with the table counterpart', () => {
  const roster = [
    { id: 'm1', profileId: 'owner' }, { id: 'm2', profileId: 'partner' }, { id: 'm3', profileId: 'obs' },
  ].map(m => ({ ...m, displayName: m.profileId })) as never;
  const seated = { rounds: [{ id: 'r1', roundNo: 1, endedAt: null }], seatsByRound: new Map([['r1', [{ id: 'm1', table: 1, role: 'first' }, { id: 'm2', table: 1, role: 'second' }, { id: 'm3', table: 1, role: 'observer' }]]]), topics: new Map() } as unknown as EventRoundsState;

  it('the partner and the observer compare with the owner; the owner with the partner', () => {
    expect(tableCounterpart({ state: seated, roster, viewerId: 'partner', canvasOwnerId: 'owner' })?.id).toBe('owner');
    expect(tableCounterpart({ state: seated, roster, viewerId: 'obs', canvasOwnerId: 'owner' })?.id).toBe('owner');
    expect(tableCounterpart({ state: seated, roster, viewerId: 'owner', canvasOwnerId: 'owner' })?.id).toBe('partner');
    expect(tableCounterpart({ state: seated, roster, viewerId: 'stranger', canvasOwnerId: 'owner' })).toBeNull();
  });

  it('the counterpart is in the chooser and pre-selected with zero positions; others stay as today', () => {
    const ready = { ownerId: 'owner', owner: { name: 'Owner', hasPledged: false }, positions: new Map(), versions: [], draft: null } as unknown as CanvasReady;
    const extra = tableCounterpart({ state: seated, roster, viewerId: 'owner', canvasOwnerId: 'owner' });
    const withIt = compareSetup(ready, 'owner', 'owner', 'partner', extra);
    expect(withIt.others.map(p => p.id)).toEqual(['partner']);
    expect(withIt.withPerson?.id).toBe('partner');
    expect(compareSetup(ready, 'owner', 'owner', null, null).others).toEqual([]);
  });
});

describe('the Compare default in the address', () => {
  const ready = (draft: boolean) => ({ ownerId: 'owner', owner: { name: 'Owner', hasPledged: false }, positions: new Map(), versions: [{ name: 'v1', seq: 1, draft: false }], draft: draft ? { id: 'd', version: 'v2', baseSeq: 1, runCount: 0, revision: 1 } : null, version: draft ? 'v2' : 'v1', isOwner: draft }) as unknown as CanvasReady;
  const roster = [{ id: 'm1', profileId: 'owner', displayName: 'Owner' }, { id: 'm2', profileId: 'me', displayName: 'Me' }] as never;

  const setParamsSpy = vi.fn();
  function Writer({ r, key2 = 'k', state = null }: { r: CanvasReady; key2?: string; state?: unknown }) {
    useTableCanvas({ table: { to: '/events/e/room', eventId: 'ev' }, viewerId: 'me', ready: r, editing: false, params: new URLSearchParams(), setParams: setParamsSpy, canvasKey: key2, state: state as never });
    return null;
  }
  beforeEach(async () => {
    setParamsSpy.mockClear();
    const svc = await import('@/app/data/event-room-service');
    (svc.tryRoomRoster as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(roster);
    rounds.state = { rounds: [{ id: 'r1', roundNo: 1, endedAt: null }], seatsByRound: new Map([['r1', [{ id: 'm1', table: 1, role: 'first' }, { id: 'm2', table: 1, role: 'second' }]]]), topics: new Map() };
  });

  it('writes ?with= once per canvas key (replace), and not again on re-render', async () => {
    vi.useRealTimers();
    const view = render(<MemoryRouter><Writer r={ready(false)} /></MemoryRouter>);
    await vi.waitFor(() => expect(setParamsSpy).toHaveBeenCalledTimes(1));
    const next = setParamsSpy.mock.calls[0]![0](new URLSearchParams());
    expect(next.get('with')).toBe('owner');
    expect(setParamsSpy.mock.calls[0]![1].replace).toBe(true);
    view.rerender(<MemoryRouter><Writer r={ready(false)} /></MemoryRouter>);
    await new Promise(r => setTimeout(r, 30));
    expect(setParamsSpy).toHaveBeenCalledTimes(1);
  });

  it('J2: the owner\'s own canvas opened from their card (plainCanvas) writes no ?with=; the table state is kept for the way back', async () => {
    vi.useRealTimers();
    render(<MemoryRouter><Writer r={ready(false)} state={plainCanvasState(tableLinkState('/events/e/room', 'ev'))} /></MemoryRouter>);
    await new Promise(r => setTimeout(r, 50));
    expect(setParamsSpy).not.toHaveBeenCalled();
    expect(plainCanvasState(tableLinkState('/r', 'ev'))).toEqual({ backToTable: '/r', tableEvent: 'ev', plainCanvas: true });
  });

  it('writes nothing on a draft view', async () => {
    vi.useRealTimers();
    render(<MemoryRouter><Writer r={ready(true)} /></MemoryRouter>);
    await new Promise(r => setTimeout(r, 50));
    expect(setParamsSpy).not.toHaveBeenCalled();
  });
});

describe('review round 2', () => {
  it('after a loaded baseline with no round, the first round starting is "Round 1 started"', () => {
    expect(roundChange(null, { id: 'r1', no: 1, ended: false })).toEqual({ kind: 'started', roundNo: 1 });
    expect(roundChange(null, null)).toBeNull();
  });

  it('the first read of an already running round is only a baseline (no bar)', () => {
    mount(<Probe />);
    expect(screen.getByText('none')).toBeTruthy();
  });

  it('a read that is not the one held for this canvas is scoped out', () => {
    const a = { ownerId: 'a' } as unknown as CanvasReady;
    const b = { ownerId: 'b' } as unknown as CanvasReady;
    expect(scopedReady(a, a)).toBe(a);
    expect(scopedReady(a, b)).toBeNull();
    expect(scopedReady(a, null)).toBeNull();
  });

  it('a new canvas key never keeps the previous canvas counterpart', async () => {
    vi.useRealTimers();
    const svc = await import('@/app/data/event-room-service');
    (svc.tryRoomRoster as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'm1', profileId: 'owner', displayName: 'Owner' }, { id: 'm2', profileId: 'me', displayName: 'Me' }]);
    rounds.state = { rounds: [{ id: 'r1', roundNo: 1, endedAt: null }], seatsByRound: new Map([['r1', [{ id: 'm1', table: 1, role: 'first' }, { id: 'm2', table: 1, role: 'second' }]]]), topics: new Map() };
    const seen: Array<string | null> = [];
    const rd = { ownerId: 'owner', owner: { name: 'Owner', hasPledged: false }, positions: new Map(), versions: [], draft: null, isOwner: false, version: 'v1' } as unknown as CanvasReady;
    function P({ k, r }: { k: string; r: CanvasReady | null }) {
      const { counterpart } = useTableCanvas({ table: { to: '/t', eventId: 'ev' }, viewerId: 'me', ready: r, editing: false, params: new URLSearchParams('with=x'), setParams: () => undefined, canvasKey: k, state: null });
      seen.push(counterpart?.id ?? null);
      return null;
    }
    const view = render(<MemoryRouter><P k="a" r={rd} /></MemoryRouter>);
    await vi.waitFor(() => expect(seen.at(-1)).toBe('owner'));
    view.rerender(<MemoryRouter><P k="b" r={null} /></MemoryRouter>);
    expect(seen.at(-1)).toBeNull();
  });

  it('retry waits are 1s then 2s with +-30% jitter', () => {
    expect(retryWaitMs(1, () => 0)).toBeCloseTo(700);
    expect(retryWaitMs(1, () => 1)).toBeCloseTo(1300);
    expect(retryWaitMs(2, () => 0.5)).toBeCloseTo(2000);
  });
});

describe('a busy page is never moved', () => {
  const swap = (view: ReturnType<typeof render>) => {
    rounds.state = stateOf([round('r1', 1, true)]);
    view.rerender(<MemoryRouter initialEntries={['/canvas']}><Routes><Route path="/canvas" element={<Probe />} /><Route path="/events/e/room" element={<p>the table</p>} /></Routes></MemoryRouter>);
  };
  afterEach(() => { document.body.innerHTML = ''; });

  it('an open dialog when the round ends: link only, no navigation, and closing it does not start a countdown', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    swap(mount(<Probe />));
    expect(screen.getByTestId('round-return-line').textContent).toBe('Round 1 ended.');
    expect(screen.getByTestId('round-return-link')).toBeTruthy();
    dialog.remove();
    act(() => { vi.advanceTimersByTime(10000); });
    expect(screen.queryByText('the table')).toBeNull();
    expect(screen.queryByTestId('round-return-count')).toBeNull();
  });

  it('a dialog opening mid-countdown turns the bar into the link', async () => {
    const view = mount(<Probe />);
    swap(view);
    expect(screen.getByTestId('round-return-count')).toBeTruthy();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    await act(async () => { document.body.appendChild(dialog); await Promise.resolve(); });
    expect(screen.queryByTestId('round-return-count')).toBeNull();
    act(() => { vi.advanceTimersByTime(10000); });
    expect(screen.queryByText('the table')).toBeNull();
  });

  it('a focused textarea counts; a closed dialog and a button do not', () => {
    const closed = document.createElement('div');
    closed.setAttribute('role', 'dialog'); closed.setAttribute('data-state', 'closed');
    document.body.appendChild(closed);
    const b = document.createElement('button');
    document.body.appendChild(b); b.focus();
    expect(pageIsBusy()).toBe(false);
    const t = document.createElement('textarea');
    document.body.appendChild(t); t.focus();
    expect(pageIsBusy()).toBe(true);
  });

  it('the live region is mounted empty and takes the line once', () => {
    const view = render(<RoundReturnLive bar={null} />);
    const live = screen.getByTestId('round-return-live');
    expect(live.textContent).toBe('');
    view.rerender(<RoundReturnLive bar={{ line: 'Round 1 ended.', left: 5, to: '/t', onStay: () => undefined }} />);
    expect(screen.getByTestId('round-return-live')).toBe(live);
    expect(live.textContent).toBe('Round 1 ended. Back to your table in 5 seconds.'); // the countdown is said once, politely
    view.rerender(<RoundReturnLive bar={{ line: 'Round 1 ended.', left: 3, to: '/t', onStay: () => undefined }} />);
    expect(live.textContent).toBe('Round 1 ended. Back to your table in 5 seconds.'); // the ticking never re-announces
    // cancelling the auto-return ("Stay here": no countdown, the message stays) is announced once
    view.rerender(<RoundReturnLive bar={{ line: 'Round 1 ended.', left: null, to: '/t', onStay: () => undefined }} />);
    expect(live.textContent).toBe('Staying here.');
    view.rerender(<RoundReturnLive bar={{ line: 'Round 1 ended.', left: null, to: '/t', onStay: () => undefined }} />);
    expect(live.textContent).toBe('Staying here.');
    // the same message counting down AGAIN after "Stay here" is announced again
    view.rerender(<RoundReturnLive bar={{ line: 'Round 1 ended.', left: 6, to: '/t', onStay: () => undefined }} />);
    expect(live.textContent).toBe('Round 1 ended. Back to your table in 6 seconds.');
    // the same words for a different move (another destination) are announced again
    view.rerender(<RoundReturnLive bar={{ line: 'Round 1 ended.', left: 8, to: '/other', onStay: () => undefined }} />);
    expect(live.textContent).toBe('Round 1 ended. Back to your table in 8 seconds.');
  });
});

describe('hold and attribute toggles', () => {
  const tree = (editing: boolean) => <MemoryRouter initialEntries={['/canvas']}><Routes><Route path="/canvas" element={<Probe editing={editing} />} /><Route path="/events/e/room" element={<p>the table</p>} /></Routes></MemoryRouter>;
  it('the owner hold ending after a round change leaves the link, never a countdown', () => {
    const view = render(tree(true));
    rounds.state = stateOf([round('r1', 1, true)]);
    view.rerender(tree(true));
    view.rerender(tree(false));
    act(() => { vi.advanceTimersByTime(10000); });
    expect(screen.queryByTestId('round-return-count')).toBeNull();
    expect(screen.queryByText('the table')).toBeNull();
    expect(screen.getByTestId('round-return-link')).toBeTruthy();
    cleanup();
  });
  it('a dialog that turns open by attribute is caught on the next tick', () => {
    const d = document.createElement('div');
    d.setAttribute('role', 'dialog'); d.setAttribute('data-state', 'closed');
    document.body.appendChild(d);
    const view = render(tree(false));
    rounds.state = stateOf([round('r1', 1, true)]);
    view.rerender(tree(false));
    expect(screen.getByTestId('round-return-count')).toBeTruthy();
    d.setAttribute('data-state', 'open');
    for (let i = 0; i < 6; i++) act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByText('the table')).toBeNull();
    expect(screen.getByTestId('round-return-link')).toBeTruthy();
    d.remove();
  });
});

describe('the first roster read waits for a visible tab', () => {
  it('no request while hidden; one when the tab becomes visible', async () => {
    vi.useRealTimers();
    const svc = await import('@/app/data/event-room-service');
    const spy = svc.tryRoomRoster as unknown as ReturnType<typeof vi.fn>;
    spy.mockClear();
    let state: DocumentVisibilityState = 'hidden';
    const spyVis = vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => state);
    render(<MemoryRouter><Probe /></MemoryRouter>);
    await new Promise(r => setTimeout(r, 20));
    expect(spy).not.toHaveBeenCalled();
    state = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(r => setTimeout(r, 20));
    expect(spy).toHaveBeenCalledTimes(1);
    spyVis.mockRestore();
  });
});
