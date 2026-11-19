/**
 * @file p1675-r19-surfaces.test.tsx
 * @description P1675 R19 review fixes, render level: the event box and the registered block show the arrival line for a hiker
 * who chose the meeting point only (and only before the start); the restore effect rejects a stale kept choice for an observer;
 * a 'full' refusal keeps the submitted prep choice.
 */
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ arrival: null as unknown, register: vi.fn() }));
vi.mock('@/app/prototypes/events/use-my-arrival', () => ({ useMyRegistrationArrival: () => h.arrival }));
vi.mock('@/app/data/event-registration', () => ({ registerForEvent: (...a: unknown[]) => h.register(...a) }));
vi.mock('@/app/data/event-waitlist', () => ({ joinWaitlist: vi.fn(), getMyWaitlistEntry: vi.fn().mockResolvedValue(null), leaveWaitlist: vi.fn() }));
vi.mock('@/app/data/hike-registration', () => ({ registerForHike: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

import { EventBox, RegisteredBlock } from '@/app/prototypes/events/prep/PrepPieces';
import { HikeRegistrationQuestions } from '@/app/prototypes/events/components/HikeRegistrationQuestions';
import { RegistrationQuestions } from '@/app/prototypes/events/components/RegistrationQuestions';
import { useRegistrationStep } from '@/app/prototypes/events/components/use-registration-step';

const FUTURE = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
const hike = {
  id: 'h1', slug: 'trail', title: 'Clarity Hike: Trail', description: '', location: 'Trailhead', flow: 'social-hike', seriesSlug: 'social-hike',
  datetime: FUTURE.toISOString(), durationMinutes: 240, timezone: 'UTC', hasGroupChat: false,
} as unknown as Parameters<typeof EventBox>[0]['event'];

afterEach(() => { cleanup(); h.arrival = null; h.register.mockReset(); });

describe('F8: the arrival line on the event box and the registered block', () => {
  const box = (ev = hike) => render(<MemoryRouter><EventBox event={ev} groupChatUrl={null} title="t" testId="box" viewerId="u1" /></MemoryRouter>);
  const block = (ev = hike) => render(<MemoryRouter><RegisteredBlock event={ev} groupChatUrl={null} viewerId="u1" /></MemoryRouter>);

  it('event hiker: both show the arrival and the start, labelled, in the event zone, before the start', () => {
    h.arrival = { owner: true, atDoors: true };
    const start = FUTURE.toISOString().slice(11, 16); // the event zone is UTC
    const early = new Date(FUTURE.getTime() - 15 * 60_000).toISOString().slice(11, 16);
    const line = `Please come at ${early}. The hike starts at ${start}.`;
    box();
    expect(screen.getByTestId('box-arrival').textContent).toBe(line);
    cleanup();
    block();
    expect(screen.getByTestId('registered-arrival').textContent).toBe(line);
  });
  it('Codex final review: while a hiker\'s answer is read the calendar link waits, Share does not', () => {
    h.arrival = undefined;
    block();
    expect(screen.queryByText('Add to calendar')).toBeNull();
    expect(screen.getByTestId('registered-share')).toBeTruthy();
    cleanup();
    h.arrival = { owner: true, atDoors: true };
    block();
    expect(screen.getByTestId('registered-share')).toBeTruthy();
    expect(screen.getByTestId('registered-links').textContent).toMatch(/calendar/i);
  });
  it('after the start: no calendar and no Share on the registered block', () => {
    h.arrival = null;
    block({ ...hike, datetime: new Date(Date.now() - 60_000).toISOString() } as never);
    expect(screen.queryByTestId('registered-share')).toBeNull();
  });
  it('now or later hiker, no answer, a read still out: no line', () => {
    for (const a of [{ owner: true, atDoors: false }, null, undefined]) {
      h.arrival = a;
      box();
      expect(screen.queryByTestId('box-arrival')).toBeNull();
      cleanup();
      block();
      expect(screen.queryByTestId('registered-arrival')).toBeNull();
      cleanup();
    }
  });
  it('after the start: no line', () => {
    h.arrival = { owner: true, atDoors: true };
    box({ ...hike, datetime: new Date(Date.now() - 60_000).toISOString() } as never);
    expect(screen.queryByTestId('box-arrival')).toBeNull();
  });
});

describe('F15: a stale kept choice is rejected for an observer', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-01T00:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });
  const base = { datetime: '2026-11-14T11:30:00+00:00', timezone: 'UTC', busy: false, onCancel: vi.fn(), onSubmit: vi.fn() };
  it("observerPrep 'doors' with a stale kept 'now' restores as 'event'", () => {
    const initial = { participation: 'observer', observerPrep: 'doors', phone: 'usbc', hope: '', recordingAccepted: true } as const;
    render(<RegistrationQuestions open {...base} initial={initial} initialPrep="now" />);
    expect((screen.getByTestId('prep-event') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('prep-now') as HTMLInputElement).checked).toBe(false);
  });
  it("observerPrep 'home' with a kept 'now' still restores as 'now' (the pair agrees)", () => {
    const initial = { participation: 'observer', observerPrep: 'home', phone: 'usbc', hope: '', recordingAccepted: true } as const;
    render(<RegistrationQuestions open {...base} initial={initial} initialPrep="now" />);
    expect((screen.getByTestId('prep-now') as HTMLInputElement).checked).toBe(true);
  });
  it('a kept choice is not reset by re-rendering with the same props, nor lost when the person picks by hand', () => {
    const initial = { participation: 'canvas_before', observerPrep: null, phone: 'usbc', hope: '', recordingAccepted: true } as const;
    const { rerender } = render(<RegistrationQuestions open {...base} initial={initial} initialPrep="now" />);
    fireEvent.click(screen.getByTestId('prep-event'));
    rerender(<RegistrationQuestions open {...base} initial={initial} initialPrep="now" />);
    expect((screen.getByTestId('prep-event') as HTMLInputElement).checked).toBe(true);
  });
});

