import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ClarityDoc } from '@/app/types';

const mocks = vi.hoisted(() => ({
  getDocsByUser: vi.fn(),
  getAllSentLettersOrThrow: vi.fn(),
  getDeliveriesForLettersOrThrow: vi.fn(),
  getInboxItems: vi.fn(),
  getAllReceivedLetters: vi.fn(),
  listMyCanvases: vi.fn(),
  listSharedWithMe: vi.fn(),
}));
vi.mock('@/app/data/docs-service', () => ({ docsService: { getDocsByUser: mocks.getDocsByUser } }));
vi.mock('@/app/data/letters-service', () => ({
  getAllSentLettersOrThrow: mocks.getAllSentLettersOrThrow,
  getDeliveriesForLettersOrThrow: mocks.getDeliveriesForLettersOrThrow,
  getInboxItems: mocks.getInboxItems,
  getAllReceivedLetters: mocks.getAllReceivedLetters,
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
  mocks.getDocsByUser.mockResolvedValue([]);
  mocks.getAllSentLettersOrThrow.mockResolvedValue([]);
  mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({});
  mocks.getInboxItems.mockResolvedValue([]);
  mocks.getAllReceivedLetters.mockResolvedValue([]);
  mocks.listMyCanvases.mockResolvedValue([]);
  mocks.listSharedWithMe.mockResolvedValue([]);
});

describe('useArtifactsData ordering and failures', () => {
  it('an older response never overwrites a newer refresh', async () => {
    const older = deferred<ClarityDoc[]>();
    mocks.getDocsByUser.mockReturnValueOnce(older.promise); // the first load is slow
    const { result } = renderHook(() => useArtifactsData('me', 'me'));
    mocks.getDocsByUser.mockResolvedValueOnce([]); // the refresh after a delete answers first, empty
    await act(async () => { await result.current.refresh(); });
    await waitFor(() => expect(result.current.yours.status).toBe('ready'));
    await act(async () => { older.resolve([doc]); await Promise.resolve(); });
    expect(result.current.yours.rows).toHaveLength(0);
  });

  it('a refresh that fails keeps the loaded sent letters and says some items are missing', async () => {
    const letter = { id: 'l1', source_doc_id: 'd9', sender_id: 'me', mode: 'one-to-one', status: 'sealed', sealed_at: new Date().toISOString(), created_at: new Date().toISOString(), doc_title: 'Hello Tom' };
    mocks.getAllSentLettersOrThrow.mockResolvedValue([letter]);
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [{ id: 'dv1', letter_id: 'l1', receiver_email: 'a@example.com', status: 'pending' }] });
    const { result } = renderHook(() => useArtifactsData('me', 'me'));
    await waitFor(() => expect(result.current.yours.rows).toHaveLength(1));
    expect(result.current.yours.partial).toBe(false);
    mocks.getDeliveriesForLettersOrThrow.mockRejectedValue(new Error('rpc down'));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.yours.rows).toHaveLength(1);
    expect(result.current.yours.rows[0].menu.map(a => a.id)).not.toContain('delete-letter');
    expect(result.current.yours.partial).toBe(true);
    expect(result.current.yours.status).toBe('ready');
  });
});
