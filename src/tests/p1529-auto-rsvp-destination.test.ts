import { describe, it, expect, vi, beforeEach } from 'vitest';

const getEventBySlug = vi.fn();
const isUserRsvpd = vi.fn();
const eventAsksBeforeSeat = vi.fn();
const readRegistrationDraft = vi.fn();
const clearRegistrationDraft = vi.fn();
const trackPostSignupRsvp = vi.fn();
const rawTrack: { fn: (() => Promise<unknown>) | null } = { fn: null };

vi.mock('@/app/data/api', () => ({
  getEventBySlug: (...a: unknown[]) => getEventBySlug(...a),
  isUserRsvpd: (...a: unknown[]) => isUserRsvpd(...a),
}));
vi.mock('@/app/data/event-registration', () => ({
  eventAsksBeforeSeat: (...a: unknown[]) => eventAsksBeforeSeat(...a),
}));
vi.mock('@/app/data/registration-draft', () => ({
  readRegistrationDraft: (...a: unknown[]) => readRegistrationDraft(...a),
  clearRegistrationDraft: (...a: unknown[]) => clearRegistrationDraft(...a),
}));
vi.mock('@/app/prototypes/events/rsvp-analytics', () => ({
  // `rawTrack` bypasses the vi.fn: vitest attaches its own handler to a returned promise, which would mask an unhandled rejection
  trackPostSignupRsvp: (...a: unknown[]) => (rawTrack.fn ? rawTrack.fn() : trackPostSignupRsvp(...a)),
}));

import { autoRsvpDestination } from '@/auth/auto-rsvp-destination';

const SLUG = 'my-event';
const PAGE = `/events/${SLUG}?action=rsvp`;
const CONFIRM = `/events/${SLUG}/confirm`;
const SRC = 'rsvp-link';
const hangs = () => new Promise<never>(() => {});
const within = <T,>(p: Promise<T>) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('blocked on tracking')), 500))]);
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  [getEventBySlug, isUserRsvpd, eventAsksBeforeSeat, readRegistrationDraft, clearRegistrationDraft, trackPostSignupRsvp].forEach((m) => m.mockReset());
  getEventBySlug.mockResolvedValue({ id: 'e1', slug: SLUG });
  eventAsksBeforeSeat.mockResolvedValue(false);
  readRegistrationDraft.mockReturnValue(null);
  isUserRsvpd.mockResolvedValue(false);
  rawTrack.fn = null;
  trackPostSignupRsvp.mockResolvedValue(undefined); // the real one is async
});

