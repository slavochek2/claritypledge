/**
 * @file focus.ts
 * @description P1722 prototype: whether keyboard focus was lost after the control holding it went away.
 */

/** Focus went nowhere a person put it: the page, or a container only code focuses (tabindex -1; WebKit may leave it there). */
export const focusLost = (): boolean => {
  const a = document.activeElement;
  return !a || a === document.body || !a.matches('a[href], button, input, textarea, select, summary, [contenteditable="true"], [tabindex]:not([tabindex="-1"])');
};
