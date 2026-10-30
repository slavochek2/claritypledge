/**
 * Review (Codex + Gemini): the C-logo loader's draw and breathing ignored prefers-reduced-motion. Under it the mark is
 * static, whole and fully visible. jsdom does not evaluate media queries, so the rule is asserted as written in
 * src/index.css; the rendered result was checked in a browser with reduced motion emulated.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/index.css', 'utf8');

describe('the C-logo loader under prefers-reduced-motion', () => {
  it('has no animation, the stroke fully drawn and the mark fully opaque', () => {
    const block = css.match(/@media \(prefers-reduced-motion: reduce\) \{\s*\.clarity-loader-c \{([^}]*)\}/);
    expect(block, 'no reduced-motion rule for .clarity-loader-c').not.toBeNull();
    expect(block![1]).toMatch(/animation: none;/);
    expect(block![1]).toMatch(/stroke-dashoffset: 0;/);
    expect(block![1]).toMatch(/opacity: 1;/);
  });

  it('comes after the animated rule, so it wins on source order', () => {
    expect(css.indexOf('@media (prefers-reduced-motion: reduce) {\n  .clarity-loader-c')).toBeGreaterThan(css.indexOf('.clarity-loader-c {\n  animation: clarity-draw'));
  });
});
