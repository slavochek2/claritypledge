/**
 * P1631: the drafts of one Clarify thread, read from the database. Read again when a run this tab started ends and every few
 * seconds while a draft is queued or running (another device may be the one running it); never while the tab is hidden.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getClarifyThread, type ClarifyDraft } from '@/app/data/clarify-service';
import { onClarifyRunEnded } from './clarify-run';

const POLL_MS = 3_000;

export interface ClarifyThreadState {
  drafts: ClarifyDraft[];
  loaded: boolean;
  failed: boolean;
  reload: () => Promise<void>;
}

export function useClarifyThread(threadRootId: string | null): ClarifyThreadState {
  const [drafts, setDrafts] = useState<ClarifyDraft[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const reload = useCallback(async () => {
    if (!threadRootId) return;
    try {
      const next = await getClarifyThread(threadRootId);
      if (!alive.current) return;
      setDrafts(next);
      setFailed(false);
    } catch {
      if (alive.current) setFailed(true);
    } finally {
      if (alive.current) setLoaded(true);
    }
  }, [threadRootId]);

  useEffect(() => {
    setDrafts([]);
    setLoaded(false);
    void reload();
  }, [reload]);

  useEffect(() => onClarifyRunEnded(() => void reload()), [reload]);

  const working = drafts.some((d) => d.state === 'queued' || d.state === 'running');
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => {
      if (document.visibilityState !== 'hidden') void reload();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [working, reload]);

  return { drafts, loaded, failed, reload };
}
