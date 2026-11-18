// @vitest-environment jsdom
/**
 * P1675 UAT round 1 R6, moved to R18 (client side): the event's before-the-seat preset (hike_registration) reaches the answer model,
 * its validator, the signed-out draft, the registration step and return hooks, the RPC caller and the host line; Edit shows the
 * one four-way choice for hikes only; changing it never sends the "event updated" email.
 */
import { renderHook, render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = (rel: string) => readFileSync(join(process.cwd(), 'src/app', rel), 'utf8');

const h = vi.hoisted(() => ({ rpc: vi.fn(), hike: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => h.rpc(...a) } }));
vi.mock('@/lib/list-return-cache', () => ({ clearListReturnCache: vi.fn() }));
vi.mock('@/lib/event-emails', () => ({ invokeEventEmails: vi.fn() }));
vi.mock('@/lib/session-guard', () => ({
  guardSeatWrite: async () => true,
  isAnonymousRlsDenial: () => false,
  isSessionMismatch: () => false,
  SessionMismatchError: class SessionMismatchError extends Error {},
}));
vi.mock('@/app/data/db-error-logger', () => ({ logDbError: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock('@/app/data/event-registration', () => ({ registerForEvent: vi.fn() }));
vi.mock('@/app/data/event-waitlist', () => ({ joinWaitlist: vi.fn(), getMyWaitlistEntry: vi.fn().mockResolvedValue(null), leaveWaitlist: vi.fn() }));
vi.mock('@/app/data/events-service', () => ({ eventsService: { isEventFull: () => false } }));

import { SILENT_KEYS, updateNeedsEmail } from '@/app/data/event-update-changes';
import {
  DEFAULT_HIKE_REGISTRATION, hikeAsksOf, hikeRegistrationOf, isAsked, isValidHikeAnswers, normalizeHikeAnswers, type HikeAnswers, type HikeAsks,
} from '@/app/data/hike-answer-model';
import { eventAsksBeforeSeatSync, hikeAsksBeforeSeat } from '@/app/prototypes/events/form-first';
import { registerForHike } from '@/app/data/hike-registration';
import { readHikeDraft, saveHikeDraft } from '@/app/data/registration-draft';
import { useRegistrationStep } from '@/app/prototypes/events/components/use-registration-step';
import { useRegistrationReturn } from '@/app/prototypes/events/components/use-registration-return';
import { HikeQuestionsFields } from '@/app/prototypes/events/prep/HikeQuestionsFields';
import { eventUpdateColumns } from '@/app/data/event-write-columns';
import { eventOptionalCreateColumns } from '@/app/data/event-create-columns';

const NO_TRANSPORT: HikeAsks = { transport: false, help: true };
const NO_ASKS: HikeAsks = { transport: false, help: false }; // the 'when' preset
const NO_HELP: HikeAsks = { transport: true, help: false };
const BARE: HikeAnswers = { when: 'now', transport: null, freeSeats: null, help: null, helpOther: null };

beforeEach(() => { localStorage.clear(); h.rpc.mockReset(); h.hike.mockReset(); });

describe('answer model with the event settings', () => {
  it('hikeRegistrationOf defaults an absent or unknown value to all', () => {
    expect(hikeRegistrationOf({})).toBe('all');
    expect(hikeRegistrationOf(null)).toBe('all');
    expect(hikeRegistrationOf({ hikeRegistration: 'nonsense' })).toBe('all');
    expect(hikeRegistrationOf({ hikeRegistration: 'optional' })).toBe('optional');
    expect(DEFAULT_HIKE_REGISTRATION).toBe('all');
  });

  it('hikeAsksOf is derived from the preset', () => {
    expect(hikeAsksOf({ hikeRegistration: 'when' })).toEqual({ transport: false, help: false });
    expect(hikeAsksOf({ hikeRegistration: 'when_transport' })).toEqual({ transport: true, help: false });
    expect(hikeAsksOf({ hikeRegistration: 'all' })).toEqual({ transport: true, help: true });
    expect(hikeAsksOf({ hikeRegistration: 'optional' })).toEqual({ transport: false, help: false });
    expect(hikeAsksOf({})).toEqual({ transport: true, help: true });
    expect(hikeAsksOf(null)).toEqual({ transport: true, help: true });
  });

  it('hikeAsksBeforeSeat and the shared form-first helper follow the preset and the flow', () => {
    const hike = { seriesSlug: 'social-hike', flow: 'social-hike' };
    expect(hikeAsksBeforeSeat({ ...hike, hikeRegistration: 'optional' })).toBe(false);
    expect(hikeAsksBeforeSeat({ ...hike, hikeRegistration: 'when' })).toBe(true);
    expect(hikeAsksBeforeSeat({ ...hike })).toBe(true);
    expect(hikeAsksBeforeSeat({ seriesSlug: 'clarity-night', flow: 'clarity-night' })).toBe(false);
    expect(eventAsksBeforeSeatSync({ ...hike, hikeRegistration: 'optional' })).toBe(false);
    expect(eventAsksBeforeSeatSync({ ...hike, hikeRegistration: 'all' })).toBe(true);
    expect(eventAsksBeforeSeatSync({ flow: 'sales-mastermind' })).toBe(true);
    expect(eventAsksBeforeSeatSync({ flow: 'clarity-night' })).toBe(false);
  });

  it('transport off: null transport and seats are valid; a transport answer is not', () => {
    expect(isValidHikeAnswers(BARE, NO_TRANSPORT)).toBe(true);
    expect(isValidHikeAnswers({ ...BARE, transport: 'car', freeSeats: 1 }, NO_TRANSPORT)).toBe(false);
    expect(isValidHikeAnswers(BARE)).toBe(false); // asked by default: transport is required
  });

  it('help off: only a null help is valid', () => {
    const a = { ...BARE, transport: 'bike_or_foot' as const };
    expect(isValidHikeAnswers(a, NO_HELP)).toBe(true);
    expect(isValidHikeAnswers({ ...a, help: 'lead' }, NO_HELP)).toBe(false);
  });

  it('normalize nulls what is not asked, and drops Transport lead without a ride', () => {
    const wide: HikeAnswers = { when: 'now', transport: 'need_ride', freeSeats: null, help: 'transport_lead', helpOther: null };
    expect(normalizeHikeAnswers(wide, NO_TRANSPORT)).toEqual({ ...wide, transport: null, help: null });
    expect(normalizeHikeAnswers(wide, NO_HELP)).toEqual({ ...wide, help: null });
  });
});

describe('RPC caller sends null for questions not asked', () => {
  it('transport off: transport and seats null whatever the form held', async () => {
    h.rpc.mockResolvedValue({ data: 'ok', error: null, status: 200 });
    await registerForHike({ id: 'e1', slug: 'hike-1' }, 'u1', { when: 'now', transport: 'car', freeSeats: 3, help: 'lead', helpOther: null }, NO_TRANSPORT);
    expect(h.rpc).toHaveBeenCalledWith('register_for_hike', {
      p_slug: 'hike-1', p_when: 'now', p_transport: null, p_free_seats: null, p_help: 'lead', p_help_other: null,
    });
  });

  it('help off: help and Other null', async () => {
    h.rpc.mockResolvedValue({ data: 'ok', error: null, status: 200 });
    await registerForHike({ id: 'e1', slug: 'hike-1' }, 'u1', { when: 'now', transport: 'bike_or_foot', freeSeats: null, help: 'other', helpOther: 'x' }, NO_HELP);
    expect(h.rpc).toHaveBeenCalledWith('register_for_hike', {
      p_slug: 'hike-1', p_when: 'now', p_transport: 'bike_or_foot', p_free_seats: null, p_help: null, p_help_other: null,
    });
  });
});

describe('signed-out draft round trip', () => {
  it('a transport-off draft survives and reads back only under the same settings', () => {
    expect(saveHikeDraft('walk', BARE, NO_TRANSPORT)).toBe(true);
    expect(readHikeDraft('walk', NO_TRANSPORT)).toEqual(BARE);
  });

  it('a draft saved while a question was on survives the host turning it off (normalised on read)', () => {
    const wide: HikeAnswers = { when: 'now', transport: 'need_ride', freeSeats: null, help: 'transport_lead', helpOther: null };
    localStorage.setItem('cp:registration-draft:walk', JSON.stringify({ slug: 'walk', kind: 'hike', intent: 'register', answers: wide, savedAt: Date.now() }));
    expect(readHikeDraft('walk', NO_TRANSPORT)).toEqual({ ...wide, transport: null, help: null });
  });

  it('a draft missing an answer that is now required is still refused and removed', () => {
    localStorage.setItem('cp:registration-draft:walk', JSON.stringify({ slug: 'walk', kind: 'hike', intent: 'register', answers: BARE, savedAt: Date.now() }));
    expect(readHikeDraft('walk')).toBeNull(); // transport is asked by default and the draft has none
    expect(localStorage.getItem('cp:registration-draft:walk')).toBeNull();
  });

  it('a draft that does not fit the event settings is refused and removed', () => {
    saveHikeDraft('walk', BARE, NO_TRANSPORT);
    expect(readHikeDraft('walk')).toBeNull(); // the event now asks transport: null transport is invalid
    expect(localStorage.getItem('cp:registration-draft:walk')).toBeNull();
  });
});

describe('registration step and return hooks', () => {
  function mount(userId: string | undefined, asks: HikeAsks) {
    const cb = { onRegistered: vi.fn(), onRefused: vi.fn(), onSessionLost: vi.fn(), onHikeRegistered: vi.fn(), onSignIn: vi.fn() };
    return { ...renderHook(() => useRegistrationStep({ event: { id: 'e1', slug: 'walk' }, userId, hikeAsks: asks, ...cb })), cb };
  }

  it('signed out, transport off: the answers are kept as a draft that reads back', async () => {
    const { result, cb } = mount(undefined, NO_TRANSPORT);
    await act(async () => { await result.current.submitHike(BARE); });
    expect(cb.onSignIn).toHaveBeenCalledTimes(1);
    expect(readHikeDraft('walk', NO_TRANSPORT)).toEqual(BARE);
  });

  it('the return hook reads the draft under the event settings and submits it', async () => {
    saveHikeDraft('hike-1', BARE, NO_ASKS);
    const registration = { askHike: vi.fn(), keepHikeAnswers: vi.fn(), submitHike: vi.fn().mockResolvedValue(true) };
    const event = { id: 'e1', slug: 'hike-1', seriesSlug: 'social-hike', status: 'published', hikeRegistration: 'when', datetime: new Date(Date.now() + 5 * 864e5).toISOString() };
    renderHook(() => useRegistrationReturn({
      searchParams: new URLSearchParams('action=rsvp'), setSearchParams: vi.fn(), isLoggedIn: true, event: event as never,
      loading: false, asksBeforeSeat: true, isRsvpd: false, isHostOfEvent: false, registration: registration as never,
    }));
    await waitFor(() => expect(registration.submitHike).toHaveBeenCalledWith(BARE));
    expect(registration.askHike).not.toHaveBeenCalled();
  });

  it('now_only redraw keeps the other answers of a transport-off hike', async () => {
    h.rpc.mockResolvedValue({ data: 'now_only', error: null, status: 200 });
    const { result } = mount('u1', NO_TRANSPORT);
    const answers: HikeAnswers = { when: 'later', transport: null, freeSeats: null, help: 'welcomer', helpOther: null };
    await act(async () => { await result.current.submitHike(answers); });
    expect(result.current.asking).toBe(true);
    expect(result.current.nowOnly).toBe(true);
    expect(result.current.hikePrefill).toEqual(answers);
    expect(h.rpc).toHaveBeenCalledWith('register_for_hike', expect.objectContaining({ p_transport: null, p_help: 'welcomer' }));
  });
});

describe('R18 host settings field', () => {
  it('shows the four choices under "Before the seat", the stored one selected', () => {
    render(<HikeQuestionsFields value="when_transport" onChange={vi.fn()} />);
    expect(screen.getByText('Before the seat')).toBeTruthy();
    expect(screen.getByLabelText('Introduction optional: one tap')).toBeTruthy();
    expect(screen.getByLabelText('Introduction required: ask when only')).toBeTruthy();
    expect(screen.getByLabelText("Introduction required: ask when and how they're coming")).toBeTruthy();
    expect(screen.getByLabelText('Introduction required: ask all questions')).toBeTruthy();
    expect((screen.getByTestId('hike-registration-when_transport') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('hike-registration-all') as HTMLInputElement).checked).toBe(false);
  });

  it('reports a change', () => {
    const t = vi.fn();
    render(<HikeQuestionsFields value="all" onChange={t} />);
    fireEvent.click(screen.getByTestId('hike-registration-optional'));
    expect(t).toHaveBeenCalledWith('optional');
  });

  it('Create never shows the fields (a Create-form event is never a hike)', () => {
    // Edit's hike-only display and the keys it sends are asserted by rendering it: p1675-r1-edit-event-render.test.tsx.
    const create = src('prototypes/events/components/CreateEvent.tsx');
    expect(create).not.toMatch(/HikeQuestionsFields|isHikeTitle|hikeAsks/);
  });
});

describe('R6 event columns', () => {
  it('update writes the snake_case columns only when given; create writes neither', () => {
    expect(eventUpdateColumns({ hikeRegistration: 'when' })).toEqual({ hike_registration: 'when' });
    expect(eventUpdateColumns({ title: 'x' })).not.toHaveProperty('hike_registration');
    const create = eventOptionalCreateColumns({ hikeRegistration: 'when' } as never);
    expect(create).not.toHaveProperty('hike_registration');
  });

  it('SILENT_KEYS includes the preset, so changing it never sends the event-updated email', () => {
    expect(SILENT_KEYS).toContain('hike_registration');
    expect(updateNeedsEmail({ hike_registration: 'optional' }, null)).toBe(false);
  });

  it('the shared helper says absent means asked (one shared helper)', () => {
    // Behavioural: the one helper every reader of the column uses (mapper, host line, Edit form) says absent means asked.
    expect(isAsked(undefined)).toBe(true);
    expect(isAsked(null)).toBe(true);
    expect(isAsked(false)).toBe(false);
  });
});
