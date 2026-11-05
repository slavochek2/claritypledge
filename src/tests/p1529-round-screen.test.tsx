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
  getMyUpdateState: vi.fn(),
  getCanvasUpdateStep: vi.fn(),
  getMyDraftRef: vi.fn(),
  getMyEventCanvas: vi.fn(),
  publishCanvasDraft: vi.fn(),
  retryCanvasRun: vi.fn(),
  getCanvasDraftState: vi.fn(),
  classicProps: vi.fn(),
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
  getMyUpdateState: h.getMyUpdateState,
  getCanvasUpdateStep: h.getCanvasUpdateStep,
  getMyDraftRef: h.getMyDraftRef,
  getMyEventCanvas: h.getMyEventCanvas,
}));
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

const OPEN = { state: 'none', roundId: null };
const NOT_TAPPED = { state: 'not_tapped', draftId: null, revision: null, runId: null };
const DRAFT = { draftId: 'd1', revision: 4, runId: 'run1' };

const Where = () => <span data-testid="where">{useLocation().pathname}</span>;

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
  h.server = {
    canvas: { ownerProfileId: 'p-owner', ownerSlug: 'haru', canvasName: 'launch_plan', shared: true },
    offer: OPEN, update: NOT_TAPPED, step: null,
  };
  h.getMyRoundCanvas.mockImplementation(async () => h.server.canvas);
  h.getMyNextVersionOffer.mockImplementation(async () => h.server.offer);
  h.getMyUpdateState.mockImplementation(async () => h.server.update);
  h.getCanvasUpdateStep.mockImplementation(async () => h.server.step);
  h.getMyDraftRef.mockResolvedValue({ canvasId: 'c1', versionName: 'v3-draft' });
  h.getMyEventCanvas.mockResolvedValue({ name: 'launch_plan', shared: true, fixed: true });
  h.getCanvasDraftState.mockResolvedValue(undefined);
  liveRound();
});
afterEach(() => { vi.useRealTimers(); });

describe('P1529 round screen: what each role sees', () => {
  it.each([
    [OWNER, "You're the Clarity Canvas owner: Erin W. is your partner", /lower number between you and your partner decides; above 8 your partner may challenge/],
    [PARTNER, "You're Haru T.'s partner", /lower number decides; above 8 you may challenge/],
    [OBSERVER, "You're observing Haru T.'s Clarity Canvas with Erin W.", /lower number decides, and above 8 the partner may challenge/],
  ])('%#: role line and one rule line', async (who, line, rule) => {
    renderCard(who);
    expect((await screen.findByTestId('round-card-role')).textContent).toBe(line);
    expect(screen.getByTestId('round-card-table').textContent).toBe('Table 1');
    expect(screen.getByTestId('round-card-rule').textContent).toMatch(rule);
    expect(screen.getByTestId('round-card-with').textContent).toBe(
      who === OWNER ? 'With Erin W., Sam L.' : who === PARTNER ? 'With Haru T., Sam L.' : 'With Haru T., Erin W.',
    );
  });

  it('shows only the person\'s own table when the round has several', async () => {
    liveRound([round()], { r1: [
      seat('r1', 'm-other-owner', 'first', 1), seat('r1', 'm-other-partner', 'second', 1),
      seat('r1', 'm-owner', 'first', 2), seat('r1', 'm-partner', 'second', 2), seat('r1', 'm-obs', 'observer', 2),
    ] });
    renderCard(PARTNER);
    expect((await screen.findByTestId('round-card-role')).textContent).toBe("You're Haru T.'s partner");
    expect(screen.getByTestId('round-card-table').textContent).toBe('Table 2');
    expect(screen.getByTestId('round-card-with').textContent).toBe('With Haru T., Sam L.');
  });

  it('never uses a bare "owner" or "reader" in attendee words', async () => {
    renderCard(PARTNER);
    await screen.findByTestId('round-card-role');
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\breader\b/i);
    expect(text.replace(/Clarity Canvas owner/g, '')).not.toMatch(/\bowner\b/i);
  });

  it('asks for nothing during a round: no confirm, swap, phase, compare, slider or score', async () => {
    renderCard(OWNER);
    await screen.findByTestId('round-card-role');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('slider')).toHaveLength(0);
    expect(screen.queryByTestId('round-card-confirm')).toBeNull();
    expect(document.body.textContent).not.toMatch(/swap|seated —|compare|score|stance/i);
  });

  it("a partner's only control is the quiet link to their own canvas card", async () => {
    renderCard(PARTNER);
    await screen.findByTestId('round-card-role');
    expect(screen.getAllByRole('button').map(b => b.getAttribute('data-testid'))).toEqual(['round-canvas-card-toggle']);
  });
});

