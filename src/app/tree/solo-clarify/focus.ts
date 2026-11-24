/**
 * @file focus.ts
 * @description P1722 prototype: whether keyboard focus was lost after the control holding it went away.
 */

/** Focus went nowhere a person put it: the page, or a container that only holds focus for reading (WebKit may leave it there). */
export const focusLost = (): boolean => {
  const a = document.activeElement;
  return !a || a === document.body || !a.matches('a[href], button, input, textarea, select, [role="radio"], [role="tab"]');
};