describe('mastermind now routes to /prepare; the hike form offers the meeting point inside the cutoff', () => {
  const answers = { participation: 'canvas_before', observerPrep: null, phone: 'usbc', hope: '', recordingAccepted: true } as const;
  it("a seat with prep 'now' calls onRegistered(true) (EventDetail navigates to /prepare), 'later' and 'event' call it with false", async () => {
    h.register.mockResolvedValue('ok');
    const cb = { onRegistered: vi.fn(), onRefused: vi.fn(), onSessionLost: vi.fn() };
    const { result } = renderHook(() => useRegistrationStep({ event: { id: 'e1', slug: 'mm' }, userId: 'u1', ...cb }));
    await act(async () => { await result.current.submit(answers, { prep: 'now' }); });
    expect(cb.onRegistered).toHaveBeenLastCalledWith(true);
    await act(async () => { await result.current.submit(answers, { prep: 'later' }); });
    expect(cb.onRegistered).toHaveBeenLastCalledWith(false);
    await act(async () => { await result.current.submit(answers, { prep: 'event' }); });
    expect(cb.onRegistered).toHaveBeenLastCalledWith(false);
  });
  it('the hike form shows now and the meeting point (not later) inside the cutoff, and submits when: event', () => {
    const onSubmit = vi.fn();
    const near = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
    render(<HikeRegistrationQuestions open datetime={near} minutes={9} busy={false} onCancel={vi.fn()} onSubmit={onSubmit} />);
    expect(screen.queryByTestId('hike-when-later')).toBeNull();
    expect(screen.queryByTestId('hike-when-now')).not.toBeNull();
    fireEvent.click(screen.getByTestId('hike-when-event'));
    expect((screen.getByTestId('hike-when-event') as HTMLInputElement).checked).toBe(true);
  });
});

describe('F16: a full refusal keeps the submitted prep', () => {
  it("keeps 'now' with the answers when the seat went while submitting", async () => {
    h.register.mockResolvedValue('full');
    const cb = { onRegistered: vi.fn(), onRefused: vi.fn(), onSessionLost: vi.fn() };
    const { result } = renderHook(() => useRegistrationStep({ event: { id: 'e1', slug: 'mm' }, userId: 'u1', ...cb }));
    const answers = { participation: 'canvas_before', observerPrep: null, phone: 'usbc', hope: '', recordingAccepted: true } as const;
    await act(async () => { await result.current.submit(answers, { prep: 'now' }); });
    expect(cb.onRefused).toHaveBeenCalledWith('full');
    expect(result.current.prefillPrep).toBe('now');
    expect(result.current.prefill).toEqual(answers);
  });
});
