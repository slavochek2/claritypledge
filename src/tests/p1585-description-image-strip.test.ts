/**
 * @file p1585-description-image-strip.test.ts
 * @description P1585: two or more images written on one line of an event description render in
 * ONE paragraph, which the `.event-description p:has(> img + img)` rule turns into a swipeable
 * strip, as do images on consecutive lines. Images separated by a blank line stay separate paragraphs.
 */
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderEventDescription } from '@/lib/markdown';

const OURS = 'https://project.supabase.co/storage/v1/object/public/';
const render = (md: string) => renderEventDescription(md, [OURS]);
const paragraphs = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return [...div.querySelectorAll('p')];
};

describe('P1585 description image strip', () => {
  it('images on one line share one paragraph, so the strip rule matches', () => {
    const html = render(`![Airbnb](${OURS}event-banners/a.png) ![Dropbox](${OURS}event-banners/b.png)`);
    const ps = paragraphs(html);
    expect(ps).toHaveLength(1);
    expect(ps[0].querySelectorAll(':scope > img')).toHaveLength(2);
    expect(ps[0].matches('p:has(> img + img)')).toBe(true);
  });

  it('images on consecutive lines (one soft break) still form one strip', () => {
    const html = render(`![Airbnb](${OURS}event-banners/a.png)\n![Dropbox](${OURS}event-banners/b.png)\n![Third](${OURS}event-banners/c.png)`);
    const ps = paragraphs(html);
    expect(ps).toHaveLength(1);
    expect(ps[0].querySelector('br')).toBeNull();
    expect(ps[0].querySelectorAll(':scope > img')).toHaveLength(3);
    expect(ps[0].matches('p:has(> img + img)')).toBe(true);
  });

  it('images on separate paragraphs stay single images (existing descriptions unchanged)', () => {
    const html = render(`![Airbnb](${OURS}event-banners/a.png)\n\n![Dropbox](${OURS}event-banners/b.png)`);
    const ps = paragraphs(html);
    expect(ps).toHaveLength(2);
    for (const p of ps) expect(p.matches('p:has(> img + img)')).toBe(false);
  });

  it('a dropped foreign image does not leave a one-image strip', () => {
    const html = render(`![ours](${OURS}event-banners/a.png) ![theirs](https://evil.example/x.png)`);
    expect(paragraphs(html)[0].matches('p:has(> img + img)')).toBe(false);
  });

  it('the strip rule is in the stylesheet, scoped to event descriptions', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    expect(css).toContain('.event-description p:has(> img + img) {');
    expect(css).toMatch(/\.event-description p:has\(> img \+ img\) > img \{[^}]*scroll-snap-align: start/);
  });
});
