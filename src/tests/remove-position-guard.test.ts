/**
 * @file remove-position-guard.test.ts
 * @description Unit tests for P401: useRemovePositionGuard hook and checkLinkedStories
 *
 * P401 contract:
 * - `checkLinkedStories(pointId, userId)` queries stories (by author_id) then story_points.
 *   Returns count of linked stories.
 * - `useRemovePositionGuard` wraps `pointsService.removePosition` with a pre-flight check.
 *   - count === 0 → calls removePosition directly, no dialog
 *   - count > 0 → opens warning dialog listing count of affected stories
 * - Cancel in dialog → removePosition NOT called, dialog closes
 * - Confirm in dialog → removePosition called, dialog closes
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Supabase client mock — chain-based (matches existing test convention)
// ---------------------------------------------------------------------------

const mockFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    auth: {
      getUser: vi.fn(),
    },
  },
}));

// ---------------------------------------------------------------------------
// checkLinkedStories — direct service method tests
// ---------------------------------------------------------------------------

describe('checkLinkedStories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * `checkLinkedStories` makes two queries:
   *  1. stories.select('id').eq('author_id', userId) → storyIds
   *  2. story_points.select(count).eq('point_id', pointId).in('story_id', ids) → count
   *
   * We use mockReturnValueOnce to handle each call in sequence.
   */
  function mockTwoQueryChain(storyRows: { id: string }[], linkedCount: number) {
    // First call: stories query
    const eqStories = vi.fn().mockResolvedValue({ data: storyRows, error: null });
    const selectStories = vi.fn().mockReturnValue({ eq: eqStories });

    // Second call: story_points count query
    const inStoryPoints = vi.fn().mockResolvedValue({ count: linkedCount, error: null });
    const eqStoryPoints = vi.fn().mockReturnValue({ in: inStoryPoints });
    const selectStoryPoints = vi.fn().mockReturnValue({ eq: eqStoryPoints });

    mockFrom
      .mockReturnValueOnce({ select: selectStories })
      .mockReturnValueOnce({ select: selectStoryPoints });
  }

  it('returns 0 when the user has no stories at all', async () => {
    // stories returns empty → short-circuits, returns 0 without querying story_points
    const eqStories = vi.fn().mockResolvedValue({ data: [], error: null });
    const selectStories = vi.fn().mockReturnValue({ eq: eqStories });
    mockFrom.mockReturnValueOnce({ select: selectStories });

    const { realPointsService } = await import('@/app/data/points-service-real');
    const count = await realPointsService.checkLinkedStories('point-1', 'user-1');

    expect(count).toBe(0);
  });

  it('returns 0 when user has stories but none linked to this point', async () => {
    mockTwoQueryChain([{ id: 'story-a' }], 0);

    const { realPointsService } = await import('@/app/data/points-service-real');
    const count = await realPointsService.checkLinkedStories('point-1', 'user-1');

    expect(count).toBe(0);
  });

  it('returns correct count when stories are linked', async () => {
    mockTwoQueryChain(
      [{ id: 'story-1' }, { id: 'story-2' }, { id: 'story-3' }],
      3,
    );

    const { realPointsService } = await import('@/app/data/points-service-real');
    const count = await realPointsService.checkLinkedStories('point-1', 'user-1');

    expect(count).toBe(3);
  });

  it('returns 1 when exactly one story is linked', async () => {
    mockTwoQueryChain([{ id: 'story-1' }], 1);

    const { realPointsService } = await import('@/app/data/points-service-real');
    const count = await realPointsService.checkLinkedStories('point-1', 'user-1');

    expect(count).toBe(1);
  });

  it('queries the stories table first, then story_points', async () => {
    mockTwoQueryChain([{ id: 'story-abc' }], 0);

    const { realPointsService } = await import('@/app/data/points-service-real');
    await realPointsService.checkLinkedStories('point-abc', 'user-xyz');

    expect(mockFrom).toHaveBeenNthCalledWith(1, 'stories');
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'story_points');
  });
});

// ---------------------------------------------------------------------------
// useRemovePositionGuard — hook tests
//
// The hook uses `pointsService` (the global singleton) directly.
// We mock the entire module so we control checkLinkedStories and removePosition.
// ---------------------------------------------------------------------------

