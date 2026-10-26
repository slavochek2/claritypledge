import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ClarityDoc } from '@/app/types';

const mocks = vi.hoisted(() => ({
  getDocsByUserOrThrow: vi.fn(),
  getAllSentLettersOrThrow: vi.fn(),
  getDeliveriesForLettersOrThrow: vi.fn(),
  getInboxItems: vi.fn(),
  getAllReceivedLetters: vi.fn(),
  listMyCanvases: vi.fn(),
  listSharedWithMe: vi.fn(),
  getUnreadExplainBackCountsByDelivery: vi.fn(),
}));
vi.mock('@/app/data/docs-service', () => ({ docsService: { getDocsByUserOrThrow: mocks.getDocsByUserOrThrow } }));
vi.mock('@/app/data/letters-service', () => ({
  getAllSentLettersOrThrow: mocks.getAllSentLettersOrThrow,
  getDeliveriesForLettersOrThrow: mocks.getDeliveriesForLettersOrThrow,
  getInboxItems: mocks.getInboxItems,
  getAllReceivedLetters: mocks.getAllReceivedLetters,
  getUnreadExplainBackCountsByDelivery: mocks.getUnreadExplainBackCountsByDelivery,
}));
vi.mock('@/app/data/canvas-service', () => ({
  canvasService: { listMyCanvases: mocks.listMyCanvases, listSharedWithMe: mocks.listSharedWithMe },
}));

import { useArtifactsData } from './use-artifacts-data';

const doc = { id: 'd1', title: 'Draft about trust', visibility: 'private', updated_at: new Date().toISOString(), story_count: 1, point_count: 1, has_sent_letters: false } as ClarityDoc;
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDocsByUserOrThrow.mockResolvedValue([]);
  mocks.getAllSentLettersOrThrow.mockResolvedValue([]);
  mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({});
  mocks.getInboxItems.mockResolvedValue([]);
  mocks.getAllReceivedLetters.mockResolvedValue([]);
  mocks.listMyCanvases.mockResolvedValue([]);
  mocks.listSharedWithMe.mockResolvedValue([]);
  mocks.getUnreadExplainBackCountsByDelivery.mockResolvedValue({});
});

describe('useArtifactsData ordering and failures', () => {
  it('an older response never overwrites a newer refresh', async () => {
    const older = deferred<ClarityDoc[]>();
    mocks.getDocsByUserOrThrow.mockReturnValueOnce(older.promise); // the first load is slow
    const { result } = renderHook(() => useArtifactsData('me', 'me'));
    mocks.getDocsByUserOrThrow.mockResolvedValueOnce([]); // the refresh after a delete answers first, empty
    await act(async () => { await result.current.refresh(); });
    await waitFor(() => expect(result.current.lists.drafts.status).toBe('ready'));
    await act(async () => { older.resolve([doc]); await Promise.resolve(); });
    expect(result.current.lists.drafts.rows).toHaveLength(0);
  });

  it('a refresh that fails keeps the loaded sent letters and says some items are missing', async () => {
    const letter = { id: 'l1', source_doc_id: 'd9', sender_id: 'me', mode: 'one-to-one', status: 'sealed', sealed_at: new Date().toISOString(), created_at: new Date().toISOString(), doc_title: 'Hello Tom' };
    mocks.getAllSentLettersOrThrow.mockResolvedValue([letter]);
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [{ id: 'dv1', letter_id: 'l1', receiver_email: 'a@example.com', status: 'pending' }] });
    const { result } = renderHook(() => useArtifactsData('me', 'me'));
    await waitFor(() => expect(result.current.lists.sent.rows).toHaveLength(1));
    expect(result.current.lists.sent.partial).toBe(false);
    mocks.getDeliveriesForLettersOrThrow.mockRejectedValue(new Error('rpc down'));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.lists.sent.rows).toHaveLength(1);
    expect(result.current.lists.sent.rows[0]?.meta).toMatch(/^Sent to 1 · 0 of 1 done/); // the kept deliveries are still what is shown
    expect(result.current.lists.sent.partial).toBe(true);
    expect(result.current.lists.sent.status).toBe('ready');
  });
});

