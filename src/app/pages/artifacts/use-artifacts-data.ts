/**
 * @file use-artifacts-data.ts
 * @description P1545 WP3: loads everything the Artifacts page lists and hands it to the view model.
 *
 * One hook for both tabs. Letters sent to you come from `getAllReceivedLetters` (paged, no 20-row cap);
 * `getInboxItems` (a capped mixed list) is read only for sender activity, which feeds the sent letters'
 * "N replied" in Yours. That read is a refinement: the deliveries already give the replied count, so it
 * belongs to neither tab's success rule. Each source settles on its own, so one slow or failing service
 * never blanks the other tab; a tab errors only when all of ITS sources failed, and says "some could not
 * be loaded" when only part did.
 *
 * Refreshes quietly every 15 s while the tab is visible and on focus (today's inbox/sent behaviour):
 * a failed quiet refresh keeps what is on screen and marks the tab "partial" (a small retry line).
 * The sent letters and their deliveries come from the throwing readers: an empty answer from the
 * tolerant ones could be a failure, and a letter whose recipients are unknown must never offer Delete.
 * A poll tick skips a source whose previous load is still in flight (a slow source must be allowed to finish);
 * an explicit refresh always starts a new request and supersedes it. Each source carries a request generation: only the newest request may write, so a slow older
 * response can never bring back a row a newer refresh already removed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { docsService } from '@/app/data/docs-service';
import { getAllReceivedLetters, getAllSentLettersOrThrow, getDeliveriesForLettersOrThrow, getInboxItems } from '@/app/data/letters-service';
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
  received: InboxItem[] | null;
  /** Sender-side activity on my own letters (the capped mixed inbox list). */
  activity: InboxItem[] | null;
  sharedCanvases: CanvasSharedWithMe[] | null;
}

const EMPTY: Sources = { docs: null, sent: null, myCanvases: null, received: null, activity: null, sharedCanvases: null };

/** `null` = not settled yet, or failed; `failed` tells the two apart. */
type Failed = Partial<Record<keyof Sources, boolean>>;

async function loadSent(userId: string): Promise<NonNullable<Sources['sent']>> {
  const letters = await getAllSentLettersOrThrow(userId);
  const deliveries = letters.length ? await getDeliveriesForLettersOrThrow(letters.map(l => l.id)) : {};
  return { letters, deliveries };
}

export function useArtifactsData(userId: string, userSlug: string | null): TabDataResult {
  const [sources, setSources] = useState<Sources>(EMPTY);
  const [failed, setFailed] = useState<Failed>({});
  const [settled, setSettled] = useState<Partial<Record<keyof Sources, boolean>>>({});
  const mounted = useRef(true);
  const userRef = useRef(userId);
  userRef.current = userId;
  // Newest request number per source: a response from an older request is dropped.
  const generation = useRef<Partial<Record<keyof Sources, number>>>({});
  // Request number of the load still in flight per source (cleared when that newest request settles).
  const inFlight = useRef<Partial<Record<keyof Sources, number>>>({});
  // Sources with data on screen (loaded at least once for this person): a later failure keeps that value.
  const [loaded, setLoaded] = useState<Partial<Record<keyof Sources, boolean>>>({});

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // `skipInFlight` is for the timer/focus poll: a source whose previous load has not answered yet is left alone,
  // so a slow source is not restarted (and its answer discarded) every tick. An explicit load supersedes.
  const load = useCallback(async (skipInFlight = false) => {
    const forUser = userId;
    const run = <K extends keyof Sources>(key: K, fn: () => Promise<NonNullable<Sources[K]>>) => {
      if (skipInFlight && inFlight.current[key] !== undefined) return Promise.resolve();
      const mine = (generation.current[key] ?? 0) + 1;
      generation.current[key] = mine;
      inFlight.current[key] = mine;
      const done = () => { if (inFlight.current[key] === mine) inFlight.current = { ...inFlight.current, [key]: undefined }; };
      const current = () => mounted.current && userRef.current === forUser && generation.current[key] === mine;
      return fn().then(
        value => {
          done();
          if (!current()) return;
          setLoaded(prev => (prev[key] ? prev : { ...prev, [key]: true }));
          setSources(prev => ({ ...prev, [key]: value }));
          setFailed(prev => (prev[key] ? { ...prev, [key]: false } : prev));
          setSettled(prev => (prev[key] ? prev : { ...prev, [key]: true }));
        },
        () => {
          done();
          if (!current()) return;
          // A failed read keeps the last good value (if any) and is flagged, so the tab can say items may be missing.
          setFailed(prev => (prev[key] ? prev : { ...prev, [key]: true }));
          setSettled(prev => (prev[key] ? prev : { ...prev, [key]: true }));
        },
      );
    };
    await Promise.all([
      run('docs', () => docsService.getDocsByUserOrThrow(forUser)),
      run('sent', () => loadSent(forUser)),
      run('myCanvases', () => canvasService.listMyCanvases()),
      run('received', () => getAllReceivedLetters(forUser)),
      run('activity', () => getInboxItems(forUser)),
      run('sharedCanvases', () => canvasService.listSharedWithMe()),
    ]);
  }, [userId]);

  useEffect(() => {
    setLoaded({});
    setSources(EMPTY);
    setFailed({});
    setSettled({});
    void load();
    const tick = () => { if (document.visibilityState === 'visible') void load(true); };
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
        // Received rows only from the paged read; the mixed list contributes sender activity alone.
        inbox: [...(sources.received ?? []), ...(sources.activity ?? []).filter(i => i.type !== 'received')],
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
    // Nothing to show and every source failed: the error state. If anything is on screen, keep it.
    if (failedCount === keys.length && !keys.some(k => loaded[k])) return { status: 'error', rows: [], partial: false };
    return { status: 'ready', rows, partial: failedCount > 0 };
  };

  return {
    yours: tabState(['docs', 'sent', 'myCanvases'], model.yours),
    shared: tabState(['received', 'sharedCanvases'], model.shared),
    refresh: () => load(),
  };
}

export interface TabDataResult {
  yours: TabData;
  shared: TabData;
  refresh: () => Promise<void>;
}
