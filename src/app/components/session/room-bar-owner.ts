/**
 * @file room-bar-owner.ts
 * @description The event room draws the running transcription bar itself, under its tabs row (founder, solo test
 * 2026-11-02). While a page holds that claim, the shell's slot keeps its place (so the App-level fallback stays out of
 * the way) but draws nothing, so the bar is never on screen twice.
 */
import { useSyncExternalStore } from 'react';

let owners = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Claim the bar for this page; the returned function releases it. */
export function claimRoomBar(): () => void {
  owners += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;   // a second call must not drop somebody else's claim
    released = true;
    owners = Math.max(0, owners - 1);
    emit();
  };
}

export function useRoomBarClaimed(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => owners > 0,
    () => false,
  );
}
