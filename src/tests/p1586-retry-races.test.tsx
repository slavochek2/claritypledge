// @vitest-environment jsdom
/**
 * P1586: a stalled read that answers AFTER Retry (or after the session changed) must not overwrite
 * the newer read's state. Review mode's turns and the pledgers grid each drop a superseded answer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
vi.mock('@/app/components/landing/dual-cta', () => ({ DualCTA: () => null }));
vi.mock('@/app/components/social/pledger-grid', () => ({
  PledgerGrid: ({ items }: { items: unknown[] }) => <div data-testid="pledger-count">{items.length}</div>,
}));
vi.mock('@/app/data/api', () => ({ getLiveTurns: vi.fn(), getVerifiedProfilesPage: vi.fn(), PLEDGERS_PAGE_SIZE: 30 }));

import { getLiveTurns, getVerifiedProfilesPage } from '@/app/data/api';
import { ReviewModeView } from '@/app/components/partners/review-mode-view';
import { ClarityPledgersPage } from '@/app/pages/clarity-pledgers-page';

const DEADLINE_MS = 10_000;

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

const turn = (id: string) => ({ id, flag: 'not_clear', actorName: 'Ann', roundNumber: 1 });
const profile = (id: string) => ({ id, slug: id, name: id, role: 'r', reason: '', signedAt: '', avatarColor: 'blue', avatarUrl: null });

const review = (sessionId: string) => (
  <ReviewModeView session={{ id: sessionId } as never} liveState={{ ideasDiscussed: 2, ideasUnderstood: 1 } as never}
    currentUserName="Ann" partnerName="Bob" onToggleMode={() => {}} />
);

async function flush() {
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

describe('P1586 retry races', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('review mode: a stalled first read that answers after Retry does not overwrite the newer turns', async () => {
    const first = deferred<unknown[]>();
    const second = deferred<unknown[]>();
    vi.mocked(getLiveTurns).mockReturnValueOnce(first.promise as never).mockReturnValueOnce(second.promise as never);
    render(review('session-id-1'));
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(DEADLINE_MS); });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await flush();

    second.resolve([turn('t1'), turn('t2')]);
    await flush();
    expect(screen.getByText('Flags Raised (2)')).toBeTruthy();
    first.resolve([turn('t-old')]);
    await flush();
    expect(screen.getByText('Flags Raised (2)')).toBeTruthy();
  });

  it('review mode: an answer for the previous session does not land on the new one', async () => {
    const old = deferred<unknown[]>();
    const next = deferred<unknown[]>();
    vi.mocked(getLiveTurns).mockReturnValueOnce(old.promise as never).mockReturnValueOnce(next.promise as never);
    const view = render(review('session-id-1'));
    await flush();
    view.rerender(review('session-id-2'));
    await flush();

    next.resolve([turn('t1'), turn('t2')]);
    await flush();
    old.resolve([turn('t-old')]);
    await flush();
    expect(screen.getByText('Flags Raised (2)')).toBeTruthy();
  });

  it('pledgers: a stalled first read that answers after Retry does not overwrite the newer page', async () => {
    const first = deferred<{ profiles: unknown[]; total: number }>();
    const second = deferred<{ profiles: unknown[]; total: number }>();
    vi.mocked(getVerifiedProfilesPage).mockReturnValueOnce(first.promise as never).mockReturnValueOnce(second.promise as never);
    render(<MemoryRouter><ClarityPledgersPage /></MemoryRouter>);
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(DEADLINE_MS); });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await flush();

    second.resolve({ profiles: [profile('a'), profile('b')], total: 2 });
    await flush();
    expect(screen.getByTestId('pledger-count').textContent).toBe('2');
    first.resolve({ profiles: [profile('old')], total: 1 });
    await flush();
    expect(screen.getByTestId('pledger-count').textContent).toBe('2');
  });

  // A rejected read is unknown, not "nothing there": Retry shows at once, never the empty state.
  it('pledgers: a rejected first read shows Retry immediately, not an empty grid, and Retry recovers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(getVerifiedProfilesPage)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ profiles: [profile('a')], total: 1 } as never);
    render(<MemoryRouter><ClarityPledgersPage /></MemoryRouter>);
    await flush();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.queryByTestId('pledger-count')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await flush();
    expect(screen.getByTestId('pledger-count').textContent).toBe('1');
  });

  it('review mode: a rejected read shows Retry immediately, not the ideas, and Retry recovers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(getLiveTurns)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce([turn('t1')] as never);
    render(review('session-id-1'));
    await flush();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.queryByText(/Flags Raised/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await flush();
    expect(screen.getByText('Flags Raised (1)')).toBeTruthy();
  });
});
