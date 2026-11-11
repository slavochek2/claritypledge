/**
 * P1529 §5 and §6: the sales mastermind's round screen. The server and the rounds poll are replaced by a fake that the
 * test sets; what is under test is what each person sees and which call each tap makes.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventRoomMember } from '@/app/types';
import type { EventRoundsState, EventRound, RoundSeat } from '@/app/data/event-rounds-service';

const h = vi.hoisted(() => ({
  state: null as unknown,
  server: {} as Record<string, unknown>,
  recordCanvasOpen: vi.fn(),
  makeMyNextVersion: vi.fn(),
  getMyRoundCanvas: vi.fn(),
  getMyNextVersionOffer: vi.fn(),
  getMyDraftRef: vi.fn(),
  getMyEventCanvas: vi.fn(),
  publishCanvasDraft: vi.fn(),
  retryCanvasRun: vi.fn(),
  getCanvasDraftState: vi.fn(),
  classicProps: vi.fn(),
  listSharedWithEvent: vi.fn(),
  getEveningEnd: vi.fn(),
  // The room capture context, as the round card reads it: capturing by default (the mic step has its own tests, p1529-round-mic.test.tsx).
  capture: {} as Record<string, unknown>,
}));

vi.mock('@/app/prototypes/events/rounds/use-event-rounds', async importOriginal => {
  const real = await importOriginal<typeof import('@/app/prototypes/events/rounds/use-event-rounds')>();
  return { ...real, useEventRounds: () => ({ state: h.state, loaded: true, refresh: async () => {} }) };
});
vi.mock('@/app/data/event-mastermind-service', () => ({
  recordCanvasOpen: h.recordCanvasOpen,
  makeMyNextVersion: h.makeMyNextVersion,
  getMyRoundCanvas: h.getMyRoundCanvas,
  getMyNextVersionOffer: h.getMyNextVersionOffer,
  getMyDraftRef: h.getMyDraftRef,
  getMyEventCanvas: h.getMyEventCanvas,
  getEveningEnd: h.getEveningEnd,
}));
vi.mock('@/app/contexts/room-capture-context', () => ({ useRoomCapture: () => h.capture }));
vi.mock('@/app/data/canvas-service', () => ({ canvasService: { listSharedWithEvent: h.listSharedWithEvent } }));
vi.mock('@/app/data/canvas-draft-service', () => ({
  publishCanvasDraft: h.publishCanvasDraft,
  retryCanvasRun: h.retryCanvasRun,
  getCanvasDraftState: h.getCanvasDraftState,
}));
vi.mock('@/app/prototypes/events/prep/EventCanvasCard', () => ({ EventCanvasCard: () => <div data-testid="event-canvas-card" /> }));
// RoundCard is Clarity Night's own screen, with its own tests: here it is only a marker that the old path is taken.
vi.mock('@/app/prototypes/events/rounds/RoundCard', () => ({
  RoundCard: (props: Record<string, unknown>) => { h.classicProps(props); return <div data-testid="classic-round-card" />; },
}));

import { MastermindRoundCard } from '@/app/prototypes/events/rounds/MastermindRoundCard';
import { FlowRoundCard } from '@/app/prototypes/events/rounds/FlowRoundCard';

const round = (over: Partial<EventRound> = {}): EventRound => ({
  id: 'r1', roundNo: 1, groupSize: 3, startedAt: new Date().toISOString(), endedAt: null,
  seatingS: 60, firstS: 360, secondS: 360, observerS: 180, splitSpeakers: false, matchTag: null, showcase: false, ...over,
});
const seat = (roundId: string, id: string, role: RoundSeat['role'], table = 1): RoundSeat => ({ roundId, id, table, role, confirmedAt: null });
const person = (id: string, displayName: string, profileId: string, profileSlug: string) =>
  ({ id, displayName, profileId, profileSlug } as unknown as EventRoomMember);

const OWNER = person('m-owner', 'Haru Tanaka', 'p-owner', 'haru');
const PARTNER = person('m-partner', 'Erin Wu', 'p-partner', 'erin');
const OBSERVER = person('m-obs', 'Sam Lee', 'p-obs', 'sam');
const ROSTER = [OWNER, PARTNER, OBSERVER];

/** Round 1 live, one table: Haru owns, Erin is their partner, Sam observes. */
function liveRound(rounds: EventRound[] = [round()], seats: Record<string, RoundSeat[]> = {
  r1: [seat('r1', 'm-owner', 'first'), seat('r1', 'm-partner', 'second'), seat('r1', 'm-obs', 'observer')],
}) {
  h.state = { rounds, seatsByRound: new Map(Object.entries(seats)), topics: new Map() } satisfies EventRoundsState;
}
/** Round 1 is over and nobody is seated: the owner between rounds. */
const betweenRounds = () => liveRound([round({ endedAt: new Date().toISOString() })]);

