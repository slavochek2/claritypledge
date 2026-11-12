/**
 * P1631: whether the owner has set a position on a draft point, shared between the draft card (which writes the position) and the Publish button under the latest card
 * (which only needs to know if there is one). A tiny external store keyed by point id, so the two stay in step without lifting the card's write state.
 */
import { useSyncExternalStore } from 'react';

const known = new Map<string, boolean>();
const listeners = new Set<() => void>();

/** Called by the card whenever its shown position changes. */
export function setHasPosition(pointId: string, has: boolean): void {
  if (known.get(pointId) === has) return;
  known.set(pointId, has);
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

/** The shown position of a point is set; before the card has reported, the server's value decides. */
export function useHasPosition(pointId: string, serverHas: boolean): boolean {
  return useSyncExternalStore(subscribe, () => known.get(pointId) ?? serverHas, () => serverHas);
}
