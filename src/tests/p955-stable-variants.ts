/**
 * P955 gate — rule 9 assertion (P1536 S6.2), kept apart from p955-gate.test.ts so any test file can import it:
 * importing a `.test.ts` file would register that file's tests a second time. p955-gate.test.ts re-exports both functions.
 */
import { fireEvent } from '@testing-library/react';
import { buttonVariants } from '@/components/ui/button';

/**
 * P1536 S6.2 (design rule 9, docs/design-system.md): a button's look changes only when its meaning changes, and typing
 * changes only the composer's send slot.
 *
 * Types into `composer`'s field and compares every other button before and after:
 *   - buttons are keyed by DOM node identity, so a button replaced by another is reported as unmounted + mounted;
 *   - the send slot is excluded: any button that carries `data-composer-send` or sits inside an element that does (the
 *     real Composer marks Send and the voice-note button, the P1576 swap);
 *   - a button's look is its `data-variant`, its variant classes (derived from `buttonVariants` in
 *     src/components/ui/button.tsx, so a new variant needs no edit here), any hand-typed look class (bg-, border, ring,
 *     shadow, underline, text colour, opacity-, gradient from/via/to, outline-, fill-, stroke-) WITH its state prefix
 *     (hover:, focus:, disabled:, dark:, sm:, group-*, aria-*:, data-[...]: ...), its `disabled` and `aria-disabled`
 *     attributes and its inline `style`.
 *
 * Throws if a button changed its look, mounted or unmounted. It never passes without proof that it checked something:
 *   - the field must be empty first, and must hold what was typed afterwards (a controlled field with no handler snaps back);
 *   - the composer must contain a send slot, and the slot must have switched (voice button -> Send): that is what shows
 *     the input reached the app and not only the DOM node;
 *   - at least one other button must exist OUTSIDE the composer element to compare.
 * A `[contenteditable="true"]` field is typed into by setting its textContent and firing `input`.
 */