describe('P1529 round screen: the canvas link', () => {
  it('shows the partner and the observer a link to the owner\'s newest version; the click records the open and goes there', async () => {
    for (const who of [PARTNER, OBSERVER]) {
      h.recordCanvasOpen.mockClear();
      const { unmount } = renderCard(who);
      const link = (await screen.findByTestId('round-canvas-link')) as HTMLAnchorElement;
      expect(link.getAttribute('href')).toBe('/p/haru/canvas/launch_plan');
      expect(link.textContent).toMatch(/Open Haru T.’s Clarity Canvas/);
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
  });

  it('the Clarity Canvas owner has no link to their own canvas, and the server is not asked for one', async () => {
    renderCard(OWNER);
    await screen.findByTestId('round-card-role');
    expect(screen.queryByTestId('round-canvas-link')).toBeNull();
    expect(h.getMyRoundCanvas).not.toHaveBeenCalled();
  });

  it('says the canvas is no longer shared, with no link', async () => {
    h.server.canvas = { ownerProfileId: 'p-owner', ownerSlug: 'haru', canvasName: null, shared: false };
    renderCard(PARTNER);
    expect((await screen.findByTestId('round-canvas-unshared')).textContent).toBe('This Clarity Canvas is no longer shared');
    expect(screen.queryByTestId('round-canvas-link')).toBeNull();
  });

  it('an observer reaches their own canvas card from the room, collapsed until asked', async () => {
    renderCard(OBSERVER);
    const toggle = await screen.findByTestId('round-canvas-card-toggle');
    expect(screen.queryByTestId('event-canvas-card')).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByTestId('event-canvas-card')).toBeTruthy();
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

  it('the host\'s canvas-update step is not "the evening is over"; without it, rounds that ended are', async () => {
    betweenRounds();
    h.server.step = { afterRoundId: 'r1', startedAt: new Date().toISOString() };
    const onMoment = vi.fn();
    const { unmount } = renderCard(OWNER, { onMoment });
    await waitFor(() => expect(onMoment).toHaveBeenLastCalledWith(expect.objectContaining({ eveningOver: false, waiting: true })));
    unmount();
    h.server.step = null;
    const again = vi.fn();
    renderCard(OWNER, { onMoment: again });
    await waitFor(() => expect(again).toHaveBeenLastCalledWith(expect.objectContaining({ eveningOver: true })));
  });
});

describe('P1529 §6: "Make my next version"', () => {
  beforeEach(() => { betweenRounds(); });

  it('is shown to the Clarity Canvas owner once their round is over, and taps the round it was made in', async () => {
    h.server.offer = { state: 'offer', roundId: 'r1' };
    h.makeMyNextVersion.mockImplementation(async () => {
      h.server.update = { state: 'drafting', ...DRAFT };
      return { status: 'started', draftId: 'd1', runId: 'run1', repeat: false, start: { ok: true, runId: 'run1', kind: 'message' } };
    });
    renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-task')).textContent).toMatch(/From Round 1/);
    fireEvent.click(screen.getByTestId('mastermind-make'));
    await waitFor(() => expect(h.makeMyNextVersion).toHaveBeenCalledWith('r1'));
    expect((await screen.findByTestId('mastermind-task-drafting')).textContent).toMatch(/drafting/);
    expect(screen.queryByTestId('mastermind-make')).toBeNull();
  });

  it('is not shown before the round is over, to someone who is not its owner, or when the server says none', async () => {
    h.server.offer = { state: 'round_on', roundId: 'r1' };
    renderCard(OWNER);
    await waitFor(() => expect(h.getMyNextVersionOffer).toHaveBeenCalled());
    expect(screen.queryByTestId('mastermind-make')).toBeNull();
    expect(screen.queryByTestId('mastermind-task')).toBeNull();
    expect(screen.queryByTestId('mastermind-task-line')).toBeNull();
  });

  it('with no recording from the round it says so, with no button', async () => {
    h.server.offer = { state: 'no_recording', roundId: 'r1' };
    renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-task-no-recording')).textContent).toBe('No recording from this round');
    expect(screen.queryByTestId('mastermind-make')).toBeNull();
  });

  it('with the words still arriving it says so and lets them try again', async () => {
    h.server.offer = { state: 'transcript_pending', roundId: 'r1' };
    h.makeMyNextVersion.mockResolvedValue({ status: 'transcript_pending' });
    renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-task-pending')).textContent).toMatch(/still arriving/);
    fireEvent.click(screen.getByTestId('mastermind-make'));
    await waitFor(() => expect(h.makeMyNextVersion).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('mastermind-make')).toBeTruthy();
  });

  it('a tap that finds the words still arriving, while the card showed the button, says so', async () => {
    h.server.offer = { state: 'offer', roundId: 'r1' };
    h.makeMyNextVersion.mockResolvedValue({ status: 'transcript_pending' });
    renderCard(OWNER);
    fireEvent.click(await screen.findByTestId('mastermind-make'));
    expect((await screen.findByTestId('mastermind-task-note')).textContent).toMatch(/still arriving/);
  });

  it('no_canvas gets a plain sentence and no button', async () => {
    h.server.offer = { state: 'no_canvas', roundId: 'r1' };
    renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-task-no-canvas')).textContent).toMatch(/no Clarity Canvas shared with this event/);
    expect(screen.queryByTestId('mastermind-make')).toBeNull();
  });

  it('a draft already open names the way to it', async () => {
    h.server.offer = { state: 'draft_open', roundId: 'r1' };
    renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-task-draft-open')).textContent).toMatch(/already have a draft open/);
    expect(screen.queryByTestId('mastermind-make')).toBeNull();
  });

  it.each([
    ['demo_round', /Demo round/],
    ['round_still_on', /still on/],
    ['next_owning_round_started', /next round has started/],
    ['draft_already_open', /already have a draft open/],
    ['cap_reached', /used all the mirror runs/],
    ['busy', /busy/],
    ['busy_elsewhere', /busy/],
    ['something_new', /could not be made/],
  ])('a refused tap (%s) says why in a sentence, and the button stays', async (code, sentence) => {
    h.server.offer = { state: 'offer', roundId: 'r1' };
    h.makeMyNextVersion.mockResolvedValue({ status: 'refused', code });
    renderCard(OWNER);
    fireEvent.click(await screen.findByTestId('mastermind-make'));
    expect((await screen.findByTestId('mastermind-task-note')).textContent).toMatch(sentence);
    expect(screen.getByTestId('mastermind-make')).toBeTruthy();
  });

  it('a call that throws is a sentence, not silence', async () => {
    h.server.offer = { state: 'offer', roundId: 'r1' };
    h.makeMyNextVersion.mockRejectedValue(new Error('network'));
    renderCard(OWNER);
    fireEvent.click(await screen.findByTestId('mastermind-make'));
    expect((await screen.findByTestId('mastermind-task-note')).textContent).toMatch(/could not be made/);
  });
});

describe('P1529 §6: the update task', () => {
  beforeEach(() => {
    betweenRounds();
    h.server.step = { afterRoundId: 'r1', startedAt: new Date().toISOString() };
  });

  it('drafting shows no button', async () => {
    h.server.update = { state: 'drafting', ...DRAFT };
    renderCard(OWNER);
    expect((await screen.findByTestId('mastermind-task-drafting')).textContent).toMatch(/drafting/);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('ready: Publish publishes the draft as it is, and a tweak link opens the draft workspace first', async () => {
    h.server.update = { state: 'ready', ...DRAFT };
    h.publishCanvasDraft.mockImplementation(async () => {
      h.server.update = { state: 'published', draftId: null, revision: null, runId: null };
      return { ok: true, seq: 3, skippedLinks: 0, replyMessageId: null, openOffers: 0 };
    });
    renderCard(OWNER);
    const tweak = (await screen.findByTestId('mastermind-tweak')) as HTMLAnchorElement;
    expect(tweak.getAttribute('href')).toBe('/p/haru/canvas/launch_plan?v=v3-draft&ws=1');
    fireEvent.click(screen.getByTestId('mastermind-publish'));
    await waitFor(() => expect(h.publishCanvasDraft).toHaveBeenCalledWith('d1', 4));
    expect((await screen.findByTestId('mastermind-task-published')).textContent).toMatch(/published/);
    expect(screen.queryByTestId('mastermind-publish')).toBeNull();
    expect(screen.queryByTestId('mastermind-make')).toBeNull();
  });

  it('is never asked for stances, and Publish is the only full-width primary', async () => {
    h.server.update = { state: 'ready', ...DRAFT };
    renderCard(OWNER);
    await screen.findByTestId('mastermind-publish');
    expect(document.body.textContent).not.toMatch(/stance|position|score/i);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('a refused publish says why', async () => {
    h.server.update = { state: 'ready', ...DRAFT };
    h.publishCanvasDraft.mockResolvedValue({ ok: false, refused: 'stale_view', revision: 5 });
    renderCard(OWNER);
    fireEvent.click(await screen.findByTestId('mastermind-publish'));
    expect((await screen.findByTestId('mastermind-task-note')).textContent).toMatch(/just changed/);
  });

  it('failed: Try again retries the failed run on its revision, with a new client id', async () => {
    h.server.update = { state: 'failed', ...DRAFT };
    h.retryCanvasRun.mockImplementation(async () => {
      h.server.update = { state: 'drafting', ...DRAFT };
      return { ok: true, runId: 'run2', revision: 5, replayed: false, start: { ok: true, runId: 'run2', kind: 'message' } };
    });
    renderCard(OWNER);
    fireEvent.click(await screen.findByTestId('mastermind-retry'));
    await waitFor(() => expect(h.retryCanvasRun).toHaveBeenCalledTimes(1));
    const arg = h.retryCanvasRun.mock.calls[0]![0] as { draftId: string; failedRunId: string; expectedRevision: number; clientId: string };
    expect(arg).toMatchObject({ draftId: 'd1', failedRunId: 'run1', expectedRevision: 4 });
    expect(arg.clientId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByTestId('mastermind-task-drafting')).toBeTruthy();
  });

  it('published: a line, and the button does not come back', async () => {
    h.server.update = { state: 'published', draftId: null, revision: null, runId: null };
    h.server.offer = { state: 'offer', roundId: 'r1' };
    renderCard(OWNER);
    await screen.findByTestId('mastermind-task-published');
    expect(screen.queryByTestId('mastermind-make')).toBeNull();
  });

  it('is the screen during the host\'s update step, and a quiet card outside it', async () => {
    h.server.update = { state: 'ready', ...DRAFT };
    const { unmount } = renderCard(OWNER);
    const inStep = await screen.findByTestId('mastermind-task');
    expect(inStep.querySelector('h2')).not.toBeNull();
    unmount();
    h.server.step = null;
    renderCard(OWNER);
    const outside = await screen.findByTestId('mastermind-task');
    expect(outside.querySelector('h2')).toBeNull();
    expect(outside.querySelector('h3')).not.toBeNull();
  });

  it('shrinks to one quiet line while the person sits in the next round, and opens on a tap', async () => {
    liveRound([round({ endedAt: new Date().toISOString() }), round({ id: 'r2', roundNo: 2 })], {
      r1: [seat('r1', 'm-owner', 'first')],
      r2: [seat('r2', 'm-owner', 'second'), seat('r2', 'm-partner', 'first')],
    });
    h.server.step = null;
    h.server.update = { state: 'ready', ...DRAFT };
    renderCard(OWNER);
    const line = await screen.findByTestId('mastermind-task-line');
    expect(line.textContent).toBe('Your next version: ready to publish');
    expect(screen.queryByTestId('mastermind-publish')).toBeNull();
    fireEvent.click(line);
    expect(screen.getByTestId('mastermind-publish')).toBeTruthy();
  });
});

describe('P1529 §6: polling only while a read can change', () => {
  const reads = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

  it('polls a draft being written, and stops once it is ready', async () => {
    betweenRounds();
    h.server.update = { state: 'drafting', ...DRAFT };
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderCard(OWNER);
    await screen.findByTestId('mastermind-task-drafting');
    await reads(100);
    const before = h.getMyUpdateState.mock.calls.length;
    await reads(12_000);
    expect(h.getMyUpdateState.mock.calls.length).toBeGreaterThan(before);
    expect(h.getCanvasDraftState).toHaveBeenCalledWith('c1');
    h.server.update = { state: 'ready', ...DRAFT };
    await reads(6_000);
    await screen.findByTestId('mastermind-publish');
    const settled = h.getMyUpdateState.mock.calls.length;
    await reads(60_000);
    expect(h.getMyUpdateState.mock.calls.length).toBe(settled);
  });

  it('does not poll a published or idle owner', async () => {
    betweenRounds();
    h.server.update = { state: 'published', draftId: null, revision: null, runId: null };
    h.server.offer = { state: 'no_recording', roundId: 'r1' };
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderCard(OWNER);
    await screen.findByTestId('mastermind-task-published');
    const u = h.getMyUpdateState.mock.calls.length;
    const o = h.getMyNextVersionOffer.mock.calls.length;
    await reads(60_000);
    expect(h.getMyUpdateState.mock.calls.length).toBe(u);
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
    expect(h.getMyUpdateState).not.toHaveBeenCalled();
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
  it('the mastermind room has Principle and Table only; Clarity Night and the hike keep theirs', async () => {
    const { hiddenRoomSteps } = await import('@/app/prototypes/events/rounds/hidden-room-steps');
    const { SALES_MASTERMIND_RECIPE, CLARITY_NIGHT_RECIPE, SOCIAL_HIKE_RECIPE } = await import('@/app/prototypes/events/series-recipes');
    expect(hiddenRoomSteps(SALES_MASTERMIND_RECIPE).sort()).toEqual(['close', 'compare', 'ready']);
    expect(hiddenRoomSteps(CLARITY_NIGHT_RECIPE)).toEqual([]);
    expect(hiddenRoomSteps(SOCIAL_HIKE_RECIPE).sort()).toEqual(['compare', 'ready', 'table']);
  });
});

