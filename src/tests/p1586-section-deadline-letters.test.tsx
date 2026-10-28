// @vitest-environment jsdom
/**
 * P1586 invariant: a wait that never ends becomes a readable state. The three letters tabs show a
 * readable line with a Retry after the section deadline, and Retry re-runs the tab's read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const DEADLINE_MS = 10_000;
const { never } = vi.hoisted(() => ({ never: () => new Promise<never>(() => {}) }));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/app/data/letters-service', () => ({
  getInboxItems: vi.fn(never),
  markDeliveryRead: vi.fn(),
  getUnreadExplainBackCountsByDelivery: vi.fn().mockResolvedValue({}),
  getAllSentLetters: vi.fn(never),
  getDeliveriesForLetters: vi.fn(),
  deleteLetter: vi.fn(),
}));
vi.mock('@/app/data/docs-service', () => ({ docsService: { getDocsByUser: vi.fn(never) } }));

import { getInboxItems, getAllSentLetters } from '@/app/data/letters-service';
import { docsService } from '@/app/data/docs-service';
import { InboxTab } from '@/app/components/letters/inbox-tab';
import { SentTab } from '@/app/components/letters/sent-tab';
import { DraftsTab } from '@/app/components/letters/drafts-tab';

const tabs = [
  ['inbox', () => <InboxTab userId="user-id-1" />, getInboxItems],
  ['sent', () => <SentTab userId="user-id-1" />, getAllSentLetters],
  ['drafts', () => <DraftsTab userId="user-id-1" />, docsService.getDocsByUser],
] as const;

describe('P1586 letters tabs: a stalled read reaches a readable line', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it.each(tabs)('%s: skeleton, then a Retry line after the deadline, and Retry re-runs the read', async (_n, ui, read) => {
    render(<MemoryRouter>{ui()}</MemoryRouter>);
    expect(screen.getByTestId('letter-list-skeleton')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(DEADLINE_MS - 1); });
    expect(screen.getByTestId('letter-list-skeleton')).toBeTruthy();

    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.queryByTestId('letter-list-skeleton')).toBeNull();
    const retry = screen.getByRole('button', { name: 'Retry' });

    const callsBefore = vi.mocked(read as () => unknown).mock.calls.length;
    fireEvent.click(retry);
    expect(vi.mocked(read as () => unknown).mock.calls.length).toBe(callsBefore + 1);
    expect(screen.getByTestId('letter-list-skeleton')).toBeTruthy();
  });
});

// A stalled first read that settles AFTER Retry's read must not overwrite the newer state, on either
// its answer or its error path (the reviewer saw drafts flip a successful Retry back to error).
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

const raceTabs = [
  ['inbox', () => <InboxTab userId="user-id-1" />, getInboxItems, 'No letters or responses yet.'],
  ['sent', () => <SentTab userId="user-id-1" />, getAllSentLetters, 'No published letters yet.'],
  ['drafts', () => <DraftsTab userId="user-id-1" />, docsService.getDocsByUser, 'No drafts yet.'],
] as const;

describe('P1586 letters tabs: only the latest read may write', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it.each(raceTabs)('%s: a stalled first read that REJECTS after Retry keeps the newer state', async (_n, ui, read, emptyText) => {
    const first = deferred<unknown[]>();
    vi.mocked(read as () => unknown).mockReturnValueOnce(first.promise as never).mockResolvedValueOnce([] as never);
    render(<MemoryRouter>{ui()}</MemoryRouter>);
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(DEADLINE_MS); });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await flush();
    expect(screen.getByText(emptyText)).toBeTruthy();

    first.reject(new Error('late failure'));
    await flush();
    expect(screen.getByText(emptyText)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('drafts: a stalled first read that ANSWERS after Retry does not replace the newer list', async () => {
    const doc = (title: string) => ({ id: title, title, visibility: 'private', story_count: 0, point_count: 0, updated_at: new Date().toISOString(), has_sent_letters: false });
    const first = deferred<unknown[]>();
    vi.mocked(docsService.getDocsByUser).mockReturnValueOnce(first.promise as never).mockResolvedValueOnce([doc('Newer draft')] as never);
    render(<MemoryRouter><DraftsTab userId="user-id-1" /></MemoryRouter>);
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(DEADLINE_MS); });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await flush();
    expect(screen.getByText('Newer draft')).toBeTruthy();

    first.resolve([doc('Older draft')]);
    await flush();
    expect(screen.getByText('Newer draft')).toBeTruthy();
    expect(screen.queryByText('Older draft')).toBeNull();
  });
});