const mockRemovePosition = vi.fn();

vi.mock('@/app/data/points-service', () => ({
  pointsService: {
    removePosition: (...args: unknown[]) => mockRemovePosition(...args),
  },
}));

describe('useRemovePositionGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRemovePosition.mockResolvedValue(undefined);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // P576/P616: Dialog opens immediately — no checkLinkedStories, no story count
  // ─────────────────────────────────────────────────────────────────────────

  describe('opening the dialog', () => {
    it('opens the dialog without calling removePosition immediately', async () => {
      const { useRemovePositionGuard } = await import(
        '@/app/components/shared/remove-position-dialog'
      );

      const onAfterRemove = vi.fn();
      const { result } = renderHook(() =>
        useRemovePositionGuard({ userId: 'user-1', onAfterRemove })
      );

      await act(async () => {
        await result.current.guardedRemovePosition('point-1');
      });

      expect(result.current.dialogProps.open).toBe(true);
      expect(mockRemovePosition).not.toHaveBeenCalled();
    });

    it('calls onAfterRemove after confirm', async () => {
      const { useRemovePositionGuard } = await import(
        '@/app/components/shared/remove-position-dialog'
      );

      const onAfterRemove = vi.fn();
      const { result } = renderHook(() =>
        useRemovePositionGuard({ userId: 'user-1', onAfterRemove })
      );

      await act(async () => {
        await result.current.guardedRemovePosition('point-1');
      });

      await act(async () => {
        await result.current.dialogProps.onConfirm();
      });

      expect(mockRemovePosition).toHaveBeenCalledWith('point-1', 'user-1');
      expect(onAfterRemove).toHaveBeenCalledWith('point-1');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Cancel — position kept intact
  // ─────────────────────────────────────────────────────────────────────────

  describe('cancel in dialog', () => {
    it('closes the dialog without calling removePosition', async () => {
      const { useRemovePositionGuard } = await import(
        '@/app/components/shared/remove-position-dialog'
      );

      const { result } = renderHook(() =>
        useRemovePositionGuard({ userId: 'user-1' })
      );

      await act(async () => {
        await result.current.guardedRemovePosition('point-1');
      });
      expect(result.current.dialogProps.open).toBe(true);

      act(() => {
        result.current.dialogProps.onCancel();
      });

      expect(result.current.dialogProps.open).toBe(false);
      expect(mockRemovePosition).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Confirm — removePosition called, dialog closes
  // ─────────────────────────────────────────────────────────────────────────

  describe('confirm in dialog', () => {
    it('calls removePosition with the correct arguments and closes the dialog', async () => {
      const { useRemovePositionGuard } = await import(
        '@/app/components/shared/remove-position-dialog'
      );

      const { result } = renderHook(() =>
        useRemovePositionGuard({ userId: 'user-1' })
      );

      await act(async () => {
        await result.current.guardedRemovePosition('point-1');
      });

      await act(async () => {
        await result.current.dialogProps.onConfirm();
      });

      expect(mockRemovePosition).toHaveBeenCalledWith('point-1', 'user-1');
      expect(result.current.dialogProps.open).toBe(false);
    });

    it('calls removePosition exactly once on confirm', async () => {
      const { useRemovePositionGuard } = await import(
        '@/app/components/shared/remove-position-dialog'
      );

      const { result } = renderHook(() =>
        useRemovePositionGuard({ userId: 'user-1' })
      );

      await act(async () => {
        await result.current.guardedRemovePosition('point-1');
      });

      await act(async () => {
        await result.current.dialogProps.onConfirm();
      });

      expect(mockRemovePosition).toHaveBeenCalledTimes(1);
    });

    it('calls onAfterRemove after confirm', async () => {
      const { useRemovePositionGuard } = await import(
        '@/app/components/shared/remove-position-dialog'
      );

      const onAfterRemove = vi.fn();
      const { result } = renderHook(() =>
        useRemovePositionGuard({ userId: 'user-1', onAfterRemove })
      );

      await act(async () => {
        await result.current.guardedRemovePosition('point-1');
      });

      await act(async () => {
        await result.current.dialogProps.onConfirm();
      });

      expect(onAfterRemove).toHaveBeenCalledWith('point-1');
    });
  });
});
