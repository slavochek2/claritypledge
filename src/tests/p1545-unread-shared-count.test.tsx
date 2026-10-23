import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const state = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  letters: vi.fn(),
  canvases: vi.fn(),
}));

vi.mock('@/auth', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/app/data/letters-service', () => ({ getUnreadReceivedLetterCount: state.letters }));
vi.mock('@/app/data/canvas-service', () => ({ canvasService: { listSharedWithMe: state.canvases } }));

import { useUnreadSharedCount, ARTIFACTS_READ_EVENT } from '@/app/hooks/useUnreadSharedCount';

beforeEach(() => {
  vi.clearAllMocks();
  state.user = { id: 'u1' };
});

describe('useUnreadSharedCount (Artifacts nav badge)', () => {
  it('= unread letters sent to you + unread shared canvases (read canvases do not count)', async () => {
    state.letters.mockResolvedValue(2);
    state.canvases.mockResolvedValue([{ unread: true }, { unread: false }, { unread: true }]);
    const { result } = renderHook(() => useUnreadSharedCount());
    await waitFor(() => expect(result.current.count).toBe(4));
    expect(state.letters).toHaveBeenCalledWith('u1');
  });

  it('a failing canvas read still shows the letters', async () => {
    state.letters.mockResolvedValue(3);
    state.canvases.mockRejectedValue(new Error('x'));
    const { result } = renderHook(() => useUnreadSharedCount());
    await waitFor(() => expect(result.current.count).toBe(3));
  });

  it('re-reads when the page reports an item was opened', async () => {
    state.letters.mockResolvedValueOnce(1).mockResolvedValue(0);
    state.canvases.mockResolvedValue([]);
    const { result } = renderHook(() => useUnreadSharedCount());
    await waitFor(() => expect(result.current.count).toBe(1));
    window.dispatchEvent(new Event(ARTIFACTS_READ_EVENT));
    await waitFor(() => expect(result.current.count).toBe(0));
  });

  it('signed out: 0 and no reads', () => {
    state.user = null;
    const { result } = renderHook(() => useUnreadSharedCount());
    expect(result.current.count).toBe(0);
    expect(state.letters).not.toHaveBeenCalled();
  });
});
