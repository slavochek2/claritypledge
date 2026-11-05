/**
 * @file canvas-focus-request.ts
 * @description P1621 (keyboard): when a control goes away (an editor closes, a card is replaced after a save), focus must land somewhere useful and never on the page.
 * The control that will take it may not exist yet (a save's new card arrives with the next read), so the closing code names it by test id (or a list of them, tried in
 * order) and the boxes hand focus over as soon as one is on screen and can take it. Focus moves only while it is lost (on the page body or on something removed): a
 * person who has moved on is never pulled back. The request is dropped when the canvas page goes away.
 */
import { useEffect } from 'react';

const WAIT_MS = 8000;
let pending: { testIds: readonly string[]; until: number } | null = null;

export function requestFocus(testId: string | readonly string[]): void {
  pending = { testIds: typeof testId === 'string' ? [testId] : testId, until: Date.now() + WAIT_MS };
}

export function dropFocusRequest(): void {
  pending = null;
}

export const hasFocusRequest = (): boolean => pending !== null;

/** Called by every box on every render: hands focus to the first requested control that exists and takes it, once focus is lost. */
export function useFocusRequest(): void {
  useEffect(() => {
    if (!pending) return;
    if (Date.now() > pending.until) { pending = null; return; }
    const at = document.activeElement;
    if (at && at !== document.body && at.isConnected) { pending = null; return; }
    for (const id of pending.testIds) {
      const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
      if (!el) continue;
      el.focus();
      if (document.activeElement === el) { pending = null; return; }   // an element behind an open panel cannot take focus: try the next, keep waiting
    }
  });
}

/**
 * For a box: when focus was inside it at the start of a render and has fallen to the page by the end of the commit (a control that had it was removed: Edit or Add card when a
 * run starts, a Cancel that closed its editor), focus goes to `fallback` (the box title) unless a named request is still waiting.
 */
export function useKeepFocus(box: { current: HTMLElement | null }, fallback: () => void): void {
  let had = false;
  if (typeof document !== 'undefined') {
    const at = document.activeElement;
    had = !!at && at !== document.body && !!box.current?.contains(at);
  }
  useEffect(() => {
    if (!had || pending) return;
    const at = document.activeElement;
    if (!at || at === document.body) fallback();
  });
}
