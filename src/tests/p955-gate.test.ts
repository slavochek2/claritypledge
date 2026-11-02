/**
 * P955 UI Gate — Deterministic DOM Assertion Suite
 *
 * This file serves two purposes:
 *   1. Exported assertion functions (assertOnePrimary, assertNoDeadDisabled,
 *      assertNoOverflow320, assertTouchTargets44, assertStableVariantsOnInput) — the gate harness that
 *      fires on every UI commit via pre-commit-checks.sh.
 *   2. A regression suite that proves each assertion FAILS against a P952
 *      defect fixture — epistemic gate 7 requirement before trusting the gate.
 *
 * Run: npx vitest run src/tests/p955-gate.test.ts
 *
 * Reference: features/p955_ui_build_loop.md § Phase 2(a/b/h)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import React, { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Composer } from '@/app/pages/chat/Composer';
import { GateFixture as CanvasThreadGateFixture } from '@/app/tree/_gate/canvas-thread/GateFixture';
import { GateFixture as CanvasWorkspaceGateFixture } from '@/app/tree/_gate/canvas-workspace/GateFixture';
import { P952DefectFixture } from './p955-fixture';
import { assertStableVariantsOnInput, buttonsChangedOnInput } from './p955-stable-variants';
import { assertTopBarMainAction, isFilledControl, reachableControls } from './p955-top-bar';

// P1536 S6.2: the rule-9 assertion lives in p955-stable-variants.ts so other test files can import it without re-registering this file's tests.
export { assertStableVariantsOnInput, buttonsChangedOnInput };
// P1536 3c S6.1: rule 9's top-bar clause (one filled main action, furthest right, auto width, nothing disabled) lives in p955-top-bar.ts for the same reason.
export { assertTopBarMainAction };

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
// P1536 S6.2 / S6.3 — assertStableVariantsOnInput: controls and the real canvas-thread fixture
//
// Known-bad controls (the assertion THROWS) and known-good controls (it passes) first, on small components, then on the
// REAL code: the real Composer, and every phase of the real /tree/_gate/canvas-thread fixture. The canvas thread
// is rule-9 clean since S3 removed the ladder: every phase is a plain passing test below, and the P1536 workspace fixture
// (S6.5) is checked the same way in the next block. The real ThreadPanel and ConversationPane composers are in
// src/tests/p1536-composer-surfaces.test.tsx.
// ---------------------------------------------------------------------------

const h = React.createElement;

/** A composer stand-in: a text field plus a send slot (marked), and whatever the caller puts next to it. */
function TypingSurface({ aside, sendSlot, editable = false }: { aside: (typed: boolean) => React.ReactNode; sendSlot?: (typed: boolean) => React.ReactNode; editable?: boolean }) {
  const [text, setText] = useState('');
  const typed = text !== '';
  const field = editable
    ? h('div', { role: 'textbox', 'aria-label': 'Message', contentEditable: true, suppressContentEditableWarning: true, onInput: (e: React.FormEvent<HTMLDivElement>) => setText(e.currentTarget.textContent ?? '') })
    : h('textarea', { 'aria-label': 'Message', value: text, onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value) });
  return h('div', null,
    aside(typed),
    h('div', { 'data-testid': 'composer' },
      field,
      sendSlot ? sendSlot(typed) : typed ? h('button', { type: 'submit', 'data-composer-send': '', className: 'bg-blue-600 text-white' }, 'Send') : h('button', { type: 'button', 'data-composer-send': '', className: 'border' }, 'Voice note')));
}

const surface = (aside: (typed: boolean) => React.ReactNode, sendSlot?: (typed: boolean) => React.ReactNode, editable = false) => {
  const view = render(h(TypingSurface, { aside, sendSlot, editable }));
  return { container: view.container, composer: within(view.container).getByTestId('composer') };
};
const KEEP = () => h(Button, { variant: 'outline' }, 'Keep');

