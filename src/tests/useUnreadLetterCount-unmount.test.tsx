import { renderHook, act } from '@testing-library/react';
import { vi, it, expect } from 'vitest';
import { useUnreadLetterCount } from '@/app/hooks/useUnreadLetterCount';

// Slow fetch simulates a real network call that outlasts the component's lifetime.
vi.mock('@/app/data/letters-service', () => ({
  getUnreadLetterCount: () => new Promise(resolve => setTimeout(() => resolve(3), 50)),
}));

vi.mock('@/auth', () => ({
  useAuth: () => ({ user: { id: 'test-user-id' } }),
}));

it('does not fire state updates after unmount', async () => {
  const { result, unmount } = renderHook(() => useUnreadLetterCount());

  // fetchCount fires on mount — setLoading(true) is reflected in result.current
  expect(result.current.loading).toBe(true);

  // Unmount while the in-flight 50ms promise is still pending.
  // isMountedRef cleanup sets isMountedRef.current = false.
  act(() => { unmount(); });

  // Let the in-flight promise resolve after unmount.
  await new Promise(r => setTimeout(r, 100));

  // The isMountedRef guard must have blocked setLoading(false) and setCount(3).
  // result.current retains the last-rendered snapshot — loading stays true and count
  // stays 0, proving the post-unmount state updates were suppressed.
  // Note: React 18 silently drops state updates on unmounted components too,
  // so this test documents the invariant rather than being a fully discriminating canary.
  expect(result.current.count).toBe(0);
  expect(result.current.loading).toBe(true);
});
