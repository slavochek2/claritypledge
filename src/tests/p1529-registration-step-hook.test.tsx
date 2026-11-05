/**
 * P1529 D16, D24: what the registration step does with every outcome. An error that is not a lost session must show the retry
 * toast and keep the step open with the answers, never leave an unhandled rejection. Signed out, nothing is sent: the answers
 * are kept in this browser for this event only and the person goes to sign-up. A full event joins the waiting list, which is not a seat.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ register: vi.fn(), join: vi.fn(), onList: vi.fn(), leave: vi.fn(), toastError: vi.fn() }));
vi.mock('@/app/data/event-registration', () => ({ registerForEvent: (...a: unknown[]) => h.register(...a) }));
vi.mock('@/app/data/event-waitlist', () => ({
  joinWaitlist: (...a: unknown[]) => h.join(...a),
  getMyWaitlistEntry: (...a: unknown[]) => h.onList(...a),
  leaveWaitlist: (...a: unknown[]) => h.leave(...a),
}));
vi.mock('sonner', () => ({ toast: { error: (m: string) => h.toastError(m) } }));

import { useRegistrationStep } from '@/app/prototypes/events/components/use-registration-step';
import { readRegistrationDraft } from '@/app/data/registration-draft';
import { SessionMismatchError } from '@/lib/session-guard';
import type { RegistrationAnswers } from '@/app/data/registration-answer-model';

const ANSWERS: RegistrationAnswers = { participation: 'observer', observerPrep: 'home', phone: 'other', hope: '', recordingAccepted: true };

function mount(over: { userId?: string | undefined; full?: boolean; readsWaitlist?: boolean; onSignIn?: () => void } = {}) {
  const cb = { onRegistered: vi.fn(), onRefused: vi.fn(), onSessionLost: vi.fn() };
  const opts = { userId: 'u1' as string | undefined, ...over };
  const hook = renderHook(() => useRegistrationStep({ event: { id: 'e1', slug: 'night' }, ...opts, ...cb }));
  return { ...hook, cb };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  h.onList.mockResolvedValue(null);
});

describe('useRegistrationStep.submit', () => {
  it('an unknown error shows the retry toast, keeps the step open, and rejects nothing', async () => {
    h.register.mockRejectedValueOnce(new Error('boom'));
    const { result, cb } = mount();
    act(() => result.current.ask());
    await act(async () => { await expect(result.current.submit(ANSWERS)).resolves.toBe(false); }); // false: a retry is needed
    expect(h.toastError).toHaveBeenCalledWith("Couldn't register you. Please try again.");
    expect(result.current.asking).toBe(true);
    expect(result.current.busy).toBe(false);
    expect(cb.onRegistered).not.toHaveBeenCalled();
  });

  it('a lost session asks to sign in again, with no toast', async () => {
    h.register.mockRejectedValueOnce(new SessionMismatchError('u1'));
    const { result, cb } = mount();
    await act(async () => { await result.current.submit(ANSWERS); });
    expect(cb.onSessionLost).toHaveBeenCalledTimes(1);
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it('a seat closes the step; full and cancelled are handed to the page; anything else is the retry toast', async () => {
    const { result, cb } = mount();
    h.register.mockResolvedValueOnce('ok');
    await act(async () => { result.current.ask(); await result.current.submit(ANSWERS); });
    expect(cb.onRegistered).toHaveBeenCalledTimes(1);
    expect(result.current.asking).toBe(false);
    h.register.mockResolvedValueOnce('full');
    await act(async () => { await result.current.submit(ANSWERS); });
    expect(cb.onRefused).toHaveBeenCalledWith('full');
    expect(result.current.filled).toBe(true);
    h.register.mockResolvedValueOnce('failed');
    await act(async () => { await result.current.submit(ANSWERS); });
    expect(h.toastError).toHaveBeenCalledTimes(1);
  });

  it('the answers are sent with the second answer', async () => {
    h.register.mockResolvedValueOnce('ok');
    const { result } = mount();
    await act(async () => { await result.current.submit(ANSWERS); });
    expect(h.register).toHaveBeenCalledWith({ id: 'e1', slug: 'night' }, 'u1', ANSWERS);
  });
});

describe('signed out (D24)', () => {
  it('keeps the answers for this event only, sends nothing, and goes to sign-up', async () => {
    const onSignIn = vi.fn();
    const { result } = mount({ userId: undefined, onSignIn });
    act(() => result.current.ask());
    await act(async () => { await result.current.submit(ANSWERS); });
    expect(h.register).not.toHaveBeenCalled();
    expect(h.join).not.toHaveBeenCalled();
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(result.current.asking).toBe(false);
    expect(readRegistrationDraft('night')).toEqual({ intent: 'register', answers: ANSWERS });
    expect(readRegistrationDraft('other-event')).toBeNull();
    expect(localStorage.length).toBe(1);
    expect(localStorage.key(0)).toBe('cp:registration-draft:night');
  });

  it('a full event keeps a waiting-list request', async () => {
    const { result } = mount({ userId: undefined, full: true, onSignIn: vi.fn() });
    await act(async () => { await result.current.submit(ANSWERS); });
    expect(readRegistrationDraft('night')?.intent).toBe('waitlist');
  });

  it('a browser without storage still goes to sign-up', async () => {
    const onSignIn = vi.fn();
    const boom = () => { throw new Error('denied'); };
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { value: { getItem: boom, setItem: boom, removeItem: boom, clear: boom, length: 0, key: boom }, configurable: true });
    const { result } = mount({ userId: undefined, onSignIn });
    await act(async () => { await result.current.submit(ANSWERS); });
    expect(onSignIn).toHaveBeenCalledTimes(1);
    if (original) Object.defineProperty(window, 'localStorage', original);
  });
});

describe('the waiting list (D24)', () => {
  it('a full event joins the list instead of registering, and the draft is cleared', async () => {
    h.join.mockResolvedValueOnce('ok');
    const { result, cb } = mount({ full: true });
    act(() => result.current.ask());
    await act(async () => { await result.current.submit(ANSWERS); });
    expect(h.join).toHaveBeenCalledWith('night', 'u1', ANSWERS);
    expect(h.register).not.toHaveBeenCalled();
    expect(result.current.onWaitlist).toBe(true);
    expect(result.current.asking).toBe(false);
    expect(cb.onRegistered).not.toHaveBeenCalled();
  });

  it('a place that opened meanwhile registers the person instead', async () => {
    h.join.mockResolvedValueOnce('not_full');
    h.register.mockResolvedValueOnce('ok');
    const { result, cb } = mount({ full: true });
    await act(async () => { await result.current.submit(ANSWERS); });
    expect(h.register).toHaveBeenCalledTimes(1);
    expect(cb.onRegistered).toHaveBeenCalledTimes(1);
  });

  it('a failed join keeps the step open with the retry toast', async () => {
    h.join.mockResolvedValueOnce('failed');
    const { result } = mount({ full: true });
    act(() => result.current.ask());
    await act(async () => { await result.current.submit(ANSWERS); });
    expect(h.toastError).toHaveBeenCalledWith("Couldn't join the waiting list. Please try again.");
    expect(result.current.asking).toBe(true);
    expect(result.current.onWaitlist).toBe(false);
  });

  it('reads whether this person is already on the list only where the page asks for it, and leaving takes them off', async () => {
    h.onList.mockResolvedValue(ANSWERS);
    h.leave.mockResolvedValue(undefined);
    const listed = mount({ full: true, readsWaitlist: true });
    await waitFor(() => expect(listed.result.current.onWaitlist).toBe(true));
    await act(async () => { await listed.result.current.leaveWaitlist(); });
    expect(h.leave).toHaveBeenCalledWith('night');
    expect(listed.result.current.onWaitlist).toBe(false);
    h.onList.mockClear();
    mount({ full: true }); // Clarity Night and Social Hike never read it
    expect(h.onList).not.toHaveBeenCalled();
  });

  it('a listed person is still listed after the limit is raised, and the form is filled with their stored answers', async () => {
    h.onList.mockResolvedValue(ANSWERS);
    const { result } = mount({ full: false, readsWaitlist: true });
    await waitFor(() => expect(result.current.onWaitlist).toBe(true));
    expect(result.current.prefill).toEqual(ANSWERS);
  });

  it('Leave is disabled while the request is out, and a failed leave keeps them listed with a toast', async () => {
    h.onList.mockResolvedValue(ANSWERS);
    let finish: (v?: unknown) => void = () => {};
    h.leave.mockImplementationOnce(() => new Promise(r => { finish = r; }));
    const { result } = mount({ full: true, readsWaitlist: true });
    await waitFor(() => expect(result.current.onWaitlist).toBe(true));
    let leaving: Promise<void> = Promise.resolve();
    act(() => { leaving = result.current.leaveWaitlist(); });
    expect(result.current.leaving).toBe(true);
    await act(async () => { finish(); await leaving; });
    expect(result.current.leaving).toBe(false);
    expect(result.current.onWaitlist).toBe(false);
  });

  it('a failed leave keeps them listed, says so, and enables the link again', async () => {
    h.onList.mockResolvedValue(ANSWERS);
    h.leave.mockRejectedValueOnce(new Error('x'));
    const { result } = mount({ full: true, readsWaitlist: true });
    await waitFor(() => expect(result.current.onWaitlist).toBe(true));
    await act(async () => { await result.current.leaveWaitlist(); });
    expect(result.current.onWaitlist).toBe(true);
    expect(result.current.leaving).toBe(false);
    expect(h.toastError).toHaveBeenCalledWith("Couldn't take you off the waiting list. Please try again.");
  });
});

describe('submit tells the caller whether a retry is needed (D24)', () => {
  it('true for a seat, the list, sign-up, full and cancelled; false for a failure or an unknown error', async () => {
    const { result } = mount();
    h.register.mockResolvedValueOnce('ok');
    await act(async () => { expect(await result.current.submit(ANSWERS)).toBe(true); });
    h.register.mockResolvedValueOnce('full');
    await act(async () => { expect(await result.current.submit(ANSWERS)).toBe(true); });
    h.register.mockResolvedValueOnce('cancelled');
    await act(async () => { expect(await result.current.submit(ANSWERS)).toBe(true); });
    h.register.mockResolvedValueOnce('failed');
    await act(async () => { expect(await result.current.submit(ANSWERS)).toBe(false); });
    h.register.mockRejectedValueOnce(new Error('boom'));
    await act(async () => { expect(await result.current.submit(ANSWERS)).toBe(false); });
    h.register.mockRejectedValueOnce(new SessionMismatchError('u1'));
    await act(async () => { expect(await result.current.submit(ANSWERS)).toBe(true); }); // it signs in again instead
  });
});