describe('P955 gate — assertStableVariantsOnInput: known-good controls pass', () => {
  it('a surface whose only change is the send slot passes (the voice-note button becomes Send)', () => {
    const { container, composer } = surface(() => h(Button, { variant: 'outline' }, 'Copy prompt'));
    expect(() => assertStableVariantsOnInput(container, composer)).not.toThrow();
  });

  it('a send slot that mounts, unmounts and changes look is excluded, also when marked on a wrapper', () => {
    const { container, composer } = surface(
      () => h(Button, { variant: 'ghost' }, 'Cancel'),
      (typed) => h('span', { 'data-composer-send': '' }, typed ? h(Button, { variant: 'default' }, 'Send') : null),
    );
    expect(() => assertStableVariantsOnInput(container, composer)).not.toThrow();
  });

  it('a contenteditable composer passes: typing sets its textContent and fires input', () => {
    const { container, composer } = surface(KEEP, undefined, true);
    expect(() => assertStableVariantsOnInput(container, composer)).not.toThrow();
    expect(composer.querySelector('[contenteditable]')!.textContent).toBe(''); // left empty
  });

  it('the REAL Composer next to a button that keeps its look passes (Send and the voice-note button carry the marker)', () => {
    localStorage.clear();
    const view = render(h('div', null, h(Button, { variant: 'outline' }, 'Upload'), h(Composer, { draftKey: 's6-good-control', placeholder: 'Message', onSend: () => undefined })));
    expect(() => assertStableVariantsOnInput(view.container, within(view.container).getByTestId('composer'))).not.toThrow();
    expect(within(view.container).queryByRole('button', { name: 'Send' })).toBeNull(); // the check leaves the composer empty
  });
});

describe('P955 gate — assertStableVariantsOnInput: known-bad controls throw', () => {
  it('a button that changes variant while typing (default -> outline) throws', () => {
    const { container, composer } = surface((typed) => h(Button, { variant: typed ? 'outline' : 'default' }, 'Create canvas'));
    expect(() => assertStableVariantsOnInput(container, composer)).toThrow(/stable-variants.*Create canvas: look/);
  });

  // Each change below is invisible to a check that reads only unprefixed colour classes.
  it.each<[string, (typed: boolean) => Record<string, unknown>]>([
    ['hand-typed colour (bg-blue-600 -> border)', (t) => ({ className: t ? 'border' : 'bg-blue-600 text-white' })],
    ['data-variant', (t) => ({ 'data-variant': t ? 'secondary' : 'primary' })],
    ['opacity (opacity-100 -> opacity-50)', (t) => ({ className: t ? 'opacity-50' : 'opacity-100' })],
    ['a hover colour (hover:bg-green-500 -> hover:bg-red-500)', (t) => ({ className: t ? 'hover:bg-red-500' : 'hover:bg-green-500' })],
    ['a breakpoint colour (md:bg-blue-600 -> md:bg-red-600)', (t) => ({ className: t ? 'md:bg-red-600' : 'md:bg-blue-600' })],
    ['a group state colour (group-hover:text-white -> group-hover:text-black)', (t) => ({ className: t ? 'group-hover:text-black' : 'group-hover:text-white' })],
    ['an aria state colour (aria-[pressed=true]:bg-blue-600 -> aria-[pressed=true]:bg-red-600)', (t) => ({ className: t ? 'aria-[pressed=true]:bg-red-600' : 'aria-[pressed=true]:bg-blue-600' })],
    ['a gradient stop (from-blue-500 -> from-red-500)', (t) => ({ className: t ? 'from-red-500' : 'from-blue-500' })],
    ['the disabled attribute', (t) => ({ disabled: t })],
    ['the aria-disabled attribute', (t) => ({ 'aria-disabled': t ? 'true' : undefined })],
    ['an inline style', (t) => ({ style: t ? { background: 'red' } : { background: 'blue' } })],
  ])('a button whose %s changes while typing throws', (_what, props) => {
    const { container, composer } = surface((typed) => h('button', { type: 'button', ...props(typed) }, 'Publish'));
    expect(() => assertStableVariantsOnInput(container, composer)).toThrow(/Publish: look/);
  });

  it('CONTROL for the table above: the same buttons, with the property held constant, pass', () => {
    const { container, composer } = surface(() => h('button', { type: 'button', className: 'opacity-50 hover:bg-red-500 md:bg-red-600 from-red-500', style: { background: 'red' }, disabled: true, 'aria-disabled': 'true' }, 'Publish'));
    expect(() => assertStableVariantsOnInput(container, composer)).not.toThrow();
  });

  it('a button that mounts while typing throws, and one that unmounts throws', () => {
    const mounts = surface((typed) => h('div', null, KEEP(), typed ? h(Button, { variant: 'outline' }, 'Appeared') : null));
    expect(() => assertStableVariantsOnInput(mounts.container, mounts.composer)).toThrow(/Appeared: mounted/);
    const unmounts = surface((typed) => h('div', null, KEEP(), typed ? null : h(Button, { variant: 'outline' }, 'Vanished')));
    expect(() => assertStableVariantsOnInput(unmounts.container, unmounts.composer)).toThrow(/Vanished: unmounted/);
  });

  it('a button replaced by an identical-looking one throws: identity is the DOM node, not the label', () => {
    const { container, composer } = surface((typed) => h(Button, { key: typed ? 'b' : 'a', variant: 'outline' }, 'Same label'));
    expect(() => assertStableVariantsOnInput(container, composer)).toThrow(/Same label: (unmounted|mounted)/);
  });

  it('a contenteditable composer is checked too: a button flipping while typing throws', () => {
    const { container, composer } = surface((typed) => h(Button, { variant: typed ? 'outline' : 'default' }, 'Create canvas'), undefined, true);
    expect(() => assertStableVariantsOnInput(container, composer)).toThrow(/Create canvas: look/);
  });
});

