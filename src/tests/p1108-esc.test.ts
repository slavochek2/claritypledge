/**
 * P1108 — ESC-1 (folded in against the recommendation to split — founder decision,
 * see `## Resolved Decisions (goalify)`). `esc()` was previously missing `>` and `'`.
 * Verified not currently exploitable (every dynamic value lands in a double-quoted
 * attribute or the `<title>` text node) — this is hardening, not a live-vuln fix.
 */
import { describe, it, expect } from 'vitest';
import { esc } from '../../api/og';

describe('api/og.ts — esc() escapes all five characters (P1108 ESC-1)', () => {
  it('escapes &', () => {
    expect(esc('a & b')).toBe('a &amp; b');
  });

  it('escapes "', () => {
    expect(esc('say "hi"')).toBe('say &quot;hi&quot;');
  });

  it('escapes <', () => {
    expect(esc('a < b')).toBe('a &lt; b');
  });

  it('escapes >', () => {
    expect(esc('a > b')).toBe('a &gt; b');
  });

  it("escapes '", () => {
    expect(esc("it's here")).toBe('it&#39;s here');
  });

  it('escapes all five in one string, & first so its own entities are not re-escaped', () => {
    expect(esc(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});
