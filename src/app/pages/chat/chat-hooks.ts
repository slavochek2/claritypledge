/**
 * P1512: small hooks shared by the chat components.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * While `on`, a press outside every given ref and the Escape key both call `onClose`.
 * Escape is marked handled (preventDefault) so a panel behind a menu does not also close.
 */
export function useDismiss(onClose: () => void, on: boolean, refs: RefObject<HTMLElement | null>[]) {
  const close = useRef(onClose);
  close.current = onClose;
  const keep = useRef(refs);
  keep.current = refs;
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      close.current();
    };
    const onPress = (e: MouseEvent) => {
      const target = e.target as Node;
      if (keep.current.every((r) => !r.current || !r.current.contains(target))) close.current();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPress);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPress);
    };
  }, [on]);
}

/** True while the tab is in front. Read the live value; nothing else re-renders on a flip. */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
    };
  }, []);
  return visible;
}

/**
 * The unsent text of each conversation, kept while the person looks at another chat. Keys start
 * with the signed-in user's id, and everyone else's drafts are dropped when the user changes, so
 * one person's half-written message can never show up in the next person's composer.
 */
const drafts = new Map<string, string>();

/** Drops every draft that does not belong to `userId` (all of them when signed out). */
export function clearDraftsExcept(userId: string | null): void {
  for (const key of [...drafts.keys()]) {
    if (!userId || !key.startsWith(`${userId}:`)) drafts.delete(key);
  }
}

export function useDraft(key: string): [string, (value: string) => void] {
  const [value, setValue] = useState(() => drafts.get(key) ?? '');
  useEffect(() => {
    setValue(drafts.get(key) ?? '');
  }, [key]);
  const set = useCallback(
    (next: string) => {
      if (next) drafts.set(key, next);
      else drafts.delete(key);
      setValue(next);
    },
    [key],
  );
  return [value, set];
}

/** A desktop-pointer check for "Enter sends": touch keyboards use Enter for a new line. */
export function hasFinePointer(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(pointer: fine)').matches;
}

/** Live result of a media query (false where matchMedia does not exist). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches === true);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches === true);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, [query]);
  return matches;
}

/** Tailwind's lg: the two-pane desktop layout. */
export const DESKTOP_QUERY = '(min-width: 1024px)';

/** A wide screen with a real hover: the only place the message toolbar floats over the text. */
export const DESKTOP_HOVER_QUERY = '(min-width: 1024px) and (hover: hover)';
