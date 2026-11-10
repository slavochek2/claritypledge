/**
 * P955 gate: the four DOM assertions (one primary, no dead disabled control, no overflow at 320, 44px touch targets), kept apart from
 * p955-gate.test.ts like p955-stable-variants.ts so any test file can import them: importing a `.test.ts` file would register that
 * file's tests a second time. p955-gate.test.ts re-exports all four.
 */

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
