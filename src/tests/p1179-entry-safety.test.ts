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
 *
 * P1323 REMOVED THE ONLY OPERATOR-WRITABLE INPUT to this surface. `buildLinksMenu` no
 * longer accepts per-event extras — that group is retired — so every entry is now built
 * from a literal in event-links.ts. The hostile-extra tests below therefore had nothing
 * left to inject into and have been rewritten to test `isSafeTag` and `stakePath`
 * directly, plus the shape of every produced path.
 *
 * READ THIS BEFORE "SIMPLIFYING" THE FILE: it is now a REGRESSION GUARD with nothing
 * currently behind it, kept deliberately. P1323 R4 defers moving the tag and letter lists
 * into founder-editable data to its own spec, and that spec re-introduces an
 * operator-writable input on exactly this path. The invariant it must hold — a data row
 * supplies a TAG, never a path or a URL — is asserted here already, so it is inherited
 * rather than rediscovered. Deleting these because "nothing calls them with hostile input
 * today" is the failure this note exists to prevent.
 */
import { describe, it, expect } from 'vitest';
import { buildLinksMenu, isSafeTag, stakePath, STANDARD_STAKE_TAGS, STANDARD_TOOL_ENTRIES, STANDARD_LETTER_ENTRIES } from '@/app/data/event-links';

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

  it('the menu is built ONLY from literals — there is no operator-writable input left', () => {
    // Derived, not a literal count: P1256 grew the standard set from 4 to 7 and P1323 added
    // nine letters; a hardcoded number would need editing on every such change while proving
    // nothing. What this asserts is that the entry set is exactly the three source lists.
    const entries = buildLinksMenu('cm-1');
    expect(entries).toHaveLength(
      STANDARD_STAKE_TAGS.length + STANDARD_LETTER_ENTRIES.length + STANDARD_TOOL_ENTRIES.length
    );
    // The retired per-event group must not come back by any route.
    expect(entries.every(e => e.group !== ('event' as unknown as typeof e.group))).toBe(true);
    expect(entries.every(e => ['points', 'letters', 'tools'].includes(e.group))).toBe(true);
  });

  it('a hostile tag can never reach a path, because stakePath is the only constructor', () => {
    // The R4 tripwire: this is the shape a data-sourced row would take. Each hostile value
    // is refused by the guard that any future write path must run first.
    for (const tag of HOSTILE) {
      expect(isSafeTag(tag)).toBe(false);
    }
    // Known-good control through the IDENTICAL path, so a guard that rejects EVERYTHING is
    // distinguishable from one that works. Without this the loop above passes on
    // `isSafeTag = () => false`.
    for (const tag of STANDARD_STAKE_TAGS) {
      expect(isSafeTag(tag)).toBe(true);
      expect(stakePath(tag, 'cm-1')).toBe(`/stake/${tag}?event=cm-1`);
    }
  });

  it('every produced path is internal and not protocol-relative, for every entry', () => {
    const entries = buildLinksMenu('cm-1');
    for (const e of entries) {
      expect(e.to.startsWith('/')).toBe(true);
      expect(e.to.startsWith('//')).toBe(false);
      expect(e.to).not.toMatch(/^\/\\/);
      expect(e.to).not.toMatch(/^[a-z][a-z0-9+.-]*:/i);
    }
  });

  it('a malformed eventSlug cannot break out of the query string', () => {
    // `eventSlug` is the one caller-supplied value left. It is encoded, never concatenated.
    for (const slug of HOSTILE) {
      for (const e of buildLinksMenu(slug)) {
        expect(e.to.startsWith('/')).toBe(true);
        expect(e.to.startsWith('//')).toBe(false);
        expect(e.to).not.toMatch(/^[a-z][a-z0-9+.-]*:/i);
      }
    }
  });

  it('every letter path is built from its code, never taken from data', () => {
    const letters = buildLinksMenu(null).filter(e => e.group === 'letters');
    expect(letters).toHaveLength(STANDARD_LETTER_ENTRIES.length);
    for (const e of letters) {
      expect(e.to).toMatch(/^\/letter\/(ck|st[1-9])$/); // P1351: ck added by name, still no wildcard
      // P1323 R3: a same-tab navigation to an immersive letter route suppresses the nav
      // (no way back to the menu) AND pauses a running capture while the session bar stops
      // rendering — the host would believe the room is still recording. The new tab is the
      // mitigation, so it is an invariant, not a style choice.
      expect(e.newTab).toBe(true);
    }
  });

  it('stakePath encodes the event slug rather than concatenating it raw', () => {
    expect(stakePath('cmp7', 'a b&c=d')).toBe('/stake/cmp7?event=a%20b%26c%3Dd');
    expect(stakePath('cmp7')).toBe('/stake/cmp7');
  });

  /**
   * /finish code review (2026-08-31) found an event extra colliding with a standard tag,
   * rendering /stake/cmp7 TWICE — once under "This event", once under the standard group.
   * With the per-event group retired (P1323 R5) that collision is structurally impossible:
   * there is one list and a tag appears in it once. Asserted rather than assumed, because
   * R4's deferred data spec re-opens exactly this door.
   */
  it('no destination is reachable from two entries', () => {
    const tos = buildLinksMenu('cm-1').map(e => e.to);
    expect(new Set(tos).size).toBe(tos.length);
  });

  it('labels are exactly the three source lists, in tab order', () => {
    expect(buildLinksMenu('cm-1').map(e => e.label)).toEqual([
      ...STANDARD_STAKE_TAGS,
      ...STANDARD_LETTER_ENTRIES.map(l => l.label),
      ...STANDARD_TOOL_ENTRIES.map(t => t.label),
    ]);
  });
});
