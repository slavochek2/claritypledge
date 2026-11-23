/**
 * P1616: /presi5, the Sales Mastermind deck. A static page under public/presi5/, outside the SPA router.
 * Checks the spec's Done-When that can be checked without a browser: the eight slides in the
 * run-of-show's order, no slide or embed tied to a past event, the route wired, and the quoted
 * product text still matching its source file.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VERIFIED_UNDERSTANDING_OATH } from '../app/content/verified-understanding-oath';
import { CHANGES_COPY } from '../app/prototypes/events/rounds/next-version-changes';

const root = resolve(__dirname, '../..');
const html = readFileSync(resolve(root, 'public/presi5/index.html'), 'utf8');
const doc = new DOMParser().parseFromString(html, 'text/html');

describe('P1616 /presi5 deck', () => {
  it('has the eight slides in the run-of-show order', () => {
    const order = [...doc.querySelectorAll('section.slide')].map((s) => s.getAttribute('data-slide'));
    // docs/events/sales-mastermind.md opener: roles and rules, cards, hands-up, recording check, then the demo.
    expect(order).toEqual(['welcome', 'roles', 'rule', 'hands-up', 'recording', 'demo', 'update', 'close']);
  });

  it('points at no event: no iframe, no event link, no QR', () => {
    expect(doc.querySelectorAll('iframe').length).toBe(0);
    // What renders or loads, not the source comments (which cite docs/events/ files).
    const urls = [...doc.querySelectorAll('[href],[src]')].map((el) => el.getAttribute('href') ?? el.getAttribute('src') ?? '');
    expect(urls.filter((u) => !u.startsWith('data:'))).toEqual([]);
    expect(doc.body.textContent).not.toMatch(/\/events\/|clarity night/i);
    expect(doc.querySelectorAll('.qr').length).toBe(0);
  });

  it('loads only files vendored next to it', () => {
    expect(existsSync(resolve(root, 'public/presi5/fonts/inter-latin.woff2'))).toBe(true);
    expect(doc.querySelectorAll('script[src], link[rel="stylesheet"]').length).toBe(0);
  });

  it('quotes the principle line verbatim from its source (decisions.md 2026-10-06)', () => {
    const promise = VERIFIED_UNDERSTANDING_OATH[5].myPromise.text;
    const lastPara = promise.split('\n\n').at(-1)!;
    const quoted = doc.querySelector('[data-slide="rule"] .quote')!.childNodes[0].textContent!
      .replace(/[“”]/g, '').replace(/’/g, "'");
    expect(quoted).toBe(lastPara);
  });

  it('quotes the update-step button labels that the room renders', () => {
    const labels = [...doc.querySelectorAll('[data-slide="update"] b')].map((b) => b.textContent);
    expect(labels).toEqual(['Create next version', 'Publish']);
    // "Create next version" is a JSX text node on its own line (not a comment mention).
    const task = readFileSync(resolve(root, 'src/app/prototypes/events/rounds/MastermindUpdateTask.tsx'), 'utf8');
    expect(task).toMatch(/^\s+Create next version\s*$/m);
    // "Publish" is the copy constant the changes card renders.
    expect(CHANGES_COPY.publish).toBe(labels[1]);
  });

  it('leaves /presi4 untouched (the frozen Clarity Night deck still teaches its own evening)', () => {
    const p4 = readFileSync(resolve(root, 'public/presi4/index.html'), 'utf8');
    expect(p4).toContain('<title>Clarity Night #2');
  });

  it('lets slides flow and scroll at phone width instead of clipping', () => {
    const phone = html.slice(html.indexOf('@media (max-width:640px)'));
    expect(phone).toMatch(/\.slide\{[^}]*position:relative[^}]*overflow:visible/);
    expect(phone).toMatch(/\.deck\{height:auto/);
  });

  it('is reachable at /presi5 without a trailing slash', () => {
    const vercel = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'));
    const all = [...(vercel.redirects ?? []), ...(vercel.rewrites ?? [])];
    expect(all.some((r: { source: string; destination: string }) => r.source === '/presi5' && r.destination === '/presi5/')).toBe(true);
  });
});