const buttonTokens = (variant: string) => new Set(buttonVariants({ variant: variant as never }).split(/\s+/));
const VARIANT_NAMES = ['default', 'dark', 'destructive', 'outline', 'secondary', 'ghost', 'link'];
const VARIANT_TOKENS: ReadonlySet<string> = (() => {
  const all = VARIANT_NAMES.map(buttonTokens);
  const shared = [...all[0]].filter((t) => all.every((set) => set.has(t)));
  return new Set(all.flatMap((set) => [...set]).filter((t) => !shared.includes(t)));
})();
/** Tailwind state and breakpoint prefixes: `hover:`, `md:`, `group-hover:`, `aria-[x]:`, `data-[state=open]:`, `[&_svg]:`, `dark:`, `peer-focus/name:` ... */
const STATE_PREFIX = /^(?:!?[\w-]*(?:\[[^\]]*\])?[\w-]*(?:\/[\w-]+)?:)+/;
const LOOK_TOKEN = /^!?-?(?:bg|border|ring|shadow|opacity|from|via|to|outline|fill|stroke|decoration)(?:-|$)|^!?underline$|^!?no-underline$|^!?text-(?!(?:xs|sm|base|lg|xl|\d+xl|left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip)$|\[\d)/;

const isLookToken = (token: string) => VARIANT_TOKENS.has(token) || LOOK_TOKEN.test(token.replace(STATE_PREFIX, ''));

function lookSignature(el: HTMLElement): string {
  const tokens = (el.getAttribute('class') ?? '').split(/\s+/).filter((t) => t && isLookToken(t));
  return [
    el.getAttribute('data-variant') ?? '',
    [...new Set(tokens)].sort().join(' '),
    `disabled=${el.hasAttribute('disabled')}`,
    `aria-disabled=${el.getAttribute('aria-disabled') ?? ''}`,
    `style=${el.getAttribute('style') ?? ''}`,
  ].join('|');
}

const buttonName = (el: HTMLElement) => el.getAttribute('aria-label') ?? (el.textContent?.trim() || '(unlabeled)');
const inSendSlot = (el: HTMLElement) => el.hasAttribute('data-composer-send') || el.closest('[data-composer-send]') !== null;

function buttonLooks(container: HTMLElement): Map<HTMLElement, string> {
  const looks = new Map<HTMLElement, string>();
  for (const el of container.querySelectorAll<HTMLElement>('button, [role="button"]')) {
    if (!inSendSlot(el)) looks.set(el, lookSignature(el));
  }
  return looks;
}

/** What the send slot holds: React may reuse one DOM node for the voice button and Send, so the slot is read by what it shows. */
const sendSlotOf = (composer: HTMLElement): string[] =>
  Array.from(composer.querySelectorAll<HTMLElement>('[data-composer-send]'), (el) => `${el.tagName}|${buttonName(el)}|${el.getAttribute('type') ?? ''}`);

function setFieldText(field: HTMLElement, text: string): void {
  if (field.isContentEditable || field.getAttribute('contenteditable') === 'true') {
    field.textContent = text;
    fireEvent.input(field);
  } else {
    fireEvent.change(field, { target: { value: text } });
  }
}
const fieldText = (field: HTMLElement) => (field.getAttribute('contenteditable') === 'true' ? field.textContent ?? '' : (field as HTMLTextAreaElement).value);

const TYPED = 'hello';

/**
 * The buttons that changed when TYPED went into the composer, as "name: look | mounted | unmounted" (sorted), after the
 * checks that the input really reached the app. Throws when the check could not run. The composer is left empty.
 */
export function buttonsChangedOnInput(container: HTMLElement, composer: HTMLElement): string[] {
  const field = composer.querySelector<HTMLElement>('textarea, input:not([type="file"]):not([type="hidden"]), [contenteditable="true"]');
  if (!field) throw new Error('P955-gate [stable-variants]: the composer has no text field to type into.');
  if (fieldText(field) !== '') {
    throw new Error('P955-gate [stable-variants]: the composer already holds text, so typing would change nothing. Start from an empty composer.');
  }
  const before = buttonLooks(container);
  if (![...before.keys()].some((el) => !composer.contains(el))) {
    throw new Error('P955-gate [stable-variants]: no button outside the composer to compare, so nothing was checked.');
  }
  const slotBefore = sendSlotOf(composer);
  setFieldText(field, TYPED);
  const typed = fieldText(field);
  const after = buttonLooks(container);
  const slotAfter = sendSlotOf(composer);
  // Leave the composer as found: a chat draft is kept per key, so the next render of the same surface would start with text.
  setFieldText(field, '');

  const switched = slotBefore.join('||') !== slotAfter.join('||');
  if (typed !== TYPED || !switched) {
    const slot = slotBefore.length + slotAfter.length === 0 ? 'has no send slot (mark Send with data-composer-send)' : switched ? 'switched' : 'did not switch';
    throw new Error(`P955-gate [stable-variants]: input did not reach the composer: the field holds "${typed}" after typing "${TYPED}" and its send slot ${slot}. Nothing was compared.`);
  }
  const changed: string[] = [];
  for (const [el, look] of before) {
    if (!after.has(el)) changed.push(`${buttonName(el)}: unmounted`);
    else if (after.get(el) !== look) changed.push(`${buttonName(el)}: look (${look} -> ${after.get(el)})`);
  }
  for (const el of after.keys()) if (!before.has(el)) changed.push(`${buttonName(el)}: mounted`);
  return changed.sort();
}

export function assertStableVariantsOnInput(container: HTMLElement, composer: HTMLElement): void {
  const changed = buttonsChangedOnInput(container, composer);
  if (changed.length > 0) {
    throw new Error(
      `P955-gate [stable-variants]: typing in the composer changed ${changed.length} button(s) outside the send slot: ` +
        `${changed.join('; ')}. Rule 9: a button's look changes only when its meaning changes; typing changes only the composer's Send.`
    );
  }
}
