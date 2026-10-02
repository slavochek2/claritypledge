/**
 * P1308 — one interactive blue (medium, #2563eb). `tailwind.config.js` maps blue-500/600/700 to it, so
 * a class follows the decision automatically; a raw blue HEX in UI code does not. This guard fails
 * on any off-brand blue hex in prod-reachable UI code.
 *
 * Exempt: avatar colours (per-user data — the palette and its fallbacks), the logo marks (a separate
 * brand decision), DEV-only /tree pages and prototypes, and tests.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import tailwindConfig from '../../tailwind.config.js';

const ROOT = join(__dirname, '..');
const BANNED = /#(3b82f6|0044cc|0033aa|00336b|001f45)\b/i;  // off-brand; #2563eb/#1d4ed8 ARE the brand

const EXEMPT_PATH = [
  /\.test\.tsx?$/,
  /^app\/prototypes\//,
  /^app\/pages\/prototypes\//,
  /^app\/pages\/(design-[a-z-]+|landing-v[234]|loading-demo-page)\.tsx$/,
  /^app\/data\//,                       // avatar_color fallbacks on rows
  /^components\/ui\/(clarity-logo|clarity-loader|person-avatar|gravatar-avatar)\.tsx$/,
  /^lib\/confetti\.ts$/,
];
// Lines that carry avatar colour data rather than UI colour.
const EXEMPT_LINE = /avatar_?color|avatarcolor|authoravatarcolor|gravataravatar/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(p);
  }
  return out;
}

export function findOffBrandBlues(files: { path: string; text: string }[]): string[] {
  const hits: string[] = [];
  for (const { path, text } of files) {
    if (EXEMPT_PATH.some(r => r.test(path))) continue;
    text.split('\n').forEach((line, i) => {
      if (BANNED.test(line) && !EXEMPT_LINE.test(line)) hits.push(`${path}:${i + 1}`);
    });
  }
  return hits;
}

describe('P1308 — one interactive blue', () => {
  it('no off-brand blue hex in prod-reachable UI code', () => {
    const files = walk(ROOT).map(p => ({ path: relative(ROOT, p), text: readFileSync(p, 'utf8') }));
    expect(findOffBrandBlues(files)).toEqual([]);
  });

  it('MUST-FAIL: a planted UI blue hex is caught; an avatar colour is not', () => {
    expect(findOffBrandBlues([{ path: 'app/pages/x.tsx', text: '<div className="bg-[#3b82f6]" />' }]))
      .toEqual(['app/pages/x.tsx:1']);
    expect(findOffBrandBlues([{ path: 'app/pages/x.tsx', text: "avatarColor = '#0044CC'," }])).toEqual([]);
  });

  it('the navy remap itself is in tailwind.config.js (deleting it must fail)', () => {
    const blue = (tailwindConfig as { theme: { extend: { colors: { blue: Record<string, string> } } } }).theme.extend.colors.blue;
    expect(blue).toEqual({ '500': '#2563eb', '600': '#2563eb', '700': '#1d4ed8' });
  });
});
