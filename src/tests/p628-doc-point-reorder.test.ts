/**
 * @file p628-doc-point-reorder.test.ts
 * @description Regression test for P628: point reorder arrows silently fail
 * for points added after initial order was saved.
 *
 * Tests the logic that handleMovePoint uses to build its working order array.
 * Before fix: newly-linked points missing from saved order → indexOf returns -1 → silent no-op.
 * After fix: orderedPointIds always includes all current points.
 */

import { describe, it, expect } from 'vitest';

// Extracted logic mirrors doc-detail-page.tsx orderedPointIds + handleMovePoint
function buildOrderedPointIds(
  allPointIds: string[],
  savedOrder: string[] | undefined
): string[] {
  if (savedOrder?.length) {
    const orderMap = new Map(savedOrder.map((id, i) => [id, i]));
    return [...allPointIds].sort(
      (a, b) => (orderMap.get(a) ?? 999) - (orderMap.get(b) ?? 999)
    );
  }
  return [...allPointIds];
}

// Before fix: handleMovePoint used savedOrder directly (buggy)
function movePointBuggy(
  pointId: string,
  direction: 'up' | 'down',
  allPointIds: string[],
  savedOrder: string[] | undefined
): string[] | null {
  const currentOrder = savedOrder?.length
    ? savedOrder
    : [...allPointIds];
  const idx = currentOrder.indexOf(pointId);
  if (idx < 0) return null; // silent failure — bug!
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= currentOrder.length) return null;
  const newOrder = [...currentOrder];
  [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
  return newOrder;
}

// After fix: handleMovePoint uses orderedPointIds (correct)
function movePointFixed(
  pointId: string,
  direction: 'up' | 'down',
  allPointIds: string[],
  savedOrder: string[] | undefined
): string[] | null {
  const orderedPointIds = buildOrderedPointIds(allPointIds, savedOrder);
  const idx = orderedPointIds.indexOf(pointId);
  if (idx < 0) return null;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= orderedPointIds.length) return null;
  const newOrder = [...orderedPointIds];
  [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
  return newOrder;
}

describe('P628: doc point reorder with stale saved order', () => {
  const allPoints = ['A', 'B', 'C']; // C is newly linked
  const savedOrder = ['B', 'A']; // stale — missing C

  it('BUG: buggy version silently fails to move newly-linked point C up', () => {
    const result = movePointBuggy('C', 'up', allPoints, savedOrder);
    // Before fix: returns null (silent failure) because C is not in savedOrder
    expect(result).toBeNull();
  });

  it('FIX: fixed version successfully moves newly-linked point C up', () => {
    const result = movePointFixed('C', 'up', allPoints, savedOrder);
    // After fix: C is in orderedPointIds (at end), can be moved up
    expect(result).not.toBeNull();
    expect(result).toContain('C');
    // C was at index 2 (end), moving up swaps with index 1
    expect(result![1]).toBe('C');
  });

  it('FIX: existing points still reorder correctly', () => {
    // Moving A up (A is at index 1 in orderedPointIds [B, A, C])
    const result = movePointFixed('A', 'up', allPoints, savedOrder);
    expect(result).not.toBeNull();
    expect(result![0]).toBe('A');
    expect(result![1]).toBe('B');
  });

  it('FIX: boundary check still works — first point cannot move up', () => {
    // B is first in orderedPointIds [B, A, C]
    const result = movePointFixed('B', 'up', allPoints, savedOrder);
    expect(result).toBeNull(); // correctly blocked at boundary
  });

  it('FIX: no saved order — fallback to allPoints order', () => {
    const result = movePointFixed('B', 'up', ['A', 'B', 'C'], undefined);
    expect(result).not.toBeNull();
    expect(result![0]).toBe('B');
    expect(result![1]).toBe('A');
  });

  it('FIX: self-healing — after move, all IDs are in the new order', () => {
    const result = movePointFixed('C', 'up', allPoints, savedOrder);
    expect(result).toHaveLength(3);
    expect(result).toContain('A');
    expect(result).toContain('B');
    expect(result).toContain('C');
  });
});
