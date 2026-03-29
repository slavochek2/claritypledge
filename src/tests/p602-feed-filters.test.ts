/**
 * @file p602-feed-filters.test.ts
 * Unit tests for P602: Feed multi-tag parsing and version collapse logic.
 */

import { describe, it, expect } from 'vitest';
import {
  parseTags,
  serializeTags,
  filterByTags,
  getStGroup,
  getVersion,
  collapseToLatest,
} from '../lib/feed-utils';

interface MockPoint {
  id: string;
  statement: string;
  tags: string[];
}

describe('parseTags', () => {
  it('returns empty array for null', () => {
    expect(parseTags(null)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseTags('')).toEqual([]);
  });

  it('parses single tag', () => {
    expect(parseTags('understanding')).toEqual(['understanding']);
  });

  it('parses multiple comma-separated tags', () => {
    expect(parseTags('understanding,motivation')).toEqual(['understanding', 'motivation']);
  });

  it('trims whitespace around tags', () => {
    expect(parseTags('understanding , motivation')).toEqual(['understanding', 'motivation']);
  });

  it('ignores empty segments from trailing commas', () => {
    expect(parseTags('understanding,,motivation,')).toEqual(['understanding', 'motivation']);
  });
});

describe('serializeTags', () => {
  it('returns null for empty array', () => {
    expect(serializeTags([])).toBeNull();
  });

  it('serializes single tag', () => {
    expect(serializeTags(['understanding'])).toBe('understanding');
  });

  it('serializes multiple tags comma-separated', () => {
    expect(serializeTags(['understanding', 'motivation'])).toBe('understanding,motivation');
  });
});

describe('filterByTags (OR logic)', () => {
  const points: MockPoint[] = [
    { id: '1', statement: 'Point A', tags: ['understanding', 'st1', 'v1'] },
    { id: '2', statement: 'Point B', tags: ['misunderstanding', 'st1', 'v1'] },
    { id: '3', statement: 'Point C', tags: ['motivation', 'st8', 'v1'] },
    { id: '4', statement: 'Point D', tags: ['understanding', 'st2', 'v1'] },
  ];

  it('returns all points when no tags specified', () => {
    expect(filterByTags(points, [])).toEqual(points);
  });

  it('filters by single tag', () => {
    const result = filterByTags(points, ['understanding']);
    expect(result.map(p => p.id)).toEqual(['1', '4']);
  });

  it('filters by multiple tags (OR logic)', () => {
    const result = filterByTags(points, ['understanding', 'motivation']);
    expect(result.map(p => p.id)).toEqual(['1', '3', '4']);
  });

  it('returns empty when no points match', () => {
    const result = filterByTags(points, ['nonexistent']);
    expect(result).toEqual([]);
  });
});

describe('getStGroup', () => {
  it('extracts st-number from tags', () => {
    expect(getStGroup(['understanding', 'st3', 'v1'])).toBe(3);
  });

  it('returns null when no st-tag', () => {
    expect(getStGroup(['understanding', 'v1'])).toBeNull();
  });

  it('handles double-digit st numbers', () => {
    expect(getStGroup(['st12', 'v1'])).toBe(12);
  });
});

describe('getVersion', () => {
  it('extracts version number from tags', () => {
    expect(getVersion(['st1', 'v2', 'understanding'])).toBe(2);
  });

  it('returns 1 when no v-tag (BR-9)', () => {
    expect(getVersion(['st1', 'understanding'])).toBe(1);
  });
});

describe('collapseToLatest', () => {
  it('keeps single-version st-groups unchanged', () => {
    const points: MockPoint[] = [
      { id: '1', statement: 'st1 v1', tags: ['st1', 'v1', 'understanding'] },
      { id: '2', statement: 'st2 v1', tags: ['st2', 'v1', 'understanding'] },
    ];
    const result = collapseToLatest(points);
    expect(result.map(p => p.id)).toEqual(['1', '2']);
  });

  it('keeps only highest version per st-group', () => {
    const points: MockPoint[] = [
      { id: '1', statement: 'st8 v1', tags: ['st8', 'v1', 'understanding'] },
      { id: '2', statement: 'st8 v2', tags: ['st8', 'v2', 'understanding'] },
      { id: '3', statement: 'st9 v1', tags: ['st9', 'v1', 'understanding'] },
    ];
    const result = collapseToLatest(points);
    expect(result.map(p => p.id)).toEqual(['2', '3']);
  });

  it('passes through points without st-tag (BR-9)', () => {
    const points: MockPoint[] = [
      { id: '1', statement: 'st1 v1', tags: ['st1', 'v1', 'understanding'] },
      { id: '2', statement: 'no st', tags: ['v1', 'understanding'] },
    ];
    const result = collapseToLatest(points);
    expect(result.map(p => p.id)).toEqual(['1', '2']);
  });

  it('treats missing v-tag as v1 (BR-9)', () => {
    const points: MockPoint[] = [
      { id: '1', statement: 'st5 no v', tags: ['st5', 'understanding'] },
      { id: '2', statement: 'st5 v2', tags: ['st5', 'v2', 'understanding'] },
    ];
    const result = collapseToLatest(points);
    expect(result.map(p => p.id)).toEqual(['2']);
  });

  it('handles empty array', () => {
    expect(collapseToLatest([])).toEqual([]);
  });
});
