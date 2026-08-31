/**
 * @file p1179-entry-safety.test.ts
 * @description P1179 DW-3: an entry configured with an external or
 * protocol-relative URL is rejected or ignored, verified by ATTEMPTING one.
 *
 * The guarantee here is structural, not a runtime check bolted on afterwards:
 * an entry carries a TAG, and event-links.ts is the only thing that turns a tag
 * into a path, and it produces exactly one shape. So the assertions below feed
 * the module every destination shape an attacker would want and assert none of
 * them survives into a rendered `to`.
 */
import { describe, it, expect } from 'vitest';
import { buildLinksMenu, isSafeTag, stakePath, STANDARD_STAKE_TAGS } from '@/app/data/event-links';

const HOSTILE = [
  'https://evil.com',
  'http://evil.com',
  '//evil.com',
  '/\\evil.com',
  'javascript:alert(1)',
  'data:text/html,<script>',
  '../../admin',
  '..%2F..%2Fadmin',
  'cmp7/../../admin',
  'cmp7?x=1',
  'cmp7#frag',
  'cmp 7',
  '',
  ' ',
];

describe('P1179 DW-3 — an entry can never carry an external destination', () => {
  it.each(HOSTILE)('rejects %j as a tag', (tag) => {
    expect(isSafeTag(tag)).toBe(false);
  });

  it.each(STANDARD_STAKE_TAGS)('accepts the standard tag %s', (tag) => {
    expect(isSafeTag(tag)).toBe(true);
  });

  it('DROPS a hostile extra rather than throwing — the room menu must not fail closed mid-event', () => {
    const extras = HOSTILE.map(tag => ({ tag }));
    const entries = buildLinksMenu(extras, 'cm-1');
    // Exactly the four standard entries survive; every hostile extra is gone.
    expect(entries).toHaveLength(4);
    expect(entries.every(e => e.group !== 'event')).toBe(true);
  });

  it('every produced path is internal and not protocol-relative, for every input', () => {
    const entries = buildLinksMenu(
      [...HOSTILE.map(tag => ({ tag })), { tag: 'topic', label: 'Tonight' }],
      'cm-1'
    );
    for (const e of entries) {
      expect(e.to.startsWith('/')).toBe(true);
      expect(e.to.startsWith('//')).toBe(false);
      expect(e.to).not.toMatch(/^\/\\/);
      expect(e.to).not.toMatch(/^[a-z][a-z0-9+.-]*:/i);
    }
  });

  it('malformed extras that are not objects are ignored', () => {
    const entries = buildLinksMenu(
      [null, undefined, 'cmp7', 42, [], { label: 'no tag' }] as never,
      'cm-1'
    );
    expect(entries).toHaveLength(4);
  });

  it('stakePath encodes the event slug rather than concatenating it raw', () => {
    expect(stakePath('cmp7', 'a b&c=d')).toBe('/stake/cmp7?event=a%20b%26c%3Dd');
    expect(stakePath('cmp7')).toBe('/stake/cmp7');
  });
});
