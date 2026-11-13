/**
 * P1631: the Mirror's Clarify thread opens BESIDE the chat it came from, not instead of it. The chat's own address stays; one query parameter
 * names the Mirror thread shown in the right panel (full screen below lg, like any thread). Closing removes the parameter in place.
 */
import { POINTS_PANEL_PARAM } from './points-panel';

export const CLARIFY_PANEL_PARAM = 'clarify';

/** The same address with the panel opened on this Mirror thread (other parameters, such as ?m=, are kept). */
export function withClarifyPanel(search: string, rootId: string): string {
  const p = new URLSearchParams(search);
  p.delete(POINTS_PANEL_PARAM); // one side panel at a time: the one just asked for
  p.set(CLARIFY_PANEL_PARAM, rootId);
  return `?${p.toString()}`;
}

/** The same address without the panel. Empty when nothing else is left. */
export function withoutClarifyPanel(search: string): string {
  const p = new URLSearchParams(search);
  p.delete(CLARIFY_PANEL_PARAM);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** True when this very entry was pushed to open the panel (so closing it is one step back). */
export const clarifyPanelPushed = (state: unknown): boolean => !!(state as { clarifyPanel?: boolean } | null)?.clarifyPanel;

/**
 * The state of the entry pushed to open the panel. It sits on top of the chat's own entry, so for the chat's Back and Leave plans it is a
 * 'skip' level: they count it as one more entry to step over, and still land where they always did.
 */
export function clarifyPushState(state: unknown): Record<string, unknown> {
  const s = (state ?? {}) as { below?: unknown[] };
  return { ...s, below: ['skip', ...(Array.isArray(s.below) ? s.below : [])], clarifyPanel: true };
}

/** The Mirror thread the address asks the panel to show, or null. */
export function clarifyPanelRoot(search: string): string | null {
  return new URLSearchParams(search).get(CLARIFY_PANEL_PARAM) || null;
}

/**
 * AC 137: below 1280px the Mirror's Clarify thread is tinted (the prototype's blue-50, a design-system tint), so it never reads as the chat it came from.
 * The panel wears it, and so does its message list, which paints its own background (passed to it as `scrollerClassName`). From 1280px it sits beside
 * the chat untinted. The app has no dark theme (nothing sets the `dark` class), so there is no dark counterpart.
 */
export const CLARIFY_NARROW_TINT = 'bg-blue-50 xl:bg-background';
