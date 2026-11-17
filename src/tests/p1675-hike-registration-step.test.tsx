// @vitest-environment jsdom
/**
 * P1675: what the registration step does for a hike. A seat with "now" goes to the introduction (the page callback gets the
 * answer); "now_only" reopens the form with only "now" and the other answers kept plus a notice; signed out nothing is sent and the
 * answers are kept across sign-up as a hike draft, which a mastermind reader never takes. The data layer's guards and the close
 * page's routing are pinned alongside.
 */
import { readFileSync } from 'node:fs';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ hike: vi.fn(), toast: vi.fn(), toastError: vi.fn(), rpc: vi.fn(), emails: vi.fn() }));
vi.mock('@/app/data/hike-registration', () => ({ registerForHike: (...a: unknown[]) => h.hike(...a) }));
vi.mock('@/app/data/event-registration', () => ({ registerForEvent: vi.fn() }));
vi.mock('@/app/data/event-waitlist', () => ({ joinWaitlist: vi.fn(), getMyWaitlistEntry: vi.fn().mockResolvedValue(null), leaveWaitlist: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign((m: string) => h.toast(m), { error: (m: string) => h.toastError(m) }) }));

import { useRegistrationStep } from '@/app/prototypes/events/components/use-registration-step';
import { readHikeDraft, readRegistrationDraft, saveRegistrationDraft, DRAFT_TTL_MS } from '@/app/data/registration-draft';
import { isValidHikeAnswers, normalizeHikeAnswers, type HikeAnswers } from '@/app/data/hike-answer-model';
import { HIKE_NOW_ONLY_NOTICE } from '@/app/prototypes/events/components/hike-copy';

const ANSWERS: HikeAnswers = { when: 'later', transport: 'car', freeSeats: 2, help: 'sweep', helpOther: null };

function mount(over: { userId?: string | undefined; onSignIn?: () => void } = {}) {
  const cb = { onRegistered: vi.fn(), onRefused: vi.fn(), onSessionLost: vi.fn(), onHikeRegistered: vi.fn() };
  const opts = { userId: 'u1' as string | undefined, ...over };
  const hook = renderHook(() => useRegistrationStep({ event: { id: 'e1', slug: 'walk' }, ...opts, ...cb }));
  return { ...hook, cb };
}

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });

describe('useRegistrationStep.submitHike', () => {
  it("a seat with 'now' hands 'now' to the page (which goes to the introduction); 'later' hands 'later'", async () => {
    const { result, cb } = mount();
    h.hike.mockResolvedValueOnce('ok');
    await act(async () => { result.current.askHike(); await result.current.submitHike({ ...ANSWERS, when: 'now' }); });
    expect(cb.onHikeRegistered).toHaveBeenCalledWith('now');
    expect(result.current.asking).toBe(false);
    h.hike.mockResolvedValueOnce('already');
    await act(async () => { await result.current.submitHike(ANSWERS); });
    expect(cb.onHikeRegistered).toHaveBeenLastCalledWith('later');
    expect(cb.onRegistered).not.toHaveBeenCalled();
  });

  it("'now_only' reopens the form with only 'now', every other answer kept, and says why", async () => {
    const { result, cb } = mount();
    h.hike.mockResolvedValueOnce('now_only');
    await act(async () => { result.current.askHike(); await result.current.submitHike(ANSWERS); });
    expect(result.current.asking).toBe(true);
    expect(result.current.nowOnly).toBe(true);
    // Every answer is kept; "later" stays in the prefill so the form, which no longer offers it, clears it and the person
    // picks "now" themselves (the form's own test asserts "now" starts unchecked). Review 2026-11-17.
    expect(result.current.hikePrefill).toEqual(ANSWERS);
    expect(h.toast).toHaveBeenCalledWith(HIKE_NOW_ONLY_NOTICE);
    expect(cb.onHikeRegistered).not.toHaveBeenCalled();
  });

  it('full and cancelled go to the page; a failure keeps the step open with the retry toast', async () => {
    const { result, cb } = mount();
    h.hike.mockResolvedValueOnce('full');
    await act(async () => { await result.current.submitHike(ANSWERS); });
    expect(cb.onRefused).toHaveBeenCalledWith('full');
    h.hike.mockResolvedValueOnce('failed');
    await act(async () => { result.current.askHike(); await expect(result.current.submitHike(ANSWERS)).resolves.toBe(false); });
    expect(h.toastError).toHaveBeenCalledWith("Couldn't register you. Please try again.");
    expect(result.current.asking).toBe(true);
  });

  it('signed out: nothing is sent, the answers are kept as a hike draft and sign-up follows', async () => {
    const onSignIn = vi.fn();
    const { result } = mount({ userId: undefined, onSignIn });
    await act(async () => { await result.current.submitHike(ANSWERS); });
    expect(h.hike).not.toHaveBeenCalled();
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(readHikeDraft('walk')).toEqual(ANSWERS);
  });
});