/** What get_my_next_version_offer answers (the client's NextVersionOffer). */
const offerOf = (state: string, over: Record<string, unknown> = {}) =>
  ({ state, roundId: state === 'none' ? null : 'r1', draftId: null, revision: null, runId: null, autoPublish: false, ...over });
const OPEN = offerOf('none');
const DRAFT = { draftId: 'd1', revision: 4, runId: 'run1' };

const Where = () => { const l = useLocation(); return <span data-testid="where" data-state={JSON.stringify(l.state)}>{l.pathname}</span>; };
const FROM_ROOM = JSON.stringify({ backToTable: '/', tableEvent: 'e1' });

function renderCard(selfMember: EventRoomMember, props: { view?: 'table' | 'compare' | 'hidden'; onMoment?: () => void } = {}) {
  return render(
    <MemoryRouter>
      <MastermindRoundCard eventId="e1" self={selfMember} roster={ROSTER} view={props.view ?? 'table'} onMoment={props.onMoment} />
      <Where />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.capture = { phase: 'capturing', isCapturingForEvent: () => true, micLost: false, tapDown: false, stopping: false, startCapture: vi.fn(), reconnectMic: vi.fn() };
  h.getEveningEnd.mockResolvedValue(null);
  h.server = {
    canvas: { ownerProfileId: 'p-owner', ownerSlug: 'haru', canvasName: 'launch_plan', shared: true },
    offer: OPEN,
    shared: [{ ownerId: 'p-owner', ownerName: 'Haru Tanaka', ownerSlug: 'haru', name: 'launch_plan' }],
  };
  h.listSharedWithEvent.mockResolvedValue(h.server.shared);
  h.getMyRoundCanvas.mockImplementation(async () => h.server.canvas);
  h.getMyNextVersionOffer.mockImplementation(async () => h.server.offer);
  h.getMyDraftRef.mockResolvedValue({ canvasId: 'c1', versionName: 'v3-draft' });
  h.getMyEventCanvas.mockResolvedValue({ name: 'launch_plan', shared: true, fixed: true });
  h.getCanvasDraftState.mockResolvedValue(undefined);
  liveRound();
});
afterEach(() => { vi.useRealTimers(); });

/** Every button but the waiting state's collapsed "Other Clarity Canvases" backup. */
const taskButtons = () => screen.queryAllByRole('button').filter(b => b.getAttribute('data-testid') !== 'mastermind-other-canvases-toggle');
const lines = () => screen.getAllByTestId('round-card-person').map(li => li.textContent);

describe('P1529 round screen: what each role sees', () => {
  it.each([
    [OWNER, ['You: owner', 'Erin W.: partner', 'Sam L.: observer'], true],
    [PARTNER, ['Haru T.: owner', 'You: partner', 'Sam L.: observer'], true],
    [OBSERVER, ['Haru T.: owner', 'Erin W.: partner', 'You: observer'], true],
  ])('%#: the table, the canvas headline, one line per person in role order, Open for every role', async (who, people, open) => {
    renderCard(who);
    expect((await screen.findByTestId('round-card-table')).textContent).toBe('Table 1');
    expect((await screen.findByTestId('round-card-headline')).textContent).toBe(who === OWNER ? 'Discussing your Clarity Canvas' : 'Discussing Haru T.\u2019s Clarity Canvas');
    expect(lines()).toEqual(people);
    if (open) expect((await screen.findByTestId('round-canvas-link')).textContent).toBe('Open the canvas');
    else expect(screen.queryByTestId('round-canvas-link')).toBeNull();
    for (const gone of ['round-card-role', 'round-card-with', 'round-card-rule', 'round-canvas-card-toggle']) expect(screen.queryByTestId(gone)).toBeNull();
  });

  it('shows only the person\'s own table when the round has several', async () => {
    liveRound([round()], { r1: [
      seat('r1', 'm-other-owner', 'first', 1), seat('r1', 'm-other-partner', 'second', 1),
      seat('r1', 'm-owner', 'first', 2), seat('r1', 'm-partner', 'second', 2), seat('r1', 'm-obs', 'observer', 2),
    ] });
    renderCard(PARTNER);
    expect((await screen.findByTestId('round-card-headline')).textContent).toBe('Discussing Haru T.\u2019s Clarity Canvas');
    expect(screen.getByTestId('round-card-table').textContent).toBe('Table 2');
    expect(lines()).toEqual(['Haru T.: owner', 'You: partner', 'Sam L.: observer']);
  });

  it('a person the roster has no name for shows the fallback name', async () => {
    liveRound([round()], { r1: [seat('r1', 'm-ghost', 'first'), seat('r1', 'm-partner', 'second')] });
    renderCard(PARTNER);
    expect((await screen.findByTestId('round-card-headline')).textContent).toBe('Discussing Someone\u2019s Clarity Canvas');
    expect(lines()).toEqual(['Someone: owner', 'You: partner']);
  });

  it('asks for nothing during a round: no confirm, swap, phase, compare, slider or score; the owner has no button', async () => {
    renderCard(OWNER);
    await screen.findByTestId('round-card-headline');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('slider')).toHaveLength(0);
    expect(screen.queryByTestId('round-card-confirm')).toBeNull();
    expect(document.body.textContent).not.toMatch(/swap|seated —|compare|score|stance/i);
  });

  it("a partner's only control is Open the canvas (no card toggle)", async () => {
    renderCard(PARTNER);
    await screen.findByTestId('round-canvas-link');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByTestId('round-canvas-select')).toBeNull();
  });
});

