/**
 * P1722 fix round 6: Q1 expected statement + ack key + sign-out, Q2 availability probe (hidden tab, jitter), Q3 no Edit/Delete once posted.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ cb: null as null | ((e: string) => void) }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc, auth: { onAuthStateChange: (cb: (e: string) => void) => { auth.cb = cb; return { data: { subscription: { unsubscribe: vi.fn() } } }; } } } }));
const toast = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: Object.assign(toast, { error: toast }) }));
vi.mock('@/app/pages/chat/clarify-position-store', () => ({ useHasPosition: () => true }));

import { ClarifyPublishButton } from '@/app/pages/chat/ClarifyPublishButton';
import { isWarningAcked, markWarningAcked, resetWarningAcks } from '@/app/pages/chat/clarify-warning-ack';
import { PUBLISH_CHANGED_TOAST } from '@/app/pages/chat/clarify-copy';
import { jittered, useAvailabilityProbe } from '@/app/pages/chat/use-availability-probe';

beforeEach(() => { rpc.mockReset(); toast.mockReset(); resetWarningAcks(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

const press = () => fireEvent.click(screen.getByTestId('clarify-publish-d1'));

describe('Q1', () => {
  it('Publish sends the statement the card shows', async () => {
    rpc.mockResolvedValue({ data: { status: 'refused', code: 'x' }, error: null });
    render(<ClarifyPublishButton id="d1" pointId="p1" serverHasPosition visibility="private" statement="Seen words" />);
    press();
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_expected_statement: 'Seen words' });
  });
  it('a `changed` refusal: plain message and the thread is re-read', async () => {
    rpc.mockResolvedValue({ data: { status: 'refused', code: 'changed' }, error: null });
    const onReload = vi.fn();
    render(<ClarifyPublishButton id="d1" pointId="p1" serverHasPosition visibility="private" statement="s" onReload={onReload} />);
    press();
    await waitFor(() => expect(toast).toHaveBeenCalledWith(PUBLISH_CHANGED_TOAST));
    expect(onReload).toHaveBeenCalledTimes(1);
  });
  it('the ack is per draft AND statement: a changed statement is not acked', () => {
    markWarningAcked('d1', 'one');
    expect(isWarningAcked('d1', 'one')).toBe(true);
    expect(isWarningAcked('d1', 'two')).toBe(false);
  });
  it('a changed statement asks the warning again before publishing', async () => {
    markWarningAcked('d1', 'old words');
    render(<ClarifyPublishButton id="d1" pointId="p1" serverHasPosition visibility="public" publicWarning statement="new words" />);
    press();
    expect(await screen.findByTestId('clarify-public-warning')).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('sign-out forgets every ack', () => {
    markWarningAcked('d1', 's');
    act(() => auth.cb?.('SIGNED_OUT'));
    expect(isWarningAcked('d1', 's')).toBe(false);
  });
});

describe('Q2: availability probe', () => {
  const setHidden = (h: boolean) => Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
  afterEach(() => setHidden(false));

  it('a hidden tab asks nothing until it is visible', async () => {
    setHidden(true);
    const ask = vi.fn().mockResolvedValue(true);
    renderHook(() => useAvailabilityProbe(true, null, ask));
    await Promise.resolve();
    expect(ask).not.toHaveBeenCalled();
    setHidden(false);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
  });
  it('a visible tab asks at once (control)', async () => {
    const ask = vi.fn().mockResolvedValue(true);
    renderHook(() => useAvailabilityProbe(true, null, ask));
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
  });
  it('retries are jittered between half and all of the wait', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(jittered(1000)).toBe(500);
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    expect(jittered(1000)).toBeGreaterThan(999);
    expect(jittered(1000)).toBeLessThanOrEqual(1000);
    const spy = vi.spyOn(globalThis, 'setTimeout');
    const ask = vi.fn().mockResolvedValue(null);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    renderHook(() => useAvailabilityProbe(true, null, ask));
    return waitFor(() => expect(spy.mock.calls.some((c) => c[1] === 500)).toBe(true));
  });
});