describe('autoRsvpDestination', () => {
  it('event not found: null, no tracking', async () => {
    getEventBySlug.mockResolvedValue(null);
    const seat = vi.fn();
    expect(await autoRsvpDestination(SLUG, SRC, seat, vi.fn())).toBeNull();
    expect(seat).not.toHaveBeenCalled();
    expect(trackPostSignupRsvp).not.toHaveBeenCalled();
  });

  describe('one-tap path', () => {
    it('seat false: page, no tracking', async () => {
      expect(await autoRsvpDestination(SLUG, SRC, async () => false, vi.fn())).toBe(PAGE);
      expect(trackPostSignupRsvp).not.toHaveBeenCalled();
    });
    it('seat true: confirm, tracked once', async () => {
      expect(await autoRsvpDestination(SLUG, SRC, async () => true, vi.fn())).toBe(CONFIRM);
      expect(trackPostSignupRsvp).toHaveBeenCalledTimes(1);
      expect(trackPostSignupRsvp).toHaveBeenCalledWith('e1', SLUG, SRC);
    });
    it('does not track before the seat resolves', async () => {
      let resolve!: (v: boolean) => void;
      const seat = () => new Promise<boolean>((r) => { resolve = r; });
      const p = autoRsvpDestination(SLUG, SRC, seat, vi.fn());
      await flush();
      expect(trackPostSignupRsvp).not.toHaveBeenCalled();
      resolve(true);
      expect(await p).toBe(CONFIRM);
      expect(trackPostSignupRsvp).toHaveBeenCalledTimes(1);
    });
    it('tracking never blocks the redirect', async () => {
      trackPostSignupRsvp.mockReturnValue(hangs());
      expect(await within(autoRsvpDestination(SLUG, SRC, async () => true, vi.fn()))).toBe(CONFIRM);
    });
    it('a rejecting tracker: confirm, no unhandled rejection', async () => {
      const seen = vi.fn();
      process.on('unhandledRejection', seen);
      try {
        const rejected = Promise.reject(new Error('analytics down'));
        const then = vi.spyOn(rejected, 'then'); // the process listener is not reliable under this env, so also prove a rejection handler was attached
        rawTrack.fn = () => rejected;
        expect(await autoRsvpDestination(SLUG, SRC, async () => true, vi.fn())).toBe(CONFIRM);
        await flush(); await flush();
        expect(seen).not.toHaveBeenCalled();
        expect(then.mock.calls.some((c) => typeof c[1] === 'function')).toBe(true);
      } finally { process.off('unhandledRejection', seen); }
    });
    it('session loss in the seat propagates, not tracked', async () => {
      const err = new Error('session lost');
      await expect(autoRsvpDestination(SLUG, SRC, async () => { throw err; }, vi.fn())).rejects.toBe(err);
      expect(trackPostSignupRsvp).not.toHaveBeenCalled();
    });
    it('eventAsksBeforeSeat rejecting is treated as false', async () => {
      eventAsksBeforeSeat.mockRejectedValue(new Error('boom'));
      const seat = vi.fn().mockResolvedValue(true);
      expect(await autoRsvpDestination(SLUG, SRC, seat, vi.fn())).toBe(CONFIRM);
      expect(seat).toHaveBeenCalledTimes(1);
    });
  });

  describe('asks-before-seat path', () => {
    beforeEach(() => eventAsksBeforeSeat.mockResolvedValue(true));
    const draft = { intent: 'register', answers: { q: 'a' } };

    it.each([
      ['ok', true],
      ['already', false],
    ])('registerWith %s: confirm, draft cleared, tracked=%s', async (result, tracked) => {
      readRegistrationDraft.mockReturnValue(draft);
      const registerWith = vi.fn().mockResolvedValue(result);
      expect(await autoRsvpDestination(SLUG, SRC, vi.fn(), registerWith)).toBe(CONFIRM);
      expect(clearRegistrationDraft).toHaveBeenCalledWith(SLUG);
      expect(trackPostSignupRsvp).toHaveBeenCalledTimes(tracked ? 1 : 0);
      if (tracked) expect(trackPostSignupRsvp).toHaveBeenCalledWith('e1', SLUG, SRC);
    });

    it.each(['full', 'failed', 'cancelled'])('registerWith %s: page, draft kept, not tracked', async (result) => {
      readRegistrationDraft.mockReturnValue(draft);
      const registerWith = vi.fn().mockResolvedValue(result);
      expect(await autoRsvpDestination(SLUG, SRC, vi.fn(), registerWith)).toBe(PAGE);
      expect(clearRegistrationDraft).not.toHaveBeenCalled();
      expect(trackPostSignupRsvp).not.toHaveBeenCalled();
    });

    it('no draft, already registered: confirm, not tracked', async () => {
      isUserRsvpd.mockResolvedValue(true);
      expect(await autoRsvpDestination(SLUG, SRC, vi.fn(), vi.fn(), 'u1')).toBe(CONFIRM);
      expect(trackPostSignupRsvp).not.toHaveBeenCalled();
    });
    it('no draft, not registered: page', async () => {
      expect(await autoRsvpDestination(SLUG, SRC, vi.fn(), vi.fn(), 'u1')).toBe(PAGE);
      expect(trackPostSignupRsvp).not.toHaveBeenCalled();
    });
    it('registerWith gets the event and the draft answers', async () => {
      readRegistrationDraft.mockReturnValue(draft);
      const registerWith = vi.fn().mockResolvedValue('ok');
      await autoRsvpDestination(SLUG, SRC, vi.fn(), registerWith);
      expect(registerWith).toHaveBeenCalledWith({ id: 'e1', slug: SLUG }, draft.answers);
    });
    it('waiting-list draft: page, no read of the seat, not tracked, draft kept', async () => {
      readRegistrationDraft.mockReturnValue({ intent: 'waitlist', answers: { q: 'a' } });
      const registerWith = vi.fn();
      expect(await autoRsvpDestination(SLUG, SRC, vi.fn(), registerWith, 'u1')).toBe(PAGE);
      expect(isUserRsvpd).not.toHaveBeenCalled();
      expect(registerWith).not.toHaveBeenCalled();
      expect(trackPostSignupRsvp).not.toHaveBeenCalled();
      expect(clearRegistrationDraft).not.toHaveBeenCalled();
    });
    it('no draft, no userId: page, isUserRsvpd not called', async () => {
      expect(await autoRsvpDestination(SLUG, SRC, vi.fn(), vi.fn())).toBe(PAGE);
      expect(isUserRsvpd).not.toHaveBeenCalled();
    });
    it('no draft, isUserRsvpd rejects: page', async () => {
      isUserRsvpd.mockRejectedValue(new Error('read failed'));
      expect(await autoRsvpDestination(SLUG, SRC, vi.fn(), vi.fn(), 'u1')).toBe(PAGE);
    });
    it('does not track before registerWith resolves to ok', async () => {
      readRegistrationDraft.mockReturnValue(draft);
      let resolve!: (v: string) => void;
      const registerWith = () => new Promise<string>((r) => { resolve = r; });
      const p = autoRsvpDestination(SLUG, SRC, vi.fn(), registerWith as never);
      await flush();
      expect(trackPostSignupRsvp).not.toHaveBeenCalled();
      resolve('ok');
      expect(await p).toBe(CONFIRM);
      expect(trackPostSignupRsvp).toHaveBeenCalledTimes(1);
    });
    it('tracking never blocks the redirect', async () => {
      readRegistrationDraft.mockReturnValue(draft);
      trackPostSignupRsvp.mockReturnValue(hangs());
      expect(await within(autoRsvpDestination(SLUG, SRC, vi.fn(), vi.fn().mockResolvedValue('ok')))).toBe(CONFIRM);
    });
    it('a rejecting tracker: confirm, no unhandled rejection', async () => {
      readRegistrationDraft.mockReturnValue(draft);
      const seen = vi.fn();
      process.on('unhandledRejection', seen);
      try {
        const rejected = Promise.reject(new Error('analytics down'));
        const then = vi.spyOn(rejected, 'then'); // the process listener is not reliable under this env, so also prove a rejection handler was attached
        rawTrack.fn = () => rejected;
        expect(await autoRsvpDestination(SLUG, SRC, vi.fn(), vi.fn().mockResolvedValue('ok'))).toBe(CONFIRM);
        await flush(); await flush();
        expect(seen).not.toHaveBeenCalled();
        expect(then.mock.calls.some((c) => typeof c[1] === 'function')).toBe(true);
      } finally { process.off('unhandledRejection', seen); }
    });
    it('session loss in registerWith propagates: not tracked, draft kept', async () => {
      readRegistrationDraft.mockReturnValue(draft);
      const err = new Error('session lost');
      await expect(autoRsvpDestination(SLUG, SRC, vi.fn(), vi.fn().mockRejectedValue(err))).rejects.toBe(err);
      expect(trackPostSignupRsvp).not.toHaveBeenCalled();
      expect(clearRegistrationDraft).not.toHaveBeenCalled();
    });
  });
});