describe('P1529 round screen: the canvas link', () => {
  it('shows the partner and the observer a link to the owner\'s newest version; the click records the open and goes there', async () => {
    for (const who of [PARTNER, OBSERVER]) {
      h.recordCanvasOpen.mockClear();
      const { unmount } = renderCard(who);
      const link = (await screen.findByTestId('round-canvas-link')) as HTMLAnchorElement;
      expect(link.getAttribute('href')).toBe('/p/haru/canvas/launch_plan');
      expect(link.textContent).toBe('Open the canvas');
      fireEvent.click(link);
      expect(h.recordCanvasOpen).toHaveBeenCalledWith('r1', 'p-owner');
      expect(screen.getByTestId('where').textContent).toBe('/p/haru/canvas/launch_plan');
      unmount();
    }
  });

  it('a record that throws never stops the navigation', async () => {
    h.recordCanvasOpen.mockImplementation(() => { throw new Error('boom'); });
    renderCard(PARTNER);
    fireEvent.click(await screen.findByTestId('round-canvas-link'));
    expect(h.recordCanvasOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('where').textContent).toBe('/p/haru/canvas/launch_plan');
    // the canvas page can offer "Back to your table" (P1529 UAT): the room's path and the event ride in the navigation state
    expect(screen.getByTestId('where').getAttribute('data-state')).toBe(FROM_ROOM);
  });

  it('the Clarity Canvas owner can open their own canvas, and that open is not recorded as evidence', async () => {
    renderCard(OWNER);
    fireEvent.click(await screen.findByTestId('round-canvas-link'));
    expect(screen.getByTestId('where').textContent).toBe('/p/haru/canvas/launch_plan');
    expect(h.recordCanvasOpen).not.toHaveBeenCalled();
  });

  it('says the canvas is no longer shared, with no link', async () => {
    h.server.canvas = { ownerProfileId: 'p-owner', ownerSlug: 'haru', canvasName: null, shared: false };
    renderCard(PARTNER);
    expect((await screen.findByTestId('round-canvas-unshared')).textContent).toBe('This Clarity Canvas is no longer shared');
    expect(screen.queryByTestId('round-canvas-link')).toBeNull();
  });

  it('a failed read of the canvas says so with a Retry, and Retry brings the link back', async () => {
    h.getMyRoundCanvas.mockRejectedValueOnce(new Error('offline'));
    renderCard(PARTNER);
    expect((await screen.findByTestId('round-canvas-error')).textContent).toMatch(/Could not load this Clarity Canvas/);
    expect(screen.queryByTestId('round-canvas-link')).toBeNull();
    expect(screen.queryByTestId('round-canvas-unshared')).toBeNull();
    fireEvent.click(screen.getByTestId('round-canvas-retry'));
    expect(((await screen.findByTestId('round-canvas-link')) as HTMLAnchorElement).getAttribute('href')).toBe('/p/haru/canvas/launch_plan');
    expect(screen.queryByTestId('round-canvas-error')).toBeNull();
  });

  it('no "Your Clarity Canvas" toggle and no canvas card on the round card', async () => {
    renderCard(OBSERVER);
    await screen.findByTestId('round-canvas-link');
    expect(screen.queryByTestId('round-canvas-card-toggle')).toBeNull();
    expect(screen.queryByTestId('event-canvas-card')).toBeNull();
  });
});

