/** P1536: the run's shared deadline signal is waited on by several token counts; none may leave a listener behind. */
import { describe, expect, it, vi } from 'vitest';
import { anySignal, raceAbort } from '../../supabase/functions/_shared/abort-signals';

/** A signal that counts its live 'abort' listeners. */
function watched() {
  const controller = new AbortController();
  const live = new Set<EventListenerOrEventListenerObject>();
  const add = controller.signal.addEventListener.bind(controller.signal);
  const remove = controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, opts?: unknown) => { live.add(fn); add(type, fn, opts as AddEventListenerOptions); }) as typeof add;
  controller.signal.removeEventListener = ((type: string, fn: EventListenerOrEventListenerObject, opts?: unknown) => { live.delete(fn); remove(type, fn, opts as EventListenerOptions); }) as typeof remove;
  return { controller, live };
}

describe('raceAbort', () => {
  it('returns the work when it settles first, and leaves no listener on the shared signal, however many calls share it', async () => {
    const { controller, live } = watched();
    for (let i = 0; i < 5; i++) expect(await raceAbort(Promise.resolve(i), controller.signal, -1)).toBe(i);
    await Promise.resolve();
    await Promise.resolve();
    expect(live.size).toBe(0);
  });
  it('also removes it when the work fails first (and passes the failure on)', async () => {
    const { controller, live } = watched();
    await expect(raceAbort(Promise.reject(new Error('boom')), controller.signal, -1)).rejects.toThrow('boom');
    await Promise.resolve();
    await Promise.resolve();
    expect(live.size).toBe(0);
  });
  it('gives the fallback as soon as the signal fires, and at once when it already has', async () => {
    const { controller } = watched();
    const pending = raceAbort(new Promise<number>(() => undefined), controller.signal, -1);
    controller.abort();
    expect(await pending).toBe(-1);
    expect(await raceAbort(new Promise<number>(() => undefined), controller.signal, -2)).toBe(-2);
  });
  it('with no signal it is just the work', async () => {
    expect(await raceAbort(Promise.resolve(7), undefined, -1)).toBe(7);
  });
});

describe('anySignal', () => {
  it('aborts when any live signal aborts; ignores undefined; one signal comes back as is', () => {
    const a = new AbortController(); const b = new AbortController();
    expect(anySignal(undefined, a.signal)).toBe(a.signal);
    expect(anySignal()).toBeUndefined();
    const both = anySignal(a.signal, b.signal)!;
    expect(both.aborted).toBe(false);
    b.abort('late');
    expect(both.aborted).toBe(true);
    expect(both.reason).toBe('late');
  });
  it('an already-fired signal decides at once and attaches no listener to the others', () => {
    const live = new AbortController();
    const add = vi.spyOn(live.signal, 'addEventListener');
    const done = new AbortController(); done.abort('first');
    const s = anySignal(live.signal, done.signal)!;
    expect(s.aborted).toBe(true);
    expect(s.reason).toBe('first');
    expect(add).not.toHaveBeenCalled();
  });
});
