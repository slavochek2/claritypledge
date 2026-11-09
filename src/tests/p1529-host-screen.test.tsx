/**
 * P1529 §1, §3, §4, §7 and §5's projector: the sales mastermind's host screen. The server and the polls are a fake the
 * test sets; what is under test is what the host sees and which call each tap makes, with Clarity Night beside it.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventRoomMember } from '@/app/types';
import type { EventRound, EventRoundsState, RoundSeat } from '@/app/data/event-rounds-service';
import type { MastermindPerson } from '@/app/data/event-mastermind-service';
import type { MastermindSeatingInput, MastermindSeatingPlan } from '@/lib/mastermind-seating';

const h = vi.hoisted(() => ({
  state: null as unknown,
  roster: [] as unknown[],
  event: {} as Record<string, unknown>,
  hostState: new Map<string, unknown>(),
  previous: [] as [string, string][],
  step: null as null | { afterRoundId: string | null; startedAt: string },
  updateStates: new Map<string, string>(),
  planOverride: null as null | ((input: MastermindSeatingInput) => MastermindSeatingPlan),
  getMastermindHostState: vi.fn(),
  getPreviousSessionPartners: vi.fn(),
  hostSetObserver: vi.fn(),
  hostSetEventFlow: vi.fn(),
  hostStartCanvasUpdate: vi.fn(),
  getCanvasUpdateStep: vi.fn(),
  getMastermindUpdateStates: vi.fn(),
  hostStartRound: vi.fn(),
  hostSetRoundSeats: vi.fn(),
  getWaitlistPublic: vi.fn(),
  hostAddFromWaitlist: vi.fn(),
  presence: new Map<string, unknown>(),
  hostSetRoundPresence: vi.fn(),
}));

vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'host-1' }, session: { user: { id: 'host-1' } }, sessionChecked: true }) }));
vi.mock('@/app/components/layout/focus-header', () => ({ FocusHeader: () => null }));
vi.mock('@/app/prototypes/events/components/EventRoomAccess', () => ({
  useEventRoomAccess: () => ({ slug: 'night', event: h.event, loading: false, granted: true }),
}));
vi.mock('@/app/data/event-room-service', () => ({
  subscribeToRoomRoster: (_id: string, cb: (r: unknown[]) => void) => { cb(h.roster); return () => {}; },
}));
vi.mock('@/app/data/event-prep-service', async importOriginal => ({
  ...(await importOriginal<typeof import('@/app/data/event-prep-service')>()),
  getPrepHostView: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/app/data/event-topic-tags', async importOriginal => ({
  ...(await importOriginal<typeof import('@/app/data/event-topic-tags')>()),
  getEventTopicTags: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/app/prototypes/events/rounds/use-tag-positions', async importOriginal => ({
  ...(await importOriginal<typeof import('@/app/prototypes/events/rounds/use-tag-positions')>()),
  useTagPositions: () => ({ byProfile: new Map() }),
}));
vi.mock('@/app/prototypes/events/rounds/use-event-rounds', async importOriginal => ({
  ...(await importOriginal<typeof import('@/app/prototypes/events/rounds/use-event-rounds')>()),
  useEventRounds: () => ({ state: h.state, loaded: true, refresh: async () => {} }),
}));
vi.mock('@/app/data/event-rounds-service', async importOriginal => ({
  ...(await importOriginal<typeof import('@/app/data/event-rounds-service')>()),
  getRoundPresence: vi.fn(async () => h.presence),
  hostSetRoundPresence: h.hostSetRoundPresence,
  getTranscribingNow: vi.fn().mockResolvedValue(new Set()),
  getRoundSeatKeys: vi.fn().mockResolvedValue(null),
  hostStartRound: h.hostStartRound,
  hostSetRoundSeats: h.hostSetRoundSeats,
}));
vi.mock('@/app/data/event-mastermind-service', async importOriginal => ({
  ...(await importOriginal<typeof import('@/app/data/event-mastermind-service')>()),
  getMastermindHostState: h.getMastermindHostState,
  getPreviousSessionPartners: h.getPreviousSessionPartners,
  hostSetObserver: h.hostSetObserver,
  hostSetEventFlow: h.hostSetEventFlow,
  hostStartCanvasUpdate: h.hostStartCanvasUpdate,
  getCanvasUpdateStep: h.getCanvasUpdateStep,
  getMastermindUpdateStates: h.getMastermindUpdateStates,
}));
vi.mock('@/app/data/event-waitlist', async importOriginal => ({
  ...(await importOriginal<typeof import('@/app/data/event-waitlist')>()),
  getWaitlistPublic: h.getWaitlistPublic,
  hostAddFromWaitlist: h.hostAddFromWaitlist,
}));
vi.mock('@/lib/mastermind-seating', async importOriginal => {
  const real = await importOriginal<typeof import('@/lib/mastermind-seating')>();
  return { ...real, planMastermindRound: (input: MastermindSeatingInput) => (h.planOverride ? h.planOverride(input) : real.planMastermindRound(input)) };
});

import { EventHostPage } from '@/app/prototypes/events/rounds/EventHostPage';
import { SCREEN_RULE_LINE } from '@/app/prototypes/events/rounds/mastermind-host-helpers';

const MIN = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const round = (over: Partial<EventRound> = {}): EventRound => ({
  id: 'r1', roundNo: 1, groupSize: 4, startedAt: ago(10 * MIN), endedAt: null,
  seatingS: 120, firstS: 450, secondS: 450, observerS: 180, splitSpeakers: false, matchTag: null, showcase: false, ...over,
});
const seat = (roundId: string, id: string, role: RoundSeat['role'], table: number): RoundSeat => ({ roundId, id, table, role, confirmedAt: null });
const setRounds = (rounds: EventRound[], seats: Record<string, RoundSeat[]> = {}) => {
  h.state = { rounds, seatsByRound: new Map(Object.entries(seats)), topics: new Map() } satisfies EventRoundsState;
};

const member = (key: string, name: string) =>
  ({ id: `m-${key}`, profileId: `p-${key}`, displayName: name, profileSlug: key, profileHasPledged: false } as unknown as EventRoomMember);
const ANA = member('a', 'Ana Brown');
const BEN = member('b', 'Ben Cole');
const CAT = member('c', 'Cat Dunn');
const DAN = member('d', 'Dan Eve');
const EVA = member('e', 'Eva Fox');
const ROSTER = [ANA, BEN, CAT, DAN, EVA];

const person = (key: string, over: Partial<MastermindPerson> = {}): MastermindPerson => ({
  profileId: `p-${key}`, canvasName: `canvas_${key}`, canvasTitle: null, canvasShared: true, observerOverride: null,
  participation: 'canvas_before', observerPrep: null, registered: true, waitingPosition: null, name: null, phone: 'usbc', recordingOn: false, lastWordsAt: null, ...over,
});
const setHostState = (people: MastermindPerson[]) => { h.hostState = new Map(people.map(p => [p.profileId, p])); };
/** Four canvas holders and one person without a canvas. */
const defaultPeople = () => setHostState([person('a'), person('b'), person('c'), person('d'), person('e', { canvasName: null, canvasShared: false })]);

