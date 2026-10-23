/**
 * @file use-artifacts-data.ts
 * @description P1545 WP3: loads everything the Artifacts page lists and hands it to the view model.
 *
 * One hook for both tabs because the two share a source: `getInboxItems` feeds Shared with you (letters
 * sent to you) AND the sent letters' "N replied" in Yours. Each source settles on its own, so one slow
 * or failing service never blanks the other tab; a tab errors only when all of ITS sources failed, and
 * says "some could not be loaded" when only part did.
 *
 * Refreshes quietly every 15 s while the tab is visible and on focus (today's inbox/sent behaviour):
 * a failed quiet refresh keeps what is on screen.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { docsService } from '@/app/data/docs-service';
import { getAllSentLetters, getDeliveriesForLetters, getInboxItems } from '@/app/data/letters-service';
import { canvasService, type CanvasSharedWithMe, type MyCanvasRow } from '@/app/data/canvas-service';
import { buildArtifacts, type ArtifactRow, type SentLetter } from './artifacts-view-model';
import type { ClarityDoc, InboxItem, LetterDelivery } from '@/app/types';

const POLL_MS = 15_000;

export type TabStatus = 'loading' | 'ready' | 'error';

export interface TabData {
  status: TabStatus;
  rows: ArtifactRow[];
  /** Ready, but at least one source failed: the list may be missing items. */
  partial: boolean;
}

interface Sources {
  docs: ClarityDoc[] | null;
  sent: { letters: SentLetter[]; deliveries: Record<string, LetterDelivery[]> } | null;
  myCanvases: MyCanvasRow[] | null;
  inbox: InboxItem[] | null;
  sharedCanvases: CanvasSharedWithMe[] | null;
}

const EMPTY: Sources = { docs: null, sent: null, myCanvases: null, inbox: null, sharedCanvases: null };

/** `null` = not settled yet, or failed; `failed` tells the two apart. */
type Failed = Partial<Record<keyof Sources, boolean>>;

async function loadSent(userId: string): Promise<NonNullable<Sources['sent']>> {
  const letters = await getAllSentLetters(userId);
  const deliveries = letters.length ? await getDeliveriesForLetters(letters.map(l => l.id)) : {};
  return { letters, deliveries };
}

export function useArtifactsData(userId: string, userSlug: string | null): TabDataResult {
  const [sources, setSources] = useState<Sources>(EMPTY);
  const [failed, setFailed] = useState<Failed>({});
  const [settled, setSettled] = useState<Partial<Record<keyof Sources, boolean>>>({});
  const mounted = useRef(true);
  const userRef = useRef(userId);
  userRef.current = userId;
  // Sources that have loaded at least once for this person: a later failure keeps their last value.
  const loadedOnce = useRef<Set<keyof Sources>>(new Set());

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const load = useCallback(async () => {
    const forUser = userId;
    const run = <K extends keyof Sources>(key: K, fn: () => Promise<NonNullable<Sources[K]>>) =>
      fn().then(
        value => {
          if (!mounted.current || userRef.current !== forUser) return;
          loadedOnce.current.add(key);
          setSources(prev => ({ ...prev, [key]: value }));
          setFailed(prev => (prev[key] ? { ...prev, [key]: false } : prev));
          setSettled(prev => (prev[key] ? prev : { ...prev, [key]: true }));
        },
        () => {
          if (!mounted.current || userRef.current !== forUser) return;
          // A quiet refresh that fails keeps the last good value; only a source that never loaded is "failed".
          if (!loadedOnce.current.has(key)) setFailed(prev => ({ ...prev, [key]: true }));
          setSettled(prev => (prev[key] ? prev : { ...prev, [key]: true }));
        },
      );
    await Promise.all([
      run('docs', () => docsService.getDocsByUser(forUser)),
      run('sent', () => loadSent(forUser)),
      run('myCanvases', () => canvasService.listMyCanvases()),
      run('inbox', () => getInboxItems(forUser)),
      run('sharedCanvases', () => canvasService.listSharedWithMe()),
    ]);
  }, [userId]);

  useEffect(() => {
    loadedOnce.current = new Set();
    setSources(EMPTY);
    setFailed({});
    setSettled({});
    void load();
    const tick = () => { if (document.visibilityState === 'visible') void load(); };
    const interval = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

  const model = useMemo(
    () =>
      buildArtifacts({
        docs: sources.docs ?? [],
        sentLetters: sources.sent?.letters ?? [],
        deliveriesByLetter: sources.sent?.deliveries ?? {},
        inbox: sources.inbox ?? [],
        myCanvases: sources.myCanvases ?? [],
        sharedCanvases: sources.sharedCanvases ?? [],
        userSlug,
      }),
    [sources, userSlug],
  );

  const tabState = (keys: (keyof Sources)[], rows: ArtifactRow[]): TabData => {
    const allSettled = keys.every(k => settled[k]);
    if (!allSettled) return { status: 'loading', rows, partial: false };
    const failedCount = keys.filter(k => failed[k]).length;
    if (failedCount === keys.length) return { status: 'error', rows: [], partial: false };
    return { status: 'ready', rows, partial: failedCount > 0 };
  };

  return {
    yours: tabState(['docs', 'sent', 'myCanvases'], model.yours),
    shared: tabState(['inbox', 'sharedCanvases'], model.shared),
    refresh: load,
  };
}

export interface TabDataResult {
  yours: TabData;
  shared: TabData;
  refresh: () => Promise<void>;
}