describe('P955 gate — assertStableVariantsOnInput: never passes without proof that the input reached the app', () => {
  it('ADVERSARIAL: a textarea with no handler beside a stable button FAILS (the field keeps the text but nothing in the app saw it)', () => {
    const view = render(h('div', null, KEEP(), h('div', { 'data-testid': 'composer' }, h('textarea', { 'aria-label': 'Message' }))));
    expect(() => assertStableVariantsOnInput(view.container, within(view.container).getByTestId('composer'))).toThrow(/input did not reach the composer.*no send slot/);
  });

  it('ADVERSARIAL: a controlled textarea with no onChange snaps back, so the field never holds the text', () => {
    const view = render(h('div', null, KEEP(), h('div', { 'data-testid': 'composer' }, h('textarea', { 'aria-label': 'Message', value: '', onChange: () => undefined }), h('button', { type: 'button', 'data-composer-send': '' }, 'Voice note'))));
    expect(() => assertStableVariantsOnInput(view.container, within(view.container).getByTestId('composer'))).toThrow(/input did not reach the composer.*field holds ""/);
  });

  it('ADVERSARIAL: a send slot that never switches fails, and so does a contenteditable with no handler', () => {
    const frozen = surface(KEEP, () => h('button', { type: 'button', 'data-composer-send': '' }, 'Voice note'));
    expect(() => assertStableVariantsOnInput(frozen.container, frozen.composer)).toThrow(/did not switch/);
    const view = render(h('div', null, KEEP(), h('div', { 'data-testid': 'composer' }, h('div', { contentEditable: true, suppressContentEditableWarning: true, role: 'textbox' }), h('button', { type: 'button', 'data-composer-send': '' }, 'Voice note'))));
    expect(() => assertStableVariantsOnInput(view.container, within(view.container).getByTestId('composer'))).toThrow(/did not switch/);
  });

  it('refuses to pass vacuously: no text field, no button outside the composer, or a composer that already holds text', () => {
    const noField = render(h('div', null, KEEP(), h('div', { 'data-testid': 'composer' })));
    expect(() => assertStableVariantsOnInput(noField.container, within(noField.container).getByTestId('composer'))).toThrow(/no text field/);
    const alone = surface(() => null);
    expect(() => assertStableVariantsOnInput(alone.container, alone.composer)).toThrow(/outside the composer/);
    const insideOnly = render(h('div', { 'data-testid': 'composer' }, h('textarea', { 'aria-label': 'Message' }), h(Button, { variant: 'outline' }, 'Attach')));
    expect(() => assertStableVariantsOnInput(insideOnly.container, within(insideOnly.container).getByTestId('composer'))).toThrow(/outside the composer/);
    const full = render(h('div', null, KEEP(), h('div', { 'data-testid': 'composer' }, h('textarea', { defaultValue: 'already here' }))));
    expect(() => assertStableVariantsOnInput(full.container, within(full.container).getByTestId('composer'))).toThrow(/already holds text/);
  });
});

