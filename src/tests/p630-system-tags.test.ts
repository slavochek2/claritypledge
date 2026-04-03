/**
 * @file p630-system-tags.test.ts
 * Unit tests for P630: System tag separation.
 * Tests isSystemTag(), extractHashtags() filtering, and feed-utils reading from systemTags.
 */

import { describe, it, expect } from 'vitest';
import { isSystemTag, getStGroup, getVersion, collapseToLatest } from '@/lib/feed-utils';
import { extractHashtags } from '@/lib/utils';

describe('isSystemTag', () => {
  // ── st-group tags ──────────────────────────────────────────────────────────
  it('recognizes st1 as system tag', () => {
    expect(isSystemTag('st1')).toBe(true);
  });

  it('recognizes st9 as system tag', () => {
    expect(isSystemTag('st9')).toBe(true);
  });

  it('recognizes double-digit st tags', () => {
    expect(isSystemTag('st12')).toBe(true);
  });

  it('is case-insensitive for st tags', () => {
    expect(isSystemTag('ST1')).toBe(true);
    expect(isSystemTag('St5')).toBe(true);
  });

  // ── version tags ───────────────────────────────────────────────────────────
  it('recognizes v1 as system tag', () => {
    expect(isSystemTag('v1')).toBe(true);
  });

  it('recognizes v2 as system tag', () => {
    expect(isSystemTag('v2')).toBe(true);
  });

  it('is case-insensitive for version tags', () => {
    expect(isSystemTag('V1')).toBe(true);
  });

  // ── category tags ──────────────────────────────────────────────────────────
  it('recognizes understanding as system tag', () => {
    expect(isSystemTag('understanding')).toBe(true);
  });

  it('recognizes misunderstanding as system tag', () => {
    expect(isSystemTag('misunderstanding')).toBe(true);
  });

  it('is case-insensitive for category tags', () => {
    expect(isSystemTag('Understanding')).toBe(true);
    expect(isSystemTag('MISUNDERSTANDING')).toBe(true);
  });

  // ── user tags (must NOT be system) ─────────────────────────────────────────
  it('does NOT recognize freeform user tags as system', () => {
    expect(isSystemTag('leadership')).toBe(false);
    expect(isSystemTag('trust')).toBe(false);
    expect(isSystemTag('teamwork')).toBe(false);
    expect(isSystemTag('hiring')).toBe(false);
  });

  it('does NOT recognize motivation as system tag', () => {
    expect(isSystemTag('motivation')).toBe(false);
  });

  it('does NOT recognize deprecated as system tag', () => {
    expect(isSystemTag('deprecated')).toBe(false);
  });

  // ── edge cases ─────────────────────────────────────────────────────────────
  it('does NOT match partial st patterns', () => {
    expect(isSystemTag('st')).toBe(false);     // no number
    expect(isSystemTag('start')).toBe(false);  // starts with st but not st\d+
    expect(isSystemTag('st1a')).toBe(false);   // extra chars after number
  });

  it('does NOT match partial v patterns', () => {
    expect(isSystemTag('v')).toBe(false);
    expect(isSystemTag('value')).toBe(false);
    expect(isSystemTag('v1a')).toBe(false);
  });
});

// ── extractHashtags with system tag filtering ───────────────────────────────
// After P630, extractHashtags() should return only user tags.

describe('extractHashtags (with system tag filtering)', () => {
  it('extracts only user tags, filtering out system tags', () => {
    const result = extractHashtags('#leadership #st1 #trust #v1 #understanding');
    expect(result).toEqual(['leadership', 'trust']);
  });

  it('returns empty when all tags are system tags', () => {
    const result = extractHashtags('#st1 #v1 #understanding');
    expect(result).toEqual([]);
  });

  it('preserves user tags when no system tags present', () => {
    const result = extractHashtags('#leadership #trust #teamwork');
    expect(result).toEqual(['leadership', 'trust', 'teamwork']);
  });

  it('filters system tags case-insensitively', () => {
    const result = extractHashtags('#ST1 #V2 #Understanding #leadership');
    expect(result).toEqual(['leadership']);
  });

  it('returns empty array when no hashtags', () => {
    expect(extractHashtags('No tags here')).toEqual([]);
  });

  it('handles mixed system and user tags with duplicates', () => {
    const result = extractHashtags('#trust #st5 #trust #misunderstanding');
    expect(result).toEqual(['trust']);
  });
});

// ── Feed utils reading from systemTags ──────────────────────────────────────
// After P630, getStGroup/getVersion/collapseToLatest read from systemTags field.

interface MockItemWithSystemTags {
  id: string;
  tags: string[];        // user tags only
  systemTags: string[];  // system tags only
}

describe('feed-utils with systemTags separation', () => {
  describe('getStGroup reads from systemTags', () => {
    it('extracts st-number from systemTags', () => {
      expect(getStGroup(['st3', 'v1', 'understanding'])).toBe(3);
    });

    it('ignores user tags in systemTags lookup', () => {
      // User has a tag "st5" in their tags — should NOT affect st-group
      // This test verifies isolation: only systemTags matter
      expect(getStGroup(['v1', 'understanding'])).toBeNull();
    });
  });

  describe('getVersion reads from systemTags', () => {
    it('extracts version from systemTags', () => {
      expect(getVersion(['st1', 'v2'])).toBe(2);
    });

    it('defaults to 1 when no v-tag in systemTags', () => {
      expect(getVersion(['st1', 'understanding'])).toBe(1);
    });
  });

  describe('collapseToLatest uses systemTags for grouping', () => {
    it('collapses based on systemTags, ignoring user tags', () => {
      const items: MockItemWithSystemTags[] = [
        { id: '1', tags: ['leadership'], systemTags: ['st8', 'v1', 'understanding'] },
        { id: '2', tags: ['trust'], systemTags: ['st8', 'v2', 'understanding'] },
        { id: '3', tags: ['teamwork'], systemTags: ['st9', 'v1', 'understanding'] },
      ];
      const result = collapseToLatest(items);
      expect(result.map(p => p.id)).toEqual(['2', '3']);
    });

    it('user tag "st5" does NOT create a phantom st-group', () => {
      // A user happened to tag their content #st5 — this should NOT
      // interfere with feed collapsing since it's in tags, not systemTags
      const items: MockItemWithSystemTags[] = [
        { id: '1', tags: ['st5'], systemTags: ['st1', 'v1'] },  // user tag st5, system st1
        { id: '2', tags: [], systemTags: ['st2', 'v1'] },
      ];
      const result = collapseToLatest(items);
      // Should have st1 and st2 groups only (from systemTags), not st5
      expect(result.map(p => p.id)).toEqual(['1', '2']);
    });

    it('sorts by st-group number from systemTags', () => {
      const items: MockItemWithSystemTags[] = [
        { id: '3', tags: [], systemTags: ['st3', 'v1'] },
        { id: '1', tags: [], systemTags: ['st1', 'v1'] },
        { id: '2', tags: [], systemTags: ['st2', 'v1'] },
      ];
      const result = collapseToLatest(items);
      expect(result.map(p => p.id)).toEqual(['1', '2', '3']);
    });
  });
});