describe('P1529 round screen: the failure-safe canvas selector', () => {
  const MIA = { ownerId: 'p-mia', ownerName: 'Mia Long', ownerSlug: 'mia', name: 'pitch' };
  const withOthers = () => { h.listSharedWithEvent.mockResolvedValue([...(h.server.shared as unknown[]), MIA]); };

  it('is a native select defaulting to the table\'s canvas, listing every other canvas shared with the event', async () => {
    withOthers();
    renderCard(PARTNER);
    const select = (await screen.findByTestId('round-canvas-select')) as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(select.value).toBe('');
    expect(Array.from(select.options).map(o => o.textContent)).toEqual(['Haru T.\u2019s Clarity Canvas', 'Mia L.\u2019s Clarity Canvas']);
    expect(select.className).toContain('min-h-11');
    expect(h.listSharedWithEvent).toHaveBeenCalledWith('e1');
  });

  it('choosing another changes where Open goes, records no evidence for it, never touches seating, and re-choosing comes back', async () => {
    withOthers();
    renderCard(PARTNER);
    const select = (await screen.findByTestId('round-canvas-select')) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'p-mia' } });
    const link = screen.getByTestId('round-canvas-link') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/p/mia/canvas/pitch');
    fireEvent.click(link);
    expect(h.recordCanvasOpen).not.toHaveBeenCalled();
    expect(lines()).toEqual(['Haru T.: owner', 'You: partner', 'Sam L.: observer']);
    expect(screen.getByTestId('round-card-table').textContent).toBe('Table 1');
    fireEvent.change(select, { target: { value: '' } });
    expect(((await screen.findByTestId('round-canvas-link')) as HTMLAnchorElement).getAttribute('href')).toBe('/p/haru/canvas/launch_plan');
  });

  it('shows the owner the selector, with Open for their own canvas and for any other they choose', async () => {
    withOthers();
    renderCard(OWNER);
    const select = (await screen.findByTestId('round-canvas-select')) as HTMLSelectElement;
    expect(select.options[0]!.textContent).toBe('Your Clarity Canvas');
    expect(((await screen.findByTestId('round-canvas-link')) as HTMLAnchorElement).getAttribute('href')).toBe('/p/haru/canvas/launch_plan');
    fireEvent.change(select, { target: { value: 'p-mia' } });
    expect((screen.getByTestId('round-canvas-link') as HTMLAnchorElement).getAttribute('href')).toBe('/p/mia/canvas/pitch');
    fireEvent.change(select, { target: { value: '' } });
    expect((screen.getByTestId('round-canvas-link') as HTMLAnchorElement).getAttribute('href')).toBe('/p/haru/canvas/launch_plan');
  });

  it('a failed read of the shared canvases falls back to the table\'s canvas with no selector', async () => {
    h.listSharedWithEvent.mockRejectedValue(new Error('offline'));
    renderCard(PARTNER);
    expect((await screen.findByTestId('round-canvas-link')).getAttribute('href')).toBe('/p/haru/canvas/launch_plan');
    expect(screen.queryByTestId('round-canvas-select')).toBeNull();
    expect(screen.getByTestId('round-card-headline').textContent).toBe('Discussing Haru T.\u2019s Clarity Canvas');
  });

  it('with no other canvas shared there is nothing to choose, so no selector', async () => {
    renderCard(PARTNER);
    await screen.findByTestId('round-canvas-link');
    expect(screen.queryByTestId('round-canvas-select')).toBeNull();
  });
});

describe('P1529 round screen: the moment the room page reads', () => {
  it('reports seated, never "at table", and not over', async () => {
    const onMoment = vi.fn();
    renderCard(PARTNER, { onMoment });
    await waitFor(() => expect(onMoment).toHaveBeenCalledWith({ seated: true, atTable: false, eveningOver: false, live: true, waiting: false }));
  });

  it('waiting: a person with no seat in the live round is told what comes next', async () => {
    liveRound([round()], { r1: [seat('r1', 'm-partner', 'second')] });
    const onMoment = vi.fn();
    renderCard(OBSERVER, { onMoment });
    expect((await screen.findByTestId('mastermind-waiting')).textContent).toMatch(/Round 1 · You join the next round/);
    expect(onMoment).toHaveBeenCalledWith(expect.objectContaining({ seated: false, waiting: true }));
  });

  it('a round that ended is "between rounds" until the host ends the evening', async () => {
    betweenRounds();
    // No stamp from the host: the round ended on its own, the evening goes on.
    const between = vi.fn();
    const second = renderCard(OWNER, { onMoment: between });
    expect((await screen.findByTestId('mastermind-between')).textContent).toBe('Round 1 is overThe next round starts soon.');
    expect(between).toHaveBeenLastCalledWith(expect.objectContaining({ eveningOver: false, waiting: true }));
    expect(screen.queryByTestId('mastermind-over')).toBeNull();
    second.unmount();
    // The host ended the evening: the stamp is at or after the newest round's start.
    h.getEveningEnd.mockResolvedValue(new Date(Date.now() + 1000).toISOString());
    const again = vi.fn();
    renderCard(OWNER, { onMoment: again });
    await waitFor(() => expect(again).toHaveBeenLastCalledWith(expect.objectContaining({ eveningOver: true })));
    expect(screen.queryByTestId('mastermind-between')).toBeNull();
    expect(screen.getByTestId('mastermind-over').textContent).toBe('The rounds are over');
  });
});

