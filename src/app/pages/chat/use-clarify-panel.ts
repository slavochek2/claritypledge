/**
 * P1631: the Clarify panel beside the chat (?clarify=<root>). The chat is the panel's parent: when the chat pushed the panel's
 * entry (and that entry can pop), closing steps back to it; otherwise (a link, a cold arrival) closing replaces the address with
 * the chat's own, keeping its route state. Never the event-night room fallback: this control returns to the chat it names.
 */
import { useLocation } from 'react-router-dom';
import { useReturnToParent } from '@/app/hooks/use-go-back';
import { clarifyPanelPushed, clarifyPanelRoot, withoutClarifyPanel } from './clarify-panel';

export function useClarifyPanel(): { clarifyRoot: string | null; closeClarify: () => void } {
  const { pathname, search, state } = useLocation();
  const parentState = state && typeof state === 'object' ? { ...(state as Record<string, unknown>), clarifyPanel: undefined } : state;
  const closeClarify = useReturnToParent(`${pathname}${withoutClarifyPanel(search)}`, clarifyPanelPushed(state), parentState);
  return { clarifyRoot: clarifyPanelRoot(search), closeClarify };
}