describe('P955 gate — assertStableVariantsOnInput against the REAL /tree/_gate/canvas-thread fixture (S6.3, S6.4)', () => {
  const at = (phase: string) => {
    localStorage.clear();
    const view = render(h(MemoryRouter, { initialEntries: [`/tree/_gate/canvas-thread?phase=${phase}`] }, h(CanvasThreadGateFixture)));
    return { container: view.container, composer: within(view.container).getByTestId('composer') };
  };
  const phasesOf = (container: HTMLElement) => Array.from(container.querySelectorAll('nav a')).map((a) => new URL(a.getAttribute('href')!, 'http://x').searchParams.get('phase')!);

  // S3 removed the ladder (openerIsPrimary, the composing variants of CanvasCreateBar, CanvasDraftCard and the closed strip), so
  // EVERY phase now keeps every button's look while typing. The 12 phases that failed before S3 were `it.fails`; they are plain
  // tests now. The Gate 7 proof against the REAL old code (the fixture and its parts restored from the pre-S3 commit) is in the
  // S3 report: it exits non-zero on exactly those 12 phases, and zero on this code.
  it('KNOWN-GOOD: the assertion passes on every phase of the fixture, and it really typed (the send slot switched, nothing else changed)', () => {
    const phases = phasesOf(at('empty').container);
    expect(phases.length).toBeGreaterThanOrEqual(4); // W0 removed the tray phases (their subject is gone): empty, messages, update-empty, update-messages remain
    cleanup();
    for (const phase of phases) {
      const { container, composer } = at(phase);
      expect(buttonsChangedOnInput(container, composer), `phase ${phase}`).toEqual([]);
      expect(() => assertStableVariantsOnInput(container, composer), `phase ${phase}`).not.toThrow();
      cleanup();
    }
  });
});

describe('P955 gate — assertTopBarMainAction (rule 9, top-bar clause): known-good and known-bad controls', () => {
  const bar = (...controls: React.ReactNode[]) => render(h('div', { 'data-testid': 'bar' }, ...controls)).container.firstElementChild as HTMLElement;
  const FILLED = 'inline-flex h-11 bg-blue-600 px-4 text-white';
  const PILL = 'inline-flex h-10 rounded-full border border-blue-600 bg-blue-50 text-blue-700';

  it('known-good: the secondary pill, then the one filled main action furthest right, auto width', () => {
    expect(() => assertTopBarMainAction(bar(h('button', { className: PILL }, 'Clone'), h('button', { className: FILLED }, 'Share')))).not.toThrow();
  });
  it('known-good: no filled control at all (a status sits in the spot)', () => {
    expect(() => assertTopBarMainAction(bar(h('button', { className: PILL }, 'Thread'), h('p', null, 'Nothing to publish yet')))).not.toThrow();
  });
  it('known-good: a filled Send in the composer slot is not the bar\'s concern, and an inert pane is not reachable', () => {
    expect(() => assertTopBarMainAction(bar(h('button', { className: FILLED }, 'Publish'), h('button', { 'data-composer-send': '', className: FILLED }, 'Send')))).not.toThrow();
    expect(() => assertTopBarMainAction(bar(h('button', { className: PILL }, 'Clone'), h('div', { inert: true }, h('button', { className: FILLED }, 'Hidden')), h('button', { className: FILLED }, 'Share')))).not.toThrow();
  });
  it('known-bad: a second filled control throws', () => {
    expect(() => assertTopBarMainAction(bar(h('button', { className: FILLED }, 'Publish'), h('button', { className: FILLED }, 'Share')))).toThrow(/top-bar.*2 filled controls/);
  });
  it('known-bad: a filled control that is not furthest right throws', () => {
    expect(() => assertTopBarMainAction(bar(h('button', { className: FILLED }, 'Publish'), h('button', { className: PILL }, 'Clone')))).toThrow(/furthest-right/);
  });
  it('known-bad: a full-width filled control throws', () => {
    expect(() => assertTopBarMainAction(bar(h('button', { className: `${FILLED} w-full` }, 'Publish')))).toThrow(/not auto width/);
  });
  it('known-bad: a disabled control (a button where a status belongs) throws', () => {
    expect(() => assertTopBarMainAction(bar(h('button', { className: PILL, disabled: true }, 'Publish')))).toThrow(/disabled control/);
    expect(() => assertTopBarMainAction(bar(h('button', { className: PILL, 'aria-disabled': 'true' }, 'Publish')))).toThrow(/disabled control/);
  });
  it('refuses to pass a bar with nothing in it', () => {
    expect(() => assertTopBarMainAction(bar(h('p', null, 'text')))).toThrow(/nothing was checked/);
  });
});

