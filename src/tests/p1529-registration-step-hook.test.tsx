/**
 * P1529 D16: what the registration step does with every outcome. An error that is not a lost session must show the retry toast
 * and keep the step open with the answers, never leave an unhandled rejection.
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ register: vi.fn(), toastError: vi.fn() }));
vi.mock('@/app/data/event-registration', () => ({ registerForEvent: (...a: unknown[]) => h.register(...a) }));
vi.mock('sonner', () => ({ toast: { error: (m: string) => h.toastError(m) } }));

import { useRegistrationStep } from '@/app/prototypes/events/components/use-registration-step';
import { SessionMismatchError } from '@/lib/session-guard';

const ANSWERS = { participation: 'observer', phone: 'other', hope: '', recordingAccepted: true } as const;

function mount() {
  const cb = { onRegistered: vi.fn(), onRefused: vi.fn(), onSessionLost: vi.fn() };
  const hook = renderHook(() => useRegistrationStep({ event: { id: 'e1', slug: 'night' }, userId: 'u1', ...cb }));
  return { ...hook, cb };
}

beforeEach(() => vi.clearAllMocks());

describe('useRegistrationStep.submit', () => {
  it('an unknown error shows the retry toast, keeps the step open, and rejects nothing', async () => {
    h.register.mockRejectedValueOnce(new Error('boom'));
    const { result, cb } = mount();
    act(() => result.current.ask());
    await act(async () => { await expect(result.current.submit(ANSWERS)).resolves.toBeUndefined(); });
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
    h.register.mockResolvedValueOnce('failed');
    await act(async () => { await result.current.submit(ANSWERS); });
    expect(h.toastError).toHaveBeenCalledTimes(1);
  });
});
