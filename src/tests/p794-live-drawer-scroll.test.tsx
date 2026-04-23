/**
 * @file p794-live-drawer-scroll.test.tsx
 * @description Canary: /live rating drawers stay non-modal so background scrolls.
 * Asserts:
 *   (1) every <Drawer> open tag in live-mode-view has both modal={false} and
 *       dismissible={false} — prevents regression of the line-1488 bug class;
 *   (2) CONTENT_LAYOUT includes pb-[calc(...)] compensation + max-w-2xl;
 *   (3) CONTENT_LAYOUT_CENTERED kept at max-w-lg (idle screens must not widen);
 *   (4) card classNames are extracted as constants (no inline max-w-sm mb-2 or -mt-3);
 *   (5) drawer content wrappers use DRAWER_CONTENT_WRAPPER constant;
 *   (6) first-rating drawer no longer uses the onOpenChange fallback-dismiss.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC_PATH = resolve(__dirname, '../app/components/partners/live-mode-view.tsx');
const src = readFileSync(SRC_PATH, 'utf-8');

/** Extract each `<Drawer ...>` open tag, whether on one line or wrapped across multiple.
 *  Starts at `<Drawer` followed by whitespace (prevents matching DrawerContent/Header/…).
 *  Ends at the first `>` that is NOT inside a JSX expression `{…}`. */
function extractDrawerOpenTags(source: string): string[] {
  const tags: string[] = [];
  const startRe = /<Drawer\s/g;
  for (const m of source.matchAll(startRe)) {
    let i = m.index!;
    let depth = 0;
    while (i < source.length) {
      const ch = source[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0) break;
      i++;
    }
    tags.push(source.slice(m.index!, i + 1));
  }
  return tags;
}

describe('p794: /live rating drawer scroll-behind + layout', () => {
  it('every Drawer open tag has modal={false} and dismissible={false}', () => {
    const tags = extractDrawerOpenTags(src);
    expect(tags.length).toBe(4); // tight count — catches added drawers without added guards
    for (const tag of tags) {
      expect(tag).toMatch(/dismissible=\{false\}/);
      expect(tag).toMatch(/modal=\{false\}/);
    }
  });

  it('CONTENT_LAYOUT has max-w-2xl + pb-[calc(env(safe-area-inset-bottom)+) compensation', () => {
    expect(src).toMatch(/const CONTENT_LAYOUT\s*=\s*"[^"]*max-w-2xl[^"]*"/);
    expect(src).toMatch(/const CONTENT_LAYOUT\s*=\s*"[^"]*pb-\[calc\(env\(safe-area-inset-bottom\)\+\d+px\)\][^"]*"/);
  });

  it('CONTENT_LAYOUT_CENTERED kept at max-w-lg (idle screens must not widen)', () => {
    expect(src).toMatch(/const CONTENT_LAYOUT_CENTERED\s*=\s*"[^"]*max-w-lg[^"]*"/);
  });

  it('story and journey card classNames are extracted as constants', () => {
    expect(src).not.toMatch(/className="w-full max-w-sm mb-2"/);
    expect(src).not.toMatch(/className="w-full max-w-sm -mt-3"/);
    expect(src).toMatch(/const STORY_CARD_LAYOUT\s*=\s*"w-full max-w-2xl/);
    expect(src).toMatch(/const JOURNEY_LAYOUT\s*=\s*"w-full max-w-2xl/);
  });

  it('drawer content wrappers use DRAWER_CONTENT_WRAPPER constant', () => {
    expect(src).not.toMatch(/className="px-4 pb-8 pt-4 space-y-4"/);
    expect(src).toMatch(/const DRAWER_CONTENT_WRAPPER\s*=\s*"/);
  });

  it('IdleScreen first-rating drawer no longer uses onOpenChange fallback dismiss', () => {
    const idleStart = src.indexOf('function IdleScreen');
    expect(idleStart).toBeGreaterThan(-1);
    // Find the next top-level function definition to bound IdleScreen's body.
    const idleEnd = src.indexOf('\nfunction ', idleStart + 1);
    const idleBody = src.slice(idleStart, idleEnd > -1 ? idleEnd : undefined);
    expect(idleBody).not.toMatch(/onOpenChange=\{\(open\)\s*=>\s*\{\s*if\s*\(!open\)\s*onSkip/);
  });
});
