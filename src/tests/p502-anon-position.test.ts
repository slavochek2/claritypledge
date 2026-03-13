/**
 * @file p502-anon-position.test.ts
 * @description Unit tests for P502: useAnonPosition localStorage utilities.
 *
 * Tests the localStorage wrapper that stores anonymous position state.
 * Covers: set, get, toggle, clear, batch retrieval, localStorage edge cases.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getAnonPosition,
  setAnonPosition,
  getAllAnonPositions,
  clearAllAnonPositions,
} from '@/app/hooks/useAnonPosition';

const STORAGE_KEY = 'cp-anon-positions';

// Mock localStorage for unit tests
const mockStorage: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { mockStorage[key] = value; }),
  removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
  clear: vi.fn(() => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }),
};

describe('useAnonPosition — localStorage operations', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  describe('getAnonPosition', () => {
    it('returns null when no position is stored for a point', () => {
      const result = getAnonPosition('point-123');
      expect(result).toBeNull();
    });

    it('returns stored position for a point', () => {
      localStorageMock.setItem(STORAGE_KEY, JSON.stringify({ 'point-123': 'agree' }));
      const result = getAnonPosition('point-123');
      expect(result).toBe('agree');
    });

    it('returns null for a different point when only one is stored', () => {
      localStorageMock.setItem(STORAGE_KEY, JSON.stringify({ 'point-123': 'agree' }));
      const result = getAnonPosition('point-456');
      expect(result).toBeNull();
    });

    it('handles corrupted localStorage gracefully (returns null)', () => {
      localStorageMock.setItem(STORAGE_KEY, 'not-valid-json');
      const result = getAnonPosition('point-123');
      expect(result).toBeNull();
    });

    it('returns null for non-object JSON (e.g., string)', () => {
      localStorageMock.setItem(STORAGE_KEY, '"just a string"');
      expect(getAnonPosition('point-123')).toBeNull();
    });

    it('returns null for non-string value (e.g., number)', () => {
      localStorageMock.setItem(STORAGE_KEY, JSON.stringify({ 'point-123': 42 }));
      expect(getAnonPosition('point-123')).toBeNull();
    });
  });

  describe('setAnonPosition', () => {
    it('stores a position for a point', () => {
      setAnonPosition('point-123', 'agree');
      const stored = JSON.parse(localStorageMock.getItem(STORAGE_KEY)!);
      expect(stored['point-123']).toBe('agree');
    });

    it('overwrites an existing position (toggle to different)', () => {
      setAnonPosition('point-123', 'agree');
      setAnonPosition('point-123', 'disagree');
      const stored = JSON.parse(localStorageMock.getItem(STORAGE_KEY)!);
      expect(stored['point-123']).toBe('disagree');
    });

    it('removes position when set to null (deselect)', () => {
      localStorageMock.setItem(STORAGE_KEY, JSON.stringify({ 'point-123': 'agree', 'point-456': 'unsure' }));
      setAnonPosition('point-123', null);
      const stored = JSON.parse(localStorageMock.getItem(STORAGE_KEY)!);
      expect(stored['point-123']).toBeUndefined();
      expect(stored['point-456']).toBe('unsure');
    });

    it('removes storage key entirely when last position is cleared', () => {
      setAnonPosition('point-123', 'agree');
      setAnonPosition('point-123', null);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    });

    it('preserves positions for other points when setting one', () => {
      localStorageMock.setItem(STORAGE_KEY, JSON.stringify({ 'point-111': 'disagree' }));
      setAnonPosition('point-222', 'agree');
      const stored = JSON.parse(localStorageMock.getItem(STORAGE_KEY)!);
      expect(stored['point-111']).toBe('disagree');
      expect(stored['point-222']).toBe('agree');
    });

    it('starts fresh if existing data is corrupted', () => {
      localStorageMock.setItem(STORAGE_KEY, 'corrupt!!!');
      setAnonPosition('point-123', 'agree');
      const stored = JSON.parse(localStorageMock.getItem(STORAGE_KEY)!);
      expect(stored['point-123']).toBe('agree');
    });
  });

  describe('getAllAnonPositions', () => {
    it('returns empty object when nothing stored', () => {
      const result = getAllAnonPositions();
      expect(result).toEqual({});
    });

    it('returns all stored positions', () => {
      const data = { 'point-1': 'agree', 'point-2': 'disagree', 'point-3': 'unsure' };
      localStorageMock.setItem(STORAGE_KEY, JSON.stringify(data));
      const result = getAllAnonPositions();
      expect(result).toEqual(data);
    });

    it('handles corrupted localStorage gracefully (returns empty object)', () => {
      localStorageMock.setItem(STORAGE_KEY, '{broken');
      const result = getAllAnonPositions();
      expect(result).toEqual({});
    });

    it('filters out non-string values', () => {
      localStorageMock.setItem(
        STORAGE_KEY,
        JSON.stringify({ 'point-1': 'agree', 'point-2': 123, 'point-3': null })
      );
      const result = getAllAnonPositions();
      expect(result).toEqual({ 'point-1': 'agree' });
    });
  });

  describe('clearAllAnonPositions', () => {
    it('removes the storage key entirely', () => {
      localStorageMock.setItem(STORAGE_KEY, JSON.stringify({ 'point-1': 'agree' }));
      clearAllAnonPositions();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    });

    it('is safe to call when nothing is stored', () => {
      expect(() => clearAllAnonPositions()).not.toThrow();
    });
  });

  describe('localStorage unavailable (Safari ITP in iframe)', () => {
    it('gracefully handles localStorage throwing SecurityError', () => {
      const throwingStorage = {
        getItem: vi.fn(() => { throw new DOMException('SecurityError'); }),
        setItem: vi.fn(() => { throw new DOMException('SecurityError'); }),
        removeItem: vi.fn(() => { throw new DOMException('SecurityError'); }),
        clear: vi.fn(),
      };
      Object.defineProperty(globalThis, 'localStorage', { value: throwingStorage, writable: true });

      expect(() => setAnonPosition('point-123', 'agree')).not.toThrow();
      expect(getAnonPosition('point-123')).toBeNull();
      expect(getAllAnonPositions()).toEqual({});
      expect(() => clearAllAnonPositions()).not.toThrow();
    });
  });

  describe('roundtrip integration', () => {
    it('set → get → getAll → clear roundtrip works', () => {
      setAnonPosition('p1', 'agree');
      setAnonPosition('p2', 'disagree');
      expect(getAnonPosition('p1')).toBe('agree');
      expect(getAnonPosition('p2')).toBe('disagree');
      expect(getAllAnonPositions()).toEqual({ p1: 'agree', p2: 'disagree' });

      setAnonPosition('p1', null);
      expect(getAnonPosition('p1')).toBeNull();
      expect(getAllAnonPositions()).toEqual({ p2: 'disagree' });

      clearAllAnonPositions();
      expect(getAllAnonPositions()).toEqual({});
    });
  });
});
