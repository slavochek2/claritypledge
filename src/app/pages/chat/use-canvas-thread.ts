/**
 * P1536: the state of a canvas draft behind one mirror thread, read from the database (never held in the page), so a
 * reload loses nothing: the draft, its newest run, and what it has read. While a run is going it is re-read every few
 * seconds; the mirror's own reply arrives in the thread like any message.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/app/data/chat-service';
import {
  countDoneCanvasDraftRuns,
  getCanvasDraftByThread,
  getCanvasDraftViewPath,
  getLastDoneCanvasDraftRunAt,
  getLatestCanvasRun,
  listCanvasMaterial,
  listMyCanvasVersions,
  type CanvasDraft,
  type CanvasDraftRun,
  type CanvasMaterialItem,
} from '@/app/data/canvas-draft-service';
import { emitCanvasDraftEvent, subscribeCanvasDraftEvents } from '@/app/data/canvas-draft-events';
import { withThreadParam } from './canvas-links';

/** How often a going run is re-read (only while the tab is on screen). */
export const RUN_POLL_MS = 3_000;
/** A run still "going" this long after it began died with its request (the server counts it dead too): the owner may start again. */
const RUN_DEAD_MS = 5 * 60_000;

export interface CanvasThread {
  draft: CanvasDraft;
  run: CanvasDraftRun | null;
  material: CanvasMaterialItem[];
  /** A run is queued or running now (and young enough to be alive). */
  running: boolean;
  /** False unless a draft run finished (or that cannot be read): nothing is drafted, so nothing can be published. */
  draftHasPoints: boolean;
  /**
   * When the newest DRAFT-kind run that finished began (ms), or null. The one baseline for what is "new", for a link that
   * could not be read, and for the Update offer: extract and tension runs, and failed, capped or cancelled ones, never move it.
   */
  lastDraftAt: number | null;
  /** The canvas page on the draft version, carrying this thread (`thread=<rootId>`), once a draft exists and its address is readable. */
  viewPath: string | null;
  /** The number the next published version of this canvas gets (v1 for a first canvas), or null while a draft is not made or it cannot be read. */
  nextSeq: number | null;
  reload: () => Promise<void>;
}

interface Loaded {
  draft: CanvasDraft;
  run: CanvasDraftRun | null;
  material: CanvasMaterialItem[];
  draftHasPoints: boolean;
  lastDraftAt: number | null;
  viewPath: string | null;
  nextSeq: number | null;
}

/** `loading`: the first read is out. `error`: it failed and there is nothing to show. `none`: not a draft thread. */
export type CanvasThreadStatus = 'idle' | 'loading' | 'error' | 'ready' | 'none';

export interface CanvasThreadRead {
  status: CanvasThreadStatus;
  thread: CanvasThread | null;
  retry: () => void;
}

const hasText = (s: string | null | undefined): boolean => !!s && s.trim() !== '';

/** A copied chat or a forward carries its own text: the note, the copied message, or any reply of the copied thread. */
export function copyHasText(m: ChatMessage): boolean {
  const f = m.forwardSnapshot;
  return hasText(m.body) || (!!f && (hasText(f.body) || f.thread.some((e) => hasText(e.body))));
}

/** The owner's own words and copies in the thread; with `after`, only those written after that moment (the publish). */
export function ownerMessagesAfterRoot(messages: ChatMessage[], ownerId: string, rootId: string, after?: string | null): ChatMessage[] {
  const from = after ? Date.parse(after) : null;
  return messages.filter((m) => {
    if (m.authorId !== ownerId || m.id === rootId || m.isDeleted || (from !== null && !(Date.parse(m.createdAt) > from))) return false;
    return m.kind === 'message' || ((m.kind === 'clarify' || m.kind === 'forward') && copyHasText(m));
  });
}

/** The send limit of one chat message (the same 4,000 characters the server checks). */
const CARRY_MAX_CHARS = 4000;

