/**
 * @file task-open-store.ts
 * @description P1529: whether the person opened the collapsed "next version" task, kept outside the component so it survives a
 * remount of the round card (the room page swaps to its loader while it reads, which unmounts everything on it). One flag per
 * event and round the version is made from: the next round starts collapsed again.
 */
import { useReducer } from 'react';

const opened = new Set<string>();

export function useTaskOpen(key: string): [boolean, (open: boolean) => void] {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const set = (open: boolean) => {
    if (open) opened.add(key); else opened.delete(key);
    rerender();
  };
  return [opened.has(key), set];
}

/** For tests: the store is module-level on purpose. */
export function resetTaskOpen(): void {
  opened.clear();
}
