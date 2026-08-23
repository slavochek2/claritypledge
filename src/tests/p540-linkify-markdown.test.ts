/**
 * P1141 SUPERSEDES part of this file's contract — read this before "fixing" a
 * failure here.
 *
 * P540 let a markdown link carry ANY label. The 2026-08-20 security finding
 * (docs/decisions.md) is exactly that permission: a link can display one label
 * while pointing somewhere else, published under a real person's agent account,
 * with the pipeline harvesting comment sections. P1141 narrows the rule to what
 * that finding supports — a link renders as a link only when its visible label
 * and its destination are the same place; on a mismatch the label renders as
 * plain, non-clickable text (fail-safe, content preserved).
 *
 * The labels below were therefore changed to MATCH their destinations. Nothing
 * else about these cases changed, and every XSS assertion in this file is
 * untouched — the scheme allowlist and the dangerous-scheme filtering are
 * unaffected by the narrowing. The mismatch cases themselves are asserted in
 * src/tests/p1141-linkify-structure.test.tsx.
 */
/**
 * @file p540-linkify-markdown.test.ts
 * @description Unit tests for P540: linkifyText() markdown [text](url) support
 *
 * Extends the existing linkify.test.ts (P414) with tests for:
 * - Markdown [text](url) parsing
 * - Mixed content: markdown links + raw URLs + plain text
 * - Processing order: markdown first, then auto-URL (no double-processing)
 * - XSS: javascript: scheme in markdown href
 * - Malformed markdown graceful fallback
 * - Edge cases: nested brackets, empty labels, consecutive links
 */

import { describe, it, expect } from 'vitest';
import type React from 'react';
import { linkifyText } from '@/app/utils/linkify';

