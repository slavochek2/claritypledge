/**
 * @file p1141-linkify-structure.test.tsx
 * @description DW-8 — story text renders structure (bold, breaks, blockquotes,
 * headings), and a link whose label differs from its destination does not
 * render as a link, across all five bypass classes the security review
 * enumerated.
 *
 * The match is a NET-NEW check, not a tightening: no label/destination
 * comparison existed anywhere before P1141. `safeMd`'s link() override
 * validates the SCHEME only, and linkify's MARKDOWN_PATTERN treated label and
 * href as independent strings — which is precisely the 2026-08-20 finding.
 *
 * Naive `text === href` is insufficient, so each of (a)-(e) below is verified
 * by its own case rather than assumed to fall out of the others.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { linkifyText, renderStoryText, labelMatchesDestination, hasConfusableHost } from '@/app/utils/linkify';

function renderNodes(nodes: React.ReactNode[]) {
  return render(<div data-testid="out">{nodes}</div>);
}

describe('p1141 DW-8 — a mismatched label never renders as a link', () => {
  it('the plain disguise: a label naming one site, a href pointing at another', () => {
    const { container } = renderNodes(linkifyText('[https://apple.com](https://evil.com)'));
    expect(container.querySelector('a')).toBeNull();
    // Fail-safe, not destructive: the reader still sees what was written.
    expect(container.textContent).toContain('https://apple.com');
  });

  it('a matching label DOES still render as a link — the check is not a blanket ban', () => {
    const { container } = renderNodes(linkifyText('[https://example.com](https://example.com)'));
    const anchor = container.querySelector('a');
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('href')).toBe('https://example.com');
  });

  // (a) compare PARSED urls, post-parse — never raw strings, or percent-encoding
  //     splits what the check saw from what the browser renders.
  it('(a) percent-encoding cannot split the comparison from the rendered destination', () => {
    // %65 is 'e'. Raw-string equality fails here; parsed equality must not be fooled
    // into treating a DIFFERENT host as equal either.
    expect(labelMatchesDestination('https://evil.com', 'https://%65vil.com')).toBe(true);
    expect(labelMatchesDestination('https://good.com', 'https://%65vil.com')).toBe(false);
    const { container } = renderNodes(linkifyText('[https://good.com](https://%65vil.com)'));
    expect(container.querySelector('a')).toBeNull();
  });

  // (b) a SEPARATE mixed-script check — a homograph is byte-identical in label
  //     and href, so matching structurally cannot express this.
  it('(b) a homograph host is rejected even though label and href match exactly', () => {
    const cyrillic = 'https://аpple.com'; // Cyrillic а
    expect(hasConfusableHost(cyrillic)).toBe(true);
    // The label matches the href byte-for-byte — matching alone would pass it.
    expect(labelMatchesDestination(cyrillic, cyrillic)).toBe(false);
    const { container } = renderNodes(linkifyText(`[${cyrillic}](${cyrillic})`));
    expect(container.querySelector('a')).toBeNull();
  });

  it('(b) an already-punycoded host is rejected in its encoded form too', () => {
    expect(hasConfusableHost('https://xn--pple-43d.com')).toBe(true);
    expect(labelMatchesDestination('https://xn--pple-43d.com', 'https://xn--pple-43d.com')).toBe(false);
  });

  it('(b) an ordinary Latin host is NOT swept up by the confusable check', () => {
    expect(hasConfusableHost('https://sub-domain.example.co.uk')).toBe(false);
  });

  // (c) reference-style links — `marked` supports them, the regex never saw them.
  it('(c) a reference-style link is rejected explicitly, not silently linked', () => {
    const { container } = renderNodes(linkifyText('[Real Site][ref]'));
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('Real Site');
  });

  // (d) autolinks trivially satisfy any match — confirm the scheme allowlist
  //     still applies to them.
  it('(d) an autolink still passes through the scheme allowlist', () => {
    const ok = renderNodes(linkifyText('<https://example.com>'));
    expect(ok.container.querySelector('a')?.getAttribute('href')).toBe('https://example.com');

    const bad = renderNodes(linkifyText('<javascript:alert(1)>'));
    expect(bad.container.querySelector('a')).toBeNull();
  });

  // (e) compare the RAW label token, not the rendered one, so nested markup
  //     cannot diverge the comparison from what the reader sees.
  it('(e) nested markup inside the label cannot diverge the comparison', () => {
    const { container } = renderNodes(linkifyText('[**https://example.com**](https://evil.com)'));
    expect(container.querySelector('a')).toBeNull();
  });

  it('a dangerous scheme in the destination is still refused, match or not', () => {
    for (const scheme of ['javascript:alert(1)', 'vbscript:msgbox(1)', 'data:text/html,<script>']) {
      expect(labelMatchesDestination(scheme, scheme)).toBe(false);
      const { container } = renderNodes(linkifyText(`[${scheme}](${scheme})`));
      expect(container.querySelector('a')).toBeNull();
    }
  });

  // NARROWING REGRESSION, added 2026-08-24 after code review.
  //
  // The first implementation required EVERY label to be a URL equal to the href. That is a far
  // larger rule than the 2026-08-20 finding asked for, and it silently downgraded every ordinary
  // descriptive link across the ten surfaces that render story and point text. It went unnoticed
  // because the pre-existing P540 test asserting `[my site](https://example.com)` renders a link
  // had its labels rewritten to literal URLs so it would keep passing — the oracle was edited to
  // match the code. These cases exist so that cannot recur silently: they FAIL under the strict
  // rule, and p540-linkify-markdown.test.ts (restored verbatim) fails with it too.
  it('an ordinary descriptive label still renders as a link — it claims no destination', () => {
    for (const label of ['my site', 'click here', 'docs', 'ClarityPledge', 'read the paper']) {
      expect(labelMatchesDestination(label, 'https://example.com/x')).toBe(true);
    }
  });

  it('an address ANYWHERE in the label is a claim, not just the first token', () => {
    // The head-only version of the narrowing let this through: the reader sees "example.com"
    // and lands on evil.com.
    expect(labelMatchesDestination('Read more at example.com', 'https://evil.com')).toBe(false);
    expect(labelMatchesDestination('Read more at example.com', 'https://example.com')).toBe(true);
  });

  it('a label naming TWO different places cannot be honest about one link', () => {
    expect(labelMatchesDestination('example.com or evil.com', 'https://example.com')).toBe(false);
  });

  it('a www. prefix and a trailing slash are the same place, not a mismatch', () => {
    expect(labelMatchesDestination('https://example.com/', 'https://www.example.com')).toBe(true);
  });
});

describe('p1141 DW-8 — structure renders', () => {
  it('renders bold', () => {
    const { container } = renderNodes(renderStoryText('This is **important** text'));
    expect(container.querySelector('strong')?.textContent).toBe('important');
  });

  it('renders a blockquote', () => {
    const { container } = renderNodes(renderStoryText('> a quoted line'));
    expect(container.querySelector('blockquote')?.textContent).toBe('a quoted line');
  });

  it('renders headings as h3/h4 — never h1, the page owns its outline', () => {
    const { container } = renderNodes(renderStoryText('# Top\n\n## Second'));
    expect(container.querySelector('h3')?.textContent).toBe('Top');
    expect(container.querySelector('h4')?.textContent).toBe('Second');
    expect(container.querySelector('h1')).toBeNull();
  });

  it('separates paragraphs on a blank line and preserves single breaks within one', () => {
    const { container } = renderNodes(renderStoryText('one\ntwo\n\nthree'));
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].textContent).toBe('one\ntwo');
    expect(paragraphs[1].textContent).toBe('three');
  });

  it('the link check applies INSIDE structure, not only at the top level', () => {
    const { container } = renderNodes(renderStoryText('> [https://apple.com](https://evil.com)'));
    expect(container.querySelector('blockquote')).not.toBeNull();
    expect(container.querySelector('a')).toBeNull();
  });

  it('no raw HTML from harvested text can reach the DOM — React elements only', () => {
    const { container } = renderNodes(renderStoryText('<img src=x onerror="alert(1)">'));
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
  });

  it('empty text renders nothing rather than an empty paragraph', () => {
    expect(renderStoryText('')).toEqual([]);
  });
});

describe('p1141 — screen queries hold for the rendered output', () => {
  it('a rejected link leaves readable text on screen', () => {
    renderNodes(linkifyText('see [https://apple.com](https://evil.com) now'));
    expect(screen.getByTestId('out').textContent).toBe('see https://apple.com now');
  });
});
