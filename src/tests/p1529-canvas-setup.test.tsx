/**
 * P1529 E5: the "Make your Clarity Canvas" part: the host's primary order, the projector, the phone card per role, and the room's Canvas tab.
 */
import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventRoomMember } from '@/app/types';
import type { EventRoundsState } from '@/app/data/event-rounds-service';
import type { MastermindPerson } from '@/app/data/event-mastermind-service';
import type { MastermindSeatingInput, MastermindSeatingPlan } from '@/lib/mastermind-seating';

const h = vi.hoisted(() => ({
  state: null as unknown,
  roster: [] as unknown[],
  event: {} as Record<string, unknown>,
  hostState: new Map<string, unknown>(),
  previous: [] as [string, string][],
  planOverride: null as null | ((input: MastermindSeatingInput) => MastermindSeatingPlan),
  getMastermindHostState: vi.fn(),
  getPreviousSessionPartners: vi.fn(),
  hostSetObserver: vi.fn(),
  hostSetEventFlow: vi.fn(),
  hostStartRound: vi.fn(),
  hostEndRound: vi.fn(),
  hostEndRounds: vi.fn(),
  refreshRounds: vi.fn(),
  eveningEnd: null as null | string,
  getEveningEnd: vi.fn(),
  hostSetRoundSeats: vi.fn(),
  getWaitlistPublic: vi.fn(),
  hostAddFromWaitlist: vi.fn(),
  presence: new Map<string, unknown>(),
  hostSetRoundPresence: vi.fn(),
  setupEnd: null as null | number,
  setupFailed: false,
  role: null as null | 'loading' | 'failed' | { participation: string | null; observerPrep: string | null },
  roleRetry: vi.fn(),
  stepShared: false,
  startRun: vi.fn(),
  hostStartCanvasSetup: vi.fn(),
  hostEndCanvasSetup: vi.fn(),
}));
vi.mock('@/app/data/event-canvas-setup-service', () => ({
  hostStartCanvasSetup: h.hostStartCanvasSetup,
  hostEndCanvasSetup: h.hostEndCanvasSetup,
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
  // Stateful like the real hook: a refresh re-renders with the setup's end the rounds read now returns.
  useEventRounds: () => {
    const [, setTick] = React.useState(0);
    return { state: { ...(h.state as object), canvasSetupEnd: h.setupEnd, canvasSetupReadFailed: h.setupFailed }, loaded: true, refresh: async () => { await h.refreshRounds(); setTick(t => t + 1); } };
  },
}));
vi.mock('@/app/data/event-rounds-service', async importOriginal => ({
  ...(await importOriginal<typeof import('@/app/data/event-rounds-service')>()),
  getRoundPresence: vi.fn(async () => h.presence),
  hostSetRoundPresence: h.hostSetRoundPresence,
  getTranscribingNow: vi.fn().mockResolvedValue(new Set()),
  getRoundSeatKeys: vi.fn().mockResolvedValue(null),
  hostStartRound: h.hostStartRound,
  hostEndRound: h.hostEndRound,
  hostEndRounds: h.hostEndRounds,
  hostSetRoundSeats: h.hostSetRoundSeats,
}));
vi.mock('@/app/data/event-mastermind-service', async importOriginal => ({
  ...(await importOriginal<typeof import('@/app/data/event-mastermind-service')>()),
  getMastermindHostState: h.getMastermindHostState,
  getPreviousSessionPartners: h.getPreviousSessionPartners,
  hostSetObserver: h.hostSetObserver,
  hostSetEventFlow: h.hostSetEventFlow,
  getEveningEnd: h.getEveningEnd,
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

vi.mock('@/app/prototypes/events/use-my-arrival', () => ({
  useMyRegistrationArrivalRead: () => ({ arrival: h.role === 'loading' ? undefined : typeof h.role === 'object' && h.role?.participation ? { owner: h.role.participation !== 'observer', atDoors: true } : null, failed: h.role === 'failed', retry: h.roleRetry }),
}));
vi.mock('@/app/prototypes/events/prep/use-event-canvas-step', () => ({
  useEventCanvasStep: () => ({
    loaded: true, readFailed: false, retry: vi.fn(), busy: false, published: [], selected: null, setPicked: vi.fn(), dialog: null,
    view: h.stepShared
      ? { state: 'E', title: 'shared', body: '', primary: null, secondary: null }
      : { state: 'A', title: 'Create', body: '', primary: { id: 'create', label: 'Create your canvas', run: h.startRun }, secondary: null },
  }),
}));

import { EventHostPage } from '@/app/prototypes/events/rounds/EventHostPage';
import { CanvasSetupPhoneCard } from '@/app/prototypes/events/rounds/CanvasSetupParts';
import { RoomSteps } from '@/app/prototypes/events/rounds/RoomSteps';
import { hiddenRoomSteps } from '@/app/prototypes/events/rounds/hidden-room-steps';
import { setupCounts, setupPhase } from '@/app/prototypes/events/rounds/canvas-setup';
import { canvasTimingOf } from '@/app/types/event-fields';

const MIN = 60_000;
const member = (key: string, name: string) =>
  ({ id: `m-${key}`, profileId: `p-${key}`, displayName: name, profileSlug: key, profileHasPledged: false } as unknown as EventRoomMember);
const ROSTER = [member('a', 'Ana Brown'), member('b', 'Ben Cole'), member('c', 'Cat Dunn'), member('d', 'Dan Eve'), member('e', 'Eva Fox')];
const person = (key: string, over: Partial<MastermindPerson> = {}): MastermindPerson => ({
  profileId: `p-${key}`, canvasName: `canvas_${key}`, canvasTitle: null, canvasShared: true, observerOverride: null,
  participation: 'canvas_before', observerPrep: null, registered: true, waitingPosition: null, name: null, phone: 'usbc', recordingOn: false, lastWordsAt: null, ...over,
});
const PEOPLE = [person('a'), person('b'), person('c'), person('d'), person('e', { canvasName: null, canvasShared: false })];

function renderHost(opts: { canvasTiming?: string; search?: string } = {}) {
  h.event = { id: 'ev-1', hostId: 'host-1', title: 'Evening', slug: 'night', statementTag: null, flow: 'sales-mastermind', seriesSlug: undefined, ...(opts.canvasTiming ? { canvasTiming: opts.canvasTiming } : {}) };
  return render(
    <MemoryRouter initialEntries={[`/events/night/host${opts.search ?? ''}`]}>
      <Routes><Route path="/events/:slug/host" element={<EventHostPage />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  try { localStorage.clear(); } catch { /* none */ }
  h.roster = ROSTER;
  h.state = { rounds: [], seatsByRound: new Map(), topics: new Map() } satisfies EventRoundsState;
  h.hostState = new Map(PEOPLE.map(p => [p.profileId, p]));
  h.setupEnd = null;
  h.setupFailed = false;
  h.getMastermindHostState.mockImplementation(async () => h.hostState);
  h.getPreviousSessionPartners.mockResolvedValue([]);
  h.getEveningEnd.mockResolvedValue(null);
  h.getWaitlistPublic.mockResolvedValue([]);
  h.refreshRounds.mockResolvedValue(undefined);
  h.hostStartCanvasSetup.mockImplementation(async (_e: string, s: number) => { h.setupEnd = Date.now() + s * 1000; return h.setupEnd; });
  h.hostEndCanvasSetup.mockImplementation(async () => { h.setupEnd = Date.now() - 1; });
  h.presence = new Map();
});
afterEach(() => { cleanup(); });

describe('pure rules', () => {
  it('the canvas is at the event unless the event says before', () => {
    expect(canvasTimingOf(undefined)).toBe('at_event');
    expect(canvasTimingOf('before')).toBe('before');
  });
  it('phase: unread is off, never started is before, skipped is off, end ahead is running, past is over', () => {
    const now = 1000;
    expect(setupPhase({ applies: true, endsAt: undefined, now })).toBe('off');
    expect(setupPhase({ applies: true, endsAt: null, now })).toBe('before');
    expect(setupPhase({ applies: true, endsAt: null, now, skip: true })).toBe('off');
    expect(setupPhase({ applies: true, endsAt: 2000, now })).toBe('running');
    expect(setupPhase({ applies: true, endsAt: 500, now })).toBe('over');
    expect(setupPhase({ applies: false, endsAt: 2000, now })).toBe('off');
  });
  it('the count leaves out observers and the waiting list', () => {
    const people = [...PEOPLE, person('o', { participation: 'observer', canvasShared: false }), person('w', { waitingPosition: 1, canvasShared: false })];
    expect(setupCounts(people)).toEqual({ n: 4, m: 5 });
  });
});

describe('the host: primary order before round 1', () => {
  it('Start canvas setup, then End setup with the count and the time left, then Preview round 1 tables', async () => {
    renderHost();
    await waitFor(() => expect(screen.getByTestId('host-primary').textContent).toBe('Start canvas setup'));
    fireEvent.click(screen.getByTestId('host-primary'));
    await waitFor(() => expect(h.hostStartCanvasSetup).toHaveBeenCalledWith('ev-1', 10 * 60));
    await waitFor(() => expect(screen.getByTestId('host-primary').textContent).toBe('End setup'));
    expect(screen.getByTestId('host-canvas-setup-count').textContent).toBe('4 of 5 have a Clarity Canvas');
    expect(screen.getByTestId('host-canvas-setup-left').textContent).toMatch(/10:00 left|9:5\d left/);
    fireEvent.click(screen.getByTestId('host-primary'));
    await waitFor(() => expect(h.hostEndCanvasSetup).toHaveBeenCalledWith('ev-1'));
    await waitFor(() => expect(screen.getByTestId('host-primary').textContent).toBe('Preview round 1 tables'));
    expect(screen.queryByTestId('host-canvas-setup')).toBeNull();
  });

  it('time running out does not block: a setup past its end offers the preview', async () => {
    h.setupEnd = Date.now() - MIN;
    renderHost();
    await waitFor(() => expect(screen.getByTestId('host-primary').textContent).toBe('Preview round 1 tables'));
  });

  it('a failed first read: Retry is the primary, never the preview; Skip setup is the host\'s own choice', async () => {
    h.setupEnd = undefined as never;
    h.setupFailed = true;
    renderHost();
    await waitFor(() => expect(screen.getByTestId('host-primary').textContent).toBe('Retry reading canvas setup'));
    fireEvent.click(screen.getByTestId('host-canvas-setup-skip'));
    await waitFor(() => expect(screen.getByTestId('host-primary').textContent).toBe('Preview round 1 tables'));
  });

  it('0 minutes skips the part', async () => {
    localStorage.setItem('p1337-host-settings:ev-1', JSON.stringify({ canvasSetupS: 0, mastermindMinutesV: 3 }));
    renderHost();
    await waitFor(() => expect(screen.getByTestId('host-primary').textContent).toBe('Preview round 1 tables'));
  });

  it('canvas made before the event: no setup part and no read of it', async () => {
    renderHost({ canvasTiming: 'before' });
    await waitFor(() => expect(screen.getByTestId('host-primary').textContent).toBe('Preview round 1 tables'));
  });

  it('the duration is set in Next round settings, in minutes, 0 allowed', async () => {
    renderHost();
    await screen.findByTestId('host-canvas-setup-setting');
    expect(screen.getByTestId('host-canvas-setup-minutes').textContent).toBe('10 min');
    fireEvent.click(screen.getByLabelText('Canvas setup: one minute less'));
    expect(screen.getByTestId('host-canvas-setup-minutes').textContent).toBe('9 min');
  });
});

describe('the projector', () => {
  it('shows Make your Clarity Canvas, one countdown and the line while it runs', async () => {
    h.setupEnd = Date.now() + 10 * MIN;
    renderHost({ search: '?view=screen' });
    const s = await screen.findByTestId('screen-canvas-setup');
    expect(within(s).getByTestId('screen-part').textContent).toBe('Make your Clarity Canvas');
    expect(within(s).getByTestId('screen-canvas-setup-clock').textContent).toMatch(/^(10:00|9:5\d)$/);
    expect(s.textContent).toContain('Open your phone: your mirror agent helps you write it. Share it with the event when it is ready.');
  });
  it('shows nothing of it when the part is not running', async () => {
    renderHost({ search: '?view=screen' });
    await screen.findByTestId('host-screen');
    expect(screen.queryByTestId('screen-canvas-setup')).toBeNull();
  });
});

describe('the phone card per role', () => {
  const run = (participation: string | null, shared = false) => {
    h.role = participation === 'loading' || participation === 'failed' ? participation : { participation, observerPrep: null };
    h.stepShared = shared;
    return render(<CanvasSetupPhoneCard eventId="ev-1" event={{ id: 'ev-1', flow: 'sales-mastermind' }} self={{ id: 'm', profileId: 'p-a' } as never} />);
  };
  it('an owner: one primary, Open your mirror agent', () => {
    run('canvas_at_doors');
    expect(screen.getByTestId('canvas-setup-primary').textContent).toBe('Open your mirror agent');
    fireEvent.click(screen.getByTestId('canvas-setup-primary'));
    expect(h.startRun).toHaveBeenCalled();
  });
  it('shared: the sentence, no button', () => {
    run('canvas_at_doors', true);
    expect(screen.getByTestId('canvas-setup-shared').textContent).toBe('Your Clarity Canvas is shared with this event \u2713');
    expect(screen.queryByTestId('canvas-setup-primary')).toBeNull();
  });
  it('role still loading: the title and a quiet line, no button', () => {
    run('loading');
    expect(screen.getByTestId('canvas-setup-loading')).toBeTruthy();
    expect(screen.queryByTestId('canvas-setup-primary')).toBeNull();
  });
  it('role unreadable: the neutral card with the button and a Retry, never an observer or owner-specific line', () => {
    run('failed');
    expect(screen.getByTestId('canvas-setup-primary')).toBeTruthy();
    fireEvent.click(screen.getByTestId('canvas-setup-role-retry'));
    expect(h.roleRetry).toHaveBeenCalled();
    expect(screen.queryByTestId('canvas-setup-observer')).toBeNull();
  });
  it('an observer: the help line and no button', () => {
    run('observer');
    expect(screen.getByTestId('canvas-setup-observer').textContent).toBe('Help the people next to you make their canvas');
    expect(screen.queryByTestId('canvas-setup-primary')).toBeNull();
  });
});

describe('the room step bar', () => {
  const bar = (withCanvas: boolean, current: 'principle' | 'canvas' | 'table', done?: boolean) => render(
    <RoomSteps current={current} viewing={current} onSelect={() => {}} hidden={['compare']} withCanvas={withCanvas} canvasDone={withCanvas ? done : undefined} />,
  );
  it('Canvas sits between Principle and Table, only when asked for', () => {
    const { unmount } = bar(true, 'canvas');
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual(['Ready', 'Principle', 'Canvas', 'Table', 'Feedback']);
    unmount();
    bar(false, 'principle');
    expect(screen.queryByTestId('room-step-canvas')).toBeNull();
  });
  it('a shared canvas ticks the step; the hidden-steps rule is unchanged', () => {
    bar(true, 'table', true);
    expect(screen.getByTestId('room-step-canvas').getAttribute('data-state')).toBe('done');
    expect(hiddenRoomSteps({ mastermind: true, room: { readiness: false, rounds: true } } as never).sort()).toEqual(['compare', 'ready']);
  });
});
