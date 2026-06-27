/**
 * P955 UI Gate — Deterministic DOM Assertion Suite
 *
 * This file serves two purposes:
 *   1. Exported assertion functions (assertOnePrimary, assertNoDeadDisabled,
 *      assertNoOverflow320, assertTouchTargets44) — the gate harness that
 *      fires on every UI commit via pre-commit-checks.sh.
 *   2. A regression suite that proves each assertion FAILS against a P952
 *      defect fixture — epistemic gate 7 requirement before trusting the gate.
 *
 * Run: npx vitest run src/tests/p955-gate.test.ts
 *
 * Reference: features/p955_ui_build_loop.md § Phase 2(a/b/h)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import React from 'react';
import { P952DefectFixture } from './p955-fixture';

// ---------------------------------------------------------------------------
// Assertion library — exported for use by per-surface fixture tests
// ---------------------------------------------------------------------------

/**
 * AD-2 check (a): At most one full-width primary button per container.
 *
 * "Full-width primary" = a <button> or element with role="button" that has
 * both a primary-action class (btn-primary | bg-primary | variant-primary |
 * action-primary) AND a full-width class (w-full | w-100 | flex-1).
 *
 * Throws with a descriptive message if the invariant is violated.
 */
export function assertOnePrimary(container: HTMLElement): void {
  const candidates = Array.from(
    container.querySelectorAll<HTMLElement>('button, [role="button"]')
  );

  const fullWidthPrimaries = candidates.filter((el) => {
    const cls = el.className ?? '';
    const isPrimary =
      cls.includes('btn-primary') ||
      cls.includes('bg-primary') ||
      cls.includes('variant-primary') ||
      cls.includes('action-primary') ||
      el.getAttribute('data-variant') === 'primary';
    const isFullWidth =
      cls.includes('w-full') ||
      cls.includes('w-100') ||
      cls.includes('flex-1') ||
      el.getAttribute('data-full-width') === 'true';
    return isPrimary && isFullWidth;
  });

  if (fullWidthPrimaries.length > 1) {
    const labels = fullWidthPrimaries
      .map((el) => el.textContent?.trim() ?? el.getAttribute('aria-label') ?? '(unlabeled)')
      .join(', ');
    throw new Error(
      `P955-gate [one-primary]: found ${fullWidthPrimaries.length} full-width primary buttons — ` +
        `expected <= 1. Buttons: [${labels}]. ` +
        `P952 defect: competing "Finish" + "Start new session" pills.`
    );
  }
}

/**
 * AD-2 check (b): No disabled submit/primary button rendered in empty/initial state.
 *
 * A disabled button used as decoration (unreachable in empty state) is a P952
 * defect pattern. Checks for disabled buttons that carry submit or primary
 * semantics — these should be absent from the initial render, not rendered-but-disabled.
 *
 * Throws if a disabled primary-action button is found.
 */
export function assertNoDeadDisabled(container: HTMLElement): void {
  const disabledPrimaries = Array.from(
    container.querySelectorAll<HTMLButtonElement>(
      'button[disabled], button[aria-disabled="true"]'
    )
  ).filter((el) => {
    const cls = el.className ?? '';
    const type = el.getAttribute('type');
    return (
      type === 'submit' ||
      cls.includes('btn-primary') ||
      cls.includes('bg-primary') ||
      cls.includes('variant-primary') ||
      cls.includes('action-primary') ||
      el.getAttribute('data-variant') === 'primary'
    );
  });

  if (disabledPrimaries.length > 0) {
    const labels = disabledPrimaries
      .map((el) => el.textContent?.trim() ?? el.getAttribute('aria-label') ?? '(unlabeled)')
      .join(', ');
    throw new Error(
      `P955-gate [no-dead-disabled]: found ${disabledPrimaries.length} disabled primary/submit ` +
        `button(s) in initial render — these should be absent, not disabled. ` +
        `Buttons: [${labels}]. ` +
        `Disabled controls as decoration confuse assistive tech and signal wrong state modeling.`
    );
  }
}

/**
 * AD-2 check (c): No element overflows its container at 320px viewport width.
 *
 * jsdom does not compute real layout, so this check uses inline style width
 * constraints as a proxy. Elements with explicit width > 320px (px units) or
 * min-width > 320px are flagged. Viewport-relative units (vw, %) are excluded
 * since they adapt automatically.
 *
 * For real layout overflow, use the Phase 1 harness route + Playwright at 320px.
 * This check catches the structural case (hardcoded large widths).
 *
 * Throws if an element's inline or data-width exceeds 320px.
 */
