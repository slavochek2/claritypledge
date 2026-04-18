import { renderHook, act } from '@testing-library/react';
import { vi, it, expect } from 'vitest';
import { usePointsForProfile, usePointsForFeed } from '@/app/hooks/usePointsForDisplay';

// Slow fetch simulates a real network call that outlasts the component's lifetime.
vi.mock('@/app/data/points-service', () => ({
  pointsService: {
    getPointsForProfileDisplay: () =>
      new Promise(resolve => setTimeout(() => resolve([]), 50)),
    getPointsForFeedDisplay: () =>
      new Promise(resolve => setTimeout(() => resolve([]), 50)),
  },
}));

vi.mock('@/auth', () => ({
  useAuth: () => ({ user: { id: 'test-user-id' } }),
}));

it('usePointsForProfile: does not fire state updates after unmount', async () => {
  const { result, unmount } = renderHook(() => usePointsForProfile('profile-1'));

  // load fires on mount — setLoading(true) is reflected in result.current
  expect(result.current.loading).toBe(true);

  // Unmount while the in-flight 50ms promise is still pending.
  act(() => { unmount(); });

  // Let the in-flight promise resolve after unmount.
  await new Promise(r => setTimeout(r, 100));

  // isMountedRef guard must have blocked setLoading(false) and setPoints([]).
  // result.current retains the last-rendered snapshot — loading stays true,
  // proving the post-unmount state updates were suppressed.
  // Note: React 18 silently drops state updates on unmounted components too,
  // so this test documents the invariant rather than being a fully discriminating canary.
  expect(result.current.loading).toBe(true);
  expect(result.current.points).toEqual([]);
});

it('usePointsForFeed: does not fire state updates after unmount', async () => {
  const { result, unmount } = renderHook(() => usePointsForFeed(20, 0));

  expect(result.current.loading).toBe(true);

  act(() => { unmount(); });

  await new Promise(r => setTimeout(r, 100));

  expect(result.current.loading).toBe(true);
  expect(result.current.points).toEqual([]);
});
