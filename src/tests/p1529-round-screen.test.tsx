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
  discardCanvasDraft: vi.fn(),
  retryCanvasRun: vi.fn(),
  getCanvasDraftState: vi.fn(),
  classicProps: vi.fn(),
  listSharedWithEvent: vi.fn(),
  getCanvas: vi.fn(),
  setPosition: vi.fn(),
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
vi.mock('@/app/data/canvas-service', () => ({ canvasService: { listSharedWithEvent: h.listSharedWithEvent, getCanvas: h.getCanvas, setPosition: h.setPosition } }));
vi.mock('@/app/data/canvas-draft-service', () => ({
  publishCanvasDraft: h.publishCanvasDraft,
  discardCanvasDraft: h.discardCanvasDraft,
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

/** A round that started `secondsAgo` ago, with a 60 s finding minute, a 180 s reading part, 360 s of talk and 180 s of observer. */
const startedAgo = (secondsAgo: number) =>
  liveRound([round({ startedAt: new Date(Date.now() - secondsAgo * 1000).toISOString(), readingS: 180, firstS: 180, secondS: 180 })]);
/** Round 1 is over and nobody is seated: the owner between rounds. */
const betweenRounds = () => liveRound([round({ endedAt: new Date().toISOString() })]);

/** What get_my_next_version_offer answers (the client's NextVersionOffer). */
const offerOf = (state: string, over: Record<string, unknown> = {}) =>
  ({ state, roundId: state === 'none' ? null : 'r1', draftId: null, revision: null, runId: null, autoPublish: false, ...over });
const OPEN = offerOf('none');
const DRAFT = { draftId: 'd1', revision: 4, runId: 'run1' };

const Where = () => { const l = useLocation(); return <span data-testid="where" data-state={JSON.stringify(l.state)}>{l.pathname}</span>; };
const FROM_ROOM = JSON.stringify({ backToTable: '/', tableEvent: 'e1' });

function renderCard(selfMember: EventRoomMember, props: { view?: 'table' | 'compare' | 'hidden'; onMoment?: () => void; feedbackSlot?: HTMLElement | null } = {}) {
  return render(
    <MemoryRouter>
      <MastermindRoundCard eventId="e1" self={selfMember} roster={ROSTER} view={props.view ?? 'table'} onMoment={props.onMoment} feedbackSlot={props.feedbackSlot} />
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
  h.discardCanvasDraft.mockResolvedValue({ ok: true, discarded: true });
  liveRound();
});
afterEach(() => { vi.useRealTimers(); });

/** Every button but the waiting state's collapsed "Other Clarity Canvases" backup. */
const taskButtons = () => screen.queryAllByRole('button').filter(b => b.getAttribute('data-testid') !== 'mastermind-other-canvases-toggle');
const lines = () => screen.getAllByTestId('round-card-person').map(li => `${li.getAttribute('data-name')}: ${li.getAttribute('data-role')}`);
/** The role (i) buttons are the only buttons the table card has (the canvas actions are links). */
const cardButtons = () => screen.queryAllByRole('button').filter(b => b.getAttribute('data-testid') !== 'role-info');

describe('P1529 round screen: what each role sees', () => {
  it.each([
    [OWNER, ['You: owner', 'Erin W.: partner', 'Sam L.: observer'], true],
    [PARTNER, ['Haru T.: owner', 'You: partner', 'Sam L.: observer'], true],
    [OBSERVER, ['Haru T.: owner', 'Erin W.: partner', 'You: observer'], true],
  ])('%#: the table, my role, the others, no instruction while finding the table, Open for every role', async (who, people, open) => {
    renderCard(who);
    expect((await screen.findByTestId('round-card-table')).textContent).toBe('Table 1');
    expect(screen.queryByTestId('round-card-instruction')).toBeNull(); // the header already says "find your table"
    expect(screen.getByTestId('round-card-my-role').textContent).toBe(`You\u2019re the ${({ owner: 'Clarity Canvas owner', partner: 'peer', observer: 'observer' } as Record<string, string>)[people.find(l => l.startsWith('You'))!.split(": ")[1]]}`);
    // everyone at the table, me first, then the others in role order
    expect(lines()).toEqual([people.find(l => l.startsWith('You'))!, ...people.filter(l => !l.startsWith('You'))]);
    if (open) expect((await screen.findByTestId('round-canvas-link')).textContent).toBe(who === OWNER ? 'Open your canvas' : 'Open Haru T.\u2019s canvas');
    else expect(screen.queryByTestId('round-canvas-link')).toBeNull();
    for (const gone of ['round-card-role', 'round-card-with', 'round-card-rule', 'round-canvas-card-toggle']) expect(screen.queryByTestId(gone)).toBeNull();
  });

  it('shows only the person\'s own table when the round has several', async () => {
    liveRound([round()], { r1: [
      seat('r1', 'm-other-owner', 'first', 1), seat('r1', 'm-other-partner', 'second', 1),
      seat('r1', 'm-owner', 'first', 2), seat('r1', 'm-partner', 'second', 2), seat('r1', 'm-obs', 'observer', 2),
    ] });
    renderCard(PARTNER);
    expect((await screen.findByTestId('round-card-table')).textContent).toBe('Table 2');
    expect(screen.getByTestId('round-card-others').textContent).toMatch(/You.*Haru T\..*Sam L\./);
    expect(lines()).toEqual(['You: partner', 'Haru T.: owner', 'Sam L.: observer']);
  });

  it('a person the roster has no name for shows the fallback name', async () => {
    liveRound([round()], { r1: [seat('r1', 'm-ghost', 'first'), seat('r1', 'm-partner', 'second')] });
    renderCard(PARTNER);
    expect((await screen.findByTestId('round-canvas-link')).textContent).toBe('Open Someone\u2019s canvas');
    expect(lines()).toEqual(['You: partner', 'Someone: owner']);
  });

  it('asks for nothing during a round: no confirm, swap, phase, compare, slider or score; the owner has no button', async () => {
    renderCard(OWNER);
    await screen.findByTestId('round-card-my-role');
    expect(cardButtons()).toHaveLength(0);
    // one recording control, in the room's bar above the tabs: the card has no mic block
    for (const gone of ['round-mic-start', 'round-mic-consent', 'round-mic-without']) expect(screen.queryByTestId(gone)).toBeNull();
    expect(screen.queryAllByRole('slider')).toHaveLength(0);
    expect(screen.queryByTestId('round-card-confirm')).toBeNull();
    expect(document.body.textContent).not.toMatch(/swap|seated —|compare|score|stance/i);
  });

  it("a partner's only control is Open the canvas (no card toggle; the role (i) is information, not a control)", async () => {
    renderCard(PARTNER);
    await screen.findByTestId('round-canvas-link');
    expect(cardButtons()).toHaveLength(0);
    expect(screen.queryByTestId('round-canvas-select')).toBeNull();
  });
});

describe('P1529 round screen: the canvas link', () => {
  it('the canvas button is the outline while my mic is not running in a live round, and the filled primary once it runs', async () => {
    h.capture = { ...h.capture, isCapturingForEvent: () => false };
    const { unmount } = renderCard(PARTNER);
    expect((await screen.findByTestId('round-canvas-link')).getAttribute('data-variant')).toBe('outline');
    unmount();
    h.capture = { ...h.capture, isCapturingForEvent: () => true };
    renderCard(PARTNER);
    expect((await screen.findByTestId('round-canvas-link')).getAttribute('data-variant')).toBe('primary');
  });

  it('shows the partner and the observer a link to the owner\'s newest version; the click records the open and goes there', async () => {
    for (const who of [PARTNER, OBSERVER]) {
      h.recordCanvasOpen.mockClear();
      const { unmount } = renderCard(who);
      const link = (await screen.findByTestId('round-canvas-link')) as HTMLAnchorElement;
      expect(link.getAttribute('href')).toBe('/p/haru/canvas/launch_plan');
      expect(link.textContent).toBe('Open Haru T.\u2019s canvas');
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

  it('a table with no canvas keeps its roles: the partner is told to talk it through, the owner to talk about their idea', async () => {
    h.server.canvas = { ownerProfileId: 'p-owner', ownerSlug: 'haru', canvasName: null, shared: false };
    // the no-canvas line replaces the instruction once the table is seated (reading onward)
    startedAgo(70);
    renderCard(PARTNER);
    expect((await screen.findAllByTestId('round-card-instruction')).at(-1)!.textContent).toMatch(/Talk it through: no canvas/);
    expect(screen.queryByTestId('round-canvas-link')).toBeNull();
    expect(screen.getByTestId('mastermind-round-card').getAttribute('data-role')).toBe('partner');
  });

  it('the owner of a table with no canvas reads "No Clarity Canvas yet: talk about your business idea"', async () => {
    h.server.canvas = { ownerProfileId: 'p-owner', ownerSlug: 'haru', canvasName: null, shared: false };
    startedAgo(70);
    renderCard(OWNER);
    expect((await screen.findAllByTestId('round-card-instruction')).at(-1)!.textContent).toMatch(/No Clarity Canvas yet: talk about your business idea/);
    expect(screen.getByTestId('mastermind-round-card').getAttribute('data-role')).toBe('owner');
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

describe('P1529 round screen: the other canvases', () => {
  /** "See other canvases" is a centred link that opens a list; each row is its own link. */
  const openList = async () => {
    expect((await screen.findByTestId('round-canvas-others-toggle')).textContent).toBe('See other Clarity Canvases \u2192');
    expect(screen.queryByTestId('round-canvas-others')).toBeNull();
    fireEvent.click(screen.getByTestId('round-canvas-others-toggle'));
    return screen.findByTestId('round-canvas-others');
  };
  const MIA = { ownerId: 'p-mia', ownerName: 'Mia Long', ownerSlug: 'mia', name: 'pitch' };
  const withOthers = () => { h.listSharedWithEvent.mockResolvedValue([...(h.server.shared as unknown[]), MIA]); };

  it('lists every other canvas shared with the event as its own link, without the table\'s own', async () => {
    withOthers();
    renderCard(PARTNER);
    const list = await openList();
    const links = Array.from(list.querySelectorAll('a')) as HTMLAnchorElement[];
    expect(links.map(a => a.textContent)).toEqual(['Open Mia L.\u2019s canvas']);
    expect(links[0]!.getAttribute('href')).toBe('/p/mia/canvas/pitch');
    expect(h.listSharedWithEvent).toHaveBeenCalledWith('e1');
    expect(screen.queryByTestId('round-canvas-select')).toBeNull();
  });

  it('the main button keeps opening the table\'s canvas; another canvas records no evidence and never touches seating', async () => {
    withOthers();
    renderCard(PARTNER);
    const list = await openList();
    const main = screen.getByTestId('round-canvas-link') as HTMLAnchorElement;
    expect(main.getAttribute('href')).toBe('/p/haru/canvas/launch_plan');
    expect(main.textContent).toBe('Open Haru T.\u2019s canvas');
    fireEvent.click(list.querySelector('a')!);
    expect(h.recordCanvasOpen).not.toHaveBeenCalled();
    expect(screen.getByTestId('where').textContent).toBe('/p/mia/canvas/pitch');
  });

  it('the owner gets the same: their own canvas on the button, the others in the list', async () => {
    withOthers();
    renderCard(OWNER);
    const list = await openList();
    expect((screen.getByTestId('round-canvas-link') as HTMLAnchorElement).textContent).toBe('Open your canvas');
    expect(list.querySelectorAll('a')).toHaveLength(1);
  });

  it('a failed read of the shared canvases leaves the table\'s canvas alone, with no "See other Clarity Canvases"', async () => {
    h.listSharedWithEvent.mockRejectedValue(new Error('offline'));
    renderCard(PARTNER);
    expect((await screen.findByTestId('round-canvas-link')).getAttribute('href')).toBe('/p/haru/canvas/launch_plan');
    expect(screen.queryByTestId('round-canvas-others-toggle')).toBeNull();
  });

  it('with no other canvas shared there is nothing to list, so no "See other Clarity Canvases"', async () => {
    renderCard(PARTNER);
    await screen.findByTestId('round-canvas-link');
    expect(screen.queryByTestId('round-canvas-others-toggle')).toBeNull();
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

  it('the card says "{round} with {partner} is in"; "Create next version" makes and publishes in one tap, for that round', async () => {
    h.server.offer = offerOf('offer');
    h.makeMyNextVersion.mockImplementation(async () => {
      h.server.offer = offerOf('drafting', DRAFT);
      return { status: 'started', draftId: 'd1', runId: 'run1', repeat: false, start: { ok: true, runId: 'run1', kind: 'message' } };
    });
    renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-task-title')).textContent).toBe('Round 1 with Erin: transcript ready');
    expect(screen.getByTestId('mastermind-task-body').textContent).toBe('Make your next version from what was said.');
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
    expect((await screen.findByTestId('mastermind-task-pending')).textContent).toBe('Round 1 with Erin: the transcript is on its way. Usually 1 to 3 minutes.');
    expect(screen.queryByTestId('mastermind-make')).toBeNull();
    h.server.offer = offerOf('offer');
    // The tab goes away and comes back (a real visibility change, not a bare event).
    for (const v of ['hidden', 'visible']) {
      Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
      fireEvent(document, new Event('visibilitychange'));
    }
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
    expect((await screen.findByTestId('mastermind-task-failed')).textContent).toBe('Could not make your next version.');
    fireEvent.click(screen.getByTestId('mastermind-retry'));
    await waitFor(() => expect(h.retryCanvasRun).toHaveBeenCalledWith({ draftId: 'd1', failedRunId: 'run1', expectedRevision: 4, clientId: expect.any(String) }));
    expect(await screen.findByTestId('mastermind-task-creating')).toBeTruthy();
  });

  it('nothing new: a draft that changes nothing says so in calm grey, with no Try again and no button', async () => {
    h.server.offer = offerOf('ready', { ...DRAFT, autoPublish: true });
    h.publishCanvasDraft.mockResolvedValue({ ok: false, refused: 'no_changes' });
    renderCard(OWNER);
    const card = await screen.findByTestId('mastermind-task-nothing-new');
    expect(card.textContent).toBe('Round 1 with Erin: nothing to add. What was said didn\u2019t change your canvas.');
    expect(card.querySelector('.text-destructive')).toBeNull();
    expect(screen.queryByTestId('mastermind-publish')).toBeNull();
    expect(screen.queryByTestId('mastermind-task-note')).toBeNull();
    expect(taskButtons()).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/Nothing is different|Try again|words ready/);
  });

  it('nothing new closes the unchanged draft (so the offer moves on) and reads the offer again', async () => {
    h.server.offer = offerOf('ready', { ...DRAFT, autoPublish: true });
    h.publishCanvasDraft.mockResolvedValue({ ok: false, refused: 'no_changes' });
    h.discardCanvasDraft.mockImplementation(async () => { h.server.offer = offerOf('offer'); return { ok: true, discarded: true }; });
    renderCard(OWNER);
    await waitFor(() => expect(h.discardCanvasDraft).toHaveBeenCalledWith('d1', 4));
    expect(await screen.findByTestId('mastermind-make')).toBeTruthy();
    expect(screen.getByTestId('mastermind-task-note').textContent).toMatch(/Nothing to add/);
  });

  it('after the discard, an offer of none still shows the round\u2019s "nothing to add" card until another offer arrives', async () => {
    h.server.offer = offerOf('ready', { ...DRAFT, autoPublish: true });
    h.publishCanvasDraft.mockResolvedValue({ ok: false, refused: 'no_changes' });
    h.discardCanvasDraft.mockImplementation(async () => { h.server.offer = offerOf('none'); return { ok: true, discarded: true }; });
    renderCard(OWNER);
    const card = await screen.findByTestId('mastermind-task-nothing-new');
    await waitFor(() => expect(h.discardCanvasDraft).toHaveBeenCalled());
    await waitFor(() => expect(h.getMyNextVersionOffer.mock.calls.length).toBeGreaterThan(1));
    expect((await screen.findByTestId('mastermind-task-nothing-new')).textContent).toBe('Round 1 with Erin: nothing to add. What was said didn\u2019t change your canvas.');
    expect(card).toBeTruthy();
    h.server.offer = offerOf('offer');
    for (const v of ['hidden', 'visible']) {
      Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    }
    expect(await screen.findByTestId('mastermind-make')).toBeTruthy();
    expect(screen.queryByTestId('mastermind-task-nothing-new')).toBeNull();
  });

  it('"Version N is published." only when this card made that round\u2019s publish; a published offer read fresh says no number', async () => {
    h.server.offer = offerOf('ready', { ...DRAFT, autoPublish: true });
    h.publishCanvasDraft.mockImplementation(async () => { h.server.offer = offerOf('published'); return { ok: true, seq: 3 }; });
    const first = renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-task-published')).textContent).toMatch(/Version 3 is published\./);
    first.unmount();
    renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-task-published')).textContent).toMatch(/Your next version is published\./);
  });

  it('a failed close keeps the calm note and offers "Close this", which tries the discard again', async () => {
    h.server.offer = offerOf('ready', { ...DRAFT, autoPublish: true });
    h.publishCanvasDraft.mockResolvedValue({ ok: false, refused: 'no_changes' });
    h.discardCanvasDraft.mockRejectedValueOnce(new Error('offline'));
    renderCard(OWNER);
    fireEvent.click(await screen.findByTestId('mastermind-task-close'));
    await waitFor(() => expect(h.discardCanvasDraft).toHaveBeenCalledTimes(2));
  });

  it('a settled state whose first refresh fails shows Try again at once (it is not polled)', async () => {
    h.server.offer = offerOf('published');
    renderCard(OWNER);
    await screen.findByTestId('mastermind-task-published');
    h.getMyNextVersionOffer.mockRejectedValueOnce(new Error('offline'));
    for (const v of ['hidden', 'visible']) {
      Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    }
    expect(await screen.findByTestId('mastermind-offer-failed')).toBeTruthy();
  });

  it('a real publish failure says "Could not make your next version." with a secondary Try again', async () => {
    h.server.offer = offerOf('ready', { ...DRAFT, autoPublish: true });
    h.publishCanvasDraft.mockResolvedValue({ ok: false, refused: 'stale_view' });
    renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-task-ready')).textContent).toBe('Could not make your next version.');
    expect(screen.getByTestId('mastermind-publish').textContent).toBe('Try again');
  });

  it('on the Feedback tab the card is AFTER the feedback in the DOM, under "Before you go: your next version"', async () => {
    h.server.offer = offerOf('offer');
    const host = document.createElement('div');
    host.innerHTML = '<div data-testid="feedback-block">How was the evening?</div><div data-testid="slot"></div>';
    document.body.appendChild(host);
    const slot = host.querySelector('[data-testid="slot"]') as HTMLElement;
    renderCard(OWNER, { view: 'hidden', feedbackSlot: slot });
    const after = await screen.findByTestId('mastermind-task-after-feedback');
    expect(slot.contains(after)).toBe(true);
    const feedback = host.querySelector('[data-testid="feedback-block"]')!;
    expect(feedback.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(after.querySelector('h3')!.textContent).toBe('Before you go: your next version');
    expect(after.querySelector('[data-testid="mastermind-make"]')).toBeTruthy();
    host.remove();
  });

  it('nothing new is bound to the draft revision: a hand-edited draft is NOT auto-published again, it waits for the Publish tap', async () => {
    const D9 = { draftId: 'd9', revision: 4, runId: 'run1' };
    h.server.offer = offerOf('ready', { ...D9, autoPublish: true });
    h.publishCanvasDraft.mockResolvedValue({ ok: false, refused: 'no_changes' });
    renderCard(OWNER);
    await screen.findByTestId('mastermind-task-nothing-new');
    expect(h.publishCanvasDraft).toHaveBeenCalledTimes(1);
    // the server keeps saying autoPublish: true for every later revision (the owner edited by hand)
    h.server.offer = offerOf('ready', { ...D9, revision: 5, autoPublish: true });
    for (const v of ['hidden', 'visible']) {
      Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    }
    expect((await screen.findByTestId('mastermind-publish')).textContent).toBe('Publish');
    expect(screen.queryByTestId('mastermind-task-nothing-new')).toBeNull();
    await new Promise(r => setTimeout(r, 60));
    expect(h.publishCanvasDraft).not.toHaveBeenCalledWith('d9', 5);
    expect(h.publishCanvasDraft).toHaveBeenCalledTimes(1);
  });

  it('auto-publish waits for the break: nothing is published while a round is running, then it publishes', async () => {
    h.server.offer = offerOf('ready', { draftId: 'd11', revision: 4, runId: 'run1', autoPublish: true });
    h.publishCanvasDraft.mockResolvedValue({ ok: true, seq: 3 });
    startedAgo(70);
    const running = renderCard(OWNER);
    await screen.findByTestId('round-card-my-role');
    await new Promise(r => setTimeout(r, 80));
    expect(h.publishCanvasDraft).not.toHaveBeenCalled();
    running.unmount();
    betweenRounds();
    renderCard(OWNER);
    await waitFor(() => expect(h.publishCanvasDraft).toHaveBeenCalledWith('d11', 4));
  });

  it('a "draft just changed" refusal while the offer is already published (another open room did it) shows the published state, not the error', async () => {
    h.server.offer = offerOf('ready', { draftId: 'd12', revision: 4, runId: 'run1', autoPublish: true });
    h.publishCanvasDraft.mockImplementation(async () => { h.server.offer = offerOf('published'); return { ok: false, refused: 'stale_view' }; });
    renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-task-open'))).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/draft just changed/i);
  });

  it('published: "Open it" goes to the published canvas page, with no open draft needed', async () => {
    h.server.offer = offerOf('published');
    renderCard(OWNER);
    const open = (await screen.findByTestId('mastermind-task-open')) as HTMLAnchorElement;
    expect(open.getAttribute('href')).toBe('/p/haru/canvas/launch_plan');
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

// ── The reading part and the observer's lines (UAT 2026-11-11, items 4, 5, 6 and decision (d)) ───────────────────────

type Pos = { userId: string; position: string };
function canvasView(args: { points: [string, string][]; positions?: Record<string, Pos[]>; version: string; versions: { name: string; seq: number | null; draft: boolean }[] }) {
  return {
    points: args.points.map(([id, statement]) => ({ id, statement })),
    positions: new Map(Object.entries(args.positions ?? {})),
    version: args.version,
    versions: args.versions,
  };
}
const V2 = [{ name: 'v2', seq: 2, draft: false }, { name: 'v1', seq: 1, draft: false }];

describe('P1529 round screen: the reading part', () => {
  beforeEach(() => {
    h.setPosition.mockResolvedValue(undefined);
    h.getCanvas.mockImplementation(async (_o: string, _n: string, _v: string, _t: unknown, version?: string) =>
      version === 'v1'
        ? canvasView({ points: [['a', 'Same point']], version: 'v1', versions: V2 })
        : canvasView({
          points: [['a', 'Same point'], ['b', 'Rewritten point'], ['c', 'Another rewritten point']],
          positions: { a: [{ userId: 'p-owner', position: 'agree' }], c: [{ userId: 'p-owner', position: 'unsure' }] },
          version: 'v2',
          versions: V2,
        }));
  });

  it('a visitor lists every point, one tap writes the canvas\'s own position, with no grey prompt and no "owner hasn\'t taken a position" line', async () => {
    startedAgo(70);
    renderCard(PARTNER);
    const rows = await screen.findAllByTestId('reading-point');
    expect(rows.map(r => r.textContent)).toEqual([expect.stringContaining('Same point'), expect.stringContaining('Rewritten point'), expect.stringContaining('Another rewritten point')]);
    expect(screen.queryByTestId('reading-no-owner-position')).toBeNull(); // the line is gone
    expect(screen.queryByText(/first impression|hasn.t taken a position/)).toBeNull();
    expect(screen.queryByText(/agree with all/i)).toBeNull();
    fireEvent.click(rows[1]?.querySelector('[data-testid="reading-agree"]') as HTMLElement);
    await waitFor(() => expect(h.setPosition).toHaveBeenCalledWith('p-owner', 'launch_plan', 'b', 'agree'));
    await waitFor(() => expect((rows[1]?.querySelector('[data-testid="reading-agree"]') as HTMLElement).getAttribute('aria-pressed')).toBe('true'));
    expect(screen.getByTestId('round-canvas-link')).toBeTruthy();
  });

  it('the owner lists only the points changed since their previous version that they hold no position on', async () => {
    startedAgo(70);
    renderCard(OWNER);
    const rows = await screen.findAllByTestId('reading-point');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('Rewritten point');
    expect(screen.queryByTestId('reading-no-owner-position')).toBeNull();
  });

  it('the owner with nothing changed gets the one reading line in the box and no list', async () => {
    startedAgo(70);
    h.getCanvas.mockImplementation(async () => canvasView({ points: [['a', 'Same point']], version: 'v1', versions: [{ name: 'v1', seq: 1, draft: false }] }));
    renderCard(OWNER);
    expect((await screen.findByTestId('round-card-instruction')).textContent).toBe('Check your canvas: set your position on every point if not already.');
    expect(screen.queryByTestId('reading-owner-nothing')).toBeNull();
    expect(screen.queryByTestId('reading-list')).toBeNull();
  });

  it('there is no list outside the reading part, and nothing is read then', async () => {
    startedAgo(30);
    renderCard(PARTNER);
    await screen.findByTestId('round-card-table');
    startedAgo(300);
    renderCard(PARTNER);
    await screen.findAllByTestId('round-card-table');
    expect(screen.queryByTestId('reading-list')).toBeNull();
    expect(h.getCanvas).not.toHaveBeenCalled();
  });

  it('a round with no reading part (0) never shows the list', async () => {
    liveRound([round({ startedAt: new Date(Date.now() - 70_000).toISOString(), readingS: 0 })]);
    renderCard(PARTNER);
    await screen.findByTestId('round-card-table');
    expect(screen.queryByTestId('reading-list')).toBeNull();
  });

  it('two quick taps on one point are saved in order: the second waits for the first (finding 12)', async () => {
    startedAgo(70);
    let release: () => void = () => {};
    h.setPosition.mockImplementationOnce(() => new Promise<void>(r => { release = () => r(); }));
    renderCard(PARTNER);
    const rows = await screen.findAllByTestId('reading-point');
    fireEvent.click(rows[1]?.querySelector('[data-testid="reading-agree"]') as HTMLElement);
    await waitFor(() => expect(h.setPosition).toHaveBeenCalledTimes(1));
    fireEvent.click(rows[1]?.querySelector('[data-testid="reading-unsure"]') as HTMLElement);
    await new Promise(r => setTimeout(r, 60));
    expect(h.setPosition).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(h.setPosition).toHaveBeenCalledTimes(2));
    expect(h.setPosition).toHaveBeenLastCalledWith('p-owner', 'launch_plan', 'b', 'unsure');
  });

  it('the chosen position uses the default Button variant, with no hand-typed colour (finding 10)', async () => {
    startedAgo(70);
    renderCard(PARTNER);
    const rows = await screen.findAllByTestId('reading-point');
    fireEvent.click(rows[1]?.querySelector('[data-testid="reading-agree"]') as HTMLElement);
    await waitFor(() => expect((rows[1]?.querySelector('[data-testid="reading-agree"]') as HTMLElement).getAttribute('aria-pressed')).toBe('true'));
    const cls = (rows[1]?.querySelector('[data-testid="reading-agree"]') as HTMLElement).className;
    expect(cls).toContain('bg-blue-600');
    expect(cls).not.toContain('bg-blue-500');
  });
});

describe('P1529 round screen: review fixes (2026-11-11)', () => {
  const setVisibility = (v: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  afterEach(() => { setVisibility('visible'); });

  it('a canvas the owner chose and then unshared says "no longer shared", not "no canvas yet" (finding 9)', async () => {
    h.server.canvas = { ownerProfileId: 'p-owner', ownerSlug: 'haru', canvasName: null, shared: false, hadCanvas: true };
    renderCard(PARTNER);
    expect((await screen.findByTestId('round-canvas-unshared')).textContent).toMatch(/no longer shared/);
    expect(screen.queryByTestId('round-card-headline')?.textContent ?? '').not.toMatch(/no canvas/i);
  });

  it('a hidden tab reads nothing on mount; coming back reads at once (finding 13)', async () => {
    setVisibility('hidden');
    renderCard(PARTNER);
    await new Promise(r => setTimeout(r, 60));
    expect(h.getMyRoundCanvas).not.toHaveBeenCalled();
    expect(h.getMyNextVersionOffer).not.toHaveBeenCalled();
    expect(h.listSharedWithEvent).not.toHaveBeenCalled();
    setVisibility('visible');
    await waitFor(() => expect(h.getMyRoundCanvas).toHaveBeenCalled());
    expect(h.getMyNextVersionOffer).toHaveBeenCalled();
    expect(h.listSharedWithEvent).toHaveBeenCalled();
    await new Promise(r => setTimeout(r, 80));
    expect(h.getMyNextVersionOffer, 'one read on return, not two (finding D)').toHaveBeenCalledTimes(1);
  });

  it('a remounted card awaits the publish already in flight and shows its refusal (finding B)', async () => {
    betweenRounds();
    h.server.offer = offerOf('ready', { ...DRAFT, draftId: 'd-remount', autoPublish: true });
    let done: (v: unknown) => void = () => {};
    h.publishCanvasDraft.mockImplementation(() => new Promise(r => { done = r; }));
    const first = renderCard(OWNER);
    await waitFor(() => expect(h.publishCanvasDraft).toHaveBeenCalledTimes(1));
    first.unmount();
    renderCard(OWNER);
    await new Promise(r => setTimeout(r, 60));
    expect(h.publishCanvasDraft).toHaveBeenCalledTimes(1);
    done({ ok: false, refused: 'stale_view' });
    expect((await screen.findByTestId('mastermind-task-note')).textContent).toMatch(/just changed/);
    expect((await screen.findByTestId('mastermind-publish')).textContent).toBe('Try again');
  });

  it('later offer reads that keep failing back off and stop after three, with Try again (finding C)', async () => {
    betweenRounds();
    h.server.offer = offerOf('drafting', { ...DRAFT, autoPublish: true });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderCard(OWNER);
    await screen.findByTestId('mastermind-task-creating');
    h.getMyNextVersionOffer.mockRejectedValue(new Error('offline'));
    // One second per act, so React commits each failure before the next tick (one act around the whole span would batch them).
    for (let t = 0; t < 120; t++) await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    const calls = h.getMyNextVersionOffer.mock.calls.length;
    expect(screen.getByTestId('mastermind-offer-failed')).toBeTruthy();
    for (let t = 0; t < 120; t++) await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(h.getMyNextVersionOffer.mock.calls.length, 'polling has stopped').toBe(calls);
    expect(calls).toBeLessThanOrEqual(1 + 3 + 1);
  });

  it('a failed offer read says so with Try again, polls nothing, and Try again reads once more (finding 14)', async () => {
    betweenRounds();
    h.getMyNextVersionOffer.mockRejectedValueOnce(new Error('offline'));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-offer-failed')).textContent).toMatch(/Could not read your next version/);
    const calls = h.getMyNextVersionOffer.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(h.getMyNextVersionOffer.mock.calls.length, 'no endless polling after a failure').toBe(calls);
    h.server.offer = offerOf('published');
    fireEvent.click(screen.getByTestId('mastermind-offer-retry'));
    expect((await screen.findByTestId('mastermind-task-published'))).toBeTruthy();
    expect(screen.queryByTestId('mastermind-offer-failed')).toBeNull();
  });

  it('a first read still pending does not start a poll of its own (finding 14)', async () => {
    betweenRounds();
    h.getMyNextVersionOffer.mockImplementation(() => new Promise(() => {}));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderCard(OWNER);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(h.getMyNextVersionOffer).toHaveBeenCalledTimes(1);
  });

  it('a finished one-tap draft is published once even when the card remounts while it publishes (finding 11)', async () => {
    betweenRounds();
    h.server.offer = offerOf('ready', { ...DRAFT, autoPublish: true });
    let done: (v: { ok: true }) => void = () => {};
    h.publishCanvasDraft.mockImplementation(() => new Promise(r => { done = r as typeof done; }));
    const first = renderCard(OWNER);
    await waitFor(() => expect(h.publishCanvasDraft).toHaveBeenCalledTimes(1));
    first.unmount();
    renderCard(OWNER);
    await new Promise(r => setTimeout(r, 80));
    expect(h.publishCanvasDraft).toHaveBeenCalledTimes(1);
    h.server.offer = offerOf('published');
    done({ ok: true });
  });
});

describe('P1529 round screen: the one instruction per part', () => {
  const Q = (what: string) => `\u201CHow well do you think you understand my ${what}, from 0 to 10?\u201D`;
  const READ = 'Read Haru\u2019s canvas quietly. Set your position on each point, especially where you disagree.';
  it.each([
    [OBSERVER, 70, [READ]],
    [OBSERVER, 300, ['Make sure the listener stays in their role: no disagreeing, no own point of view yet. Keep talking time balanced: no more than 1 minute per person. Ring the bell to remind people of their roles and the time.']],
    [OBSERVER, 60 + 180 + 360 + 10, ['Say what they can do better. If you like, say how well you think you understood the canvas, from 0 to 10, and what was unclear.']],
    [OWNER, 70, ['Check your canvas: set your position on every point if not already.']],
    [OWNER, 300, [`Erin explains your canvas back. Then ask: ${Q('canvas')}`, `At 8 or more, Erin challenges your canvas. They ask you: ${Q('challenge')}`]],
    [PARTNER, 70, [READ]],
    [PARTNER, 300, ['Explain Haru\u2019s canvas back in your own words. Then answer: how well you think you understand their canvas, from 0 to 10.', `At 8 or more, challenge their canvas: explain where and why you disagree with their points. Then ask Haru: ${Q('challenge')}`]],
  ])('%#: the role reads its steps for the part now (two numbered steps in Talk for owner and partner)', async (who, secondsAgo, steps) => {
    startedAgo(secondsAgo);
    renderCard(who);
    const box = await screen.findByTestId('round-card-instruction');
    expect(Array.from(box.querySelectorAll('p, li')).map(e => e.textContent)).toEqual(steps);
    expect(box.querySelectorAll('ol > li')).toHaveLength(steps.length > 1 ? 2 : 0);
  });

  it.each([[OWNER], [PARTNER]])('%#: in the observer\'s part the owner and the partner have no instruction box', async who => {
    startedAgo(60 + 180 + 360 + 10);
    renderCard(who);
    await screen.findByTestId('round-card-my-role');
    expect(screen.queryByTestId('round-card-instruction')).toBeNull();
  });

  it('the header is the table (left), the time left (right) and the projector\'s part bar under it; no part word', async () => {
    startedAgo(70);
    renderCard(OWNER);
    expect((await screen.findByTestId('round-card-table')).textContent).toBe('Table 1');
    expect(screen.getByTestId('round-card-time').textContent).toMatch(/^\d+:\d\d$/);
    expect(screen.getByTestId('round-card-parts').querySelector('ol[aria-label="Round"]')).toBeTruthy();
    expect(screen.queryByTestId('round-card-part')).toBeNull();
    expect(screen.getByTestId('round-card-instruction').className).toContain('bg-blue-50');
    expect(screen.getByTestId('round-card-instruction').textContent).not.toContain('\u25B6');
  });

  it('finding the table: the time and the part bar show, no instruction', async () => {
    startedAgo(20);
    renderCard(OBSERVER);
    expect((await screen.findByTestId('round-card-table')).textContent).toBe('Table 1');
    expect(screen.getByTestId('round-card-time').textContent).toMatch(/^\d+:\d\d$/);
    expect(screen.getByTestId('round-card-parts')).toBeTruthy();
    expect(screen.queryByTestId('round-card-instruction')).toBeNull();
  });

  it('the canvas is always the primary filled button, centred; none for the observer in their own part', async () => {
    for (const ago of [70, 300, 60 + 180 + 360 + 10]) {
      startedAgo(ago);
      const view = renderCard(PARTNER);
      const link = await screen.findByTestId('round-canvas-link');
      expect(link.closest('[class*="bg-blue-600"]')).toBeTruthy();
      expect(link.closest('[class*="justify-center"]')).toBeTruthy();
      view.unmount();
    }
    startedAgo(60 + 180 + 360 + 10);
    renderCard(OBSERVER);
    await screen.findByTestId('round-card-my-role');
    expect(screen.queryByTestId('round-canvas-link')).toBeNull();
  });
});