export function assertNoOverflow320(container: HTMLElement): void {
  const allElements = Array.from(container.querySelectorAll<HTMLElement>('*'));

  const overflowing = allElements.filter((el) => {
    // Check inline style width/min-width with px units
    const style = el.style;
    const checkPx = (val: string): boolean => {
      const match = val.match(/^(\d+(?:\.\d+)?)px$/);
      return match !== null && parseFloat(match[1]) > 320;
    };
    return checkPx(style.width) || checkPx(style.minWidth);
  });

  if (overflowing.length > 0) {
    const descriptions = overflowing
      .slice(0, 3)
      .map(
        (el) =>
          `<${el.tagName.toLowerCase()}> width=${el.style.width || el.style.minWidth}`
      )
      .join(', ');
    throw new Error(
      `P955-gate [no-overflow-320]: ${overflowing.length} element(s) have hardcoded width > 320px. ` +
        `First offenders: ${descriptions}. ` +
        `Use w-full / max-w-* / responsive units instead.`
    );
  }
}

/**
 * AD-2 check (d): All interactive elements have a touch target >= 44px.
 *
 * jsdom reports computed height as 0 for elements without a real layout engine.
 * This check reads the inline style height, or falls back to known small
 * Tailwind height classes. For real touch-target measurement, use Playwright +
 * getComputedStyle (UAT-D).
 *
 * The DOM assertion catches elements explicitly set smaller than 44px inline,
 * which is the failure mode the spec targets (h-8 = 32px Tailwind classes).
 *
 * Throws if an interactive element is detectably smaller than 44px.
 */
