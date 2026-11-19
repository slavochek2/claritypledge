/**
 * @file p1675-r20-return-hook.test.tsx
 * @description P1675 R20 (round-4 fold): after sign-in the kept UI choice goes to the automatic submit (now routes to the preparation
 * page from it); a kept "later" past the cutoff is dropped and the form asks again instead of submitting.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const h = vi.hoisted(() => ({ full: false }));
vi.mock('@/app/data/events-service', () => ({ eventsService: { isEventFull: () => h.full } }));
vi.mock('@/app/data/events-service-real', () => ({ EVENT_GRACE_HOURS: 12 }));
vi.mock('@/app/prototypes/events/form-first', () => ({ hikeAsksBeforeSeat: () => false }));

import { useRegistrationReturn } from '@/app/prototypes/events/components/use-registration-return';
import { saveRegistrationDraft } from '@/app/data/registration-draft';

const ANSWERS = { participation: 'canvas_before', observerPrep: null, phone: 'usbc', hope: '', recordingAccepted: true } as const;
const event = { slug: 'mm', datetime: '2026-11-14T11:30:00+00:00', status: 'published' } as never;

const mastermind = (canvasTiming: string) => ({ ...(event as object), flow: 'sales-mastermind', canvasTiming }) as never;

function run(ev: never = event) {
  const registration = {
    keepAnswers: vi.fn(), submit: vi.fn(() => Promise.resolve(true)), ask: vi.fn(), markFilled: vi.fn(),
  };
  renderHook(() => useRegistrationReturn({
    searchParams: new URLSearchParams('action=rsvp'), setSearchParams: vi.fn(), isLoggedIn: true, event: ev, loading: false,
    asksBeforeSeat: true, isRsvpd: false, isHostOfEvent: false, registration: registration as never,
  }));
  return registration;
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-01T00:00:00Z')); });
afterEach(() => { vi.useRealTimers(); localStorage.clear(); h.full = false; });

describe('R20 return after sign-in', () => {
  it('submits with the kept choice (now stays now)', () => {
    saveRegistrationDraft('mm', 'register', ANSWERS, Date.now(), 'now');
    const r = run();
    expect(r.submit).toHaveBeenCalledWith(ANSWERS, { prep: 'now' });
  });
  it('a kept later past the cutoff is dropped: the form asks again, nothing is submitted', () => {
    saveRegistrationDraft('mm', 'register', ANSWERS, Date.now(), 'later');
    vi.setSystemTime(new Date('2026-11-13T12:00:00Z'));
    saveRegistrationDraft('mm', 'register', ANSWERS, Date.now(), 'later'); // saved again inside the cutoff, as a late sign-in would find it
    const r = run();
    expect(r.submit).not.toHaveBeenCalled();
    expect(r.ask).toHaveBeenCalledWith(ANSWERS, undefined);
  });

  it('a full event: a waitlist draft with a kept later past the cutoff asks instead of sending; inside the cutoff it sends', () => {
    h.full = true;
    saveRegistrationDraft('mm', 'waitlist', ANSWERS, Date.now(), 'later');
    const early = run();
    expect(early.submit).toHaveBeenCalledWith(ANSWERS, { prep: 'later' });
    localStorage.clear();
    vi.setSystemTime(new Date('2026-11-13T12:00:00Z'));
    saveRegistrationDraft('mm', 'waitlist', ANSWERS, Date.now(), 'later');
    const late = run();
    expect(late.submit).not.toHaveBeenCalled();
    expect(late.ask).toHaveBeenCalledWith(ANSWERS, undefined);
  });

  describe('a legacy draft (no prep) is the old home choice, a kept later, on a canvas-at-the-event mastermind', () => {
    const observerHome = { ...ANSWERS, participation: 'observer', observerPrep: 'home' } as never;
    it.each([['canvas_before', ANSWERS], ['observer home', observerHome]])('%s: past the cutoff it asks, inside it submits', (_n, answers) => {
      vi.setSystemTime(new Date('2026-11-13T12:00:00Z'));
      saveRegistrationDraft('mm', 'register', answers, Date.now());
      const late = run(mastermind('at_event'));
      expect(late.submit).not.toHaveBeenCalled();
      expect(late.ask).toHaveBeenCalledWith(answers, undefined);
      localStorage.clear();
      vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));
      saveRegistrationDraft('mm', 'register', answers, Date.now());
      const early = run(mastermind('at_event'));
      expect(early.submit).toHaveBeenCalled();
    });
    it('with the canvas before the event it still submits past the cutoff (home is a real option there)', () => {
      vi.setSystemTime(new Date('2026-11-13T12:00:00Z'));
      saveRegistrationDraft('mm', 'register', ANSWERS, Date.now());
      const r = run(mastermind('before'));
      expect(r.submit).toHaveBeenCalled();
      expect(r.ask).not.toHaveBeenCalled();
    });
  });
});
