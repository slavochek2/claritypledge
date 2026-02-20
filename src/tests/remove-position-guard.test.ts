/**
 * @file remove-position-guard.test.ts
 * @description Unit tests for P401: useRemovePositionGuard hook and checkLinkedStories
 *
 * P401 contract:
 * - `checkLinkedStories(pointId, userId)` queries story_points JOIN stories
 *   WHERE stories.author_id = userId AND story_points.point_id = pointId.
 *   Returns count of linked stories.
 * - `useRemovePositionGuard` wraps `removePosition` with a pre-flight check.
 *   - count === 0 → calls removePosition directly, no dialog
 *   - count > 0 → opens warning dialog listing count of affected stories
 * - Cancel in dialog → removePosition NOT called, dialog closes
 * - Confirm in dialog → removePosition called, dialog closes
 *
 * Supabase mock pattern: same chain-based mock used throughout this codebase
 * (see points-service-real.test.ts for precedent).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Supabase client mock — chain-based (matches existing test convention)
// ---------------------------------------------------------------------------

const _mockEq = vi.fn();
const _mockSelect = vi.fn();
const _mockDelete = vi.fn();
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
// Auth context mock
// ---------------------------------------------------------------------------

vi.mock('@/auth/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '@/auth/AuthContext';

const mockUseAuth = vi.mocked(useAuth);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds the Supabase chainable mock for:
 *   supabase.from(table).select(cols).eq(col, val).eq(col, val)
 * resolving to { data: rows, error: null }.
 */
function mockSelectChain(rows: unknown[]) {
  const eqInner = vi.fn().mockResolvedValue({ data: rows, error: null });
  const eqOuter = vi.fn().mockReturnValue({ eq: eqInner });
  const select = vi.fn().mockReturnValue({ eq: eqOuter });
  mockFrom.mockReturnValue({ select });
  return { select, eqOuter, eqInner };
}

/**
 * Builds the Supabase chainable mock for a DELETE:
 *   supabase.from(table).delete().eq(col, val).eq(col, val)
 * resolving to { error: null }.
 */
function mockDeleteChain(error: unknown = null) {
  const eqInner = vi.fn().mockResolvedValue({ error });
  const eqOuter = vi.fn().mockReturnValue({ eq: eqInner });
  const del = vi.fn().mockReturnValue({ eq: eqOuter });
  mockFrom.mockReturnValue({ delete: del });
  return { delete: del, eqOuter, eqInner };
}

// ---------------------------------------------------------------------------
// checkLinkedStories — direct service method tests
// ---------------------------------------------------------------------------

describe.skip('checkLinkedStories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 0 when no stories are linked to the point for this user', async () => {
    mockSelectChain([]);

    const { realPointsService } = await import('@/app/data/points-service-real');
    const count = await realPointsService.checkLinkedStories('point-1', 'user-1');

    expect(count).toBe(0);
  });

  it('returns correct count when stories are linked', async () => {
    mockSelectChain([
      { story_id: 'story-1', point_id: 'point-1' },
      { story_id: 'story-2', point_id: 'point-1' },
      { story_id: 'story-3', point_id: 'point-1' },
    ]);

    const { realPointsService } = await import('@/app/data/points-service-real');
    const count = await realPointsService.checkLinkedStories('point-1', 'user-1');

    expect(count).toBe(3);
  });

  it('returns 1 when exactly one story is linked', async () => {
    mockSelectChain([{ story_id: 'story-1', point_id: 'point-1' }]);

    const { realPointsService } = await import('@/app/data/points-service-real');
    const count = await realPointsService.checkLinkedStories('point-1', 'user-1');

    expect(count).toBe(1);
  });

  it('queries the story_points table (not some other table)', async () => {
    mockSelectChain([]);

    const { realPointsService } = await import('@/app/data/points-service-real');
    await realPointsService.checkLinkedStories('point-abc', 'user-xyz');

    // The first call to supabase.from() must target story_points
    expect(mockFrom).toHaveBeenCalledWith('story_points');
  });
});

// ---------------------------------------------------------------------------
// useRemovePositionGuard — hook tests
// ---------------------------------------------------------------------------

