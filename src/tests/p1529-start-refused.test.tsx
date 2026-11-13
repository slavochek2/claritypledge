/** P1529 (founder 2026-11-13): a refused start of a canvas run is said, never "Updating…" for the rest of the lease. */
import { cleanup, fireEvent, render, screen, act, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  start: vi.fn(), accepted: vi.fn(), capture: vi.fn(), crumb: vi.fn(), invoke: vi.fn(), toastError: vi.fn(),
}));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/app/data/canvas-draft-service', () => ({ startCanvasRun: h.start }));
vi.mock('@/app/data/terms-accepted', () => ({ getAcceptedTermsVersion: h.accepted }));
vi.mock('@sentry/react', () => ({ captureMessage: h.capture, addBreadcrumb: h.crumb }));
vi.mock('sonner', () => ({ toast: { error: h.toastError } }));

import { CanvasStartRefused } from '@/app/pages/chat/CanvasStartRefused';
import { startRefusedNotice } from '@/app/pages/chat/canvas-start-refused-copy';
import { clearStartRefusal, recordStartRefusal, startRefusalOf, useStartRefusal } from '@/app/data/canvas-start-refusals';
import { canvasRetryTrailing } from '@/app/pages/chat/canvas-retry-trailing';
import { sendSlotOf } from '@/app/pages/chat/canvas-send-slot';

afterEach(() => { cleanup(); vi.clearAllMocks(); clearStartRefusal('r1'); });

describe('the refusal store', () => {
  it('remembers a refusal per run, clears it, and ignores BUSY and NOT_READY (waiting is then the truth)', () => {
    recordStartRefusal('r1', 'BUSY');
    expect(startRefusalOf('r1')).toBeNull();
    recordStartRefusal('r1', 'NOT_READY'); // a waiting state too: the restart's bounded retries keep working
    expect(startRefusalOf('r1')).toBeNull();
    recordStartRefusal('r1', 'TERMS_NOT_ACCEPTED');
    expect(startRefusalOf('r1')).toBe('TERMS_NOT_ACCEPTED');
    clearStartRefusal('r1');
    expect(startRefusalOf('r1')).toBeNull();
  });
});

describe('the words', () => {
  it('terms, a limit, anything else; no dashes', () => {
    expect(startRefusedNotice('TERMS_NOT_ACCEPTED')).toEqual({ kind: 'terms', text: 'Please accept the updated terms to continue.' });
    expect(startRefusedNotice('CAPPED').kind).toBe('final');
    expect(startRefusedNotice('FAILED')).toEqual({ kind: 'retry', text: 'We couldn’t update your canvas.' });
    for (const c of ['TERMS_NOT_ACCEPTED', 'CAPPED', 'FAILED', 'BAD_REQUEST']) expect(startRefusedNotice(c).text).not.toMatch(/[–—]/);
  });
});

describe('the notice', () => {
  it('a failure offers Try again: disabled and "Trying…" while it runs, then starts the same run again', async () => {
    let finish: (v: unknown) => void = () => undefined;
    h.start.mockReturnValue(new Promise((r) => { finish = r; }));
    const reload = vi.fn(async () => undefined);
    render(<CanvasStartRefused runId="r1" code="FAILED" reload={reload} />);
    expect(screen.getByTestId('canvas-start-refused-text').textContent).toContain('We couldn’t update your canvas.');
    fireEvent.click(screen.getByTestId('canvas-start-refused-retry'));
    await waitFor(() => expect(screen.getByTestId('canvas-start-refused-retry').textContent).toBe('Trying…'));
    expect((screen.getByTestId('canvas-start-refused-retry') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { finish({ ok: true, runId: 'r1', kind: 'message' }); });
    expect(h.start).toHaveBeenCalledWith('r1');
    expect(reload).toHaveBeenCalled(); // one user-initiated reload after the answer
  });
  it('a BUSY answer to Try again says the canvas is still updating and forgets the old refusal (the thread resumes its normal state)', async () => {
    h.start.mockResolvedValue({ ok: false, code: 'BUSY' });
    recordStartRefusal('r1', 'FAILED');
    render(<CanvasStartRefused runId="r1" code="FAILED" reload={async () => undefined} />);
    await act(async () => { fireEvent.click(screen.getByTestId('canvas-start-refused-retry')); });
    expect(h.toastError).toHaveBeenCalledWith('Your canvas is still updating. Wait a moment.');
    expect(startRefusalOf('r1')).toBeNull();
  });
  it('terms, acceptance genuinely behind: the sentence and Review terms (reload, where the gate opens)', async () => {
    h.accepted.mockResolvedValue('v1.5');
    const reload = vi.fn();
    const orig = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...orig, reload } });
    render(<CanvasStartRefused runId="r1" code="TERMS_NOT_ACCEPTED" reload={async () => undefined} />);
    await waitFor(() => expect(screen.getByTestId('canvas-start-refused-terms')).toBeTruthy());
    expect(screen.getByTestId('canvas-start-refused-text').textContent).toBe('Please accept the updated terms to continue.');
    expect(screen.queryByTestId('canvas-start-refused-retry')).toBeNull();
    fireEvent.click(screen.getByTestId('canvas-start-refused-terms'));
    expect(reload).toHaveBeenCalled();
    expect(h.capture).not.toHaveBeenCalled();
    Object.defineProperty(window, 'location', { configurable: true, value: orig });
  });
  it('terms, but the client considers the acceptance current (server expects another version): the failure with Try again, reported, never Review terms', async () => {
    h.accepted.mockResolvedValue('v1.8');
    h.start.mockResolvedValue({ ok: true, runId: 'r1', kind: 'message' });
    render(<CanvasStartRefused runId="r1" code="TERMS_NOT_ACCEPTED" reload={async () => undefined} />);
    await waitFor(() => expect(h.capture).toHaveBeenCalled());
    expect(h.capture.mock.calls[0][1].extra).toMatchObject({ code: 'TERMS_NOT_ACCEPTED', acceptedVersion: 'v1.8' });
    expect(screen.queryByTestId('canvas-start-refused-terms')).toBeNull();
    expect(screen.getByTestId('canvas-start-refused-text').textContent).toBe('We couldn’t update your canvas.');
    await act(async () => { fireEvent.click(screen.getByTestId('canvas-start-refused-retry')); });
    expect(h.start).toHaveBeenCalledWith('r1');
  });
});