function renderHost(opts: { flow?: string | null; search?: string } = {}) {
  h.event = { id: 'ev-1', hostId: 'host-1', title: 'Evening', slug: 'night', statementTag: null, flow: opts.flow ?? null, seriesSlug: undefined };
  return render(
    <MemoryRouter initialEntries={[`/events/night/host${opts.search ?? ''}`]}>
      <Routes><Route path="/events/:slug/host" element={<EventHostPage />} /></Routes>
    </MemoryRouter>,
  );
}
const MM = 'sales-mastermind';
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

beforeEach(() => {
  vi.clearAllMocks();
  try { localStorage.clear(); } catch { /* none */ }
  h.roster = ROSTER;
  h.step = null;
  h.updateStates = new Map();
  h.previous = [];
  h.planOverride = null;
  setRounds([]);
  defaultPeople();
  h.getMastermindHostState.mockImplementation(async () => h.hostState);
  h.getPreviousSessionPartners.mockImplementation(async () => h.previous);
  h.getCanvasUpdateStep.mockImplementation(async () => h.step);
  h.getMastermindUpdateStates.mockImplementation(async () => h.updateStates);
  h.hostSetObserver.mockResolvedValue({ status: 'ok' });
  h.hostSetEventFlow.mockResolvedValue(undefined);
  h.hostStartCanvasUpdate.mockResolvedValue(undefined);
  h.hostStartRound.mockResolvedValue('r-new');
  h.hostSetRoundSeats.mockResolvedValue(undefined);
  h.getWaitlistPublic.mockResolvedValue([]);
  h.hostAddFromWaitlist.mockResolvedValue('ok');
  h.presence = new Map();
  h.hostSetRoundPresence.mockImplementation(async (_event: string, memberId: string, left: boolean) => {
    h.presence = new Map(left ? [[memberId, { memberId, leftAt: new Date().toISOString(), sitsOutRound: null }]] : []);
  });
});
afterEach(() => { vi.useRealTimers(); });

/** The room's per-person state has been read (the host state answered). */
async function roomRead() {
  await waitFor(() => expect(h.getMastermindHostState).toHaveBeenCalled());
  await settle();
}

/** Open the seating preview on the mastermind page, once the room has been read. */
async function openPreview() {
  await roomRead();
  // Between rounds the page offers "Reopen" instead of "Start": the same proposal behind either. A click before the room is read
  // is refused with a line; the next try opens it.
  await waitFor(() => {
    if (screen.queryByTestId('host-preview')) return;
    fireEvent.click(screen.queryByTestId('host-primary') ?? screen.getByTestId('host-reopen'));
    expect(screen.getByTestId('host-preview')).toBeTruthy();
  }, { timeout: 3000 });
  return screen.findByTestId('host-preview');
}
const plan = (seats: Array<[string, number, 'first' | 'second' | 'observer']>, unmet: MastermindSeatingPlan['unmet'] = []): MastermindSeatingPlan => ({
  seats: seats.map(([id, table, role]) => ({ id, table, role })), unmet,
});

describe('the flow row (§1)', () => {
  it('shows on every flow before round 1, and is the only thing a Clarity Night host screen gains', async () => {
    renderHost();
    expect(await screen.findByTestId('host-flow-row')).toBeTruthy();
    expect((screen.getByTestId('host-flow-select') as HTMLSelectElement).value).toBe('clarity-night');
    expect(screen.queryByTestId('mm-people')).toBeNull();
    expect(h.getMastermindHostState).not.toHaveBeenCalled();
    expect(h.getPreviousSessionPartners).not.toHaveBeenCalled();
  });

  it('is gone once the first COUNTED round has started; a Demo does not count', async () => {
    setRounds([round({ id: 'demo', showcase: true, endedAt: ago(MIN) })]);
    const { unmount } = renderHost();
    expect(await screen.findByTestId('host-flow-row')).toBeTruthy();
    unmount();
    setRounds([round({ id: 'demo', showcase: true, endedAt: ago(5 * MIN) }), round({ id: 'r2', roundNo: 2 })]);
    renderHost();
    await screen.findByTestId('host-controls');
    expect(screen.queryByTestId('host-flow-row')).toBeNull();
  });

  it('applies at once with no Apply button, follows the new flow without a reload, and Undo restores it', async () => {
    renderHost();
    fireEvent.change(await screen.findByTestId('host-flow-select'), { target: { value: MM } });
    await waitFor(() => expect(h.hostSetEventFlow).toHaveBeenCalledWith('ev-1', MM));
    expect(screen.queryByRole('button', { name: /apply/i })).toBeNull();
    expect(await screen.findByTestId('mm-people')).toBeTruthy();
    expect(screen.getByTestId('host-flow-notice').textContent).toMatch(/Sales Mastermind/);
    fireEvent.click(screen.getByTestId('host-flow-undo'));
    await waitFor(() => expect(h.hostSetEventFlow).toHaveBeenLastCalledWith('ev-1', 'clarity-night'));
    await waitFor(() => expect(screen.queryByTestId('mm-people')).toBeNull());
    expect((screen.getByTestId('host-flow-select') as HTMLSelectElement).value).toBe('clarity-night');
  });

  it('says "1 registered person has" when the server counts one', async () => {
    h.hostSetEventFlow.mockRejectedValueOnce(new Error("1 registered people have not answered this flow's questions or accepted recording"));
    renderHost();
    fireEvent.change(await screen.findByTestId('host-flow-select'), { target: { value: MM } });
    const text = (await screen.findByTestId('host-flow-refused')).textContent ?? '';
    expect(text).toContain("1 registered person has not answered this flow's questions or accepted recording");
    expect(text).not.toContain('1 registered people');
  });

  it("shows the server's own refusal, including the unanswered-registrations message, and does not switch", async () => {
    const message = '3 registered people have not answered this flow\'s questions or accepted recording';
    h.hostSetEventFlow.mockRejectedValueOnce(new Error(message));
    renderHost();
    fireEvent.change(await screen.findByTestId('host-flow-select'), { target: { value: MM } });
    expect((await screen.findByTestId('host-flow-refused')).textContent).toContain(message);
    expect(screen.queryByTestId('mm-people')).toBeNull();
    expect((screen.getByTestId('host-flow-select') as HTMLSelectElement).value).toBe('clarity-night');
  });
});

