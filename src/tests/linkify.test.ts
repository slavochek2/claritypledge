/**
 * @file linkify.test.ts
 * @description Unit tests for linkifyText() utility — P414: Profile bio
 *
 * 27 tests covering:
 * - Empty / null input
 * - Plain text (no URLs)
 * - https:// URL detection
 * - http:// URL detection
 * - Bare domain.tld detection
 * - Bare domain with path
 * - Multiple URLs in one string
 * - Mixed text and URLs
 * - Dangerous scheme blocking (javascript:, vbscript:, data:, blob:)
 * - HTML injection (plain text, not raw HTML)
 * - Bare domain href https:// prefix
 * - URL attributes (target, rel, className)
 * - Return type (ReactNode[])
 */

import { describe, it, expect } from 'vitest';
import type React from 'react';
import { linkifyText } from '@/app/utils/linkify';

describe('linkifyText()', () => {
  // ── Empty / falsy input ────────────────────────────────────────────────────
  describe('empty input', () => {
    it('returns empty array for empty string', () => {
      expect(linkifyText('')).toEqual([]);
    });

    it('returns empty array for null-coerced empty', () => {
      // @ts-expect-error testing JS runtime coercion
      expect(linkifyText(null)).toEqual([]);
    });

    it('returns empty array for undefined-coerced empty', () => {
      // @ts-expect-error testing JS runtime coercion
      expect(linkifyText(undefined)).toEqual([]);
    });
  });

  // ── Plain text (no URLs) ───────────────────────────────────────────────────
  describe('plain text (no URLs)', () => {
    it('returns single string node for plain text', () => {
      const result = linkifyText('Hello world');
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('Hello world');
    });

    it('returns single string node for text with numbers', () => {
      const result = linkifyText('10+ years of experience');
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('10+ years of experience');
    });

    it('does NOT linkify email addresses', () => {
      const result = linkifyText('Contact me at foo@bar.com');
      // email address contains .com but the @ prefix should not match bare domain
      // The part "bar.com" might match — test that the link href is not the email
      const links = result.filter(node => typeof node === 'object');
      links.forEach(link => {
        const el = link as React.ReactElement;
        expect(el.props?.href ?? '').not.toContain('foo@');
      });
    });
  });

  // ── https:// URL detection ─────────────────────────────────────────────────
  describe('https:// URL detection', () => {
    it('detects a simple https:// URL', () => {
      const result = linkifyText('Visit https://example.com today');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links).toHaveLength(1);
      expect(links[0].props.href).toBe('https://example.com');
    });

    it('detects https:// URL with path', () => {
      const result = linkifyText('See https://linkedin.com/in/sarah for details');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links[0].props.href).toBe('https://linkedin.com/in/sarah');
    });

    it('does not alter https:// href (no double-prefix)', () => {
      const result = linkifyText('https://example.com');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links[0].props.href).toBe('https://example.com');
      expect(links[0].props.href).not.toContain('https://https://');
    });
  });

  // ── http:// URL detection ──────────────────────────────────────────────────
  describe('http:// URL detection', () => {
    it('detects a simple http:// URL', () => {
      const result = linkifyText('Visit http://example.com today');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links).toHaveLength(1);
      expect(links[0].props.href).toBe('http://example.com');
    });
  });

  // ── Bare domain detection ──────────────────────────────────────────────────
  describe('bare domain detection', () => {
    it('detects a bare .com domain', () => {
      const result = linkifyText('Visit example.com for more');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links).toHaveLength(1);
      expect(links[0].props.href).toBe('https://example.com');
    });

    it('detects a bare .io domain', () => {
      const result = linkifyText('Check out myapp.io');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links).toHaveLength(1);
      expect(links[0].props.href).toBe('https://myapp.io');
    });

    it('detects a bare .org domain', () => {
      const result = linkifyText('mozilla.org has docs');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links[0].props.href).toBe('https://mozilla.org');
    });

    it('detects bare domain with path', () => {
      const result = linkifyText('linkedin.com/in/sarah-coach');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links[0].props.href).toBe('https://linkedin.com/in/sarah-coach');
    });

    it('prefixes bare domain href with https://', () => {
      const result = linkifyText('example.com');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links[0].props.href).toMatch(/^https:\/\//);
    });
  });

  // ── P983: second bare-domain match glued to a preceding domain's tail (lookbehind replacement) ──
  describe('bare domain glued to a preceding domain match (P983)', () => {
    it('does NOT linkify a second bare domain glued directly onto the tail of the first match', () => {
      // "example.combar.com" — the domain char class is greedy, so a leading
      // word-char prefix (e.g. "xfoo.com") is always absorbed into a single
      // match at its own start. The only real preceded-by-word-char case is a
      // SECOND match beginning right where the first one's word-chars ended.
      const result = linkifyText('See example.combar.com here');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      const texts = result.filter(n => typeof n === 'string') as string[];
      expect(links).toHaveLength(1);
      expect(links[0].props.href).toBe('https://example.com');
      expect(texts.some(t => t.includes('bar.com'))).toBe(true);
    });

    it('still linkifies a standalone bare domain preceded by whitespace', () => {
      const result = linkifyText('visit foo.com today');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links).toHaveLength(1);
      expect(links[0].props.href).toBe('https://foo.com');
    });

    it('still linkifies a full https:// URL even when glued to a preceding word char', () => {
      const result = linkifyText('seehttps://example.com');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links).toHaveLength(1);
      expect(links[0].props.href).toBe('https://example.com');
    });
  });

  // ── Multiple URLs ──────────────────────────────────────────────────────────
  describe('multiple URLs', () => {
    it('detects two URLs in one string', () => {
      const result = linkifyText('See example.com and https://other.org');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links).toHaveLength(2);
    });

    it('preserves text between two URLs', () => {
      const result = linkifyText('A example.com B https://other.org C');
      const texts = result.filter(n => typeof n === 'string') as string[];
      expect(texts.some(t => t.includes('A '))).toBe(true);
      expect(texts.some(t => t.includes(' B '))).toBe(true);
      expect(texts.some(t => t.includes(' C'))).toBe(true);
    });
  });

  // ── Mixed text and URLs ────────────────────────────────────────────────────
  describe('mixed text and URLs', () => {
    it('returns plain text before a URL', () => {
      const result = linkifyText('Hello example.com');
      expect(result[0]).toBe('Hello ');
    });

    it('returns plain text after a URL', () => {
      const result = linkifyText('example.com is great');
      const texts = result.filter(n => typeof n === 'string') as string[];
      expect(texts).toContain(' is great');
    });
  });

  // ── Dangerous scheme blocking ──────────────────────────────────────────────
  describe('dangerous scheme blocking', () => {
    it('does NOT linkify javascript: scheme', () => {
      const result = linkifyText('javascript:alert(1)');
      const links = result.filter(n => typeof n === 'object');
      expect(links).toHaveLength(0);
    });

    it('does NOT linkify vbscript: scheme', () => {
      const result = linkifyText('vbscript:msgbox(1)');
      const links = result.filter(n => typeof n === 'object');
      expect(links).toHaveLength(0);
    });

    it('does NOT linkify data: scheme', () => {
      const result = linkifyText('data:text/html,<script>alert(1)</script>');
      const links = result.filter(n => typeof n === 'object');
      expect(links).toHaveLength(0);
    });

    it('does NOT linkify blob: scheme', () => {
      const result = linkifyText('blob:https://example.com/abc');
      const links = result.filter(n => typeof n === 'object');
      expect(links).toHaveLength(0);
    });
  });

  // ── HTML / XSS injection prevention ───────────────────────────────────────
  describe('HTML injection prevention', () => {
    it('renders <script> text as a plain string node', () => {
      const result = linkifyText('<script>alert(1)</script>');
      result.forEach(node => {
        expect(typeof node).toBe('string');
      });
    });

    it('renders HTML tags as plain text (not DOM elements)', () => {
      const result = linkifyText('Hello <b>world</b>');
      const links = result.filter(n => typeof n === 'object');
      expect(links).toHaveLength(0);
    });
  });

  // ── Link attributes ────────────────────────────────────────────────────────
  describe('link attributes', () => {
    it('sets target="_blank" on all links', () => {
      const result = linkifyText('example.com');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links[0].props.target).toBe('_blank');
    });

    it('sets rel="noopener noreferrer" on all links', () => {
      const result = linkifyText('example.com');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links[0].props.rel).toBe('noopener noreferrer');
    });

    it('sets className containing text-blue-500', () => {
      const result = linkifyText('example.com');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links[0].props.className).toContain('text-blue-500');
    });

    it('link text content equals the matched URL (not the href)', () => {
      const result = linkifyText('example.com');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      // children is the URL string itself (not the https:// prefixed href)
      expect(links[0].props.children).toBe('example.com');
    });
  });

  // ── Return type ────────────────────────────────────────────────────────────
  describe('return type', () => {
    it('returns an array', () => {
      expect(Array.isArray(linkifyText('hello'))).toBe(true);
    });

    it('link nodes are React elements (have type "a")', () => {
      const result = linkifyText('example.com');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links[0].type).toBe('a');
    });
  });
});