/** A parent that subscribes like the thread does: the notice exists only while the refusal is recorded. */
function Parent() {
  const code = useStartRefusal('r1');
  return code ? <CanvasStartRefused runId="r1" code={code} reload={async () => undefined} /> : <p data-testid="gone">gone</p>;
}

describe('Try again through the subscribing parent', () => {
  it('the notice stays mounted with "Trying…" while the request is pending, and goes only when a valid start clears the refusal', async () => {
    let finish: (v: unknown) => void = () => undefined;
    h.start.mockImplementation(() => new Promise((r) => { finish = r; }));
    act(() => recordStartRefusal('r1', 'FAILED'));
    render(<Parent />);
    fireEvent.click(screen.getByTestId('canvas-start-refused-retry'));
    await waitFor(() => expect(screen.getByTestId('canvas-start-refused-retry').textContent).toBe('Trying\u2026'));
    expect(startRefusalOf('r1')).toBe('FAILED'); // not cleared before the answer
    expect(screen.queryByTestId('gone')).toBeNull();
    await act(async () => { clearStartRefusal('r1'); finish({ ok: true, runId: 'r1', kind: 'message' }); }); // what startCanvasRun does on a valid start
    expect(screen.getByTestId('gone')).toBeTruthy();
  });
  it('while the terms check runs there is no text and no button', async () => {
    let done: (v: string) => void = () => undefined;
    h.accepted.mockReturnValue(new Promise<string>((r) => { done = r; }));
    render(<CanvasStartRefused runId="r1" code="TERMS_NOT_ACCEPTED" reload={async () => undefined} />);
    expect(screen.queryByTestId('canvas-start-refused')).toBeNull(); // no alert region mounted while checking
    expect(screen.queryByTestId('canvas-start-refused-text')).toBeNull();
    expect(screen.queryByTestId('canvas-start-refused-retry')).toBeNull();
    expect(screen.queryByTestId('canvas-start-refused-terms')).toBeNull();
    await act(async () => { done('v1.5'); });
    await waitFor(() => expect(screen.getByTestId('canvas-start-refused-terms')).toBeTruthy());
  });
});

describe('a failed acceptance read', () => {
  it('is not "behind": the failure with Try again (never the dead-end Review terms), reported', async () => {
    h.accepted.mockRejectedValue(new Error('db down'));
    render(<CanvasStartRefused runId="r1" code="TERMS_NOT_ACCEPTED" reload={async () => undefined} />);
    await waitFor(() => expect(h.crumb).toHaveBeenCalled());
    expect(h.capture).not.toHaveBeenCalled(); // "client considers current" is only for a successful read
    expect(screen.queryByTestId('canvas-start-refused-terms')).toBeNull();
    expect(screen.getByTestId('canvas-start-refused-retry')).toBeTruthy();
  });
  it('a read that never answers times out after 8 s: the failure with Try again, not "client considers current"', async () => {
    vi.useFakeTimers();
    h.accepted.mockReturnValue(new Promise(() => undefined));
    render(<CanvasStartRefused runId="r1" code="TERMS_NOT_ACCEPTED" reload={async () => undefined} />);
    expect(screen.queryByTestId('canvas-start-refused')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(8_100); });
    expect(screen.getByTestId('canvas-start-refused-retry')).toBeTruthy();
    expect(h.capture).not.toHaveBeenCalled();
    expect(h.crumb).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('the thread', () => {
  const live = (startRefusal: string | null) => ({
    draft: { id: 'd', state: 'open' } as never, run: { id: 'r1', state: 'queued' } as never, running: true, startRefusal, lastDraftAt: null, reload: async () => undefined,
  });
  const msgs = [{ id: 'm1', authorId: 'u', isDeleted: false, kind: 'message', createdAt: '2026-01-01T00:00:00Z' }] as never;
  it('a queued run whose start was refused shows the notice; a plain queued run shows none', () => {
    const args = { messages: msgs, userId: 'u', rootId: 'root' };
    expect(canvasRetryTrailing(live('FAILED'), args)).not.toBeNull();
    expect(canvasRetryTrailing(live(null), args)).toBeNull();
  });
  it('the send slot stays blocked (the server counts the queued run) but says "Not updated", not "Updating…"', () => {
    const base = { uploading: false, elsewhere: false, readStatus: 'ready' as const, runGoing: true };
    const refused = sendSlotOf({ live: live('FAILED') as never, ...base });
    expect(refused.waiting).toBe('Not updated');
    expect(refused.active).toBe(true);
    expect(sendSlotOf({ live: live(null) as never, ...base }).waiting).toBe('Updating…');
  });
});
