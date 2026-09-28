/**
 * @file use-return-state.ts
 * @description P1364 §5 — `useState` for a card's open/expanded state that Back remembers.
 *
 *   const [open, setOpen] = useReturnState(`feed-point-stories:${point.id}`, false);
 *
 * - On a POP (Back / browser back-forward) the card starts in the state it had on that visit —
 *   read synchronously in the initialiser, so the expanded card is already in the DOM when
 *   ScrollToTop restores the pixel position (which must point at the same card, opened).
 * - On a PUSH it starts at `initial` (a link, or tapping Feed in the nav, opens collapsed).
 * - A REPLACE keeps the current state (same visit; ScrollToTop migrates the stored bucket).
 * - When the SAME mounted card sees its history entry change (a POP between two entries of one
 *   list), it re-reads the entry's state (POP) or resets (PUSH); when its `id` changes (the
 *   component now shows another item), it takes that item's state.
 * See src/lib/return-state.ts for why this lives in memory per history entry, not in the URL
 * or the list cache.
 */
import { useCallback, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { scrollEntryKey } from '@/lib/scroll-positions';
import { readReturnState, writeReturnState } from '@/lib/return-state';

export function useReturnState<T>(id: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const location = useLocation();
  const navigationType = useNavigationType();
  const entry = scrollEntryKey(location.key, location.pathname, location.search);

  const [value, setValue] = useState<T>(() => {
    if (navigationType !== 'POP') return initial;
    const saved = readReturnState<T>(entry, id);
    return saved === undefined ? initial : saved;
  });

  const entryRef = useRef(entry);
  const idRef = useRef(id);
  idRef.current = id;
  const initialRef = useRef(initial);
  initialRef.current = initial;

  // The card now shows a different item (same component, new id): that item's own state.
  const lastIdRef = useRef(id);
  useLayoutEffect(() => {
    if (lastIdRef.current === id) return;
    lastIdRef.current = id;
    const saved = navigationType === 'POP' ? readReturnState<T>(entryRef.current, id) : undefined;
    setValue(saved === undefined ? initialRef.current : saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only an id change re-reads
  }, [id]);

  useLayoutEffect(() => {
    if (entryRef.current === entry) return;
    entryRef.current = entry;
    if (navigationType === 'POP') {
      const saved = readReturnState<T>(entry, idRef.current);
      setValue(saved === undefined ? initialRef.current : saved);
    } else if (navigationType === 'PUSH') {
      setValue(initialRef.current);
    }
    // REPLACE: the same visit — keep the state (ScrollToTop moved the stored bucket).
  }, [entry, navigationType]);

  const set = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    setValue(prev => {
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      writeReturnState(entryRef.current, idRef.current, resolved);
      return resolved;
    });
  }, []);

  return [value, set];
}
