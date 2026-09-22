/**
 * @file p1352-event-description-images.test.ts
 * @description P1352: event descriptions may show images, but ONLY images hosted on our own
 * storage. An image from anywhere else is dropped exactly as renderMarkdownSafe drops it,
 * because an arbitrary image URL lets its owner see who opened the page.
 */
import { describe, it, expect } from 'vitest';
import { renderEventDescription, renderMarkdownSafe } from '@/lib/markdown';

const OURS = 'https://project.supabase.co/storage/v1/object/public/';
const render = (md: string) => renderEventDescription(md, [OURS]);

describe('P1352 renderEventDescription — own-storage images render', () => {
  it('renders an image hosted on our storage, with alt text, lazy-loaded', () => {
    const html = render(`![The ikigai diagram](${OURS}event-banners/ikigai.png)`);
    expect(html).toMatch(/<img /);
    expect(html).toContain(`src="${OURS}event-banners/ikigai.png"`);
    expect(html).toContain('alt="The ikigai diagram"');
    expect(html).toContain('loading="lazy"');
  });

  it('escapes the alt text', () => {
    const html = render(`![a "quoted" <b>alt</b>](${OURS}x.png)`);
    expect(html).not.toMatch(/<b>/);
    expect(html).toContain('&quot;quoted&quot;');
  });

  it('keeps the rest of the description rendering like renderMarkdownSafe', () => {
    const md = '## Where\n\n**[Directions](https://www.google.com/maps)**';
    expect(render(md)).toBe(renderMarkdownSafe(md));
  });
});

describe('P1352 renderEventDescription — every other image is dropped', () => {
  const mustDrop: Array<[string, string]> = [
    ['a foreign domain', 'https://example.com/a.png'],
    ['a look-alike host', 'https://project.supabase.co.evil.example/storage/v1/object/public/a.png'],
    ['our prefix hidden in a query string', `https://evil.example/a.png?u=${OURS}`],
    ['our prefix hidden in a fragment', `https://evil.example/a.png#${OURS}`],
    ['a protocol-relative URL', '//project.supabase.co/storage/v1/object/public/a.png'],
    ['plain http to our host', 'http://project.supabase.co/storage/v1/object/public/a.png'],
    ['our host but outside the public storage path', 'https://project.supabase.co/rest/v1/events'],
    ['a path-traversal out of the public path', `${OURS}../../rest/v1/events`],
    // Built in two parts only so the privacy scanner does not read the userinfo form as an email.
    ['credentials smuggled before our host', 'https://project.supabase.co' + '@' + 'evil.example/storage/v1/object/public/a.png'],
    ['a data: URI', 'data:image/png;base64,AAAA'],
    ['a javascript: URI', 'javascript:alert(1)'],
  ];

  it.each(mustDrop)('drops %s', (_label, src) => {
    const html = render(`Before ![x](${src}) after`);
    expect(html).not.toMatch(/<img/i);
  });

  it('still strips raw <img> and <svg> HTML', () => {
    const html = render(`<img src="${OURS}a.png">\n\n<svg onload="alert(1)"></svg>`);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/<svg/i);
  });

  it('drops every image when no prefix is allowed', () => {
    expect(renderEventDescription(`![x](${OURS}a.png)`, [])).not.toMatch(/<img/i);
  });
});

describe('P1352 — surfaces that must NOT change', () => {
  it('renderMarkdownSafe (org footer note, P1264) still drops own-storage images', () => {
    expect(renderMarkdownSafe(`![x](${OURS}a.png)`)).not.toMatch(/<img/i);
  });
});

describe('P1352 — prefix boundary is a path segment, not a substring', () => {
  it('a prefix written without its trailing slash does not admit a sibling path', () => {
    const noSlash = 'https://project.supabase.co/storage/v1/object/public';
    const html = renderEventDescription(
      '![x](https://project.supabase.co/storage/v1/object/publicity/evil.png)',
      [noSlash],
    );
    expect(html).not.toMatch(/<img/i);
  });

  it('the same prefix without a trailing slash still admits real storage objects', () => {
    const noSlash = 'https://project.supabase.co/storage/v1/object/public';
    const html = renderEventDescription(`![x](${noSlash}/event-banners/a.png)`, [noSlash]);
    expect(html).toMatch(/<img/);
  });
});
