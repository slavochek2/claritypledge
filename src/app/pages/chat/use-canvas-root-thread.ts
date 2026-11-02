/**
 * @file use-canvas-root-thread.ts
 * @description P1536 3c X11: what a canvas thread root's draft is, for its "N replies" link: one narrow read (getCanvasRootThread), kept fresh by real signals
 * (use-canvas-root-refresh) and read AGAIN at the moment of the tap (`resolveNow`), so a stale link can never land wrong.
 *  - `thread` is null until the read answers, when it was refused, and when the viewer has no readable draft: the link shows nothing in each case (a link that goes nowhere is worse);
 *  - a read that never answers leaves `thread` null and blocks nothing: a later signal reads again (reads are never shared, P1527);
 *  - a refused RE-read keeps what was known; an older read answering after a newer one is ignored;
 *  - `resolveNow` never waits longer than TAP_READ_MAX_MS: a refused or stalled read falls back to what is known.
 * Request cost: one read on mount (a closed draft one request, an open one two), then one per signal while the draft is open or unknown; none once it is closed
 * (a closed draft never changes), none while the tab is hidden, none on a timer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getCanvasRootThread, type CanvasRootThread } from '@/app/data/canvas-draft-service';
import { useCanvasRootRefresh } from './use-canvas-root-refresh';

/** The longest a tap waits for the current state before it acts on what is known. */
export const TAP_READ_MAX_MS = 4_000;

const withDeadline = <T,>(read: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('read deadline')), ms);
    read.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e: unknown) => { clearTimeout(timer); reject(e instanceof Error ? e : new Error(String(e))); },
    );
  });

export function useCanvasRootThread(rootId: string, viewerId: string, refreshKey?: number): { thread: CanvasRootThread | null; resolveNow: () => Promise<CanvasRootThread | null> } {
  const key = `${viewerId}|${rootId}`;
  const [read, setRead] = useState<{ key: string; thread: CanvasRootThread | null } | null>(null);
  const known = useRef<CanvasRootThread | null>(null);
  const issued = useRef(0);
  const applied = useRef(0);
  const current = useRef(key);
  current.current = key;
  const thread = read && read.key === key ? read.thread : null;
  known.current = thread;

  /** One read. It writes only while nothing newer has written and the row is still the same; a refusal changes nothing but the very first value (null). */
  const load = useCallback(async (): Promise<CanvasRootThread | null> => {
    const mine = ++issued.current;
    const forKey = key;
    const write = (t: CanvasRootThread | null, first: boolean) => {
      if (current.current !== forKey || mine < applied.current) return;
      applied.current = mine;
      setRead((prev) => (first && prev && prev.key === forKey ? prev : { key: forKey, thread: t }));
    };
    try {
      const t = await getCanvasRootThread(rootId, viewerId);
      write(t, false);
      return t;
    } catch {
      if (known.current === null) write(null, true);
      return known.current;
    }
  }, [rootId, viewerId, key]);

  useEffect(() => {
    issued.current = 0;
    applied.current = 0;
    void load();
  }, [load]);

  // Only what could still change is followed: an unknown thread (not read yet, refused, stalled) and an OPEN draft. A closed one never changes again.
  useCanvasRootRefresh(thread?.state === 'open' ? thread.draftId : null, () => void load(), refreshKey, thread === null || thread.state === 'open');

  const resolveNow = useCallback(async (): Promise<CanvasRootThread | null> => {
    try {
      return await withDeadline(load(), TAP_READ_MAX_MS);
    } catch {
      return known.current;
    }
  }, [load]);

  return { thread, resolveNow };
}
