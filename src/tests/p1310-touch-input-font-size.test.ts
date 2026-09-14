/**
 * @file p1310-touch-input-font-size.test.ts
 * @description P1310 — no focusable text control may ship below 16px on phones.
 *
 * WHY A SOURCE SCAN AND NOT A RENDER TEST. Mobile Safari zooms the layout
 * viewport when a focused input's computed font-size is under 16px, and does not
 * zoom back out on blur — the founder's "sometimes accidentally there is a zoom
 * in and there is a part of this of the page that is cut off". jsdom computes no
 * cascade worth trusting and has no Safari, so the rendered font-size is not
 * observable in this suite at all. The reachable invariant is the one this scans:
 * a text control never carries a bare `text-xs` / `text-sm`, only the
 * `text-base md:text-…` pair that keeps phones at 16px and desktop unchanged.
 *
 * 14 controls violated this when the rule was written, two of them the
 * live-session join fields — the most-used screen on a phone in this product.
 * Fixing those 14 without this scan just resets the count to zero and waits.
 *
 * SCOPE, stated rather than implied: `<Input>`/`<Textarea>` with no size class
 * at all are already correct — the shared components carry
 * `text-base md:text-sm` themselves (src/components/ui/input.tsx). Only an
 * explicit override, or a raw element, can break the rule, and only those are
 * flagged. Checkbox/radio/range/file/hidden inputs have no typed text and are
 * skipped.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../..');

/** Every non-test .tsx under src/, from git rather than a glob so untracked scratch files never fail the build. */
function sourceFiles(): string[] {
  return execFileSync('git', ['ls-files', 'src/**/*.tsx'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(f => f && !f.includes('.test.') && !f.includes('/tests/'));
}

const TAG_START = /<(input|textarea|select|Input|Textarea)\b/g;
const NON_TEXT = /type=["'](?:checkbox|radio|range|file|hidden)/;
/** A size class that is NOT behind a breakpoint prefix — `md:text-sm` is fine, `text-sm` is not. */
const BARE_SMALL = /(?<![:\w-])text-(xs|sm|\[(?:[0-9]|1[0-5])px\])\b/;

/**
 * Attributes of one JSX element start tag, read with a BALANCED-BRACE walk rather
 * than a regex.
 *
 * The regex this replaces allowed exactly one level of `{...}`, so
 * `className={cn({ "text-sm": isSmall })}` — ordinary, valid, and in use in this
 * codebase's idiom — produced NO match at all, and the scan then reported the file
 * clean while a 14px control shipped. A gate with a silent blind spot is worse than
 * no gate: it is the same green either way. Found by adversarial review (P1310).
 *
 * Quotes are tracked so a `>` or `{` inside an attribute string cannot end the tag
 * early.
 */
function elementAttrs(src: string, from: number): { attrs: string; end: number } | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === quote && src[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') { depth++; continue; }
    if (ch === '}') { depth--; continue; }
    if (ch === '>' && depth === 0) return { attrs: src.slice(from, i), end: i };
  }
  return null;
}

/** Every offending control as `file:line <tag> carries <class>`. */
function scan(src: string, file = '<inline>'): string[] {
  const found: string[] = [];
  TAG_START.lastIndex = 0;
  for (const match of src.matchAll(TAG_START)) {
    const tag = match[1];
    const start = (match.index ?? 0) + match[0].length;
    const el = elementAttrs(src, start);
    if (!el) continue;
    if (NON_TEXT.test(el.attrs)) continue;
    const small = el.attrs.match(BARE_SMALL);
    if (!small) continue;
    const line = src.slice(0, match.index ?? 0).split('\n').length;
    found.push(`${file}:${line} <${tag}> carries ${small[0]}`);
  }
  return found;
}

function offenders(): string[] {
  return sourceFiles().flatMap(file => scan(readFileSync(resolve(REPO_ROOT, file), 'utf8'), file));
}

describe('P1310 — phone text controls stay at 16px', () => {
  it('no input, textarea or select carries a bare text-xs/text-sm', () => {
    const found = offenders();
    expect(
      found,
      `These controls will make iOS Safari zoom the page on focus and never zoom back out.\n` +
      `Use "text-base md:text-sm" (16px on phones, unchanged on desktop):\n  ${found.join('\n  ')}`
    ).toEqual([]);
  });

  it('the scan itself detects a violating control (gate 7 — the detector is exercised, not assumed)', () => {
    expect(scan(`<input type="text" className="w-full rounded-md text-sm" placeholder="x" />`)).toHaveLength(1);
    // …and does not fire on the corrected form, or on a non-text input.
    expect(scan(`<input type="text" className="w-full rounded-md text-base md:text-sm" />`)).toEqual([]);
    expect(scan(`<input type="checkbox" className="text-sm" />`)).toEqual([]);
  });

  it('sees through nested braces — the blind spot that made an earlier version of this gate useless', () => {
    // Each of these produced ZERO matches under the single-nesting regex this scan
    // replaced, so the suite passed while the control shipped at 14px.
    expect(scan(`<Input className={cn({ "text-sm": isSmall })} />`)).toHaveLength(1);
    expect(scan(`<Input className={cn("rounded", { "text-xs": dense }, isWide && "w-full")} />`)).toHaveLength(1);
    expect(scan(`<textarea className={clsx(base, { inner: { deep: "text-sm" } })} />`)).toHaveLength(1);
    // Two levels of nesting and still correct about the SAFE form.
    expect(scan(`<Input className={cn({ "text-base md:text-sm": true })} />`)).toEqual([]);
    // A `>` inside an attribute string must not end the tag early and hide what follows.
    expect(scan(`<input placeholder="a > b" className="text-sm" />`)).toHaveLength(1);
    // An arrow function in a handler is braces too, and must not swallow the tag.
    expect(scan(`<input onChange={(e) => { setX(e.target.value); }} className="text-sm" />`)).toHaveLength(1);
  });
});
