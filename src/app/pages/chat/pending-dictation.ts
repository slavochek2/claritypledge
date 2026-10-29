/**
 * @file pending-dictation.ts
 * @description P1576: dictated words that did not fit their chat's draft wait here, attached to THAT chat's draft
 * key. A draft never passes the message cap (the server refuses a longer message), and a person's words are
 * never cut or dropped: the composer of the chat they belong to offers them again, whenever the person is
 * there. Module-level, like the drafts themselves, so a chat switch or an unmounted composer does not lose them.
 */
import { useSyncExternalStore } from 'react';

export interface PendingDictation {
  text: string;
  /** Where in the draft they were spoken. */
  caret: number;
}

const held = new Map<string, PendingDictation>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Holds words for a chat. A second batch joins the first: nothing is replaced. */
export function holdPending(key: string, text: string, caret: number): void {
  const said = text.trim();
  if (!said) return;
  const have = held.get(key);
  held.set(key, have ? { text: `${have.text} ${said}`, caret: have.caret } : { text: said, caret });
  emit();
}

export function getPending(key: string): PendingDictation | null {
  return held.get(key) ?? null;
}

export function clearPending(key: string): void {
  if (held.delete(key)) emit();
}

/** Drops everything that does not belong to `userId` (all of it when signed out), like `clearDraftsExcept`. */
export function clearPendingExcept(userId: string | null): void {
  let changed = false;
  for (const key of [...held.keys()]) {
    if (!userId || !key.startsWith(`${userId}:`)) changed = held.delete(key) || changed;
  }
  if (changed) emit();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The words held for `key`, live. */
export function usePending(key: string): PendingDictation | null {
  return useSyncExternalStore(subscribe, () => held.get(key) ?? null);
}
