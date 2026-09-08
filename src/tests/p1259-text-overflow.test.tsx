/**
 * @file p1259-text-overflow.test.tsx
 * @description P1259 change 6 — "Show more" appears when there IS more, measured.
 *
 * THE DEFECT. `profile-page-v2.tsx` decided the control's visibility from
 * `strippedContent.length > 400` while the truncation was a CSS line clamp. Founder: "this
 * button here does nothing! siwting it moves nothing!" A character count and a line clamp
 * are two measures of the same thing and never agree.
 *
 * THE FAILURE MODE OF THE FIX IS QUIETER THAN THE DEFECT, which is what most of this file
 * is about. `scrollHeight > clientHeight` run while the element is hidden, off-screen,
 * virtualized, or before the webfont loads reads `0 > 0` = false and suppresses the control
 * PERMANENTLY — a MISSING control, with nothing on screen to notice. The spec says so
 * outright: "The failure mode of getting this wrong is a *missing* control, which is
 * quieter than the dead control it replaces."
 *
 * So the zero-height case is not an edge case here, it is the main assertion.
 *
 * jsdom reports 0 for every layout metric, so both dimensions are stubbed on
 * `HTMLElement.prototype` and driven from data attributes. That makes the layout the test's
 * input rather than something it hopes for — and it is the only way to reach the zero-height
 * branch deliberately.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { useTextOverflow } from '@/app/hooks/use-text-overflow';

const original = {
  scrollHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight'),
  clientHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight'),
};

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) { return Number(this.dataset.scrollH ?? '0'); },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) { return Number(this.dataset.clientH ?? '0'); },
  });
});

afterAll(() => {
  if (original.scrollHeight) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', original.scrollHeight);
  if (original.clientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', original.clientHeight);
});

/** Renders a clamped paragraph whose measured geometry is dictated by the props. */
function Harness({ scrollH, clientH, content = 'x' }: { scrollH: number; clientH: number; content?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const overflows = useTextOverflow(ref, [content]);
  return (
    <>
      <p ref={ref} data-scroll-h={String(scrollH)} data-client-h={String(clientH)}>{content}</p>
      <span data-testid="verdict">{overflows ? 'overflowing' : 'fits'}</span>
    </>
  );
}

const verdict = () => screen.getByTestId('verdict').textContent;

describe('P1259 change 6 — measured overflow', () => {
  it('reports overflow when the content is taller than the clamped box', () => {
    render(<Harness scrollH={400} clientH={120} />);
    expect(verdict()).toBe('overflowing');
  });

  it('reports no overflow when the content fits', () => {
    render(<Harness scrollH={120} clientH={120} />);
    expect(verdict()).toBe('fits');
  });

  /**
   * Sub-pixel rounding: a fitting element can measure scrollHeight 97.6 against clientHeight
   * 97 on a fractional line-height. Without the +1 tolerance every clamped paragraph in the
   * product would sprout a "Show more" that reveals nothing — the original defect, restored
   * by the fix meant to remove it.
   */
  it('a one-pixel difference is rounding, not overflow', () => {
    render(<Harness scrollH={121} clientH={120} />);
    expect(verdict()).toBe('fits');
  });

  it('two pixels is real overflow', () => {
    render(<Harness scrollH={122} clientH={120} />);
    expect(verdict()).toBe('overflowing');
  });

  /**
   * THE LOAD-BEARING ONE. A hidden, off-screen or pre-font-load element measures 0/0. The
   * naive comparison answers "fits" — permanently, because nothing re-measures a control
   * that was never rendered. This must read as UNKNOWN and leave the previous answer alone.
   */
  it('a zero-height element is unknown, not "fits"', () => {
    const { rerender } = render(<Harness scrollH={400} clientH={120} content="a" />);
    expect(verdict()).toBe('overflowing');

    // The element goes hidden (a collapsed tab, a virtualized row): both metrics read 0.
    rerender(<Harness scrollH={0} clientH={0} content="b" />);
    expect(
      verdict(),
      'a measurement taken while hidden must not silently retract a known-good overflow',
    ).toBe('overflowing');
  });

  it('starts at "fits" and stays there when the first real measurement says so', () => {
    render(<Harness scrollH={0} clientH={0} />);
    expect(verdict()).toBe('fits');
  });

  it('re-measures when the content changes', () => {
    const { rerender } = render(<Harness scrollH={100} clientH={120} content="short" />);
    expect(verdict()).toBe('fits');
    rerender(<Harness scrollH={900} clientH={120} content="much longer body" />);
    expect(verdict()).toBe('overflowing');
  });
});

/**
 * The source contract for the surface the founder actually reported. A render test on
 * `profile-page-v2.tsx` would need most of the app mocked; what matters here is narrower and
 * is exactly what regressed: that the decision is not made from a character count again.
 */
describe('P1259 change 6 — the profile no longer decides from a character count', () => {
  it('StoryCardFull has no character threshold beside its clamp', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, '..', 'app/pages/profile-page-v2.tsx'), 'utf8');

    expect(
      src,
      'STORY_THRESHOLD was the character count that disagreed with the clamp — it must not come back',
    ).not.toMatch(/const STORY_THRESHOLD\s*=/);
    expect(src).not.toMatch(/strippedContent\.length\s*>\s*STORY_THRESHOLD/);
    expect(src, 'visibility must come from the measured-overflow hook').toContain('useTextOverflow');
    expect(src).toMatch(/storyOverflows \|\| storyExpanded/);
  });
});