describe('observers (§3)', () => {
  const row = (name: string) => screen.getAllByTestId('mm-person').find(li => li.textContent?.includes(name)) as HTMLElement;

  it('defaults to observer without a shared canvas, participant with one', async () => {
    renderHost({ flow: MM });
    await screen.findByText('Clarity Canvas shared: canvas_a');
    expect(row('Ana B.').getAttribute('data-observer')).toBe('false');
    expect(row('Eva F.').getAttribute('data-observer')).toBe('true');
  });

  it('flips a participant to observer through host_set_observer', async () => {
    renderHost({ flow: MM });
    await screen.findByText('Clarity Canvas shared: canvas_a');
    fireEvent.click(within(row('Ana B.')).getByTestId('mm-set-observer'));
    await waitFor(() => expect(h.hostSetObserver).toHaveBeenCalledWith('ev-1', 'p-a', true));
  });

  it('says in plain words what is missing when the server refuses a participant without a canvas', async () => {
    h.hostSetObserver.mockResolvedValueOnce({ status: 'refused', code: 'no_shared_canvas' });
    renderHost({ flow: MM });
    await screen.findByText('Clarity Canvas shared: canvas_a');
    fireEvent.click(within(row('Eva F.')).getByTestId('mm-set-participant'));
    const text = (await screen.findByTestId('mm-observer-refusal')).textContent ?? '';
    expect(text).toContain('Eva F.');
    expect(text).toMatch(/no Clarity Canvas shared with this event/);
  });

  it('says the canvas is chosen but not shared when that is what is missing', async () => {
    setHostState([person('a'), person('b'), person('c'), person('d'), person('e', { canvasShared: false })]);
    h.hostSetObserver.mockResolvedValueOnce({ status: 'refused', code: 'no_shared_canvas' });
    renderHost({ flow: MM });
    await screen.findByText('Clarity Canvas shared: canvas_a');
    fireEvent.click(within(row('Eva F.')).getByTestId('mm-set-participant'));
    expect((await screen.findByTestId('mm-observer-refusal')).textContent).toMatch(/has not published and shared it/);
  });

  it('stays usable while round 1 runs, for the people with no table, because the server only refuses a missing canvas', async () => {
    setRounds([round()], { r1: [seat('r1', 'm-a', 'first', 1), seat('r1', 'm-b', 'second', 1)] });
    renderHost({ flow: MM });
    await screen.findByText('Clarity Canvas shared: canvas_c');
    fireEvent.click(within(row('Cat D.')).getByTestId('mm-set-observer'));
    await waitFor(() => expect(h.hostSetObserver).toHaveBeenCalledWith('ev-1', 'p-c', true));
  });

  it('has no switches once the evening has ended', async () => {
    setRounds([round({ endedAt: ago(MIN) })]);
    renderHost({ flow: MM });
    await screen.findByText('Evening ended');
    await roomRead();
    expect(screen.queryAllByTestId('mm-person')).toHaveLength(0);
    expect(screen.queryByTestId('mm-set-observer')).toBeNull();
  });
});

