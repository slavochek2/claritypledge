/**
 * P1631: "Points in this chat" opens BESIDE the chat, like the Clarify panel: the chat's own address stays; ?points=1 says the panel is shown
 * (full screen below lg). Closing removes the parameter, stepping back when this very entry was pushed to open it.
 */
import { useLocation } from 'react-router-dom';
import { useReturnToParent } from '@/app/hooks/use-go-back';

export const POINTS_PANEL_PARAM = 'points';

export function withPointsPanel(search: string): string {
  const p = new URLSearchParams(search);
  p.delete('clarify'); // one side panel at a time: the one just asked for
  p.set(POINTS_PANEL_PARAM, '1');
  return `?${p.toString()}`;
}

export function withoutPointsPanel(search: string): string {
  const p = new URLSearchParams(search);
  p.delete(POINTS_PANEL_PARAM);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const pointsPanelPushed = (state: unknown): boolean => !!(state as { pointsPanel?: boolean } | null)?.pointsPanel;

/** The entry pushed to open the panel is a 'skip' level for the chat's own Back and Leave plans (same as the Clarify panel's). */
export function pointsPushState(state: unknown): Record<string, unknown> {
  const s = (state ?? {}) as { below?: unknown[] };
  return { ...s, below: ['skip', ...(Array.isArray(s.below) ? s.below : [])], pointsPanel: true };
}

export function pointsPanelShown(search: string): boolean {
  return new URLSearchParams(search).get(POINTS_PANEL_PARAM) === '1';
}

export function useClosePointsPanel(): () => void {
  const { pathname, search, state } = useLocation();
  const parentState = state && typeof state === 'object' ? { ...(state as Record<string, unknown>), pointsPanel: undefined } : state;
  return useReturnToParent(`${pathname}${withoutPointsPanel(search)}`, pointsPanelPushed(state), parentState);
}
