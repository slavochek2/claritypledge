/**
 * P1536: the state of a canvas draft behind one mirror thread, read from the database (never held in the page), so a
 * reload loses nothing: the draft and its newest run. While a run is going it is re-read every few seconds; the
 * mirror's own reply arrives in the thread like any message.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getCanvasDraftByThread,
  getLastDoneCanvasDraftRunAt,
  getLatestCanvasRun,
  type CanvasDraft,
  type CanvasDraftRun,
  isDraftingRunKind,
} from '@/app/data/canvas-draft-service';
import { emitCanvasDraftEvent, subscribeCanvasDraftEvents } from '@/app/data/canvas-draft-events';

/** How often a going run is re-read (only while the tab is on screen). */
export const RUN_POLL_MS = 3_000;
/** A run still "going" this long after it began died with its request (the server counts it dead too): the owner may start again. */
const RUN_DEAD_MS = 5 * 60_000;
/** A run made but not claimed within this long is not "going": its start request did not land. */
const QUEUED_GRACE_MS = 8_000;

export interface CanvasThread {
  draft: CanvasDraft;
  run: CanvasDraftRun | null;
  /** A run is running now (and young enough to be alive), or was queued a moment ago and is being claimed. */
  running: boolean;
  /**
   * When the newest DRAFT-kind run that finished began (ms), or null. A newer one than the last seen tells the canvas page beside
   * this thread that the draft's points changed (see the "updated" event below).
   */
  lastDraftAt: number | null;
  reload: () => Promise<void>;
}

interface Loaded {
  draft: CanvasDraft;
  run: CanvasDraftRun | null;
  lastDraftAt: number | null;
}

/** `loading`: the first read is out. `error`: it failed and there is nothing to show. `none`: not a draft thread. */
export type CanvasThreadStatus = 'idle' | 'loading' | 'error' | 'ready' | 'none';

export interface CanvasThreadRead {
  status: CanvasThreadStatus;
  thread: CanvasThread | null;
  retry: () => void;
}

/** The send limit of one chat message (the same 4,000 characters the server checks). */
export const CARRY_MAX_CHARS = 4000;

/** Cuts text into pieces of at most `max` characters, at a space or line break where there is one. */
export function splitText(text: string, max: number): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const at = Math.max(rest.lastIndexOf(' ', max), rest.lastIndexOf('\n', max));
    const cut = at > 0 ? at : max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  return [...out, rest].filter((t) => t !== '');
}

const startOf = (run: CanvasDraftRun | null): number | null => (run ? Date.parse(run.startedAt ?? run.createdAt) : null);

export function runIsGoing(run: CanvasDraftRun | null, now = Date.now()): boolean {
  if (!run || (run.state !== 'queued' && run.state !== 'running')) return false;
  const age = now - new Date(run.startedAt ?? run.createdAt).getTime();
  // A queued run is going only while its start request is on its way; after that nothing is running it.
  return run.state === 'queued' ? age < QUEUED_GRACE_MS : age < RUN_DEAD_MS;
}

const tabIsVisible = (): boolean => typeof document === 'undefined' || document.visibilityState !== 'hidden';

/** The draft, its newest run, and when the newest finished draft run began. A failed secondary read never hides the draft. */
async function readDraft(rootId: string): Promise<Loaded | null> {
  const draft = await getCanvasDraftByThread(rootId);
  if (!draft) return null;
  const run = await getLatestCanvasRun(draft.id);
  // The baseline of "a newer draft run finished": the newest run when it is that run, else the last one that finished.
  // A failed lookup is "unknown", not "nothing new": baseline 0 keeps a later finished run reportable.
  const newestIsDoneDraft = isDraftingRunKind(run?.kind) && run?.state === 'done';
  const finishedBefore = !newestIsDoneDraft && draft.runCount > 0;
  const lastDraftAt = newestIsDoneDraft ? startOf(run) : finishedBefore ? await getLastDoneCanvasDraftRunAt(draft.id).then((at) => (at ? Date.parse(at) : null), () => 0) : null;
  return { draft, run, lastDraftAt };
}

/**
 * `rootId` null: this is not a canvas thread (nothing is read). `refreshKey` changes whenever the thread's messages do,
 * which is when the draft can have changed (the mirror's reply landed, the owner added a note).
 */
export function useCanvasThread(rootId: string | null, refreshKey: number): CanvasThreadRead {
  const [read, setRead] = useState<{ root: string; loaded: Loaded | null; error: boolean } | null>(null);
  const [visible, setVisible] = useState(tabIsVisible);
  const live = useRef(true);
  const current = useRef(rootId);
  current.current = rootId;
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!rootId) return;
    try {
      const loaded = await readDraft(rootId);
      if (live.current && current.current === rootId) setRead({ root: rootId, loaded, error: false });
    } catch {
      // keep what is shown: the next read (a message, the poll) tries again. With nothing shown, say so.
      if (live.current && current.current === rootId) setRead((prev) => (prev?.root === rootId && prev.loaded ? prev : { root: rootId, loaded: null, error: true }));
    }
  }, [rootId]);

  useEffect(() => {
    if (!rootId) {
      setRead(null);
      return;
    }
    void load();
  }, [rootId, refreshKey, load]);

  const loaded = read && read.root === rootId ? read.loaded : null;
  const running = runIsGoing(loaded?.run ?? null);

  // The canvas page beside this thread (P1536) is told when the draft's points changed: a read shows a NEWER finished draft run
  // than the last one seen for this draft (however many runs came and went between two reads). The first read of a draft only
  // records it, and so does coming back to one on another thread, which is why a poll that re-reads the same run, or a switch
  // to a draft whose last run is old, says nothing. It also tells this thread when the draft was published or discarded there.
  const draftId = loaded?.draft.id ?? null;
  const newestDone = loaded?.lastDraftAt || null;
  const seenDone = useRef(new Map<string, number | null>());
  useEffect(() => {
    if (!draftId) return;
    const before = seenDone.current.get(draftId);
    seenDone.current.set(draftId, newestDone ?? before ?? null); // an unknown time never forgets a known one
    if (before !== undefined && newestDone !== null && (before === null || newestDone > before)) emitCanvasDraftEvent({ kind: 'updated', draftId });
  }, [draftId, newestDone]);
  useEffect(() => {
    if (!draftId) return;
    return subscribeCanvasDraftEvents((e) => {
      if (e.draftId === draftId && e.kind !== 'updated') void load();
    });
  }, [draftId, load]);

  // A hidden tab does not poll; coming back reads once (the run may have ended meanwhile) and polling resumes.
  const wasRunning = useRef(running);
  wasRunning.current = running;
  useEffect(() => {
    const onChange = () => {
      const now = tabIsVisible();
      setVisible(now);
      if (now && wasRunning.current) void load();
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, [load]);
  useEffect(() => {
    if (!running || !visible) return;
    const t = setInterval(() => void load(), RUN_POLL_MS);
    return () => clearInterval(t);
  }, [running, visible, load]);

  const retry = useCallback(() => {
    setRead(null);
    void load();
  }, [load]);

  if (!rootId) return { status: 'idle', thread: null, retry };
  if (!read || read.root !== rootId) return { status: 'loading', thread: null, retry };
  if (loaded && loaded.draft.threadRootId === rootId) return { status: 'ready', thread: { ...loaded, running, reload: load }, retry };
  return { status: read.error ? 'error' : 'none', thread: null, retry };
}
