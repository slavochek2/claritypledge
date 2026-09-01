/**
 * @file p1219-legal-markdown-strict.test.ts
 * @description P1219: the legal documents (ToS, Privacy Policy) render through
 * dangerouslySetInnerHTML. The renderer, not the content, must guarantee that no raw
 * HTML or dangerous link protocol survives — otherwise the property is only true
 * until someone pastes an HTML snippet into tos.md.
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdownLegal, renderMarkdownTrusted } from '@/lib/markdown';
import tosContent from '@/app/content/tos.md?raw';
import privacyContent from '@/app/content/privacy.md?raw';

describe('P1219 renderMarkdownLegal — raw HTML is inert', () => {
  it('escapes a block-level <script> so no script element is produced', () => {
    const html = renderMarkdownLegal('Intro\n\n<script>alert(1)</script>\n\nOutro');
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes inline <img onerror> so no img element or handler is produced', () => {
    const html = renderMarkdownLegal('Text <img src=x onerror="alert(1)"> more');
    expect(html).not.toMatch(/<img/i);
    // The handler text survives only as escaped, visible text — never as an attribute.
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });

  it('drops javascript: links but keeps the link text', () => {
    const html = renderMarkdownLegal('[click](javascript:alert(1))');
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/<a /);
    expect(html).toContain('click');
  });

  it('drops markdown images entirely', () => {
    const html = renderMarkdownLegal('![x](https://example.com/a.png)');
    expect(html).not.toMatch(/<img/i);
  });

  it('keeps https links with target=_blank and rel', () => {
    const html = renderMarkdownLegal('[site](https://claritypledge.com/machines)');
    expect(html).toContain('href="https://claritypledge.com/machines"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('is strictly different from the trusted renderer, which lets raw HTML through', () => {
    const src = '<b>x</b>';
    expect(renderMarkdownTrusted(src)).toContain('<b>');
    expect(renderMarkdownLegal(src)).not.toContain('<b>');
  });

  it('renders the committed legal documents with no script/img/inline handlers', () => {
    for (const doc of [tosContent, privacyContent]) {
      const html = renderMarkdownLegal(doc);
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/<img/i);
      expect(html).not.toMatch(/\son[a-z]+=/i);
      expect(html).not.toMatch(/javascript:/i);
      expect(html).toMatch(/<h2>/);
    }
  });
});