describe('linkifyText() — markdown [text](url) support (P540)', () => {
  // ── Basic markdown link parsing ────────────────────────────────────────────
  describe('markdown link parsing', () => {
    it('parses [text](url) into a named link', () => {
      const result = linkifyText('Check [example.com](https://example.com) for details');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links).toHaveLength(1);
      expect(links[0].props.href).toBe('https://example.com');
      expect(links[0].props.children).toBe('example.com');
    });

    it('parses [text](url) with http:// scheme', () => {
      const result = linkifyText('[legacy.example.com](http://legacy.example.com)');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links).toHaveLength(1);
      expect(links[0].props.href).toBe('http://legacy.example.com');
      expect(links[0].props.children).toBe('legacy.example.com');
    });

    it('parses [text](url) with path and query string', () => {
      const result = linkifyText('[example.com/api?v=2&format=json](https://example.com/api?v=2&format=json)');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links).toHaveLength(1);
      expect(links[0].props.href).toBe('https://example.com/api?v=2&format=json');
    });

    it('preserves surrounding plain text', () => {
      const result = linkifyText('See [a.com](https://a.com) for more');
      const texts = result.filter(n => typeof n === 'string') as string[];
      expect(texts[0]).toBe('See ');
      expect(texts[1]).toBe(' for more');
    });
  });

  // ── Mixed content: markdown + raw URLs ─────────────────────────────────────
  describe('mixed content', () => {
    it('handles markdown link + raw URL in same string', () => {
      const result = linkifyText('Check [a.com](https://a.com) and https://b.com');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links).toHaveLength(2);
      // First link: named markdown link
      expect(links[0].props.children).toBe('a.com');
      expect(links[0].props.href).toBe('https://a.com');
      // Second link: auto-detected raw URL
      expect(links[1].props.children).toBe('https://b.com');
      expect(links[1].props.href).toBe('https://b.com');
    });

    it('handles raw URL + markdown link (reversed order)', () => {
      const result = linkifyText('Visit https://a.com or [b.com](https://b.com)');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links).toHaveLength(2);
      expect(links[0].props.href).toBe('https://a.com');
      expect(links[1].props.children).toBe('b.com');
      expect(links[1].props.href).toBe('https://b.com');
    });

    it('handles multiple markdown links in one string', () => {
      const result = linkifyText('[a.com](https://a.com) and [b.com](https://b.com)');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links).toHaveLength(2);
      expect(links[0].props.children).toBe('a.com');
      expect(links[1].props.children).toBe('b.com');
    });

    it('handles bare domain + markdown link', () => {
      const result = linkifyText('See example.com or [named](https://other.org)');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links).toHaveLength(2);
    });
  });

  // ── Processing order: no double-processing ─────────────────────────────────
  describe('processing order (no double-processing)', () => {
    it('URL inside [text](url) is NOT also auto-detected', () => {
      const result = linkifyText('[example.com](https://example.com)');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      // Should produce exactly 1 link (the markdown link), not 2
      expect(links).toHaveLength(1);
      expect(links[0].props.children).toBe('example.com');
    });

    it('bare domain inside markdown href is not double-processed', () => {
      const result = linkifyText('[example.com/path](https://example.com/path)');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links).toHaveLength(1);
      expect(links[0].props.href).toBe('https://example.com/path');
    });
  });

  // ── XSS prevention in markdown ─────────────────────────────────────────────
  describe('XSS prevention in markdown', () => {
    it('does NOT render [text](javascript:alert(1)) as a link', () => {
      const result = linkifyText('[click](javascript:alert(1))');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      // Should render as plain text, not a clickable link
      expect(links).toHaveLength(0);
    });

    it('does NOT render [text](data:text/html,...) as a link', () => {
      const result = linkifyText('[click](data:text/html,<script>alert(1)</script>)');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links).toHaveLength(0);
    });

    it('does NOT render [text](vbscript:...) as a link', () => {
      const result = linkifyText('[click](vbscript:msgbox(1))');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links).toHaveLength(0);
    });
  });

  // ── Malformed markdown graceful fallback ───────────────────────────────────
  describe('malformed markdown', () => {
    it('renders [text] without (url) as plain text', () => {
      const result = linkifyText('This is [not a link] without URL');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links).toHaveLength(0);
      const fullText = result.filter(n => typeof n === 'string').join('');
      expect(fullText).toContain('[not a link]');
    });

    it('renders (url) without [text] as auto-detected URL', () => {
      const result = linkifyText('Check (https://example.com) here');
      // The URL inside parens may or may not be auto-detected depending on regex
      // Key assertion: no crash, returns valid nodes
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('renders nested brackets as plain text: [[text]](url)', () => {
      const result = linkifyText('[[nested]](https://example.com)');
      // Should not crash — may or may not parse as link depending on implementation
      expect(Array.isArray(result)).toBe(true);
    });

    it('renders empty label [](url) as plain text (no empty link)', () => {
      const result = linkifyText('[](https://example.com)');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      // Either no link, or link with non-empty content — no empty <a></a>
      links.forEach(link => {
        if (link.props.children !== undefined) {
          expect(link.props.children).not.toBe('');
        }
      });
    });
  });

  // ── Link attributes consistency ────────────────────────────────────────────
  describe('markdown link attributes', () => {
    it('sets target="_blank" on markdown links', () => {
      const result = linkifyText('[example.com](https://example.com)');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links[0].props.target).toBe('_blank');
    });

    it('sets rel="noopener noreferrer" on markdown links', () => {
      const result = linkifyText('[example.com](https://example.com)');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links[0].props.rel).toBe('noopener noreferrer');
    });

    it('sets className containing text-blue-500 on markdown links', () => {
      const result = linkifyText('[example.com](https://example.com)');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links[0].props.className).toContain('text-blue-500');
    });

    it('does NOT use text-blue-600 (LinkedText legacy color)', () => {
      const result = linkifyText('[example.com](https://example.com)');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links[0].props.className).not.toContain('text-blue-600');
    });
  });

  // ── Existing behavior preserved ────────────────────────────────────────────
  describe('existing auto-URL behavior preserved', () => {
    it('still detects raw https:// URLs', () => {
      const result = linkifyText('Visit https://example.com today');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links).toHaveLength(1);
      expect(links[0].props.href).toBe('https://example.com');
    });

    it('still detects bare domains', () => {
      const result = linkifyText('Check example.com');
      const links = result.filter(n => typeof n === 'object') as React.ReactElement[];
      expect(links).toHaveLength(1);
    });

    it('still blocks dangerous schemes', () => {
      const result = linkifyText('javascript:alert(1)');
      const links = result.filter(n => typeof n === 'object');
      expect(links).toHaveLength(0);
    });

    it('still returns empty array for empty input', () => {
      expect(linkifyText('')).toEqual([]);
    });
  });
});