describe.skip('useRemovePositionGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAuth.mockReturnValue({
      user: { id: 'user-1' } as ReturnType<typeof useAuth>['user'],
      isLoading: false,
      sessionChecked: true,
    } as ReturnType<typeof useAuth>);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // count === 0 → direct removal, no dialog
  // ─────────────────────────────────────────────────────────────────────────

  describe('when no stories are linked (count === 0)', () => {
    it('calls removePosition directly without opening dialog', async () => {
      // checkLinkedStories returns empty — no stories linked
      mockSelectChain([]);

      // removePosition (DELETE) succeeds
      mockDeleteChain(null);

      const { useRemovePositionGuard } = await import(
        '@/app/components/shared/remove-position-dialog'
      );

      const mockRemovePosition = vi.fn().mockResolvedValue(true);
      const { result } = renderHook(() =>
        useRemovePositionGuard({ removePosition: mockRemovePosition })
      );

      await act(async () => {
        await result.current.guardedRemovePosition('point-1', 'user-1');
      });

      expect(mockRemovePosition).toHaveBeenCalledWith('point-1', 'user-1');
      expect(result.current.isDialogOpen).toBe(false);
    });

    it('does NOT open the dialog when count is 0', async () => {
      mockSelectChain([]);

      const { useRemovePositionGuard } = await import(
        '@/app/components/shared/remove-position-dialog'
      );

      const mockRemovePosition = vi.fn().mockResolvedValue(true);
      const { result } = renderHook(() =>
        useRemovePositionGuard({ removePosition: mockRemovePosition })
      );

      await act(async () => {
        await result.current.guardedRemovePosition('point-1', 'user-1');
      });

      expect(result.current.isDialogOpen).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // count > 0 → dialog opens
  // ─────────────────────────────────────────────────────────────────────────

  describe('when stories are linked (count > 0)', () => {
    it('opens the warning dialog and does NOT call removePosition immediately', async () => {
      mockSelectChain([
        { story_id: 'story-1', point_id: 'point-1' },
        { story_id: 'story-2', point_id: 'point-1' },
      ]);

      const { useRemovePositionGuard } = await import(
        '@/app/components/shared/remove-position-dialog'
      );

      const mockRemovePosition = vi.fn().mockResolvedValue(true);
      const { result } = renderHook(() =>
        useRemovePositionGuard({ removePosition: mockRemovePosition })
      );

      await act(async () => {
        await result.current.guardedRemovePosition('point-1', 'user-1');
      });

      expect(result.current.isDialogOpen).toBe(true);
      expect(mockRemovePosition).not.toHaveBeenCalled();
    });

    it('exposes the linked story count in dialog state', async () => {
      mockSelectChain([
        { story_id: 'story-1', point_id: 'point-1' },
        { story_id: 'story-2', point_id: 'point-1' },
      ]);

      const { useRemovePositionGuard } = await import(
        '@/app/components/shared/remove-position-dialog'
      );

      const { result } = renderHook(() =>
        useRemovePositionGuard({ removePosition: vi.fn() })
      );

      await act(async () => {
        await result.current.guardedRemovePosition('point-1', 'user-1');
      });

      expect(result.current.linkedStoryCount).toBe(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Cancel — position kept intact
  // ─────────────────────────────────────────────────────────────────────────

  describe('cancel in dialog', () => {
    it('closes the dialog without calling removePosition', async () => {
      mockSelectChain([{ story_id: 'story-1', point_id: 'point-1' }]);

      const { useRemovePositionGuard } = await import(
        '@/app/components/shared/remove-position-dialog'
      );

      const mockRemovePosition = vi.fn();
      const { result } = renderHook(() =>
        useRemovePositionGuard({ removePosition: mockRemovePosition })
      );

      // Open dialog
      await act(async () => {
        await result.current.guardedRemovePosition('point-1', 'user-1');
      });
      expect(result.current.isDialogOpen).toBe(true);

      // Cancel
      act(() => {
        result.current.handleCancel();
      });

      expect(result.current.isDialogOpen).toBe(false);
      expect(mockRemovePosition).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Confirm — removePosition called, dialog closes
  // ─────────────────────────────────────────────────────────────────────────

  describe('confirm in dialog', () => {
    it('calls removePosition with the correct arguments and closes the dialog', async () => {
      mockSelectChain([{ story_id: 'story-1', point_id: 'point-1' }]);

      const { useRemovePositionGuard } = await import(
        '@/app/components/shared/remove-position-dialog'
      );

      const mockRemovePosition = vi.fn().mockResolvedValue(true);
      const { result } = renderHook(() =>
        useRemovePositionGuard({ removePosition: mockRemovePosition })
      );

      // Open dialog
      await act(async () => {
        await result.current.guardedRemovePosition('point-1', 'user-1');
      });
      expect(result.current.isDialogOpen).toBe(true);

      // Confirm
      await act(async () => {
        await result.current.handleConfirm();
      });

      expect(mockRemovePosition).toHaveBeenCalledWith('point-1', 'user-1');
      expect(result.current.isDialogOpen).toBe(false);
    });

    it('calls removePosition exactly once on confirm', async () => {
      mockSelectChain([{ story_id: 'story-1', point_id: 'point-1' }]);

      const { useRemovePositionGuard } = await import(
        '@/app/components/shared/remove-position-dialog'
      );

      const mockRemovePosition = vi.fn().mockResolvedValue(true);
      const { result } = renderHook(() =>
        useRemovePositionGuard({ removePosition: mockRemovePosition })
      );

      await act(async () => {
        await result.current.guardedRemovePosition('point-1', 'user-1');
      });

      await act(async () => {
        await result.current.handleConfirm();
      });

      expect(mockRemovePosition).toHaveBeenCalledTimes(1);
    });
  });
});