describe('seating through the mastermind plan (§4)', () => {
  it('plans from holders and observers, counted history only, and a stable seed that Shuffle changes', async () => {
    const calls: MastermindSeatingInput[] = [];
    h.previous = [['p-a', 'p-b']];
    // A Demo (showcase) in the past is not history; a counted round is.
    setRounds(
      [round({ id: 'demo', showcase: true, endedAt: ago(30 * MIN) }), round({ id: 'r2', roundNo: 2, endedAt: ago(5 * MIN) })],
      { demo: [seat('demo', 'm-a', 'first', 1), seat('demo', 'm-b', 'second', 1)], r2: [seat('r2', 'm-a', 'first', 1), seat('r2', 'm-c', 'second', 1)] },
    );
    h.planOverride = input => { calls.push(input); return plan([['m-a', 1, 'first'], ['m-b', 1, 'second']]); };
    renderHost({ flow: MM });
    await openPreview();
    const first = calls[calls.length - 1] as MastermindSeatingInput;
    expect(first.holders).toEqual(['m-a', 'm-b', 'm-c', 'm-d']);
    expect(first.observers).toEqual(['m-e']);
    expect(first.history).toHaveLength(1);
    expect(first.history[0]?.map(s => s.id)).toEqual(['m-a', 'm-c']);
    expect(first.previousPartners).toEqual([['m-a', 'm-b']]);
    const seed0 = first.seed;
    fireEvent.click(screen.getByTestId('host-preview-shuffle'));
    await waitFor(() => expect(calls[calls.length - 1]?.seed).not.toBe(seed0));
  });

  it('names every rule the plan could not meet, with people\'s names', async () => {
    h.planOverride = () => plan(
      [['m-a', 1, 'first'], ['m-b', 1, 'second']],
      [
        { rule: 'repeat-partner', people: ['m-a', 'm-b'] },
        { rule: 'owns-once', person: 'm-c', part: 'first' },
        { rule: 'observes-twice', person: 'm-d' },
        { rule: 'previous-session-partner', people: ['m-a', 'm-e'] },
        { rule: 'unseated', person: 'm-e' },
        { rule: 'too-few-canvases', canvases: 4 },
      ],
    );
    renderHost({ flow: MM });
    await openPreview();
    const items = screen.getAllByTestId('mm-unmet');
    expect(items.map(i => i.getAttribute('data-rule'))).toEqual(['repeat-partner', 'owns-once', 'observes-twice', 'previous-session-partner', 'unseated', 'too-few-canvases']);
    const text = items.map(i => i.textContent).join(' | ');
    expect(text).toContain('Ana B. and Ben C. have already been partners');
    expect(text).toContain("Cat D. won't get a turn as Clarity Canvas owner in rounds 1-2");
    expect(text).toContain('Dan E. would observe a second time');
    expect(text).toContain('Ana B. and Eva F. were partners in the previous session');
    expect(text).toContain('Eva F. has no seat in this round');
    expect(text).toContain('Only 4 Clarity Canvases are shared');
  });

  it('says the seating breaks nothing when the plan meets every rule', async () => {
    h.planOverride = () => plan([['m-a', 1, 'first'], ['m-b', 1, 'second']]);
    renderHost({ flow: MM });
    await openPreview();
    expect(screen.getByTestId('mm-preview-ok')).toBeTruthy();
    expect(screen.queryAllByTestId('mm-unmet')).toHaveLength(0);
  });

  it('discloses a failed read of the previous session instead of reading as "breaks nothing"', async () => {
    h.getPreviousSessionPartners.mockRejectedValue(new Error('offline'));
    h.planOverride = () => plan([['m-a', 1, 'first'], ['m-b', 1, 'second']]);
    renderHost({ flow: MM });
    await openPreview();
    expect(screen.getByTestId('mm-previous-unread').textContent).toMatch(/previous session/);
    expect(screen.queryByTestId('mm-preview-ok')).toBeNull();
  });

  it('re-checks after a manual swap: an owner without a canvas, and a repeat partner, are named', async () => {
    // Round 1 paired Ana and Cat. The plan seats Ana/Ben and Cat/Dan, with Eva (no canvas) observing at table 1.
    setRounds([round({ endedAt: ago(5 * MIN) })], { r1: [seat('r1', 'm-a', 'first', 1), seat('r1', 'm-c', 'second', 1)] });
    h.planOverride = () => plan([['m-a', 1, 'first'], ['m-b', 1, 'second'], ['m-e', 1, 'observer'], ['m-c', 2, 'first'], ['m-d', 2, 'second']]);
    renderHost({ flow: MM });
    await openPreview();
    const tile = (name: string) => screen.getAllByTestId('round-grid-name').find(t => t.textContent?.includes(name)) as HTMLElement;
    // Ben (partner at table 1) and Cat (owner at table 2) trade seats: Ana now meets Cat again.
    fireEvent.click(tile('Ben'));
    fireEvent.click(tile('Cat'));
    await waitFor(() => expect(screen.getByTestId('mm-preview-notes').getAttribute('data-swapped')).toBe('true'));
    expect(screen.getAllByTestId('mm-unmet').map(i => i.textContent).join(' | ')).toContain('Ana B. and Cat D. have already been partners');
    // Eva (no canvas) now trades with Ana: Eva would own a table.
    fireEvent.click(tile('Eva'));
    fireEvent.click(tile('Ana'));
    await waitFor(() => expect(screen.getAllByTestId('mm-unmet').map(i => i.getAttribute('data-rule'))).toContain('owner-without-canvas'));
    expect(screen.getAllByTestId('mm-unmet').find(i => i.getAttribute('data-rule') === 'owner-without-canvas')?.textContent).toContain('Eva F.');
    expect(screen.getByTestId('mm-swap-note').textContent).toMatch(/Later rounds are not re-checked/);
  });

  it('does not propose a round when fewer than two canvases are shared, and says so', async () => {
    setHostState([person('a'), person('b', { canvasName: null, canvasShared: false }), person('c', { canvasName: null, canvasShared: false })]);
    renderHost({ flow: MM });
    await screen.findByText('Clarity Canvas shared: canvas_a');
    fireEvent.click(await screen.findByTestId('host-primary'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Fewer than two Clarity Canvases/);
    expect(screen.queryByTestId('host-preview')).toBeNull();
  });

  it('starts with the mastermind\'s own minutes, no swap and a table that holds four, and shows the seat guard\'s message', async () => {
    h.planOverride = () => plan([['m-a', 1, 'first'], ['m-b', 1, 'second']]);
    h.hostStartRound.mockRejectedValueOnce({ message: 'a Clarity Canvas owner needs a canvas shared with this event', details: 'Eva F.' });
    renderHost({ flow: MM });
    await openPreview();
    fireEvent.click(screen.getByTestId('host-preview-start'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('a Clarity Canvas owner needs a canvas shared with this event');
    expect(alert.textContent).toContain('Eva F.');
    const args = h.hostStartRound.mock.calls[0] as unknown[];
    expect(args[2]).toBe(4);
    expect(args[4]).toEqual({ seatingS: 120, speakerS: 450, observerS: 180 });
    expect(args[5]).toBe(false);
  });
});

describe('labels and touch targets while a round runs and the next is previewed (§7)', () => {
  it('names the running round\'s grid and the proposed one, so two grids are never unlabelled', async () => {
    setRounds([round({ startedAt: ago(10 * MIN) })], { r1: [seat('r1', 'm-a', 'first', 1), seat('r1', 'm-b', 'second', 1)] });
    h.planOverride = () => plan([['m-c', 1, 'first'], ['m-d', 1, 'second']]);
    renderHost({ flow: MM });
    await screen.findByTestId('round-grid');
    await roomRead();
    expect((await screen.findByTestId('host-primary')).textContent).toBe('Preview next round');
    fireEvent.click(screen.getByTestId('host-primary'));
    const confirm = await screen.findByTestId('host-next-confirm');
    expect(confirm.textContent).toMatch(/Preview the next round's tables now\? This round keeps running until you tap Start now\./);
    expect(screen.getByTestId('host-next-yes').textContent).toBe('Preview next round');
    fireEvent.click(screen.getByTestId('host-next-yes'));
    await screen.findByTestId('host-preview');
    // The preview sits in the controls column, which comes first in the page.
    expect(screen.getAllByTestId('round-grid-title').map(e => e.textContent)).toEqual(['Round 2: proposed tables', 'Round 1: tables now']);
  });

  it('titles no grid on Clarity Night, and keeps its minute buttons at 40px', async () => {
    setRounds([round({ splitSpeakers: true })], { r1: [seat('r1', 'm-a', 'first', 1), seat('r1', 'm-b', 'second', 1)] });
    const { unmount } = renderHost();
    await screen.findByTestId('round-grid');
    expect(screen.queryAllByTestId('round-grid-title')).toHaveLength(0);
    expect(screen.getByTestId('host-extend').className).toContain('min-h-10');
    unmount();
    renderHost({ flow: MM });
    await screen.findByTestId('round-grid');
    expect(screen.getByTestId('host-extend').className).toContain('min-h-11');
    expect(screen.getByTestId('host-shorten').className).toContain('min-h-11');
  });

  it('words the owners\' first state "Hasn\'t started"', async () => {
    setRounds([round({ id: 'r1', endedAt: ago(30 * MIN) }), round({ id: 'r2', roundNo: 2, endedAt: ago(MIN) })]);
    h.step = { afterRoundId: 'r2', startedAt: ago(MIN) };
    h.updateStates = new Map([['p-a', 'not_tapped']]);
    renderHost({ flow: MM });
    await waitFor(() => expect(screen.getAllByTestId('mm-update-owner')).toHaveLength(1));
    expect(screen.getByTestId('mm-update-owner').textContent).toContain("Hasn't started");
  });
});

describe('review fixes batch 2: preview lock and the owners list', () => {
  it('while a seating preview is open, the unseated list shows one line instead of the observer switch and Mark out', async () => {
    setRounds([round({ startedAt: ago(10 * MIN) })], { r1: [seat('r1', 'm-a', 'first', 1), seat('r1', 'm-b', 'second', 1)] });
    h.planOverride = () => plan([['m-c', 1, 'first'], ['m-d', 1, 'second']]);
    renderHost({ flow: MM });
    await screen.findByTestId('round-grid');
    await roomRead();
    expect(screen.getAllByTestId('mm-mark-out').length).toBeGreaterThan(0);
    fireEvent.click(await screen.findByTestId('host-primary'));
    fireEvent.click(await screen.findByTestId('host-next-yes'));
    await screen.findByTestId('host-preview');
    const people = screen.getByTestId('mm-people');
    expect(within(people).queryByTestId('mm-set-observer')).toBeNull();
    expect(within(people).queryByTestId('mm-mark-out')).toBeNull();
    expect(within(people).getAllByTestId('mm-locked')[0]?.textContent).toBe('Close the seating preview to change who observes.');
  });

  it('the update step does not list an owner who is marked out', async () => {
    setRounds([round({ id: 'r1', endedAt: ago(30 * MIN) }), round({ id: 'r2', roundNo: 2, endedAt: ago(MIN) })]);
    h.step = { afterRoundId: 'r2', startedAt: ago(MIN) };
    h.updateStates = new Map([['p-a', 'not_tapped'], ['p-b', 'drafting'], ['p-c', 'ready'], ['p-d', 'failed'], ['p-e', 'published']]);
    h.presence = new Map([['m-e', { memberId: 'm-e', leftAt: new Date().toISOString(), sitsOutRound: null }]]);
    renderHost({ flow: MM });
    await waitFor(() => expect(screen.getAllByTestId('mm-update-owner')).toHaveLength(4));
    expect(screen.getAllByTestId('mm-update-owner').map(li => li.textContent).join(' ')).not.toContain('Eva');
  });
});

describe('ready mark (D17)', () => {
  it('marks a shared canvas that was never an owner or partner, after round 1 only', async () => {
    setRounds([round()], { r1: [seat('r1', 'm-a', 'first', 1), seat('r1', 'm-b', 'second', 1)] });
    renderHost({ flow: MM });
    await screen.findByText('Clarity Canvas shared: canvas_c');
    const marked = screen.getAllByTestId('mm-person').filter(li => within(li).queryByTestId('mm-ready'));
    // Cat and Dan have a canvas and no table yet; Ana and Ben already sat; Eva has no canvas.
    expect(marked.map(li => li.textContent?.match(/(Cat|Dan) [A-Z]\./)?.[0])).toEqual(['Cat D.', 'Dan E.']);
  });

  it('shows no ready marks before round 1 starts', async () => {
    renderHost({ flow: MM });
    await screen.findByText('Clarity Canvas shared: canvas_a');
    expect(screen.queryAllByTestId('mm-ready')).toHaveLength(0);
  });
});

describe('recording states (§7)', () => {
  const running = () => {
    setRounds([round({ startedAt: ago(10 * MIN) })], {
      r1: [seat('r1', 'm-a', 'first', 1), seat('r1', 'm-b', 'second', 1), seat('r1', 'm-c', 'first', 2), seat('r1', 'm-d', 'second', 2)],
    });
    setHostState([
      person('a', { recordingOn: true, lastWordsAt: ago(30_000) }),
      person('b', { recordingOn: true, lastWordsAt: ago(20 * MIN) }),
      person('c', { recordingOn: true, lastWordsAt: null }),
      person('d', { recordingOn: false }),
      person('e', { canvasName: null, canvasShared: false }),
    ]);
  };

  it('shows off, on with no words yet, and words arriving per person, and not the red dot', async () => {
    running();
    renderHost({ flow: MM });
    await waitFor(() => expect(screen.getAllByTestId('mark-recording').map(e => e.getAttribute('data-state'))).toContain('words'));
    // Four people sit (their state is on their tile); Eva has no table (her state is on her row). Nobody is shown twice.
    const states = Object.fromEntries(screen.getAllByTestId('round-grid-name').map(t => [t.textContent?.match(/(Ana|Ben|Cat|Dan)/)?.[0], within(t).getByTestId('mark-recording').getAttribute('data-state')]));
    expect(states).toEqual({ Ana: 'words', Ben: 'silent', Cat: 'silent', Dan: 'off' });
    expect(screen.getAllByTestId('mm-person')).toHaveLength(1);
    expect(within(screen.getByTestId('mm-person')).getByTestId('mm-recording').getAttribute('data-state')).toBe('off');
    expect(screen.queryByTestId('mark-transcribing')).toBeNull();
  });

  it('makes a table with nobody\'s words stand out once the reading time is over', async () => {
    running();
    renderHost({ flow: MM });
    await waitFor(() => expect(screen.getByTestId('mm-silent-tables')).toBeTruthy());
    expect(screen.getByTestId('mm-silent-tables').textContent).toContain('2');
    expect(screen.getByLabelText('Table 2').getAttribute('data-silent')).toBe('true');
    expect(screen.getByLabelText('Table 1').getAttribute('data-silent')).toBeNull();
  });

  it('flags no table while the round is still in its seating and reading minutes', async () => {
    running();
    setRounds([round({ startedAt: ago(3 * MIN) })], {
      r1: [seat('r1', 'm-c', 'first', 2), seat('r1', 'm-d', 'second', 2)],
    });
    renderHost({ flow: MM });
    await waitFor(() => expect(screen.getAllByTestId('mm-recording').map(e => e.getAttribute('data-state'))).toContain('words'));
    expect(screen.queryByTestId('mm-silent-tables')).toBeNull();
  });

  it('keeps the red dot on Clarity Night', async () => {
    setRounds([round({ splitSpeakers: true })], { r1: [seat('r1', 'm-a', 'first', 1), seat('r1', 'm-b', 'second', 1)] });
    renderHost();
    await screen.findByTestId('round-grid');
    expect(screen.queryAllByTestId('mark-recording')).toHaveLength(0);
    expect(screen.queryByTestId('mm-people')).toBeNull();
  });
});

describe('the canvas-update step (§7)', () => {
  const afterRound2 = () => {
    setRounds([round({ id: 'r1', endedAt: ago(30 * MIN) }), round({ id: 'r2', roundNo: 2, endedAt: ago(MIN) })]);
    h.step = { afterRoundId: 'r2', startedAt: ago(MIN) };
  };

  it('lists each owner\'s state while the step is on, and Start round 3 stays available with someone still drafting', async () => {
    afterRound2();
    h.updateStates = new Map([['p-a', 'not_tapped'], ['p-b', 'drafting'], ['p-c', 'ready'], ['p-d', 'failed'], ['p-e', 'published']]);
    renderHost({ flow: MM });
    await waitFor(() => expect(screen.getAllByTestId('mm-update-owner')).toHaveLength(5));
    // Whoever needs the host first is on top: failed, hasn't started, drafting, ready, published.
    const byState = screen.getAllByTestId('mm-update-owner').map(li => li.getAttribute('data-state'));
    expect(byState).toEqual(['failed', 'not_tapped', 'drafting', 'ready', 'published']);
    // The owners' update is the screen: titled, counted, and the one button previews round 3.
    expect(screen.getByTestId('host-round-title').textContent).toBe('Canvas update');
    expect(screen.getByTestId('host-update-title').textContent).toBe('Canvas update · 1 of 5 published');
    const start = screen.getByTestId('host-primary') as HTMLButtonElement;
    expect(start.textContent).toBe('Preview round 3 tables');
    expect(start.disabled).toBe(false);
    expect(screen.queryByText('Evening ended')).toBeNull();
    // Nobody is listed a second time as "Here".
    expect(screen.queryAllByTestId('host-member')).toHaveLength(0);
    expect(screen.queryByTestId('host-waiting')).toBeNull();
  });

  it('reads the owners only while the step is on, and the step only after round 2', async () => {
    setRounds([round({ endedAt: ago(MIN) })]);
    const { unmount } = renderHost({ flow: MM });
    await roomRead();
    await settle();
    expect(h.getCanvasUpdateStep).not.toHaveBeenCalled();
    expect(h.getMastermindUpdateStates).not.toHaveBeenCalled();
    unmount();
    setRounds([round({ id: 'r1', endedAt: ago(30 * MIN) }), round({ id: 'r2', roundNo: 2, endedAt: ago(MIN) })]);
    h.step = null;
    renderHost({ flow: MM });
    await roomRead();
    await settle();
    expect(h.getCanvasUpdateStep).toHaveBeenCalled();
    expect(h.getMastermindUpdateStates).not.toHaveBeenCalled();
  });

  it('is offered while round 2 runs, asks once because it ends the round, then starts through host_start_canvas_update', async () => {
    setRounds([round({ id: 'r1', endedAt: ago(30 * MIN) }), round({ id: 'r2', roundNo: 2, startedAt: ago(5 * MIN) })]);
    renderHost({ flow: MM });
    // The update is the one blue button; previewing round 3 without it is a quiet link below.
    const start = await screen.findByTestId('mm-update-start');
    expect(start.textContent).toBe('Start canvas update');
    expect(screen.getByTestId('host-primary').textContent).toBe('Skip the update, preview round 3 tables');
    expect(screen.getByTestId('host-primary').className).not.toContain('bg-blue-600');
    fireEvent.click(start);
    expect((await screen.findByTestId('mm-update-confirm')).textContent).toMatch(/Round 2 has .* left\. Starting the canvas update ends it now/);
    // The confirm names what the tap ends.
    expect(screen.getByTestId('mm-update-yes').textContent).toBe('End Round 2 & start update');
    expect(h.hostStartCanvasUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('mm-update-yes'));
    await waitFor(() => expect(h.hostStartCanvasUpdate).toHaveBeenCalledWith('ev-1'));
  });

  it('skipping the update asks once inline ("Owners won\'t get time to update their canvas."), Keep puts it back, Skip proceeds', async () => {
    setRounds([round({ id: 'r1', endedAt: ago(30 * MIN) }), round({ id: 'r2', roundNo: 2, startedAt: ago(5 * MIN) })]);
    renderHost({ flow: MM });
    await screen.findByTestId('mm-update-start');
    fireEvent.click(screen.getByTestId('host-primary'));
    expect(screen.getByTestId('mm-skip-confirm').textContent).toContain("Owners won't get time to update their canvas.");
    expect(screen.getByTestId('mm-skip-yes').textContent).toBe('Skip the update');
    expect(screen.getByTestId('mm-skip-keep').textContent).toBe('Keep');
    expect(screen.queryByTestId('host-primary')).toBeNull();
    expect(h.hostStartCanvasUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('mm-skip-keep'));
    expect(screen.queryByTestId('mm-skip-confirm')).toBeNull();
    expect(screen.getByTestId('host-primary').textContent).toBe('Skip the update, preview round 3 tables');
    fireEvent.click(screen.getByTestId('host-primary'));
    fireEvent.click(screen.getByTestId('mm-skip-yes'));
    expect(screen.queryByTestId('mm-skip-confirm')).toBeNull();
    // One confirm is enough: the preview that follows saves nothing, and the round runs until Start now.
    expect(screen.queryByTestId('host-next-confirm')).toBeNull();
  });

  it('is offered in round 2 only: not before it is counted, and not in round 3 or 4', async () => {
    setRounds([round({ startedAt: ago(5 * MIN) })]);
    const { unmount } = renderHost({ flow: MM });
    await screen.findByTestId('host-controls');
    await roomRead();
    expect(screen.queryByTestId('mm-update-start')).toBeNull();
    expect(screen.getByTestId('host-primary').textContent).toBe('Preview next round');
    unmount();
    for (const no of [3, 4]) {
      const earlier = Array.from({ length: no - 1 }, (_, i) => round({ id: `r${i + 1}`, roundNo: i + 1, endedAt: ago((no - i) * 20 * MIN) }));
      setRounds([...earlier, round({ id: `r${no}`, roundNo: no, startedAt: ago(5 * MIN) })]);
      const view = renderHost({ flow: MM });
      await screen.findByTestId('host-controls');
      await roomRead();
      expect(screen.queryByTestId('mm-update-start')).toBeNull();
      expect(screen.getByTestId('host-primary').className).toContain('bg-blue-600');
      view.unmount();
    }
  });
});

describe('Clarity Night controls with no meaning here (§4, §7)', () => {
  const open = async () => { await screen.findByTestId('host-settings'); };

  it('hides group size, the half-time swap, topic, matching and the demo table in this flow, and keeps the minutes', async () => {
    renderHost({ flow: MM });
    await open();
    expect(screen.queryByText('Group size')).toBeNull();
    expect(screen.queryByTestId('host-split-speakers')).toBeNull();
    expect(screen.queryByTestId('host-match-tag')).toBeNull();
    expect(screen.queryByText('Recorders together')).toBeNull();
    expect(screen.queryByText('Disagreement gap')).toBeNull();
    expect(screen.queryByText('Haven’t met yet')).toBeNull();
    expect(screen.queryByTestId('host-seat-now')).toBeNull();
    // "Who plays / One demo table / Volunteers / Suggest pair" are Clarity Night's, and mean nothing here.
    expect(screen.queryByTestId('host-who-plays')).toBeNull();
    expect(screen.queryByText('One demo table')).toBeNull();
    expect(screen.queryByTestId('host-choose-recorders')).toBeNull();
    expect(screen.queryByTestId('host-suggest-pair')).toBeNull();
    // The first part is named as the clock names it.
    expect(screen.getByText('Finding tables')).toBeTruthy();
    expect(screen.queryByText('Tables')).toBeNull();
    // One talk of 15 minutes (stored as 2 x 7.5), 2 to find the table and 3 of observer feedback.
    expect(screen.getByTestId('host-minutes-speakerS').textContent).toBe('15 min');
    expect(screen.getByTestId('host-minutes-seatingS').textContent).toBe('2 min');
    expect(screen.getByTestId('host-minutes-observerS').textContent).toBe('3 min');
    expect(screen.getByText('Talk')).toBeTruthy();
  });

  it('shows all of them on a Clarity Night event', async () => {
    renderHost();
    await open();
    expect(screen.getByText('Group size')).toBeTruthy();
    expect(screen.getByTestId('host-who-plays')).toBeTruthy();
    expect(screen.getByText('Tables')).toBeTruthy();
    expect(screen.getByTestId('host-split-speakers')).toBeTruthy();
    expect(screen.getByTestId('host-match-tag')).toBeTruthy();
    expect(screen.getByText('Recorders together')).toBeTruthy();
    expect(screen.getByText('Disagreement gap')).toBeTruthy();
    expect(screen.getByText('Haven’t met yet')).toBeTruthy();
    expect(screen.getByTestId('host-minutes-speakerS').textContent).toBe('6 min');
  });

  it('names the columns Clarity Canvas owner, Partner and Observer in this flow, and Speaker on Clarity Night', async () => {
    const seats = { r1: [seat('r1', 'm-a', 'first', 1), seat('r1', 'm-b', 'second', 1), seat('r1', 'm-e', 'observer', 1)] };
    setRounds([round()], seats);
    const { unmount } = renderHost({ flow: MM });
    await screen.findByTestId('round-grid');
    // Clarity Night's headers carry the printed S / L / O card before the name.
    const roles = () => screen.getAllByTestId('round-grid-role').map(e => e.textContent?.replace(/^[SLO](?=[A-Z])/, ''));
    expect(roles()).toEqual(['Clarity Canvas owner', 'Partner', 'Observer']);
    unmount();
    setRounds([round({ splitSpeakers: true })], seats);
    renderHost();
    await screen.findByTestId('round-grid');
    expect(roles()).toEqual(['Speaker 1', 'Speaker 2', 'Observer']);
  });
});

describe('the projector (§5)', () => {
  const seats = {
    r1: [seat('r1', 'm-a', 'first', 1), seat('r1', 'm-b', 'second', 1), seat('r1', 'm-e', 'observer', 1), seat('r1', 'm-c', 'first', 2), seat('r1', 'm-d', 'second', 2)],
  };

  it('shows the round, the clock, every table with its roles and one fixed rule line, and no swap or phase', async () => {
    setRounds([round({ startedAt: ago(10 * MIN) })], seats);
    renderHost({ flow: MM, search: '?view=screen' });
    expect((await screen.findByRole('heading', { name: 'Round 1' })).textContent).toBe('Round 1');
    expect(screen.getByTestId('round-clock')).toBeTruthy();
    expect(screen.getAllByTestId('screen-table')).toHaveLength(2);
    expect(screen.getByTestId('screen-rule-line').textContent).toBe(SCREEN_RULE_LINE);
    expect(screen.getAllByTestId('screen-seat').map(s => s.getAttribute('data-role'))).toEqual(['first', 'second', 'observer', 'first', 'second']);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Clarity Canvas owner');
    expect(text).toContain('Partner');
    expect(text).not.toMatch(/swap|speaker 1|speaker 2|listener|challenge phase|understanding/i);
    expect(screen.queryAllByTestId('screen-bell')).toHaveLength(1);
  });

  it('says the canvas update is on while the step is on', async () => {
    setRounds([round({ id: 'r1', endedAt: ago(30 * MIN) }), round({ id: 'r2', roundNo: 2, endedAt: ago(MIN) })]);
    h.step = { afterRoundId: 'r2', startedAt: ago(MIN) };
    renderHost({ flow: MM, search: '?view=screen' });
    expect((await screen.findByTestId('screen-update-on')).textContent).toMatch(/Canvas update/);
    expect(screen.queryByText('Evening ended')).toBeNull();
  });

  it('leaves Clarity Night\'s projector as it was: role cards and the speakers\' parts, no rule line', async () => {
    setRounds([round({ splitSpeakers: true, startedAt: ago(MIN) })], seats);
    renderHost({ search: '?view=screen' });
    await screen.findByTestId('host-screen');
    expect(screen.queryByTestId('screen-rule-line')).toBeNull();
    expect(screen.queryByTestId('screen-update-on')).toBeNull();
    expect(screen.getByText(/Speaker 1/)).toBeTruthy();
    expect(screen.getByText(/Speaker 2/)).toBeTruthy();
    expect(h.getCanvasUpdateStep).not.toHaveBeenCalled();
  });
});

describe('registration on the host screen (D24)', () => {
  it('names a person who is not registered, with the reason, and never proposes them for a table', async () => {
    setHostState([person('a'), person('b'), person('c'), person('d'), person('e', { registered: false })]);
    let seen: MastermindSeatingInput | null = null;
    h.planOverride = input => { seen = input; return plan([['m-a', 1, 'first'], ['m-b', 1, 'second']]); };
    renderHost({ flow: MM });
    const not = await screen.findAllByTestId('mm-not-registered');
    expect(not).toHaveLength(1);
    const first = not[0] as HTMLElement;
    expect(first.textContent).toBe('Not registered for this event. They cannot be seated.');
    expect(within(first.closest('[data-testid="mm-person"]') as HTMLElement).getByText('Eva F.')).toBeTruthy();
    await openPreview();
    const input = seen as MastermindSeatingInput | null;
    expect([...(input?.holders ?? []), ...(input?.observers ?? [])]).not.toContain('m-e');
    expect(input?.holders).toEqual(expect.arrayContaining(['m-a', 'm-b', 'm-c', 'm-d']));
  });

  it('a person the server has not described is not judged unregistered', async () => {
    renderHost({ flow: MM });
    await screen.findByText('Clarity Canvas shared: canvas_a');
    expect(screen.queryAllByTestId('mm-not-registered')).toHaveLength(0);
  });

  it('shows the server\'s refusal to seat someone unregistered, with their name', async () => {
    h.planOverride = () => plan([['m-a', 1, 'first'], ['m-b', 1, 'second']]);
    h.hostStartRound.mockRejectedValueOnce({ message: 'A person who is not registered for this event cannot be seated', details: 'Eva F.' });
    renderHost({ flow: MM });
    await openPreview();
    fireEvent.click(screen.getByTestId('host-preview-start'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('not registered for this event');
    expect(alert.textContent).toContain('Eva F.');
  });

  it('counts who comes at the doors time: improving at the event, or an observer who prepares at the event', async () => {
    setHostState([
      person('a', { participation: 'canvas_at_doors' }),
      person('b', { participation: 'canvas_at_doors' }),
      person('c', { participation: 'observer', observerPrep: 'doors' }),
      person('d', { participation: 'observer', observerPrep: 'home' }),
      person('e', { participation: 'canvas_before' }),
    ]);
    renderHost({ flow: MM });
    await screen.findAllByTestId('mm-person');
    // The mark is on the person's own row (not an anonymous count): improving at the event, or an observer who prepares there.
    const doors = screen.getAllByTestId('mm-person').filter(li => within(li).queryByTestId('mm-doors')).map(li => li.textContent?.match(/(Ana|Ben|Cat|Dan|Eva) [A-Z]\./)?.[0]);
    expect(doors).toEqual(['Ana B.', 'Ben C.', 'Cat D.']);
    expect(screen.queryByText(/come at the doors time/)).toBeNull();
    expect(screen.queryByTestId('mm-doors-count')).toBeNull();
  });
});

describe('the waiting list on the host screen (D24, spec "Waiting list")', () => {
  const WAITING = [
    { profileId: 'p-w1', name: 'Zed Young', slug: 'zed', avatarColor: '#123456', avatarUrl: null, hasPledged: false, position: 1 },
    { profileId: 'p-w2', name: 'Amy Xu', slug: 'amy', avatarColor: '#654321', avatarUrl: null, hasPledged: false, position: 2 },
  ];

  it('sits directly below the people list, in position order, with one Add per person', async () => {
    h.getWaitlistPublic.mockResolvedValue(WAITING);
    renderHost({ flow: MM });
    const list = await screen.findByTestId('event-waitlist');
    expect(within(list).getAllByText(/^(Zed|Amy) /).map(n => n.textContent)).toEqual(['Zed Young', 'Amy Xu']);
    expect(within(list).getAllByTestId('event-waitlist-add')).toHaveLength(2);
    // Same section, people first, waiting list right after, nothing in between.
    const people = screen.getByTestId('mm-people');
    expect(people.nextElementSibling).toBe(list);
    // The old read-only list is gone.
    expect(screen.queryByTestId('mm-waitlist')).toBeNull();
  });

  it('one tap on Add registers the person (host_add_from_waitlist) and the host state is read again', async () => {
    h.getWaitlistPublic.mockImplementation(async () => (h.hostAddFromWaitlist.mock.calls.length === 0 ? WAITING : [WAITING[1]])); // the list is re-read with every poll
    renderHost({ flow: MM });
    await screen.findByTestId('event-waitlist');
    await roomRead();
    const reads = h.getMastermindHostState.mock.calls.length;
    fireEvent.click(within(screen.getByTestId('event-waitlist')).getAllByTestId('event-waitlist-add')[0] as HTMLElement);
    await waitFor(() => expect(h.hostAddFromWaitlist).toHaveBeenCalledWith('ev-1', 'p-w1'));
    await waitFor(() => expect(h.getMastermindHostState.mock.calls.length).toBeGreaterThan(reads));
    await waitFor(() => expect(within(screen.getByTestId('event-waitlist')).getAllByTestId('event-waitlist-add')).toHaveLength(1));
  });

  it('never lists the host, and is not shown while the seating preview is open, after round 1 starts, or on Clarity Night', async () => {
    h.getWaitlistPublic.mockResolvedValue([{ ...WAITING[0], profileId: 'host-1', name: 'Host Person' }, WAITING[1]]);
    const { unmount } = renderHost({ flow: MM });
    const list = await screen.findByTestId('event-waitlist');
    expect(within(list).queryByText('Host Person')).toBeNull();
    expect(within(list).getAllByTestId('event-waitlist-add')).toHaveLength(1);
    unmount();
    setRounds([round()], { r1: [seat('r1', 'm-a', 'first', 1), seat('r1', 'm-b', 'second', 1)] });
    const running = renderHost({ flow: MM });
    await screen.findByTestId('round-grid');
    await roomRead();
    expect(screen.queryByTestId('event-waitlist')).toBeNull();
    running.unmount();
    setRounds([]);
    h.getWaitlistPublic.mockClear();
    renderHost();
    await screen.findByTestId('host-flow-row');
    expect(screen.queryByTestId('event-waitlist')).toBeNull();
    expect(h.getWaitlistPublic).not.toHaveBeenCalled();
  });

  it('a failed read of the room says so once, with Retry, and Retry reads again', async () => {
    h.getMastermindHostState.mockRejectedValueOnce(new Error('offline'));
    renderHost({ flow: MM });
    const warning = await screen.findByTestId('mm-warning');
    expect(warning.textContent).toContain('Could not read the room just now.');
    // One alert for one failure: the waiting list does not add a second.
    expect(within(screen.getByTestId('host-people')).getAllByRole('alert')).toHaveLength(1);
    expect(screen.queryByTestId('mm-waitlist-error')).toBeNull();
    fireEvent.click(screen.getByTestId('mm-warning-retry'));
    await waitFor(() => expect(screen.queryByTestId('mm-warning')).toBeNull());
    expect(h.getMastermindHostState).toHaveBeenCalledTimes(2);
  });
});

describe('one representation of every person, per phase', () => {
  // The event's host (renderHost's hostId) is also in the room's roster.
  const HOST = { ...member('host', 'Hugo Host'), profileId: 'host-1' } as EventRoomMember;
  /** The first names that stand for a person anywhere on the page's people area. */
  const shown = () => {
    const out: string[] = [];
    for (const el of screen.getAllByTestId('host-people').flatMap(s => [...s.querySelectorAll('[data-testid="mm-person"], [data-testid="round-grid-name"], [data-testid="host-member"], [data-testid="mm-update-owner"]')])) {
      const name = el.textContent?.match(/(Ana|Ben|Cat|Dan|Eva|Hugo)/)?.[0];
      if (name) out.push(name);
    }
    return out;
  };
  const unique = (names: string[]) => expect([...names].sort()).toEqual([...new Set(names)].sort());

  it('before round 1: one row each in one list, no second grid of "Here"', async () => {
    h.roster = [...ROSTER, HOST];
    renderHost({ flow: MM });
    await screen.findAllByTestId('mm-person');
    expect(screen.getAllByTestId('mm-person')).toHaveLength(5);
    expect(screen.queryAllByTestId('host-member')).toHaveLength(0);
    expect(screen.queryByTestId('host-waiting')).toBeNull();
    expect(shown().sort()).toEqual(['Ana', 'Ben', 'Cat', 'Dan', 'Eva']);
    // The host runs the room: not a person in it.
    expect(document.body.textContent).not.toContain('Hugo');
  });

  it('a person marked out is in Out only, and Back in returns them to the list', async () => {
    renderHost({ flow: MM });
    const row = (await screen.findAllByTestId('mm-person')).find(li => li.textContent?.includes('Eva F.')) as HTMLElement;
    fireEvent.click(within(row).getByTestId('mm-mark-out'));
    await waitFor(() => expect(screen.getByTestId('host-out')).toBeTruthy());
    expect(screen.getAllByTestId('mm-person')).toHaveLength(4);
    expect(shown().filter(n => n === 'Eva')).toHaveLength(1);
  });

  it('in a round: the tables, then only people with no table; nobody twice, and no host', async () => {
    h.roster = [...ROSTER, HOST];
    setRounds([round()], {
      r1: [seat('r1', 'm-a', 'first', 1), seat('r1', 'm-b', 'second', 1), seat('r1', 'm-c', 'first', 2), seat('r1', 'm-d', 'second', 2), seat('r1', 'm-host', 'observer', 2)],
    });
    renderHost({ flow: MM });
    await screen.findByTestId('mm-people');
    const names = shown();
    unique(names);
    expect(names.sort()).toEqual(['Ana', 'Ben', 'Cat', 'Dan', 'Eva']);
    expect(document.body.textContent).not.toContain('Hugo');
    // The tables come first in the page, the unseated list after them.
    const grid = screen.getByTestId('round-grid');
    const rest = screen.getByTestId('mm-people');
    expect(grid.compareDocumentPosition(rest) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryAllByTestId('host-member')).toHaveLength(0);
  });

  it('at the update step: the owners\' update first, then only the people who are not owners; nobody twice', async () => {
    setRounds([round({ id: 'r1', endedAt: ago(30 * MIN) }), round({ id: 'r2', roundNo: 2, endedAt: ago(MIN) })]);
    h.step = { afterRoundId: 'r2', startedAt: ago(MIN) };
    h.updateStates = new Map([['p-a', 'drafting'], ['p-b', 'published'], ['p-c', 'ready'], ['p-d', 'failed']]);
    renderHost({ flow: MM });
    await waitFor(() => expect(screen.getAllByTestId('mm-update-owner')).toHaveLength(4));
    const names = shown();
    unique(names);
    expect(names.sort()).toEqual(['Ana', 'Ben', 'Cat', 'Dan', 'Eva']);
    // Eva has no canvas: she is the one person under "Observers", with her switch.
    expect(screen.getAllByTestId('mm-person')).toHaveLength(1);
    expect(screen.getByTestId('mm-people').textContent).toContain('Eva F.');
    expect(screen.getByTestId('mm-update-step').compareDocumentPosition(screen.getByTestId('mm-people')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('after the evening: no list, no live switches, no "Here"', async () => {
    setRounds([round({ endedAt: ago(MIN) })], { r1: [seat('r1', 'm-a', 'first', 1), seat('r1', 'm-b', 'second', 1)] });
    renderHost({ flow: MM });
    await screen.findByText('Evening ended');
    await roomRead();
    expect(screen.queryByTestId('host-people')).toBeNull();
    expect(screen.queryAllByTestId('mm-person')).toHaveLength(0);
    expect(screen.queryAllByTestId('host-member')).toHaveLength(0);
  });
});

describe('Clarity Night marks that mean nothing in the mastermind', () => {
  const sit = (confirmed: boolean) => ({ r1: [{ ...seat('r1', 'm-a', 'first', 1), confirmedAt: confirmed ? ago(MIN) : null }, seat('r1', 'm-b', 'second', 1)] });

  it('shows "at their table" and "N of M tapped in" on Clarity Night only', async () => {
    setRounds([round({ id: 'r0', roundNo: 1, endedAt: ago(30 * MIN) }), round({ id: 'r1', roundNo: 2 })], { r0: sit(true).r1.map(s => ({ ...s, roundId: 'r0' })), r1: sit(true).r1 });
    const { unmount } = renderHost();
    await screen.findAllByTestId('round-grid');
    expect(screen.getAllByLabelText('at their table').length).toBeGreaterThan(0);
    expect(screen.getByTestId('host-past-rounds').textContent).toMatch(/tapped in/);
    unmount();
    renderHost({ flow: MM });
    await screen.findAllByTestId('round-grid');
    expect(screen.queryByLabelText('at their table')).toBeNull();
    expect(screen.getByTestId('host-past-rounds').textContent).not.toMatch(/tapped in/);
  });

  it('lifts a person with "Mark out" in the mastermind, and "Out" on Clarity Night', async () => {
    setRounds([round()], sit(false));
    const { unmount } = renderHost({ flow: MM });
    fireEvent.click((await screen.findAllByTestId('round-grid-name'))[0] as HTMLElement);
    expect(screen.getByTestId('host-mark-left').textContent).toBe('Mark out');
    unmount();
    setRounds([round({ splitSpeakers: true })], sit(false));
    renderHost();
    fireEvent.click((await screen.findAllByTestId('round-grid-name'))[0] as HTMLElement);
    expect(screen.getByTestId('host-mark-left').textContent).toBe('Out');
  });
});