describe('useArtifactsData activity source', () => {
  const letter = { id: 'l1', source_doc_id: 'd9', sender_id: 'me', mode: 'one-to-one', status: 'sealed', sealed_at: new Date().toISOString(), created_at: new Date().toISOString(), doc_title: 'Hello Tom' };
  const deliveries = { l1: [{ id: 'dv1', letter_id: 'l1', receiver_email: 'a@example.com', receiver_name: 'Tom', status: 'completed', completed_at: new Date().toISOString(), read_at: new Date().toISOString() }] };

  it('unread explain-backs become "N new from <name>" on the sent letter', async () => {
    mocks.getAllSentLettersOrThrow.mockResolvedValue([letter]);
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue(deliveries);
    mocks.getUnreadExplainBackCountsByDelivery.mockResolvedValue({ dv1: 2 });
    const { result } = renderHook(() => useArtifactsData('me', 'me'));
    await waitFor(() => expect(result.current.lists.sent.rows).toHaveLength(1));
    expect(mocks.getUnreadExplainBackCountsByDelivery).toHaveBeenCalledWith(['dv1']);
    expect(result.current.lists.sent.rows[0]?.meta).toMatch(/^Sent to 1 · 2 new from Tom · /);
  });

  it('an unread finished delivery makes the sent letter new, with no explain-backs and no inbox at all', async () => {
    mocks.getAllSentLettersOrThrow.mockResolvedValue([letter]);
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [{ ...deliveries.l1[0]!, read_at: null }] });
    mocks.getUnreadExplainBackCountsByDelivery.mockResolvedValue({});
    mocks.getInboxItems.mockRejectedValue(new Error('inbox down'));
    const { result } = renderHook(() => useArtifactsData('me', 'me'));
    await waitFor(() => expect(result.current.lists.sent.rows[0]?.meta).toMatch(/^Sent to 1 · 1 new from Tom · /));
  });

  it('a failing activity read degrades to no "new" part, never to an error', async () => {
    mocks.getAllSentLettersOrThrow.mockResolvedValue([letter]);
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue(deliveries);
    mocks.getUnreadExplainBackCountsByDelivery.mockRejectedValue(new Error('x'));
    const { result } = renderHook(() => useArtifactsData('me', 'me'));
    await waitFor(() => expect(result.current.lists.sent.rows).toHaveLength(1));
    expect(result.current.lists.sent.rows[0]?.meta).toMatch(/^Sent to 1 · 1 of 1 done/);
    expect(result.current.lists.sent.partial).toBe(false);
  });
});

describe('useArtifactsData polling', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('a failed drafts read after a good one keeps the drafts and marks the tab partial', async () => {
    mocks.getDocsByUserOrThrow.mockResolvedValue([doc]);
    const { result } = renderHook(() => useArtifactsData('me', 'me'));
    await waitFor(() => expect(result.current.lists.drafts.rows).toHaveLength(1));
    mocks.getDocsByUserOrThrow.mockRejectedValue(new Error('db down'));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.lists.drafts.rows).toHaveLength(1);
    expect(result.current.lists.drafts.partial).toBe(true);
  });

  it('a source slower than the poll interval still loads (the poll skips while it is in flight)', async () => {
    vi.useFakeTimers();
    const slow = deferred<ClarityDoc[]>();
    mocks.getDocsByUserOrThrow.mockReturnValue(slow.promise);
    const { result } = renderHook(() => useArtifactsData('me', 'me'));
    await act(async () => { await vi.advanceTimersByTimeAsync(16_000); });
    expect(mocks.getDocsByUserOrThrow).toHaveBeenCalledTimes(1);
    await act(async () => { slow.resolve([doc]); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.lists.drafts.rows).toHaveLength(1);
  });

  it('an explicit refresh supersedes an in-flight request, and the stale response is dropped', async () => {
    vi.useFakeTimers();
    const stale = deferred<ClarityDoc[]>();
    mocks.getDocsByUserOrThrow.mockReturnValueOnce(stale.promise);
    const { result } = renderHook(() => useArtifactsData('me', 'me'));
    mocks.getDocsByUserOrThrow.mockResolvedValueOnce([]);
    await act(async () => { await result.current.refresh(); });
    expect(mocks.getDocsByUserOrThrow).toHaveBeenCalledTimes(2);
    await act(async () => { stale.resolve([doc]); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.lists.drafts.rows).toHaveLength(0);
  });
});

describe('useArtifactsData progressive loading', () => {
  it('each list settles on its own: loaded drafts show while the sent letters are still pending', async () => {
    const sent = deferred<never[]>();
    mocks.getDocsByUserOrThrow.mockResolvedValue([doc]);
    mocks.getAllSentLettersOrThrow.mockReturnValue(sent.promise);
    const { result } = renderHook(() => useArtifactsData('me', 'me'));
    await waitFor(() => expect(result.current.lists.drafts.rows).toHaveLength(1));
    expect(result.current.lists.drafts.status).toBe('ready');
    expect(result.current.lists.drafts.pending).toBe(false);
    expect(result.current.lists.sent.status).toBe('loading');
    expect(result.current.lists.sent.pending).toBe(true);
    await act(async () => { sent.resolve([]); await Promise.resolve(); });
    await waitFor(() => expect(result.current.lists.sent.pending).toBe(false));
    expect(result.current.lists.sent.status).toBe('ready');
    expect(result.current.lists.drafts.rows).toHaveLength(1);
  });

  it('stays loading while the source of the list has no data yet', async () => {
    const docs = deferred<ClarityDoc[]>();
    mocks.getDocsByUserOrThrow.mockReturnValue(docs.promise);
    const { result } = renderHook(() => useArtifactsData('me', 'me'));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.lists.drafts.status).toBe('loading');
    expect(result.current.lists.drafts.pending).toBe(true);
  });

  it('a failed source is an error for its own list only', async () => {
    mocks.getDocsByUserOrThrow.mockResolvedValue([doc]);
    mocks.listSharedWithMe.mockRejectedValue(new Error('rls'));
    const { result } = renderHook(() => useArtifactsData('me', 'me'));
    await waitFor(() => expect(result.current.lists.shared.status).toBe('error'));
    expect(result.current.lists.drafts.status).toBe('ready');
    expect(result.current.lists.mine.status).toBe('ready');
  });
});