describe('hike draft across sign-in', () => {
  it('round-trips for its own event only, expires, and is validated as hike answers', () => {
    localStorage.setItem('cp:registration-draft:walk', JSON.stringify({ slug: 'walk', kind: 'hike', intent: 'register', answers: ANSWERS, savedAt: Date.now() }));
    expect(readHikeDraft('walk')).toEqual(ANSWERS);
    expect(readHikeDraft('other')).toBeNull();
    expect(readHikeDraft('walk', undefined, Date.now() + DRAFT_TTL_MS + 1)).toBeNull();
    localStorage.setItem('cp:registration-draft:walk', JSON.stringify({ slug: 'walk', kind: 'hike', intent: 'register', answers: { ...ANSWERS, freeSeats: 99 }, savedAt: Date.now() }));
    expect(readHikeDraft('walk')).toBeNull();
    expect(localStorage.getItem('cp:registration-draft:walk')).toBeNull();
  });

  it("a mastermind draft is never read as a hike's, and a hike draft never as a mastermind's", () => {
    saveRegistrationDraft('walk', 'register', { participation: 'observer', observerPrep: 'home', phone: 'usbc', hope: '', recordingAccepted: true });
    expect(readHikeDraft('walk')).toBeNull();
    localStorage.setItem('cp:registration-draft:walk', JSON.stringify({ slug: 'walk', kind: 'hike', intent: 'register', answers: ANSWERS, savedAt: Date.now() }));
    expect(readRegistrationDraft('walk')).toBeNull();
    // The sign-up callback reads with readRegistrationDraft first: the hike draft must survive it for the page to submit.
    expect(readHikeDraft('walk')).toEqual(ANSWERS);
  });
});

describe('hike answer rules', () => {
  it('normalising drops seats for a non-driver, Transport lead without a ride, and Other text without Other', () => {
    expect(normalizeHikeAnswers({ when: 'now', transport: 'bike_or_foot', freeSeats: 4, help: 'transport_lead', helpOther: 'x' }))
      .toEqual({ when: 'now', transport: 'bike_or_foot', freeSeats: null, help: null, helpOther: null });
    expect(isValidHikeAnswers({ when: 'now', transport: 'car', freeSeats: null, help: null, helpOther: null })).toBe(false);
    expect(isValidHikeAnswers({ when: 'now', transport: 'need_ride', freeSeats: null, help: 'transport_lead', helpOther: null })).toBe(true);
    expect(isValidHikeAnswers({ when: 'now', transport: 'car', freeSeats: 1, help: 'transport_lead', helpOther: null })).toBe(false);
    expect(isValidHikeAnswers({ when: 'now', transport: 'car', freeSeats: 1, help: 'other', helpOther: 'a'.repeat(281) })).toBe(false);
  });
});

describe('close page and recipe routing (source contracts)', () => {
  it("the thank-you's next-event offer opens an asking event's page instead of a one-tap seat", () => {
    const src = readFileSync('src/app/prototypes/events/close/EventClosePage.tsx', 'utf8');
    const i = src.indexOf('recipeForEvent(nextEvent).registration');
    const tap = src.indexOf('rsvpToEvent(nextEvent.id');
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(tap); // the page is chosen before the one-tap call can run
    expect(src).toMatch(/recipeForEvent\(nextEvent\)\.registration\) return navigate\(`\/events\/\$\{nextEvent\.slug\}/);
  });

  it("the page navigates to the event's preparation route after a 'now' seat", () => {
    const src = readFileSync('src/app/prototypes/events/components/EventDetail.tsx', 'utf8');
    expect(src).toMatch(/when === 'now' \? `\/events\/\$\{slug\}\/prepare`/);
  });

  it("the visible series label is 'Clarity Hike'", () => {
    expect(readFileSync('src/app/prototypes/events/rounds/mastermind-host-helpers.ts', 'utf8')).toContain("'social-hike': 'Clarity Hike'");
  });
});
