/**
 * P940: ear metric redefinition — guardrail tests.
 *
 * Covers the consistency guardrail (not the DB trigger semantics, which are verified
 * against the test database — see the migration verification in the spec). Two layers:
 *  1. earCountOf / earTooltip pure-function behavior.
 *  2. A static guard asserting every people-returning data-layer query selects
 *     `ears_count` — the real "can't forget the column" mechanism (the event-host bug).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { earCountOf } from '@/app/data/ear-count';
import { earTooltip } from '@/components/ui/ear-tooltip';

describe('earCountOf', () => {
  it('reads ears_count from a joined row', () => {
    expect(earCountOf({ ears_count: 5 })).toBe(5);
  });
  it('defaults to 0 for null/undefined row or missing column', () => {
    expect(earCountOf(null)).toBe(0);
    expect(earCountOf(undefined)).toBe(0);
    expect(earCountOf({})).toBe(0);
    expect(earCountOf({ ears_count: null })).toBe(0);
  });
});

describe('earTooltip', () => {
  it('shows the empty-state copy at 0', () => {
    expect(earTooltip(0, 'Su Myat Noe')).toBe('No explain-backs rated yet');
  });
  it('uses the first name and singular noun at 1', () => {
    expect(earTooltip(1, 'Su Myat Noe')).toBe(
      'Su has done 1 rated explain-back — paraphrasing story authors back to them',
    );
  });
  it('pluralizes for N≠1', () => {
    expect(earTooltip(5, 'Su Myat Noe')).toBe(
      'Su has done 5 rated explain-backs — paraphrasing story authors back to them',
    );
  });
  it('uses second person for the owner', () => {
    expect(earTooltip(3, 'Su Myat Noe', true)).toBe(
      'You have done 3 rated explain-backs — paraphrasing story authors back to them',
    );
  });
  it('never claims "verified understanding" (the retired credibility framing)', () => {
    expect(earTooltip(5, 'Su')).not.toContain('verified cognitive understanding');
  });
});

/**
 * Returns the column-list of every embedded `profiles` select that includes
 * `has_pledged` (the marker of a person-card row) but is MISSING `ears_count`.
 * An empty array means every people-select fetches the ear count.
 */
function peopleSelectsMissingEarsCount(source: string): string[] {
  const embedRe = /(?::profiles!|profiles:)[^(]*\(([^)]*)\)/g;
  const offenders: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = embedRe.exec(source)) !== null) {
    const columns = m[1];
    if (columns.includes('has_pledged') && !columns.includes('ears_count')) {
      offenders.push(columns.replace(/\s+/g, ' ').trim());
    }
  }
  return offenders;
}

describe('ear-count select guard', () => {
  const DATA_FILES = [
    'events-service-real.ts',
    'stories-service-real.ts',
    'points-service-real.ts',
    'letters-service.ts',
    'docs-service.ts',
    'api.ts',
  ];

  it.each(DATA_FILES)(
    'every people-returning select in %s includes ears_count',
    (file) => {
      const source = readFileSync(join(process.cwd(), 'src/app/data', file), 'utf8');
      expect(peopleSelectsMissingEarsCount(source)).toEqual([]);
    },
  );

  // Proof the guard actually fires (epistemic gate 7) — a person-select that drops
  // ears_count must be flagged; one that keeps it must not.
  it('flags a person-select that omits ears_count', () => {
    const broken = 'host:profiles!events_host_id_fkey ( id, full_name:name, has_pledged )';
    expect(peopleSelectsMissingEarsCount(broken)).toHaveLength(1);
  });
  it('passes a person-select that includes ears_count', () => {
    const fixed = 'host:profiles!events_host_id_fkey ( id, has_pledged, ears_count )';
    expect(peopleSelectsMissingEarsCount(fixed)).toEqual([]);
  });
});