describe('P1529 waiting state: one focus at a time', () => {
  it('between rounds the owner\'s card replaces "is over" (one focus), and the other canvases come last and collapsed', async () => {
    betweenRounds();
    h.server.offer = offerOf('offer');
    h.listSharedWithEvent.mockResolvedValue([{ ownerId: 'p-mia', ownerName: 'Mia Long', ownerSlug: 'mia', name: 'pitch' }]);
    renderCard(OWNER);
    const task = await screen.findByTestId('mastermind-task');
    expect(screen.queryByTestId('mastermind-between')).toBeNull();
    const backup = screen.getByTestId('mastermind-other-canvases');
    expect(task.compareDocumentPosition(backup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const toggle = screen.getByTestId('mastermind-other-canvases-toggle');
    expect(toggle.textContent).toBe('Clarity Canvases at this event');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('mastermind-other-canvases-select')).toBeNull();
    expect(h.listSharedWithEvent).not.toHaveBeenCalled(); // nothing is read until it is opened
  });

  it('between rounds with nothing to offer: "is over", no card', async () => {
    betweenRounds();
    renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-between')).textContent).toMatch(/Round 1 is over/);
    expect(screen.queryByTestId('mastermind-task')).toBeNull();
  });

  it('opens to a native select, and Open appears once a canvas is chosen (never recorded)', async () => {
    betweenRounds();
    h.server.offer = offerOf('no_recording');
    h.listSharedWithEvent.mockResolvedValue([{ ownerId: 'p-mia', ownerName: 'Mia Long', ownerSlug: 'mia', name: 'pitch' }]);
    renderCard(OWNER);
    fireEvent.click(await screen.findByTestId('mastermind-other-canvases-toggle'));
    const select = (await screen.findByTestId('mastermind-other-canvases-select')) as HTMLSelectElement;
    expect(screen.queryByTestId('mastermind-other-canvases-open')).toBeNull();
    fireEvent.change(select, { target: { value: 'p-mia' } });
    const link = screen.getByTestId('mastermind-other-canvases-open') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/p/mia/canvas/pitch');
    fireEvent.click(link);
    expect(h.recordCanvasOpen).not.toHaveBeenCalled();
  });
});

describe('P1529 waiting state: the canvases backup re-reads each opening', () => {
  it('shows Loading while the first read runs, and a failed read is retried by closing and opening again', async () => {
    betweenRounds();
    h.server.offer = offerOf('no_recording');
    h.listSharedWithEvent.mockRejectedValueOnce(new Error('offline'));
    renderCard(OWNER);
    const toggle = await screen.findByTestId('mastermind-other-canvases-toggle');
    fireEvent.click(toggle);
    expect(screen.getByTestId('mastermind-other-canvases-loading')).toBeTruthy();
    expect(await screen.findByTestId('mastermind-other-canvases-failed')).toBeTruthy();
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.getByTestId('mastermind-other-canvases-loading')).toBeTruthy();
    expect(await screen.findByTestId('mastermind-other-canvases-select')).toBeTruthy();
    expect(h.listSharedWithEvent).toHaveBeenCalledTimes(2);
  });
});

describe('P1529 round screen: whether any round has started (the optional preparation line steps aside)', () => {
  const card = (onRoundsStarted: (started: boolean) => void) =>
    render(<MemoryRouter><MastermindRoundCard eventId="e1" self={OWNER} roster={ROSTER} view="table" onRoundsStarted={onRoundsStarted} /></MemoryRouter>);

  it('is false before round 1, and true once a round has ended and the evening is not over', async () => {
    h.state = { rounds: [], seatsByRound: new Map(), topics: new Map() } satisfies EventRoundsState;
    const before = vi.fn();
    const { unmount } = card(before);
    await waitFor(() => expect(before).toHaveBeenLastCalledWith(false));
    unmount();
    betweenRounds();
    const during = vi.fn();
    card(during);
    await waitFor(() => expect(during).toHaveBeenLastCalledWith(true));
  });
});

