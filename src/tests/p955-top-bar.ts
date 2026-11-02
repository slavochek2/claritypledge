/**
 * P955 gate: rule 9's top-bar clause (P1536 3c S6.1), kept apart from p955-gate.test.ts like p955-stable-variants.ts so any test can import it.
 *
 * Design rule 9: "A page's single main action in a top bar (Publish, Share) is filled, auto width, furthest right, and may sit beside a filled Send;
 * everything else in that bar is the secondary pill or rule 5. When an action is waiting, a status takes its spot. Never disabled."
 *
 * `assertTopBarMainAction(bar)` reads the controls a person can reach in the bar (not inside an inert or aria-hidden element, not the composer's
 * send slot) and throws when:
 *   - more than one is FILLED (bg-blue-600, bg-primary, bg-destructive or data-variant=primary): a second main action;
 *   - the filled one is not the LAST control in document order (the bar's DOM order is its visual order: the main action is furthest right);
 *   - the filled one is not auto width (w-full, flex-1 or data-full-width);
 *   - any control is disabled or aria-disabled (a status takes the spot instead).
 * A bar with no filled control passes (a status sits in the spot). It never passes a bar it could not read: no reachable control at all is an error.
 */
const tokens = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
const FILLED = new Set(['bg-blue-600', 'bg-primary', 'bg-destructive']);

export const isFilledControl = (el: Element): boolean =>
  tokens(el).some((t) => FILLED.has(t)) || el.getAttribute('data-variant') === 'primary';

const name = (el: Element): string => (el.textContent ?? '').trim() || el.getAttribute('aria-label') || '(unlabelled)';

/** The controls a person can press in the bar, in document order. */
export function reachableControls(bar: HTMLElement): HTMLElement[] {
  return Array.from(bar.querySelectorAll<HTMLElement>('button, a[href], [role="button"]')).filter(
    (el) => !el.closest('[inert], [aria-hidden="true"]') && !el.closest('[data-composer-send]') && !el.hasAttribute('data-composer-send'),
  );
}

export function assertTopBarMainAction(bar: HTMLElement): void {
  const controls = reachableControls(bar);
  if (controls.length === 0) throw new Error('P955-gate [top-bar]: no reachable control in the bar, so nothing was checked.');
  const disabled = controls.filter((el) => (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true');
  if (disabled.length > 0) {
    throw new Error(`P955-gate [top-bar]: disabled control(s) in the bar: ${disabled.map(name).join(', ')}. Rule 9: a status takes the spot; never disabled.`);
  }
  const filled = controls.filter(isFilledControl);
  if (filled.length > 1) {
    throw new Error(`P955-gate [top-bar]: ${filled.length} filled controls in the bar: ${filled.map(name).join(', ')}. Rule 9: the bar has ONE main action; everything else is the secondary pill or rule 5.`);
  }
  const main = filled[0];
  if (!main) return;
  if (controls[controls.length - 1] !== main) {
    throw new Error(`P955-gate [top-bar]: the filled "${name(main)}" is not the furthest-right control (last: "${name(controls[controls.length - 1]!)}"). Rule 9: the main action is furthest right.`);
  }
  const cls = tokens(main);
  if (cls.includes('w-full') || cls.includes('flex-1') || main.getAttribute('data-full-width') === 'true') {
    throw new Error(`P955-gate [top-bar]: the filled "${name(main)}" is not auto width (${cls.filter((t) => t === 'w-full' || t === 'flex-1').join(' ')}). Rule 9: the bar's main action is auto width.`);
  }
}
