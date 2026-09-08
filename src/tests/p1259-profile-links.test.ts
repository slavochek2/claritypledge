/**
 * @file p1259-profile-links.test.ts
 * @description P1259 change 3 — the `https:` scheme allowlist on `profiles.links`.
 *
 * THE INVARIANT, verbatim from the spec: "Any URL rendered as a link from the new `links`
 * field must pass a scheme allowlist (`https:` only) applied at render, not only at write.
 * An unvalidated JSONB list rendered as anchors on a public page accepts `javascript:` and
 * `data:` URLs. The field is operator-written today, which is not a reason to skip it — the
 * invariant is what keeps it true when it stops being."
 *
 * Found by adversarial review of the spec, not by its author.
 *
 * WHAT THIS FIXTURE CANNOT REACH, stated rather than implied (epistemic gate 7b). These are
 * unit tests over the validator. They prove the validator rejects what it should; they do
 * NOT prove every render path goes through it. That second claim is carried by exactly one
 * thing — `ProfileSubjectLinks` being the only component that reads the field — and the
 * `links?: unknown` type on `Profile` is what keeps it that way: a call site that wants to
 * map over the array has to widen the type first, which is visible in review. If a future
 * change types that field as `ProfileLink[]`, this suite goes on passing while the
 * guarantee is gone.
 */

import { describe, it, expect } from 'vitest';
import {
  isSafeProfileLinkUrl,
  normalizeProfileLinks,
  profileLinkLabel,
} from '@/lib/profile-links';

describe('P1259 — profile links: the scheme allowlist', () => {
  it('accepts an ordinary https URL', () => {
    expect(isSafeProfileLinkUrl('https://en.wikipedia.org/wiki/Yann_LeCun')).toBe(true);
  });

  /**
   * The attack list. Each of these reaches an `href` on a PUBLIC page bearing a real
   * person's name if the gate is removed — `javascript:` executes, `data:` renders
   * attacker-controlled HTML in the page's own origin.
   */
  it.each([
    ['javascript:', 'javascript:alert(1)'],
    ['uppercase javascript:', 'JavaScript:alert(1)'],
    ['whitespace-split javascript:', 'java\tscript:alert(1)'],
    ['leading-whitespace javascript:', '  javascript:alert(1)'],
    ['data:', 'data:text/html,<script>alert(1)</script>'],
    ['blob:', 'blob:https://example.com/1234'],
    ['vbscript:', 'vbscript:msgbox(1)'],
    ['file:', 'file:///etc/passwd'],
  ])('rejects %s', (_label, url) => {
    expect(isSafeProfileLinkUrl(url)).toBe(false);
  });

  /**
   * http: is rejected too, and that is a decision rather than an oversight: a profile link
   * is a public claim about a real person who never consented to the account, and sending a
   * reader to a plaintext page under that claim is the avoidable part.
   */
  it('rejects plain http', () => {
    expect(isSafeProfileLinkUrl('http://example.com')).toBe(false);
  });

  it.each([
    ['a relative path', '/p/yann-lecun'],
    ['a scheme-relative URL', '//evil.example.com'],
    ['a bare host', 'example.com'],
    ['an empty string', ''],
    ['whitespace only', '   '],
    ['a number', 42],
    ['null', null],
    ['undefined', undefined],
    ['an object', { url: 'https://example.com' }],
  ])('rejects %s', (_label, value) => {
    expect(isSafeProfileLinkUrl(value)).toBe(false);
  });
});

describe('P1259 — profile links: normalization', () => {
  it('keeps only the safe entries and drops the rest silently', () => {
    const out = normalizeProfileLinks([
      { url: 'https://en.wikipedia.org/wiki/Yann_LeCun', label: 'Wikipedia' },
      { url: 'javascript:alert(1)', label: 'Totally fine' },
      { url: 'http://example.com' },
      'https://not-an-object.example.com',
      null,
      { label: 'no url at all' },
      { url: 'https://yann.lecun.com' },
    ]);
    expect(out.map((l) => l.url)).toEqual([
      'https://en.wikipedia.org/wiki/Yann_LeCun',
      'https://yann.lecun.com',
    ]);
  });

  it('de-duplicates repeated URLs', () => {
    const out = normalizeProfileLinks([
      { url: 'https://example.com' },
      { url: 'https://example.com', label: 'Again' },
    ]);
    expect(out).toHaveLength(1);
  });

  it.each([
    ['a non-array', { url: 'https://example.com' }],
    ['a string', 'https://example.com'],
    ['null', null],
    ['undefined', undefined],
  ])('returns an empty list for %s', (_label, raw) => {
    expect(normalizeProfileLinks(raw)).toEqual([]);
  });

  /**
   * The empty case is a RENDER contract, not a cosmetic one — spec, UX Notes: "Social
   * links, none set: the row is absent, not an empty placeholder." An all-rejected list
   * must be indistinguishable from an absent one.
   */
  it('an entirely unsafe list normalizes to empty, so the row renders as absent', () => {
    expect(normalizeProfileLinks([{ url: 'javascript:alert(1)' }, { url: 'data:text/html,x' }])).toEqual([]);
  });

  it('trims a blank label rather than rendering it', () => {
    const [link] = normalizeProfileLinks([{ url: 'https://example.com', label: '   ' }]);
    expect(link?.label).toBeUndefined();
  });
});

describe('P1259 — profile links: the visible label', () => {
  it('uses the operator label when there is one', () => {
    expect(profileLinkLabel({ url: 'https://x.com/ylecun', label: 'X' })).toBe('X');
  });

  it('falls back to the host, without www.', () => {
    expect(profileLinkLabel({ url: 'https://www.wikipedia.org/wiki/X' })).toBe('wikipedia.org');
    expect(profileLinkLabel({ url: 'https://yann.lecun.com/ex/index.html' })).toBe('yann.lecun.com');
  });
});