describe('P1529 §6 (2026-11-11): a next version after every owned round, between rounds only', () => {
  beforeEach(() => { betweenRounds(); });

  it('the card says "{round} with {partner}: words ready"; "Create next version" makes and publishes in one tap, for that round', async () => {
    h.server.offer = offerOf('offer');
    h.makeMyNextVersion.mockImplementation(async () => {
      h.server.offer = offerOf('drafting', DRAFT);
      return { status: 'started', draftId: 'd1', runId: 'run1', repeat: false, start: { ok: true, runId: 'run1', kind: 'message' } };
    });
    renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-task-title')).textContent).toBe('Round 1 with Erin: words ready');
    expect(screen.getByTestId('mastermind-make').textContent).toBe('Create next version');
    expect(screen.getByTestId('mastermind-preview').textContent).toBe('Preview first');
    fireEvent.click(screen.getByTestId('mastermind-make'));
    expect((screen.getByTestId('mastermind-make') as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(h.makeMyNextVersion).toHaveBeenCalledWith('r1', true));
    expect(await screen.findByTestId('mastermind-task-creating')).toBeTruthy();
    expect(screen.queryByTestId('mastermind-make')).toBeNull();
  });

  it('is never shown during a running round, in any role', async () => {
    liveRound();
    h.server.offer = offerOf('offer');
    for (const who of [OWNER, PARTNER, OBSERVER]) {
      const { unmount } = renderCard(who);
      await screen.findByTestId('round-card-table');
      await waitFor(() => expect(h.getMyNextVersionOffer).toHaveBeenCalled());
      expect(screen.queryByTestId('mastermind-task')).toBeNull();
      unmount();
    }
  });

  it('is shown again after the evening ends', async () => {
    h.server.offer = offerOf('offer');
    h.getEveningEnd.mockResolvedValue(new Date(Date.now() + 1000).toISOString());
    renderCard(OWNER);
    expect(await screen.findByTestId('mastermind-task')).toBeTruthy();
    expect(screen.getByTestId('mastermind-over')).toBeTruthy();
  });

  it('"Preview first" makes the draft without publishing (auto publish off) and opens it with the back-to-table state', async () => {
    h.server.offer = offerOf('offer');
    h.makeMyNextVersion.mockResolvedValue({ status: 'started', draftId: 'd1', runId: 'run1', repeat: false, start: null });
    renderCard(OWNER);
    fireEvent.click(await screen.findByTestId('mastermind-preview'));
    await waitFor(() => expect(h.makeMyNextVersion).toHaveBeenCalledWith('r1', false));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/p/haru/canvas/launch_plan'));
    expect(screen.getByTestId('where').getAttribute('data-state')).toBe(FROM_ROOM);
    expect(h.publishCanvasDraft).not.toHaveBeenCalled();
  });

  it('with no recording it says so with no button', async () => {
    h.server.offer = offerOf('no_recording');
    renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-task-no-recording')).textContent).toBe('No recording from this round');
    expect(screen.queryByTestId('mastermind-make')).toBeNull();
  });

  it('while the words are prepared: the sentence with the usual wait, no button; the button appears when they are ready', async () => {
    h.server.offer = offerOf('transcript_pending');
    renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-task-pending')).textContent).toBe('The words from Round 1 are being prepared (about 2 minutes)');
    expect(screen.queryByTestId('mastermind-make')).toBeNull();
    h.server.offer = offerOf('offer');
    fireEvent(document, new Event('visibilitychange'));
    expect(await screen.findByTestId('mastermind-make')).toBeTruthy();
  });

  it('words not ready 10 minutes after the round: the terminal sentence, no button', async () => {
    h.server.offer = offerOf('transcript_missing');
    renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-task-missing')).textContent).toBe('The words from Round 1 did not arrive. Your canvas stays as it is.');
    expect(screen.queryByTestId('mastermind-make')).toBeNull();
  });

  it('a tap that finds the words still arriving says so', async () => {
    h.server.offer = offerOf('offer');
    h.makeMyNextVersion.mockResolvedValue({ status: 'transcript_pending' });
    renderCard(OWNER);
    fireEvent.click(await screen.findByTestId('mastermind-make'));
    expect((await screen.findByTestId('mastermind-task-note')).textContent).toMatch(/being prepared/);
  });

  it('no_canvas and draft_open get a plain sentence and no button', async () => {
    h.server.offer = offerOf('no_canvas');
    const { unmount } = renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-task-no-canvas')).textContent).toMatch(/no Clarity Canvas shared with this event/);
    expect(screen.queryByTestId('mastermind-make')).toBeNull();
    unmount();
    h.server.offer = offerOf('draft_open');
    renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-task-draft-open')).textContent).toMatch(/already have a draft open/);
  });

  it.each([
    ['demo_round', /Demo round/],
    ['round_still_on', /still on/],
    ['round_already_used', /already made/],
    ['draft_already_open', /already have a draft open/],
    ['cap_reached', /used all the mirror runs/],
    ['busy', /busy/],
    ['something_new', /could not be made/],
  ])('a refused tap (%s) says why in a sentence, and the button stays', async (code, sentence) => {
    h.server.offer = offerOf('offer');
    h.makeMyNextVersion.mockResolvedValue({ status: 'refused', code });
    renderCard(OWNER);
    fireEvent.click(await screen.findByTestId('mastermind-make'));
    expect((await screen.findByTestId('mastermind-task-note')).textContent).toMatch(sentence);
    expect(screen.getByTestId('mastermind-make')).toBeTruthy();
  });

  it('a call that throws is a sentence, not silence', async () => {
    h.server.offer = offerOf('offer');
    h.makeMyNextVersion.mockRejectedValue(new Error('network'));
    renderCard(OWNER);
    fireEvent.click(await screen.findByTestId('mastermind-make'));
    expect((await screen.findByTestId('mastermind-task-note')).textContent).toMatch(/could not be made/);
  });
});

describe('P1529 §6: the states of one round\'s version', () => {
  beforeEach(() => { betweenRounds(); });

  it('drafting: no button, and the preview link once the draft is known', async () => {
    h.server.offer = offerOf('drafting', { ...DRAFT, autoPublish: true });
    renderCard(OWNER);
    expect(await screen.findByTestId('mastermind-task-creating')).toBeTruthy();
    expect(taskButtons()).toHaveLength(0);
    const tweak = await screen.findByTestId('mastermind-tweak');
    expect(tweak.textContent).toBe('Preview first');
    expect(tweak.getAttribute('href')).toBe('/p/haru/canvas/launch_plan?v=v3-draft&ws=1');
  });

  it('a finished draft of a one-tap round is published by the chain, once, on its revision', async () => {
    h.server.offer = offerOf('ready', { ...DRAFT, autoPublish: true });
    h.publishCanvasDraft.mockImplementation(async () => { h.server.offer = offerOf('published'); return { ok: true }; });
    renderCard(OWNER);
    await waitFor(() => expect(h.publishCanvasDraft).toHaveBeenCalledWith('d1', 4));
    expect((await screen.findByTestId('mastermind-task-published')).textContent).toMatch(/published/);
    expect(h.publishCanvasDraft).toHaveBeenCalledTimes(1);
  });

  it('a refused chain publish says why and shows Try again, which publishes again', async () => {
    h.server.offer = offerOf('ready', { ...DRAFT, autoPublish: true });
    h.publishCanvasDraft.mockResolvedValueOnce({ ok: false, refused: 'stale_view' });
    renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-task-note')).textContent).toMatch(/just changed/);
    const again = await screen.findByTestId('mastermind-publish');
    expect(again.textContent).toBe('Try again');
    h.publishCanvasDraft.mockResolvedValueOnce({ ok: true });
    fireEvent.click(again);
    await waitFor(() => expect(h.publishCanvasDraft).toHaveBeenCalledTimes(2));
  });

  it('a "Preview first" draft that finished waits for the owner: Publish, never the chain', async () => {
    h.server.offer = offerOf('ready', { ...DRAFT, autoPublish: false });
    renderCard(OWNER);
    const publish = await screen.findByTestId('mastermind-publish');
    expect(publish.textContent).toBe('Publish');
    await new Promise(r => setTimeout(r, 50));
    expect(h.publishCanvasDraft).not.toHaveBeenCalled();
    expect(taskButtons()).toHaveLength(1);
  });

  it('failed: Try again retries the failed run on its revision, with a new client id; the canvas stays', async () => {
    h.server.offer = offerOf('failed', DRAFT);
    h.retryCanvasRun.mockImplementation(async () => { h.server.offer = offerOf('drafting', DRAFT); return { ok: true, start: { ok: true } }; });
    renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-task-failed')).textContent).toMatch(/canvas stays/);
    fireEvent.click(screen.getByTestId('mastermind-retry'));
    await waitFor(() => expect(h.retryCanvasRun).toHaveBeenCalledWith({ draftId: 'd1', failedRunId: 'run1', expectedRevision: 4, clientId: expect.any(String) }));
    expect(await screen.findByTestId('mastermind-task-creating')).toBeTruthy();
  });

  it('published: a line, and no button', async () => {
    h.server.offer = offerOf('published');
    renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-task-published')).textContent).toMatch(/published/);
    expect(taskButtons()).toHaveLength(0);
  });
});

describe('P1529 §6: polling only while a read can change', () => {
  const reads = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

  it('polls a draft being written (asking the database to expire it), and stops once it is published', async () => {
    betweenRounds();
    h.server.offer = offerOf('drafting', { ...DRAFT, autoPublish: true });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderCard(OWNER);
    await screen.findByTestId('mastermind-task-creating');
    await reads(100);
    const before = h.getMyNextVersionOffer.mock.calls.length;
    await reads(12_000);
    expect(h.getMyNextVersionOffer.mock.calls.length).toBeGreaterThan(before);
    expect(h.getCanvasDraftState).toHaveBeenCalledWith('c1');
    h.server.offer = offerOf('published');
    await reads(6_000);
    await screen.findByTestId('mastermind-task-published');
    const settled = h.getMyNextVersionOffer.mock.calls.length;
    await reads(60_000);
    expect(h.getMyNextVersionOffer.mock.calls.length).toBe(settled);
  });

  it('reads the offer every 5 s while the words are being prepared', async () => {
    betweenRounds();
    h.server.offer = offerOf('transcript_pending');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderCard(OWNER);
    await screen.findByTestId('mastermind-task-pending');
    await reads(100);
    const before = h.getMyNextVersionOffer.mock.calls.length;
    await reads(10_100);
    expect(h.getMyNextVersionOffer.mock.calls.length - before).toBe(2);
  });

  it('does not poll an idle owner', async () => {
    betweenRounds();
    h.server.offer = offerOf('no_recording');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderCard(OWNER);
    await screen.findByTestId('mastermind-task-no-recording');
    const o = h.getMyNextVersionOffer.mock.calls.length;
    await reads(60_000);
    expect(h.getMyNextVersionOffer.mock.calls.length).toBe(o);
  });
});

describe('P1529: Clarity Night and Social Hike keep their round card', () => {
  const renderFlow = (event: Record<string, unknown>) => render(
    <MemoryRouter>
      <FlowRoundCard event={event as never} self={OWNER} roster={ROSTER} ended={false} view="table" onMoment={vi.fn()} />
    </MemoryRouter>,
  );

  it.each([['clarity-night'], ['social-hike'], [null]])('%s event still renders RoundCard with the page\'s own props', async slug => {
    const onMoment = vi.fn();
    render(
      <MemoryRouter>
        <FlowRoundCard
          event={{ id: 'e9', seriesSlug: slug, flow: null, statementTag: 'ikigai', title: 'AI and your ikigai' } as never}
          self={OWNER} roster={ROSTER} ended view="compare" onMoment={onMoment}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('classic-round-card')).toBeTruthy();
    expect(h.classicProps).toHaveBeenCalledWith({
      eventId: 'e9', statementTag: 'ikigai', eventTitle: 'AI and your ikigai', self: OWNER, roster: ROSTER, ended: true, view: 'compare', onMoment,
    });
    expect(screen.queryByTestId('mastermind-round-card')).toBeNull();
    expect(h.getMyNextVersionOffer).not.toHaveBeenCalled();
  });

  it('a host who switched a Clarity Night event to the mastermind flow gets the mastermind screen', async () => {
    renderFlow({ id: 'e9', seriesSlug: 'clarity-night', flow: 'sales-mastermind', statementTag: null, title: 'T' });
    expect(await screen.findByTestId('mastermind-round-card')).toBeTruthy();
    expect(screen.queryByTestId('classic-round-card')).toBeNull();
  });

  it('an event in the sales-mastermind series gets the mastermind screen', async () => {
    renderFlow({ id: 'e9', seriesSlug: 'sales-mastermind', flow: null, statementTag: null, title: 'T' });
    expect(await screen.findByTestId('mastermind-round-card')).toBeTruthy();
    expect(h.classicProps).not.toHaveBeenCalled();
  });
});

describe('P1529: the step bar', () => {
  it('the mastermind room has Principle, Table and Feedback (open at any time); Clarity Night and the hike keep theirs', async () => {
    const { hiddenRoomSteps } = await import('@/app/prototypes/events/rounds/hidden-room-steps');
    const { SALES_MASTERMIND_RECIPE, CLARITY_NIGHT_RECIPE, SOCIAL_HIKE_RECIPE } = await import('@/app/prototypes/events/series-recipes');
    expect(hiddenRoomSteps(SALES_MASTERMIND_RECIPE).sort()).toEqual(['compare', 'ready']);
    expect(hiddenRoomSteps(CLARITY_NIGHT_RECIPE)).toEqual([]);
    expect(hiddenRoomSteps(SOCIAL_HIKE_RECIPE).sort()).toEqual(['compare', 'ready', 'table']);
  });
});


describe('P1529 round screen: the gap after round 2 (End round 2, then the next round or the evening\'s end)', () => {
  const twoEnded = () => liveRound(
    [round({ id: 'r1', endedAt: new Date(Date.now() - 120_000).toISOString() }), round({ id: 'r2', roundNo: 2, startedAt: new Date(Date.now() - 60_000).toISOString(), endedAt: new Date(Date.now() - 30_000).toISOString() })],
    { r1: [], r2: [] },
  );

  it('after round 2 ends the card says so; the host ending the evening ends it for the phone', async () => {
    twoEnded();
    const { unmount } = renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-between')).textContent).toContain('Round 2 is over');
    unmount();
    h.getEveningEnd.mockResolvedValue(new Date(Date.now() - 5_000).toISOString());
    const onMoment = vi.fn();
    renderCard(OWNER, { onMoment });
    await waitFor(() => expect(onMoment).toHaveBeenLastCalledWith(expect.objectContaining({ eveningOver: true })));
    expect(screen.getByTestId('mastermind-over')).toBeTruthy();
    expect(screen.queryByTestId('mastermind-between')).toBeNull();
  });
});
