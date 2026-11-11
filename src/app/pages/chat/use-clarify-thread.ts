/**
 * P1631: the drafts of one Clarify thread, read from the database. Read again when a run this tab started ends and every few
 * seconds while a draft is queued or running (another device may be the one running it); never while the tab is hidden.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getClarifyThread, type ClarifyDraft } from '@/app/data/clarify-service';
import { onClarifyRunEnded, onClarifyThreadTouched } from './clarify-run';

const POLL_MS = 3_000;

export interface ClarifyThreadState {
  drafts: ClarifyDraft[];
  loaded: boolean;
  failed: boolean;
  reload: () => Promise<void>;
  /** The server has just queued this draft again (a Try again): show it as being made at once, before the next read confirms it. */
  markQueued: (draftId: string) => void;
}

export function useClarifyThread(threadRootId: string | null): ClarifyThreadState {
  const [drafts, setDrafts] = useState<ClarifyDraft[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);
  // the thread this hook currently shows; an answer for another root (the pane moved on) is dropped
  const currentRoot = useRef(threadRootId);
  currentRoot.current = threadRootId;
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // Requests are numbered; an answer older than one already applied is dropped, so a slow poll never overwrites a newer read.
  const issued = useRef(0);
  const applied = useRef(0);

  const reload = useCallback(async () => {
    if (!threadRootId) return;
    const seq = ++issued.current;
    try {
      const next = await getClarifyThread(threadRootId);
      if (!alive.current || currentRoot.current !== threadRootId || seq < applied.current) return;
      applied.current = seq;
      setDrafts(next);
      setFailed(false);
    } catch {
      // an older read failing after a newer one succeeded is not news
      if (alive.current && currentRoot.current === threadRootId && seq >= applied.current) setFailed(true);
    } finally {
      if (alive.current && currentRoot.current === threadRootId) setLoaded(true);
    }
  }, [threadRootId]);

  useEffect(() => {
    setDrafts([]);
    setFailed(false);
    // no root: nothing to read, which is an empty thread, never a skeleton that never resolves
    setLoaded(!currentRoot.current);
    void reload();
  }, [reload]);

  // Event-driven reads wait while the tab is hidden and catch up once when it is shown again.
  const missed = useRef(false);
  const reloadIfVisible = useCallback(() => {
    if (document.visibilityState === 'hidden') {
      missed.current = true;
      return;
    }
    void reload();
  }, [reload]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'hidden' || !missed.current) return;
      missed.current = false;
      void reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);
  useEffect(() => onClarifyRunEnded(() => reloadIfVisible()), [reloadIfVisible]);
  useEffect(() => onClarifyThreadTouched((root) => { if (root === threadRootId) reloadIfVisible(); }), [reloadIfVisible, threadRootId]);

  const working = drafts.some((d) => d.state === 'queued' || d.state === 'running');
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => {
      if (document.visibilityState !== 'hidden') void reload();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [working, reload]);

  const markQueued = useCallback((draftId: string) => {
    // Never older than a read already applied: bump `applied` so a read that was issued before this moment cannot put the failure back.
    // one past the newest request issued so far: every read already in flight is older, and is dropped
    applied.current = issued.current + 1;
    setDrafts((all) => all.map((d) => (d.id === draftId ? { ...d, state: 'queued', errorCode: null } : d)));
  }, []);

  return { drafts, loaded, failed, reload, markQueued };
}
