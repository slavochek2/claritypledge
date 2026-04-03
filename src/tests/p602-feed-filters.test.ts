/**
 * @file p602-feed-filters.test.ts
 * Unit tests for P602: Feed multi-tag parsing and version collapse logic.
 * P630: Updated to use systemTags for system tag operations.
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
  systemTags: string[];
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
  // P630: system tags moved to systemTags, user tags in tags
  const points: MockPoint[] = [
    { id: '1', statement: 'Point A', tags: [], systemTags: ['understanding', 'st1', 'v1'] },
    { id: '2', statement: 'Point B', tags: [], systemTags: ['misunderstanding', 'st1', 'v1'] },
    { id: '3', statement: 'Point C', tags: ['motivation'], systemTags: ['st8', 'v1'] },
    { id: '4', statement: 'Point D', tags: [], systemTags: ['understanding', 'st2', 'v1'] },
  ];

  it('returns all points when no tags specified', () => {
    expect(filterByTags(points, [])).toEqual(points);
  });

  it('filters by single system tag', () => {
    const result = filterByTags(points, ['understanding']);
    expect(result.map(p => p.id)).toEqual(['1', '4']);
  });

  it('filters by multiple tags (OR logic, mix of user and system)', () => {
    const result = filterByTags(points, ['understanding', 'motivation']);
    expect(result.map(p => p.id)).toEqual(['1', '3', '4']);
  });

  it('returns empty when no points match', () => {
    const result = filterByTags(points, ['nonexistent']);
    expect(result).toEqual([]);
  });
});

describe('getStGroup', () => {
  // P630: getStGroup now takes systemTags array directly
  it('extracts st-number from systemTags', () => {
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
  // P630: getVersion now takes systemTags array directly
  it('extracts version number from systemTags', () => {
    expect(getVersion(['st1', 'v2', 'understanding'])).toBe(2);
  });

  it('returns 1 when no v-tag (BR-9)', () => {
    expect(getVersion(['st1', 'understanding'])).toBe(1);
  });
});

describe('collapseToLatest', () => {
  // P630: collapseToLatest reads from systemTags field
  it('keeps single-version st-groups unchanged', () => {
    const points: MockPoint[] = [
      { id: '1', statement: 'st1 v1', tags: [], systemTags: ['st1', 'v1', 'understanding'] },
      { id: '2', statement: 'st2 v1', tags: [], systemTags: ['st2', 'v1', 'understanding'] },
    ];
    const result = collapseToLatest(points);
    expect(result.map(p => p.id)).toEqual(['1', '2']);
  });

  it('keeps only highest version per st-group', () => {
    const points: MockPoint[] = [
      { id: '1', statement: 'st8 v1', tags: [], systemTags: ['st8', 'v1', 'understanding'] },
      { id: '2', statement: 'st8 v2', tags: [], systemTags: ['st8', 'v2', 'understanding'] },
      { id: '3', statement: 'st9 v1', tags: [], systemTags: ['st9', 'v1', 'understanding'] },
    ];
    const result = collapseToLatest(points);
    expect(result.map(p => p.id)).toEqual(['2', '3']);
  });

  it('passes through points without st-tag (BR-9)', () => {
    const points: MockPoint[] = [
      { id: '1', statement: 'st1 v1', tags: [], systemTags: ['st1', 'v1', 'understanding'] },
      { id: '2', statement: 'no st', tags: [], systemTags: ['v1', 'understanding'] },
    ];
    const result = collapseToLatest(points);
    expect(result.map(p => p.id)).toEqual(['1', '2']);
  });

  it('treats missing v-tag as v1 (BR-9)', () => {
    const points: MockPoint[] = [
      { id: '1', statement: 'st5 no v', tags: [], systemTags: ['st5', 'understanding'] },
      { id: '2', statement: 'st5 v2', tags: [], systemTags: ['st5', 'v2', 'understanding'] },
    ];
    const result = collapseToLatest(points);
    expect(result.map(p => p.id)).toEqual(['2']);
  });

  it('handles empty array', () => {
    expect(collapseToLatest([])).toEqual([]);
  });

  it('sorts collapsed results by st-group number', () => {
    const points: MockPoint[] = [
      { id: '3', statement: 'st3', tags: [], systemTags: ['st3', 'v1'] },
      { id: '1', statement: 'st1', tags: [], systemTags: ['st1', 'v2'] },
      { id: '2', statement: 'st2', tags: [], systemTags: ['st2', 'v1'] },
    ];
    const result = collapseToLatest(points);
    expect(result.map(p => p.id)).toEqual(['1', '2', '3']);
  });
});