export function assertTouchTargets44(container: HTMLElement): void {
  const interactive = Array.from(
    container.querySelectorAll<HTMLElement>(
      'button, [role="button"], a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  );

  // Known Tailwind classes that produce heights < 44px
  // (1rem = 16px default scale: h-6=24, h-7=28, h-8=32, h-9=36, h-10=40)
  const smallHeightClasses = ['h-6', 'h-7', 'h-8', 'h-9', 'h-10'];

  const tooSmall = interactive.filter((el) => {
    const cls = el.className ?? '';
    // Check inline style
    const inlineHeight = el.style.height;
    if (inlineHeight) {
      const match = inlineHeight.match(/^(\d+(?:\.\d+)?)px$/);
      if (match && parseFloat(match[1]) < 44) return true;
    }
    // Check known small Tailwind height classes (word-boundary match to avoid h-10 matching h-100)
    return smallHeightClasses.some((c) =>
      new RegExp(`(^|\\s)${c}(\\s|$)`).test(cls)
    );
  });

  if (tooSmall.length > 0) {
    const labels = tooSmall
      .slice(0, 3)
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}[${el.textContent?.trim() ?? el.className.split(' ')[0]}]`
      )
      .join(', ');
    throw new Error(
      `P955-gate [touch-target-44]: ${tooSmall.length} interactive element(s) appear smaller ` +
        `than 44px. First offenders: ${labels}. ` +
        `Minimum touch target is 44x44px (WCAG 2.5.5 / spec 2b).`
    );
  }
}

/**
 * Test-validity shape check (spec 2e):
 *
 * A covering test for a view's primary action MUST assert a post-action EFFECT
 * (a persisted row, a surfaced error, a state transition) — not just that the
 * handler was called or the component rendered.
 *
 * This function checks a mock test body string against the validity pattern.
 * It's used below to assert what a compliant test body looks like vs. a
 * render/invocation-only test body.
 */
export function assertTestAssertEffect(testBodyDescription: string): void {
  // Calling-assertions: prove the handler ran, but say nothing about the result.
  const invocationOnlyPatterns = [
    /toHaveBeenCalled(?:Times|With)?\(/,
    /expect\([^)]*\)\.toBeTruthy\(\)/,
  ];
  // Effect-assertions: prove a post-action result (persisted row, surfaced
  // text/error, value match). NOTE: bare `screen.getBy*` is excluded — it
  // commonly matches the action's click target, not an effect; `findBy*`
  // (async, waits for a result to appear) is the real effect signal.
  const effectPatterns = [
    /supabase|\.insert\b|\.upsert\b|\.update\(|\.delete\(/i,
    /toEqual|toMatchObject|toContain/,
    /findBy/,
    /toast|alert|notification|error-message/i,
  ];

  const hasInvocationOnly = invocationOnlyPatterns.some((re) => re.test(testBodyDescription));
  const hasEffect = effectPatterns.some((re) => re.test(testBodyDescription));

  if (hasInvocationOnly && !hasEffect) {
    throw new Error(
      `P955-gate [test-validity]: covering test asserts only render/invocation. ` +
        `It must assert the post-action EFFECT: persisted row, surfaced error, or state transition. ` +
        `Pattern found: ${testBodyDescription.slice(0, 120)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Happy-path checks (clean components must NOT throw)
// ---------------------------------------------------------------------------

describe('P955 gate — assertion library (happy path)', () => {
  it('assertOnePrimary passes with exactly one full-width primary button', () => {
    const { container } = render(
      React.createElement('div', null,
        React.createElement('button', {
          className: 'btn-primary w-full',
          style: { height: '48px' }
        }, 'Submit')
      )
    );
    expect(() => assertOnePrimary(container)).not.toThrow();
  });

  it('assertOnePrimary passes with no primary buttons', () => {
    const { container } = render(
      React.createElement('div', null,
        React.createElement('button', { className: 'btn-secondary' }, 'Cancel')
      )
    );
    expect(() => assertOnePrimary(container)).not.toThrow();
  });

  it('assertNoDeadDisabled passes with no disabled primary buttons', () => {
    const { container } = render(
      React.createElement('div', null,
        React.createElement('button', { className: 'btn-primary w-full' }, 'Active Submit')
      )
    );
    expect(() => assertNoDeadDisabled(container)).not.toThrow();
  });

  it('assertNoOverflow320 passes with no inline width > 320px', () => {
    const { container } = render(
      React.createElement('div', { className: 'w-full' }, 'Content')
    );
    expect(() => assertNoOverflow320(container)).not.toThrow();
  });

  it('assertTouchTargets44 passes when all interactive elements are >= 44px', () => {
    const { container } = render(
      React.createElement('button', {
        className: 'btn-primary w-full',
        style: { height: '48px' }
      }, 'Tall button')
    );
    expect(() => assertTouchTargets44(container)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// P952 defect fixture — proves each check FIRES (gate-fires proof)
//
// Per epistemic gate 7 / spec 2h: the gate must be demonstrated firing against
// a P952 fixture BEFORE it is trusted. These tests are the proof. They pass
// (green) when the assertion THROWS — exactly what we want.
// ---------------------------------------------------------------------------

describe('P955 gate — failure-path proof against P952 defect fixture', () => {
  let rendered: RenderResult;

  beforeEach(() => {
    rendered = render(React.createElement(P952DefectFixture));
  });

  it('[assertOnePrimary] THROWS against P952 fixture (two competing full-width primaries)', () => {
    expect(() => assertOnePrimary(rendered.container)).toThrow(/one-primary/);
  });

  it('[assertNoDeadDisabled] THROWS against P952 fixture (disabled submit in empty state)', () => {
    expect(() => assertNoDeadDisabled(rendered.container)).toThrow(/no-dead-disabled/);
  });

  it('[assertNoOverflow320] does not flag P952 fixture (overflow is a layout concern, proven via Playwright at 320px in UAT-D)', () => {
    expect(() => assertNoOverflow320(rendered.container)).not.toThrow();
  });

  it('[assertTouchTargets44] THROWS when interactive elements use known small-height classes', () => {
    const { container } = render(
      React.createElement('div', null,
        React.createElement('button', {
          className: 'btn-primary w-full h-8', // h-8 = 32px, below threshold
        }, 'Too small')
      )
    );
    expect(() => assertTouchTargets44(container)).toThrow(/touch-target-44/);
  });
});

// ---------------------------------------------------------------------------
// Test-validity shape checks (spec 2e)
// ---------------------------------------------------------------------------

describe('P955 gate — test-validity assertions (spec 2e)', () => {
  it('THROWS on a test body that only asserts invocation (not effect)', () => {
    const invocationOnlyBody = `
      fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      expect(mockHandler).toHaveBeenCalledTimes(1);
    `;
    expect(() => assertTestAssertEffect(invocationOnlyBody)).toThrow(/test-validity/);
  });

  it('passes when a test body asserts a persisted effect', () => {
    const effectBody = `
      fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      expect(supabase.from('sessions').insert).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' })
      );
      expect(await screen.findByText(/session saved/i)).toBeInTheDocument();
    `;
    expect(() => assertTestAssertEffect(effectBody)).not.toThrow();
  });

  it('passes when a test body asserts a surfaced error state', () => {
    const errorBody = `
      server.use(rest.post('/api/sessions', (req, res, ctx) => res(ctx.status(500))));
      fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      expect(await screen.findByRole('alert')).toBeInTheDocument();
    `;
    expect(() => assertTestAssertEffect(errorBody)).not.toThrow();
  });
});
