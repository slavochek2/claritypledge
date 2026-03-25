/**
 * @file useAnonPosition.ts
 * @description P502: localStorage utilities for anonymous position persistence.
 * Plain functions (not a React hook) wrapping localStorage.
 *
 * Handles: corrupted JSON (returns null/empty), localStorage unavailable
 * (Safari ITP in iframe — catches SecurityError, no-ops).
 */

const STORAGE_KEY = 'cp-anon-positions';

type AnonPositionValue = string; // PositionType values

/**
 * Get the anonymous position for a specific point.
 * Returns null if no position set, localStorage unavailable, or data corrupted.
 */
export function getAnonPosition(pointId: string): AnonPositionValue | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const value = parsed[pointId];
    return typeof value === 'string' ? value : null;
  } catch {
    // SecurityError (Safari ITP), SyntaxError (corrupted JSON), etc.
    return null;
  }
}

/**
 * Set or clear the anonymous position for a specific point.
 * Pass null to remove the position for that point.
 */
export function setAnonPosition(pointId: string, position: AnonPositionValue | null): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    let positions: Record<string, AnonPositionValue> = {};
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed !== null) {
          positions = parsed;
        }
      } catch {
        // Corrupted JSON — start fresh
      }
    }
    if (position === null) {
      const { [pointId]: _, ...rest } = positions;
      void _;
      positions = rest;
    } else {
      positions[pointId] = position;
    }
    // Clean up: remove storage key entirely if empty
    if (Object.keys(positions).length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
    }
  } catch {
    // SecurityError (Safari ITP in iframe) — no-op
  }
}

/**
 * Get all anonymous positions. Returns empty object if none set or error.
 */
export function getAllAnonPositions(): Record<string, AnonPositionValue> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    // Filter to only string values
    const result: Record<string, AnonPositionValue> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        result[key] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Clear all anonymous positions from localStorage.
 */
export function clearAllAnonPositions(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // SecurityError — no-op
  }
}
