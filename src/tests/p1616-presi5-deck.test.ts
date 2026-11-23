/**
 * P1616: /presi5, the Sales Mastermind deck. A copy of /presi4 with the event substituted
 * (founder, 2026-11-23: "copy /presi4 as is mostly and just substitute the event"). A static page
 * under public/presi5/, outside the SPA router.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const html = read('public/presi5/index.html');
const doc = new DOMParser().parseFromString(html, 'text/html');
const p4 = new DOMParser().parseFromString(read('public/presi4/index.html'), 'text/html');
const SLUG = 'sales-mastermind-stress-test-your-riskiest-business-assumptions-with-peers-ai-2026-11-12-w7vyacggjqeibgwy';

describe('P1616 /presi5 deck', () => {
  it('opens on the published event title and subtitle, with the /sales link', () => {
    const first = doc.querySelector('section.slide')!;
    expect(first.querySelector('h1')!.textContent).toBe('Sales Mastermind');
    expect(first.querySelector('.t-sub')!.textContent).toBe('Stress-test your riskiest business assumptions with peers & AI');
    expect(first.querySelector('.url')!.textContent).toBe('claritypledge.com/sales');
    expect(first.querySelector('.qr')!.getAttribute('aria-label')).toBe('QR code to claritypledge.com/sales');
  });

  it('is /presi4 with the Ikigai slide swapped for the hands-up slide', () => {
    const count = (d: Document) => d.querySelectorAll('section.slide').length;
    expect(count(doc)).toBe(count(p4));
    expect(doc.body.textContent).not.toMatch(/ikigai|clarity night/i);
  });

  it('puts the hands-up slide, with its purpose, right before the demo round', () => {
    const slides = [...doc.querySelectorAll('section.slide')];
    const i = slides.findIndex((s) => s.getAttribute('data-slide') === 'hands-up');
    expect(i).toBeGreaterThan(0);
    expect(slides[i].textContent).toMatch(/When the round ends, we end it/);
    expect(slides[i + 1].textContent).toMatch(/show you one round/);
  });

  it('points every embed at this event', () => {
    const srcs = [...doc.querySelectorAll('iframe')].map((f) => f.getAttribute('src')!);
    expect(srcs.length).toBe(p4.querySelectorAll('iframe').length);
    for (const s of srcs) expect(s).toContain(`/events/${SLUG}`);
  });

  it('ships the images and scripts it references', () => {
    const local = [...doc.querySelectorAll('[src]')]
      .map((el) => el.getAttribute('src')!)
      .filter((s) => !/^(https?:|data:)/.test(s));
    for (const s of local) expect(existsSync(resolve(root, 'public/presi5', s)), s).toBe(true);
  });

  it('leaves /presi4 untouched', () => {
    expect(read('public/presi4/index.html')).toContain('<title>Clarity Night #2');
  });

  it('is reachable at /presi5 without a trailing slash', () => {
    const vercel = JSON.parse(read('vercel.json'));
    const all = [...(vercel.redirects ?? []), ...(vercel.rewrites ?? [])];
    expect(all.some((r: { source: string; destination: string }) => r.source === '/presi5' && r.destination === '/presi5/')).toBe(true);
  });
});
