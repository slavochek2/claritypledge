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

import type { RoundMoment } from '@/app/prototypes/events/rounds/RoundCard';
import { MastermindRoundCard } from '@/app/prototypes/events/rounds/MastermindRoundCard';
import { FlowRoundCard } from '@/app/prototypes/events/rounds/FlowRoundCard';

const round = (over: Partial<EventRound> = {}): EventRound => ({
  id: 'r1', roundNo: 1, groupSize: 3, startedAt: new Date().toISOString(), endedAt: null,
  seatingS: 0, readingS: 0, firstS: 360, secondS: 360, observerS: 180, splitSpeakers: false, matchTag: null, showcase: false, ...over,
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

/** A round that started `secondsAgo` ago: two parts only, 360 s of talk then 180 s of observer (no finding-the-table part, no reading part). */
const startedAgo = (secondsAgo: number) =>
  liveRound([round({ startedAt: new Date(Date.now() - secondsAgo * 1000).toISOString(), firstS: 180, secondS: 180 })]);
/** Round 1 is over and nobody is seated: the owner between rounds. */
const betweenRounds = () => liveRound([round({ endedAt: new Date().toISOString() })]);

/** What get_my_next_version_offer answers (the client's NextVersionOffer). */
const offerOf = (state: string, over: Record<string, unknown> = {}) =>
  ({ state, roundId: state === 'none' ? null : 'r1', draftId: null, revision: null, runId: null, autoPublish: false, ...over });
const OPEN = offerOf('none');
const DRAFT = { draftId: 'd1', revision: 4, runId: 'run1' };

const Where = () => { const l = useLocation(); return <span data-testid="where" data-state={JSON.stringify(l.state)} data-search={l.search}>{l.pathname}</span>; };
const FROM_ROOM = JSON.stringify({ backToTable: '/', tableEvent: 'e1' });
const PLAIN_FROM_ROOM = JSON.stringify({ backToTable: '/', tableEvent: 'e1', plainCanvas: true });
/** P1686: the owner's draft opened from the next-version card: plain, with the way back, and its Publish returns to the table. */
const DRAFT_FROM_ROOM = JSON.stringify({ backToTable: '/', tableEvent: 'e1', plainCanvas: true, publishReturnsToTable: true });
/** P1686: `get_canvas` answers for the draft (v3-draft, revision 7, started from v2) and for v2. */
const pt = (statement: string, box: string) => ({ statement, systemTags: [`canvas:${box}`] });
const VERSIONS = [{ name: 'v3-draft', seq: null, draft: true }, { name: 'v2', seq: 2, draft: false }];
function canvasReads(draftPoints = [pt('Teams of 100 to 1,000', 'segments'), pt('Same problem', 'problem')], basePoints = [pt('Small teams', 'segments'), pt('Same problem', 'problem')], revision = 7) {
  h.getCanvas.mockImplementation(async (_o: string, _n: string, _v: string, _k: unknown, version?: string) => (version === 'v3-draft'
    ? { points: draftPoints, versions: VERSIONS, draft: { id: 'd1', version: 'v3-draft', baseSeq: 2, revision } }
    : { points: basePoints, versions: VERSIONS, draft: null }));
}

function renderCard(selfMember: EventRoomMember, props: { view?: 'table' | 'compare' | 'hidden'; onMoment?: (moment: RoundMoment) => void } = {}) {
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
  ])('%#: the table, my role, the others, every step of my role listed, Open for every role', async (who, people, open) => {
    renderCard(who);
    expect((await screen.findByTestId('round-card-table')).textContent).toBe('Table 1');
    expect(screen.getByTestId('round-card-instruction').querySelectorAll('ol > li')).toHaveLength(3); // every step is always visible
    expect(screen.getByTestId('round-card-my-role').textContent).toBe(`You\u2019re the ${({ owner: 'Clarity Canvas owner', partner: 'peer', observer: 'observer' } as Record<string, string>)[people.find(l => l.startsWith('You'))!.split(": ")[1]]}`);
    // G8: the others at the table in role order; no "You" row (my role is the line above)
    expect(lines()).toEqual(people.filter(l => !l.startsWith('You')));
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
    expect(screen.getByTestId('round-card-others').textContent).toMatch(/Haru T\..*Sam L\./);
    expect(screen.getByTestId('round-card-others').textContent).not.toMatch(/You/);
    expect(lines()).toEqual(['Haru T.: owner', 'Sam L.: observer']);
  });

  it('a person the roster has no name for shows the fallback name', async () => {
    liveRound([round()], { r1: [seat('r1', 'm-ghost', 'first'), seat('r1', 'm-partner', 'second')] });
    renderCard(PARTNER);
    expect((await screen.findByTestId('round-canvas-link')).textContent).toBe('Open Someone\u2019s canvas');
    expect(lines()).toEqual(['Someone: owner']);
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
    await waitFor(() => expect(onMoment).toHaveBeenCalledWith({ seated: true, atTable: false, eveningOver: false, live: true, waiting: false, nextVersionOffered: false }));
  });

  it('before round 1 an attendee with no round yet sees the waiting card "Discussion round 1 starts soon"', async () => {
    liveRound([], {});
    renderCard(OBSERVER);
    const card = await screen.findByTestId('mastermind-waiting');
    expect(card.textContent).toContain('Discussion round 1 starts soon');
  });

  it('waiting: a person with no seat in the live round is told what comes next', async () => {
    liveRound([round()], { r1: [seat('r1', 'm-partner', 'second')] });
    const onMoment = vi.fn();
    renderCard(OBSERVER, { onMoment });
    expect((await screen.findByTestId('mastermind-waiting')).textContent).toMatch(/Discussion round 1 · You join the next round/);
    expect(onMoment).toHaveBeenCalledWith(expect.objectContaining({ seated: false, waiting: true }));
  });

  it('a round that ended is "between rounds" until the host ends the evening', async () => {
    betweenRounds();
    // No stamp from the host: the round ended on its own, the evening goes on.
    const between = vi.fn();
    const second = renderCard(OWNER, { onMoment: between });
    expect((await screen.findByTestId('mastermind-between')).textContent).toContain('Discussion round 1 is overThe next round starts soon.');
    expect(between).toHaveBeenLastCalledWith(expect.objectContaining({ eveningOver: false, waiting: true }));
    expect(screen.queryByTestId('mastermind-over')).toBeNull();
    second.unmount();
    // The host ended the evening: the stamp is at or after the newest round's start.
    h.getEveningEnd.mockResolvedValue(new Date(Date.now() + 1000).toISOString());
    const again = vi.fn();
    renderCard(OWNER, { onMoment: again });
    await waitFor(() => expect(again).toHaveBeenLastCalledWith(expect.objectContaining({ eveningOver: true })));
    expect(screen.queryByTestId('mastermind-between')).toBeNull();
    expect(screen.getByTestId('mastermind-over').textContent).toContain('The evening is over');
    expect(screen.getByTestId('mastermind-over').textContent).not.toContain('The rounds are over');
    expect(await screen.findByTestId('mastermind-over-canvas')).toBeTruthy(); // H3: Table holds the way to the canvas
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

  it('G5: between rounds a person with a canvas at this event gets "Open your canvas" (blue-bordered) in the "is over" card, and a person without one does not', async () => {
    betweenRounds();
    renderCard(OWNER);
    const link = await screen.findByTestId('mastermind-between-canvas');
    expect(link.textContent).toBe('Open your canvas');
    expect(link.className).toMatch(/border-blue-600/);
    expect(link.className).not.toMatch(/bg-background|border-input/);
    expect(screen.getByTestId('mastermind-between').contains(link)).toBe(true);
    // J2: the owner's own canvas opens plain (no Compare), keeping the way back to the table
    fireEvent.click(link);
    await waitFor(() => expect(JSON.parse(screen.getByTestId('where').getAttribute('data-state')!)).toEqual({ backToTable: '/', tableEvent: 'e1', plainCanvas: true }));
  });

  it('G5: with the next-version card offered the way to the canvas is inside that card, full width, and only once', async () => {
    betweenRounds();
    h.server.offer = offerOf('offer');
    renderCard(OWNER);
    const task = await screen.findByTestId('mastermind-task');
    const link = await screen.findByTestId('mastermind-task-canvas');
    expect(task.contains(link)).toBe(true);
    expect(link.className).toMatch(/border-blue-600/);
    expect(link.className).toMatch(/\bw-full\b/);
    expect(screen.queryByTestId('mastermind-between-canvas')).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Open your canvas' })).toHaveLength(1);
  });

  it('G5: a failed first read of the canvas is tried again at the next tab return, not left hidden for good', async () => {
    betweenRounds();
    h.getMyEventCanvas.mockRejectedValueOnce(new Error('network'));
    renderCard(OWNER);
    await screen.findByTestId('mastermind-between');
    expect(screen.queryByTestId('mastermind-between-canvas')).toBeNull();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(await screen.findByTestId('mastermind-between-canvas')).toBeTruthy();
  });

  it('G5: no canvas at the event, no button', async () => {
    betweenRounds();
    h.getMyEventCanvas.mockResolvedValue(null);
    renderCard(OWNER);
    await screen.findByTestId('mastermind-between');
    expect(screen.queryByTestId('mastermind-between-canvas')).toBeNull();
  });

  it('between rounds with nothing to offer: "is over", no card', async () => {
    betweenRounds();
    renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-between')).textContent).toMatch(/Discussion round 1 is over/);
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

  it('the card says "{round} with {partner} is in"; "Create next version" makes a draft (never publishes), shows the working state at once and stays in the room (P1686)', async () => {
    h.server.offer = offerOf('offer');
    h.makeMyNextVersion.mockImplementation(async () => {
      h.server.offer = offerOf('drafting', DRAFT);
      return { status: 'started', draftId: 'd1', runId: 'run1', repeat: false, start: { ok: true, runId: 'run1', kind: 'message' } };
    });
    renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-task-title')).textContent).toBe('Discussion round 1 with Erin: transcript ready');
    expect(screen.getByTestId('mastermind-task-body').textContent).toBe('Make your next version from what was said.');
    expect(screen.getByTestId('mastermind-make').textContent).toBe('Create next version');
    expect(screen.queryByTestId('mastermind-preview')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Preview first/);
    fireEvent.click(screen.getByTestId('mastermind-make'));
    // the working state shows from the tap, before the server has answered
    expect(screen.getByTestId('mastermind-task-creating').textContent).toMatch(/Making your next version/);
    expect(screen.queryByTestId('mastermind-make')).toBeNull();
    await waitFor(() => expect(h.makeMyNextVersion).toHaveBeenCalledWith('r1', false));
    // P1686: the owner stays in the room; the draft link is on the working face
    expect(await screen.findByTestId('mastermind-tweak')).toBeTruthy();
    await new Promise(res => setTimeout(res, 50));
    expect(screen.getByTestId('where').textContent).toBe('/');
    expect(h.publishCanvasDraft).not.toHaveBeenCalled();
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
    const task = await screen.findByTestId('mastermind-task');
    // one card: "The evening is over" is the card's own heading, not a separate card above it
    expect(task.querySelector('[data-testid="mastermind-over-heading"]')).toBeTruthy();
    expect(screen.queryByTestId('mastermind-over')).toBeNull();
  });

  it('with no recording it says so with no button', async () => {
    h.server.offer = offerOf('no_recording');
    renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-task-no-recording')).textContent).toBe('No recording from this round');
    expect(screen.queryByTestId('mastermind-make')).toBeNull();
  });

  it('INBOX-338: audio that all transcribed empty says the words could not be made out, with no button and no wait', async () => {
    h.server.offer = offerOf('not_understood');
    renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-task-not-understood')).textContent).toBe("We couldn't make out what was said in this round");
    expect(screen.queryByTestId('mastermind-make')).toBeNull();
    expect(screen.queryByTestId('mastermind-task-pending')).toBeNull();
    expect(screen.queryByTestId('mastermind-task-no-recording')).toBeNull();
  });

  it('while the words are prepared: the sentence with the usual wait, no button; the button appears when they are ready', async () => {
    h.server.offer = offerOf('transcript_pending');
    renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-task-pending')).textContent).toBe('Discussion round 1 with Erin: the transcript is on its way. Usually 1 to 3 minutes.');
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
    expect((await screen.findByTestId('mastermind-task-missing')).textContent).toBe('The words from Discussion round 1 did not arrive. Your canvas stays as it is.');
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

  it('drafting: the working state, no button, no Preview first', async () => {
    h.server.offer = offerOf('drafting', { ...DRAFT, autoPublish: true });
    renderCard(OWNER);
    expect(await screen.findByTestId('mastermind-task-creating')).toBeTruthy();
    expect(taskButtons()).toHaveLength(0);
    expect(screen.queryByTestId('mastermind-tweak')).toBeNull();
  });

  it('P1686: a finished draft shows its changes box by box, then Publish and Open full draft; nothing publishes until the tap', async () => {
    h.server.offer = offerOf('ready', { ...DRAFT, autoPublish: false });
    canvasReads();
    renderCard(OWNER);
    const list = await screen.findByTestId('next-version-list');
    expect([...list.querySelectorAll('[data-testid="next-version-box"]')].map(b => b.getAttribute('data-box'))).toEqual(['canvas:segments']);
    expect(screen.getByTestId('next-version-added').textContent).toBe('AddedTeams of 100 to 1,000');
    expect(screen.getByTestId('next-version-removed').textContent).toBe('RemovedSmall teams');
    expect(h.getCanvas).toHaveBeenCalledWith('p-owner', 'launch_plan', 'p-owner', undefined, 'v3-draft');
    expect(h.getCanvas).toHaveBeenCalledWith('p-owner', 'launch_plan', 'p-owner', undefined, 'v2');
    const full = screen.getByTestId('next-version-open-full');
    expect(full.textContent).toBe('Open full draft');
    expect(full.getAttribute('href')).toBe('/p/haru/canvas/launch_plan?v=v3-draft&ws=1');
    await new Promise(res => setTimeout(res, 50));
    expect(h.publishCanvasDraft).not.toHaveBeenCalled();
    expect(screen.getByTestId('where').textContent).toBe('/');
  });

  it('P1686: Publish sends the draft and revision from the read on screen, then the card shows the published face', async () => {
    h.server.offer = offerOf('ready', DRAFT);
    canvasReads();
    h.publishCanvasDraft.mockImplementation(async () => { h.server.offer = offerOf('published'); return { ok: true, seq: 3, skippedLinks: 0, replyMessageId: null, openOffers: 0 }; });
    renderCard(OWNER);
    fireEvent.click(await screen.findByTestId('next-version-publish'));
    await waitFor(() => expect(h.publishCanvasDraft).toHaveBeenCalledWith('d1', 7));
    expect(await screen.findByTestId('mastermind-task-published')).toBeTruthy();
    expect(screen.getByTestId('where').textContent).toBe('/');
  });

  it('P1686: Publish is absent while the changes are read, after a failed read, and with no changes', async () => {
    h.server.offer = offerOf('ready', DRAFT);
    let release: (v: unknown) => void = () => undefined;
    h.getCanvas.mockImplementation(() => new Promise(res => { release = res; }));
    const first = renderCard(OWNER);
    expect(await screen.findByTestId('next-version-loading')).toBeTruthy();
    expect(screen.queryByTestId('next-version-publish')).toBeNull();
    release({ points: [], versions: VERSIONS, draft: null });
    first.unmount();

    h.getCanvas.mockRejectedValue(new Error('offline'));
    const second = renderCard(OWNER);
    expect(await screen.findByTestId('next-version-unreadable')).toBeTruthy();
    expect(screen.queryByTestId('next-version-publish')).toBeNull();
    expect(screen.getByTestId('next-version-retry')).toBeTruthy();
    expect(screen.getByTestId('next-version-open-full')).toBeTruthy();
    second.unmount();

    canvasReads([pt('Same', 'problem')], [pt('Same', 'problem')]);
    renderCard(OWNER);
    expect(await screen.findByTestId('next-version-none')).toBeTruthy();
    expect(screen.queryByTestId('next-version-publish')).toBeNull();
    expect(screen.getByTestId('next-version-open-full')).toBeTruthy();
  });

  it('P1686: a draft that moved on (stale_view) publishes nothing; Publish returns only with the re-read list and sends the new revision', async () => {
    h.server.offer = offerOf('ready', DRAFT);
    canvasReads();
    let release: () => void = () => undefined;
    h.publishCanvasDraft.mockImplementationOnce(async () => {
      // the re-read is held so the in-between state can be seen: the new read has revision 8 and a new point
      h.getCanvas.mockImplementation((_o: string, _n: string, _v: string, _k: unknown, version?: string) => new Promise(res => { release = () => res(version === 'v3-draft'
        ? { points: [pt('Teams of 100 to 1,000', 'segments'), pt('Price 49', 'revenue')], versions: VERSIONS, draft: { id: 'd1', version: 'v3-draft', baseSeq: 2, revision: 8 } }
        : { points: [pt('Small teams', 'segments')], versions: VERSIONS, draft: null }); }));
      return { ok: false, refused: 'stale_view', revision: 8 };
    });
    renderCard(OWNER);
    fireEvent.click(await screen.findByTestId('next-version-publish'));
    expect(await screen.findByTestId('next-version-loading')).toBeTruthy();
    expect(screen.queryByTestId('next-version-publish')).toBeNull();
    expect(screen.queryByTestId('next-version-note')).toBeNull(); // the line introduces a list: none while re-reading
    await act(async () => { release(); await Promise.resolve(); });
    await act(async () => { release(); await Promise.resolve(); });
    const boxes = await screen.findAllByTestId('next-version-box');
    expect(boxes.map(b => b.getAttribute('data-box'))).toEqual(['canvas:segments', 'canvas:revenue']);
    expect(screen.getByTestId('next-version-note').textContent).toBe('Your draft changed. Here are the new changes.');
    h.publishCanvasDraft.mockResolvedValueOnce({ ok: true, seq: 3, skippedLinks: 0, replyMessageId: null, openOffers: 0 });
    fireEvent.click(screen.getByTestId('next-version-publish'));
    await waitFor(() => expect(h.publishCanvasDraft).toHaveBeenLastCalledWith('d1', 8));
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

  it('the published face keeps one working link when the published-state read gave no canvas name (the person\'s own read supplies it)', async () => {
    h.server.offer = { ...offerOf('published'), canvasName: null } as never;
    renderCard(OWNER);
    const open = await screen.findByTestId('mastermind-task-open');
    expect(open.getAttribute('href')).toBe("/p/haru/canvas/launch_plan");
    expect(screen.queryByTestId('mastermind-task-canvas')).toBeNull();
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

  it('H3: the next-version card is Table\'s, never Feedback\'s: with the view hidden it is not drawn, and the moment says a card is waiting', async () => {
    h.server.offer = offerOf('offer');
    const onMoment = vi.fn();
    renderCard(OWNER, { view: 'hidden', onMoment });
    await waitFor(() => expect(onMoment).toHaveBeenCalledWith(expect.objectContaining({ nextVersionOffered: true })));
    expect(screen.queryByTestId('mastermind-task')).toBeNull();
    expect(screen.queryByTestId('mastermind-task-after-feedback')).toBeNull();
  });

  it('H3: after the host ends the evening, Table holds "The evening is over", the next-version card and "Open your canvas"', async () => {
    betweenRounds();
    h.getEveningEnd.mockResolvedValue(new Date(Date.now() + 1000).toISOString());
    h.server.offer = offerOf('offer');
    renderCard(OWNER);
    const task = await screen.findByTestId('mastermind-task');
    // one card: the heading is inside the next-version card, with no empty-looking card above it
    expect(task.querySelector('[data-testid="mastermind-over-heading"]')!.textContent).toBe('The evening is over');
    expect(screen.queryByTestId('mastermind-over')).toBeNull();
    // visual QA: under the evening's heading the card's own title is subordinate (smaller, lighter, a level lower)
    const title = screen.getByTestId('mastermind-task-title');
    expect(title.tagName).toBe('H3');
    expect(title.className).toMatch(/text-base font-medium/);
    expect(title.className).not.toMatch(/text-xl/);
    expect(await screen.findByTestId('mastermind-task-canvas')).toBeTruthy();
  });

  it('H3: a failed read of the offer counts as waiting, so Feedback still links to Table', async () => {
    h.getMyNextVersionOffer.mockRejectedValue(new Error('offline'));
    const onMoment = vi.fn();
    renderCard(OWNER, { view: 'hidden', onMoment });
    await waitFor(() => expect(onMoment).toHaveBeenCalledWith(expect.objectContaining({ nextVersionOffered: true })));
  });

  it('H3: a next version that is already published is not "waiting"', async () => {
    h.server.offer = offerOf('published');
    const onMoment = vi.fn();
    renderCard(OWNER, { view: 'hidden', onMoment });
    await waitFor(() => expect(onMoment).toHaveBeenCalled());
    expect(onMoment).not.toHaveBeenCalledWith(expect.objectContaining({ nextVersionOffered: true }));
  });

  it('J1: nothing is ever published from the card, not even a draft an older tap marked auto-publish', async () => {
    h.server.offer = offerOf('ready', { ...DRAFT, autoPublish: true });
    renderCard(OWNER);
    canvasReads();
    expect(await screen.findByTestId('next-version-publish')).toBeTruthy(); // P1686: only the owner's tap publishes
    await new Promise(r => setTimeout(r, 80));
    expect(h.publishCanvasDraft).not.toHaveBeenCalled();
    expect(screen.getByTestId('mastermind-task').getAttribute('data-face')).toBe('ready');
  });

  it('J1: while the draft is being written the card keeps "Open your draft" (no dead end), and it opens plain with the way back', async () => {
    h.server.offer = offerOf('drafting', DRAFT);
    renderCard(OWNER);
    expect(await screen.findByTestId('mastermind-task-creating')).toBeTruthy();
    const open = await screen.findByTestId('mastermind-tweak');
    expect(open.getAttribute('href')).toBe('/p/haru/canvas/launch_plan?v=v3-draft&ws=1');
    fireEvent.click(open);
    await waitFor(() => expect(screen.getByTestId('where').getAttribute('data-state')).toBe(DRAFT_FROM_ROOM));
  });

  it('J1: a draft address that cannot be read is tried again (bounded), then the card offers Try again, which reads once more', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      h.server.offer = offerOf('ready', DRAFT);
      h.getMyDraftRef.mockRejectedValue(new Error('offline'));
      renderCard(OWNER);
      await waitFor(() => expect(h.getMyDraftRef).toHaveBeenCalledTimes(1));
      for (let i = 0; i < 3; i++) await act(async () => { await vi.advanceTimersByTimeAsync(4500); });
      expect(h.getMyDraftRef).toHaveBeenCalledTimes(3);
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(h.getMyDraftRef).toHaveBeenCalledTimes(3);
      expect(screen.queryByTestId('mastermind-tweak')).toBeNull();
      expect(screen.getByTestId('mastermind-draft-unreadable')).toBeTruthy();
      expect(screen.queryByTestId('next-version-changes')).toBeNull(); // P1686: no endless "Reading your changes" beside the error
      h.getMyDraftRef.mockResolvedValue({ canvasId: 'c1', versionName: 'v3-draft' });
      fireEvent.click(screen.getByTestId('mastermind-draft-retry'));
      canvasReads();
      await act(async () => { await vi.advanceTimersByTimeAsync(10); });
      // P1686: on the ready face the way to the draft is "Open full draft", under the changes
      expect((await screen.findByTestId('next-version-open-full')).textContent).toBe('Open full draft');
      expect(screen.queryByTestId('mastermind-draft-unreadable')).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('J2: every own-canvas link of the next-version card opens plain, keeping the way back to the table', async () => {
    const plainAfterClick = async (testId: string) => {
      const { unmount } = renderCard(OWNER);
      fireEvent.click(await screen.findByTestId(testId));
      await waitFor(() => expect(screen.getByTestId('where').getAttribute('data-state')).toBe(PLAIN_FROM_ROOM));
      unmount();
    };
    h.server.offer = offerOf('offer');
    await plainAfterClick('mastermind-task-canvas'); // "Open your canvas" under the primary
    h.server.offer = offerOf('published');
    await plainAfterClick('mastermind-task-open'); // "Open it"
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
  it('the mastermind room has Ready (P1718), Principle, Table and Feedback (open at any time); Clarity Night and the hike keep theirs', async () => {
    const { hiddenRoomSteps } = await import('@/app/prototypes/events/rounds/hidden-room-steps');
    const { SALES_MASTERMIND_RECIPE, CLARITY_NIGHT_RECIPE, SOCIAL_HIKE_RECIPE } = await import('@/app/prototypes/events/series-recipes');
    expect(hiddenRoomSteps(SALES_MASTERMIND_RECIPE).sort()).toEqual(['compare']);
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
    expect((await screen.findByTestId('mastermind-between')).textContent).toContain('Discussion round 2 is over');
    unmount();
    h.getEveningEnd.mockResolvedValue(new Date(Date.now() - 5_000).toISOString());
    const onMoment = vi.fn();
    renderCard(OWNER, { onMoment });
    await waitFor(() => expect(onMoment).toHaveBeenLastCalledWith(expect.objectContaining({ eveningOver: true })));
    expect(screen.getByTestId('mastermind-over')).toBeTruthy();
    expect(screen.queryByTestId('mastermind-between')).toBeNull();
  });
});

// ── No positions list on the card ─────────────────────────────────────────────────────────────────────────────

describe('P1529 round screen: no positions list on the card (UAT 2026-11-13 F4)', () => {
  it('the owner, a reader and the observer see no list of points and the canvas is not read for one', async () => {
    for (const who of [OWNER, PARTNER, OBSERVER]) {
      startedAgo(70);
      const view = renderCard(who);
      await screen.findByTestId('round-card-table');
      expect(screen.queryByTestId('reading-list')).toBeNull();
      expect(screen.queryByTestId('reading-point')).toBeNull();
      expect(screen.queryByText(/Agree|Unsure|Disagree/)).toBeNull();
      view.unmount();
    }
    expect(h.getCanvas).not.toHaveBeenCalled();
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

});

describe('P1529 round screen: every step of my role, the current part highlighted', () => {
  const Q = (what: string) => `\u201CHow well do you think you understand my ${what}, from 0 to 10?\u201D`;
  const ALL = {
    owner: ['Open your canvas so you see what Erin sees.', `Erin explains your canvas back. Then ask: ${Q('canvas')}`, `At 8 or more, Erin challenges your canvas. They ask you: ${Q('challenge')}`],
    partner: ['Open Haru\u2019s canvas and go through it point by point. Set your position, especially where you disagree. Out loud is fine.', 'Explain Haru\u2019s canvas back in your own words. Then answer: how well you think you understand their canvas, from 0 to 10.', `At 8 or more, challenge their canvas: explain where and why you disagree with their points. Then ask Haru: ${Q('challenge')}`],
    observer: ['Open Haru\u2019s canvas.', 'Make sure the listener stays in their role: no disagreeing, no own point of view yet. Keep talking time balanced: no more than 1 minute per person. Ring the bell to remind people of their roles and the time.', 'Observer part: say what they can do better. If you like, say how well you think you understood the canvas, from 0 to 10, and what was unclear.'],
  };
  const TALK = 70;
  const OBS = 360 + 10;
  const marked = (box: HTMLElement) => Array.from(box.querySelectorAll('ol > li')).map(li => li.getAttribute('aria-current') === 'step');
  it.each([
    [OWNER, 'owner', TALK, [true, true, true]],
    [OWNER, 'owner', OBS, [false, false, false]],
    [PARTNER, 'partner', TALK, [true, true, true]],
    [PARTNER, 'partner', OBS, [false, false, false]],
    [OBSERVER, 'observer', TALK, [true, true, false]],
    [OBSERVER, 'observer', OBS, [false, false, true]],
  ] as const)('%#: the whole numbered list in both parts, the current part\u2019s steps marked', async (who, role, secondsAgo, current) => {
    startedAgo(secondsAgo);
    renderCard(who);
    const box = await screen.findByTestId('round-card-instruction');
    expect(Array.from(box.querySelectorAll('ol > li')).map(e => e.textContent)).toEqual(ALL[role]);
    expect(marked(box)).toEqual([...current]);
  });

  it('the header is the table (left), the part and the time left (right) and the projector\'s part bar under it: two segments', async () => {
    startedAgo(70);
    renderCard(OWNER);
    expect((await screen.findByTestId('round-card-table')).textContent).toBe('Table 1');
    expect(screen.getByTestId('round-card-part').textContent).toBe('Discussion');
    expect(screen.getByTestId('round-card-time').textContent).toMatch(/^\d+:\d\d$/);
    const bar = screen.getByTestId('round-card-parts').querySelector('ol[aria-label="Round"]')!;
    expect(bar.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByTestId('round-card-instruction').textContent).not.toContain('\u25B6');
  });

  it('in the observer part the header says Observer', async () => {
    startedAgo(OBS);
    renderCard(OBSERVER);
    await screen.findByTestId('round-card-table');
    expect(screen.getByTestId('round-card-part').textContent).toBe('Observer feedback');
  });

  it('the canvas is always the primary filled button, centred; none for the observer in their own part', async () => {
    for (const ago of [70, 300, 360 + 10]) {
      startedAgo(ago);
      const view = renderCard(PARTNER);
      const link = await screen.findByTestId('round-canvas-link');
      expect(link.closest('[class*="bg-blue-600"]')).toBeTruthy();
      expect(link.closest('[class*="justify-center"]')).toBeTruthy();
      view.unmount();
    }
    startedAgo(360 + 10);
    renderCard(OBSERVER);
    await screen.findByTestId('round-card-my-role');
    expect(screen.queryByTestId('round-canvas-link')).toBeNull();
  });
});