/** Cuts text into pieces of at most `max` characters, at a space or line break where there is one. */
function splitText(text: string, max: number): string[] {
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

/** What the owner asked for after Publish, oldest first, one text per message (each short enough to send), to carry into the next version's thread. */
export function changeRequestMessages(messages: ChatMessage[], ownerId: string, rootId: string, after: string | null): string[] {
  return ownerMessagesAfterRoot(messages, ownerId, rootId, after).flatMap((m) =>
    // Only the owner's own words: a copy's quoted lines are other people's, and carried as a plain owner message the
    // engine would read them as the owner's own (spec §8). The owner can copy them into the new thread again.
    splitText((m.body ?? '').trim(), CARRY_MAX_CHARS).filter((t) => t !== ''),
  );
}

const startOf = (run: CanvasDraftRun | null): number | null => (run ? Date.parse(run.startedAt ?? run.createdAt) : null);

export function runIsGoing(run: CanvasDraftRun | null, now = Date.now()): boolean {
  if (!run || (run.state !== 'queued' && run.state !== 'running')) return false;
  return now - new Date(run.startedAt ?? run.createdAt).getTime() < RUN_DEAD_MS;
}

const tabIsVisible = (): boolean => typeof document === 'undefined' || document.visibilityState !== 'hidden';

/** One above the newest published version of this canvas: what the draft will be called when it is published. A failed read is "unknown". */
async function readNextSeq(canvasId: string): Promise<number | null> {
  try {
    const mine = (await listMyCanvasVersions()).filter((v) => v.canvasId === canvasId);
    return mine.reduce((top, v) => Math.max(top, v.seq), 0) + 1;
  } catch {
    return null;
  }
}

/**
 * The draft's next version number, read once per draft: a canvas has one open draft, so its published versions cannot
 * change while the draft is open. A failed read is tried again at the next read that is not the poll; the poll tries a
 * draft at most once, so a running revision never reads every few seconds.
 */
interface NextSeqCache {
  known: Map<string, number>;
  tried: Set<string>;
}

async function nextSeqOf(draft: CanvasDraft, cache: NextSeqCache, poll: boolean): Promise<number | null> {
  const known = cache.known.get(draft.id);
  if (known !== undefined) return known;
  if (poll && cache.tried.has(draft.id)) return null;
  cache.tried.add(draft.id);
  const seq = await readNextSeq(draft.canvasId);
  if (seq !== null) cache.known.set(draft.id, seq);
  return seq;
}

/** Everything about the draft that is read from more than one table. A failed secondary read never hides the draft. */
async function readDraft(rootId: string, ownerId: string, seqs: NextSeqCache, poll: boolean): Promise<Loaded | null> {
  const draft = await getCanvasDraftByThread(rootId);
  if (!draft) return null;
  const [run, material] = await Promise.all([getLatestCanvasRun(draft.id), listCanvasMaterial(draft.id)]);
  // Points exist only when a DRAFT-kind run finished: the newest run of any kind says nothing (a file read, a tension
  // run, a capped or cancelled run can all follow a failed draft). When the count cannot be read, assume nothing is there.
  const newestIsDoneDraft = run?.kind === 'draft' && run.state === 'done';
  const finishedBefore = !newestIsDoneDraft && draft.runCount > 0;
  const made = draft.state === 'open' && draft.runCount > 0;
  const [draftHasPoints, lastDraftAt, viewPath, nextSeq] = await Promise.all([
    newestIsDoneDraft ? true : finishedBefore ? countDoneCanvasDraftRuns(draft.id).then((n) => n > 0, () => false) : false,
    // The baseline of "new since the last canvas": the newest run when it is that run, else the last one that finished.
    // A failed lookup is "unknown", not "nothing new": baseline 0 keeps Update reachable (the server still decides).
    newestIsDoneDraft ? startOf(run) : finishedBefore ? getLastDoneCanvasDraftRunAt(draft.id).then((at) => (at ? Date.parse(at) : null), () => 0) : null,
    made ? getCanvasDraftViewPath(draft, ownerId).then((path) => (path ? withThreadParam(path, rootId) : null), () => null) : null,
    made ? nextSeqOf(draft, seqs, poll) : null,
  ]);
  return { draft, run, material, draftHasPoints, lastDraftAt, viewPath, nextSeq };
}

/**
 * `rootId` null: this is not a canvas thread (nothing is read). `refreshKey` changes whenever the thread's messages do,
 * which is when the draft can have changed (the mirror's reply landed, the owner added a note).
 */
export function useCanvasThread(rootId: string | null, refreshKey: number, ownerId: string): CanvasThreadRead {
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

  const seqs = useRef<NextSeqCache>({ known: new Map(), tried: new Set() });

  /** `poll`: the timer's read of a going run (it never re-reads what cannot change while the draft is open). */
  const load = useCallback(async (poll = false) => {
    if (!rootId) return;
    try {
      const loaded = await readDraft(rootId, ownerId, seqs.current, poll);
      if (live.current && current.current === rootId) setRead({ root: rootId, loaded, error: false });
    } catch {
      // keep what is shown: the next read (a message, the poll) tries again. With nothing shown, say so.
      if (live.current && current.current === rootId) setRead((prev) => (prev?.root === rootId && prev.loaded ? prev : { root: rootId, loaded: null, error: true }));
    }
  }, [rootId, ownerId]);

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
    const t = setInterval(() => void load(true), RUN_POLL_MS);
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