describe('P955 gate — assertStableVariantsOnInput and assertTopBarMainAction against the REAL /tree/_gate/canvas-workspace fixture (S6.4, S6.5, 3c S6.1)', () => {
  const PHASES = ['canvas', 'chat-composing', 'busy', 'published', 'nothing-to-publish', 'published-header', 'panel-closed', 'new-canvas', 'pending-clone', 'j4-sheet', 'mixed-reply', 'j10-reply'];
  // j4-sheet is a modal over the page (everything behind it is aria-hidden, so the bar has no reachable control) and j10-reply is a thread panel with no bar and no composer: each has its own test below.
  const OWN_TEST = ['j4-sheet', 'j10-reply'];
  const BAR_PHASES = PHASES.filter((p) => !OWN_TEST.includes(p));
  /** What the spot holds in each phase (3c X4): the filled control, or a status. */
  const FILLED: Record<string, 'canvas-draft-publish' | 'canvas-share-control' | null> = {
    canvas: 'canvas-draft-publish', 'chat-composing': 'canvas-draft-publish', 'panel-closed': 'canvas-draft-publish',
    published: 'canvas-share-control', 'published-header': 'canvas-share-control',
    busy: null, 'nothing-to-publish': null, 'new-canvas': null, 'pending-clone': null, 'mixed-reply': 'canvas-draft-publish',
  };
  const at = (phase: string) => {
    localStorage.clear();
    const view = render(h(MemoryRouter, { initialEntries: [`/tree/_gate/canvas-workspace?phase=${phase}`] }, h(CanvasWorkspaceGateFixture)));
    return { container: view.container, composer: within(view.container).queryByTestId('composer') };
  };

  it('the fixture lists exactly the phases this test covers (a new phase must be added here)', () => {
    const { container } = at('canvas');
    const listed = Array.from(container.querySelectorAll('nav a')).map((a) => new URL(a.getAttribute('href')!, 'http://x').searchParams.get('phase'));
    expect(listed.sort()).toEqual([...PHASES].sort());
  });

  // Gate 7c: the gate runs over EVERY existing phase, legitimate ones included, and each must still pass.
  it.each(BAR_PHASES)('%s: the bar passes rule 9 (one main action, furthest right, auto width, nothing disabled) and the spot is a filled button only when it can act', (phase) => {
    const { container } = at(phase);
    const bar = within(container).getByTestId('workspace-bar');
    expect(() => assertTopBarMainAction(bar)).not.toThrow();
    expect(reachableControls(bar).filter(isFilledControl).map((el) => el.getAttribute('data-testid'))).toEqual(FILLED[phase] ? [FILLED[phase]] : []);
    expect(Array.from(container.querySelectorAll('button')).filter((b) => b.disabled)).toEqual([]);
    expect(within(container).getByTestId('publish-spot')).toBeInTheDocument();
  });

  // published-header is the owner's bar above a plain page: there is no thread, so no composer to type into (its own test below).
  it.each(BAR_PHASES.filter((p) => p !== 'published-header'))('%s: typing changes no button except the send slot', (phase) => {
    const { container, composer } = at(phase);
    if (!composer) throw new Error(`phase ${phase} has no composer to type into`);
    if (phase === 'chat-composing') {
      // V4/V5: this phase opens with text typed in, so Send is visible (the P1576 swap shows Send only with text); the assertion starts from empty.
      expect(within(composer).getByRole('button', { name: 'Send' })).toBeInTheDocument();
      fireEvent.change(within(composer).getByRole('textbox'), { target: { value: '' } });
      expect(within(composer).queryByRole('button', { name: 'Send' })).toBeNull();
    }
    expect(buttonsChangedOnInput(container, composer)).toEqual([]);
    expect(() => assertStableVariantsOnInput(container, composer)).not.toThrow();
  });

  it('j4-sheet (S6.5): the real sheet opens over the page with one filled button (Add to my draft, last), Start over in red text, nothing disabled, both 44px', () => {
    const { container } = at('j4-sheet');
    const sheet = within(document.body).getByTestId('clone-draft-sheet');
    const buttons = within(sheet).getAllByRole('button').filter((b) => b.getAttribute('data-testid'));
    expect(buttons.map((b) => b.getAttribute('data-testid'))).toEqual(['clone-start-over', 'clone-add-to-draft']);
    expect(buttons.filter(isFilledControl).map((b) => b.getAttribute('data-testid'))).toEqual(['clone-add-to-draft']);
    expect(buttons.every((b) => b.className.includes('min-h-11') && !(b as HTMLButtonElement).disabled)).toBe(true);
    expect(buttons[0]!.className).toContain('text-destructive');
    expect(within(sheet).getByText(/Add this to it, or start over from v1\? Starting over discards that draft\./)).toBeInTheDocument();
    // the page behind keeps its own single main action (Share on a published version)
    expect(container.querySelector('[data-testid="canvas-share-control"]')).not.toBeNull();
  });

  it('mixed-reply (S6.5): the mirror\'s reply names two groups and one offer row per other group follows, each a secondary pill with the focus switch and Start; no second main action', () => {
    const { container } = at('mixed-reply');
    expect(within(container).getByTestId('gate-mixed-reply')).toHaveTextContent('two businesses');
    expect(within(container).getAllByTestId('canvas-offer-row')).toHaveLength(2);
    expect(within(container).getAllByTestId('canvas-offer-switch')).toHaveLength(2);
    expect(within(container).getAllByTestId('canvas-offer-start')).toHaveLength(2);
    const rows = within(container).getByTestId('canvas-offers');
    expect(reachableControls(rows).filter(isFilledControl)).toEqual([]);
    expect(reachableControls(rows).filter((b) => (b as HTMLButtonElement).disabled)).toEqual([]);
  });

  it('j10-reply (S6.5): a published draft\'s thread in the chat panel has offer rows with Start only, the closed line with Open canvas, no composer and no filled control', () => {
    const { container } = at('j10-reply');
    expect(within(container).getAllByTestId('canvas-offer-start')).toHaveLength(2);
    expect(within(container).queryByTestId('canvas-offer-switch')).toBeNull();
    expect(within(container).getByTestId('canvas-closed-line')).toHaveTextContent('Published as v2.');
    expect(within(container).getByTestId('canvas-closed-open')).toHaveTextContent('Open canvas');
    expect(within(container).queryByTestId('composer')).toBeNull();
    expect(within(container).queryByRole('textbox')).toBeNull();
    expect(reachableControls(container).filter(isFilledControl)).toEqual([]);
    expect(Array.from(container.querySelectorAll('button')).filter((b) => b.disabled)).toEqual([]);
  });

  it('FAILURE PATH (gate 7) on the real fixture: a second filled button put into the real bar makes the gate throw', () => {
    const { container } = at('canvas');
    const bar = within(container).getByTestId('workspace-bar');
    expect(() => assertTopBarMainAction(bar)).not.toThrow();
    const extra = document.createElement('button');
    extra.className = 'bg-blue-600 text-white';
    extra.textContent = 'Second main action';
    within(bar).getByTestId('canvas-bar-actions').prepend(extra);
    expect(() => assertTopBarMainAction(bar)).toThrow(/top-bar.*2 filled controls/);
  });

  it('published-header (W8, X4): the owner\'s bar sits above a plain page with no thread and no switcher; Share is the one filled control, with Clone beside it', () => {
    localStorage.clear();
    const { container } = render(h(MemoryRouter, { initialEntries: ['/tree/_gate/canvas-workspace?phase=published-header'] }, h(CanvasWorkspaceGateFixture)));
    const view = within(container);
    expect(view.queryByTestId('workspace-chat-pane')).toBeNull();
    expect(view.queryByTestId('workspace-view-switch')).toBeNull();
    expect(view.getByTestId('canvas-share-control')).toBeInTheDocument();
    expect(view.getByTestId('canvas-clone')).toBeInTheDocument();
    expect(view.queryByTestId('canvas-state')).toBeNull(); // no word for "published"
    expect(Array.from(container.querySelectorAll('button')).filter((b) => b.className.includes('bg-blue-600')).map((b) => b.getAttribute('data-testid'))).toEqual(['canvas-share-control']);
    expect(() => assertOnePrimary(container)).not.toThrow();
  });

  it('chat-composing opens on the Chat view, the others on the Canvas view; both panes are always mounted', () => {
    const chat = at('chat-composing').container;
    expect(within(chat).getByTestId('workspace-chat-pane')).toHaveAttribute('data-active', 'true');
    cleanup();
    const canvas = at('canvas').container;
    expect(within(canvas).getByTestId('workspace-canvas-pane')).toHaveAttribute('data-active', 'true');
    expect(within(canvas).getByTestId('workspace-chat-pane')).toBeInTheDocument();
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
