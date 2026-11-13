/**
 * P1536: the state of a canvas draft behind one mirror thread, read from the database (never held in the page), so a
 * reload loses nothing: the draft and its newest run. While a run is going it is re-read every few seconds; the
 * mirror's own reply arrives in the thread like any message.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getCanvasDraftByThread,
  getCanvasDraftState,
  getLastDoneCanvasDraftRunAt,
  getLatestCanvasRun,
  startQueuedCanvasRun,
  type CanvasDraft,
  type CanvasDraftRun,
  isDraftingRunKind,
} from '@/app/data/canvas-draft-service';
import { useRefusedStart } from './use-refused-start';
import { useRunPoll } from './use-run-poll';
import { startInFlight, startRefusalOf } from '@/app/data/canvas-start-refusals';
import { emitCanvasDraftEvent, subscribeCanvasDraftEvents } from '@/app/data/canvas-draft-events';

/** How often a going run is re-read (only while the tab is on screen). */
export const RUN_POLL_MS = 3_000;
/** A running run this long after it began is past its lease (the server's own number): the server fails it at its next read. */
const RUN_DEAD_MS = 5 * 60_000;
/** A first read that has not answered in this long ends as a failed read (Retry shows; a Send that waited on it stops waiting). A late answer still replaces it. */
export const FIRST_READ_MAX_MS = 15_000;
/** A queued run's lease (the server's own number, 3 minutes). Within it the run is ACTIVE, claimed or not: it blocks every other Send. */
export const QUEUED_LEASE_MS = 3 * 60_000;
/** How long a voice run may wait for its transcript before the server ends it (the server's own number). Its 3-minute lease counts from the landing. */
export const VOICE_WAIT_MS = 30 * 60_000;
/** A run made but not claimed within this long: its start request probably did not land, so the client starts it once more. */
export const QUEUED_GRACE_MS = 8_000;

export interface CanvasThread {
  draft: CanvasDraft;
  run: CanvasDraftRun | null;
  /** A run is active: running, or queued, and still inside its server lease (queued 3 minutes, running 5). */
  running: boolean;
  /** The newest run is still queued and its start was refused (terms, an error): it is not going, and the thread says why. null otherwise. */
  startRefusal?: string | null;
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

const startOf = (run: CanvasDraftRun | null): number | null => (run ? Date.parse(run.startedAt ?? run.createdAt) : null);

const isActiveState = (run: CanvasDraftRun | null): run is CanvasDraftRun => !!run && (run.state === 'queued' || run.state === 'running');
const isWaitingVoice = (run: CanvasDraftRun): boolean => run.state === 'queued' && run.inputKind === 'voice';
/** Where a run's lease counts from: its start, or creation; a voice run's dispatch lease counts from the moment its transcript landed. */
const ageOf = (run: CanvasDraftRun, now: number): number => now - new Date((isWaitingVoice(run) && run.readyAt) || run.startedAt || run.createdAt).getTime();
/** The lease of an active run: how long it counts as active before the server's expire step fails it. */
const leaseOf = (run: CanvasDraftRun): number => (isWaitingVoice(run) && !run.readyAt ? VOICE_WAIT_MS : run.state === 'queued' ? QUEUED_LEASE_MS : RUN_DEAD_MS);

/** How long a run's lease has left (negative: past it); null: no run. */
const leaseLeftOf = (run: CanvasDraftRun | null): number | null => (run ? leaseOf(run) - ageOf(run, Date.now()) : null);

/** S2: an active run is queued or running, inside its lease. A queued run nobody claimed is still active (the server refuses a second Send) until the lease ends. */
export function runIsGoing(run: CanvasDraftRun | null, now = Date.now()): boolean {
  return isActiveState(run) && ageOf(run, now) < leaseOf(run);
}

const tabIsVisible = (): boolean => typeof document === 'undefined' || document.visibilityState !== 'hidden';

/** The draft, its newest run, and when the newest finished draft run began. A failed secondary read never hides the draft. */
async function readDraft(rootId: string, finishedRuns: Set<string>): Promise<Loaded | null> {
  let draft = await getCanvasDraftByThread(rootId);
  if (!draft) return null;
  let run = await getLatestCanvasRun(draft.id);
  // A run still active past its lease: the plain table read never settles it, the server's state read does (its first step is the expire step,
  // which also moves the draft's revision). A failed call changes nothing here: the next poll asks again.
  if (isActiveState(run) && ageOf(run, Date.now()) >= leaseOf(run)) {
    const settled = await getCanvasDraftState(draft.canvasId).then(() => true, () => false);
    if (settled) {
      draft = (await getCanvasDraftByThread(rootId)) ?? draft;
      run = await getLatestCanvasRun(draft.id);
    }
  }
  // The baseline of "a newer draft run finished": the newest run when it is that run, else the last one that finished.
  // A failed lookup is "unknown", not "nothing new": baseline 0 keeps a later finished run reportable.
  const newestIsDoneDraft = isDraftingRunKind(run?.kind) && run?.state === 'done';
  // The draft was read first: a run that finished between the two reads would pair "done" with the revision from before it, which is what the page beside the thread compares with
  // (use-canvas-catches-up). Read it again, once per finished run: the first answer that shows the run done carries its revision or a later one (the server writes both in one transaction).
  if (newestIsDoneDraft && run && !finishedRuns.has(run.id)) {
    draft = (await getCanvasDraftByThread(rootId)) ?? draft;
    finishedRuns.add(run.id);
  }
  const finishedBefore = !newestIsDoneDraft && draft.runCount > 0;
  const lastDraftAt = newestIsDoneDraft ? startOf(run) : finishedBefore ? await getLastDoneCanvasDraftRunAt(draft.id).then((at) => (at ? Date.parse(at) : null), () => 0) : null;
  return { draft, run, lastDraftAt };
}

/** A typed run's single start request, after this long unclaimed. */
const TYPED_START_GRACE_MS = QUEUED_GRACE_MS;
/** After a voice transcript lands, the database's own dispatch has this long to begin the run before the client asks (it normally takes about 2 s). */
const VOICE_START_GRACE_MS = 10_000;
/** The spread (jitter) added to that grace, so two tabs on one run do not ask in the same second. */
const VOICE_START_JITTER_MS = 5_000;
/** The first pause between a voice run's asks; it doubles, and is stretched by up to half again by the jitter. */
const VOICE_START_PAUSE_MS = 15_000;
/** At most this many asks for one landed voice run (within its 3-minute lease, which is the real bound): about 6 requests in the worst case. */
const MAX_VOICE_ASKS = 3;
/** A tab that comes back after its ask was due waits this long (plus its jitter) before asking, so a returning tab never fires in the instant it is shown. */
const RESUME_WAIT_MS = 1_000;
const RESUME_JITTER_MS = 4_000;

/** An answer after which asking again can help: the server was busy, was not ready, or the request did not get through. */
const worthAskingAgain = (code: string): boolean => code === 'BUSY' || code === 'NOT_READY' || code === 'FAILED';

interface Asks { n: number; last: number; done: boolean; jitter: number }

/**
 * A queued run nobody claimed is started by the client when something CAN start it.
 *  - A typed run: one ask after the grace (its own start request did not land), as before.
 *  - A voice run waits for its transcript, and nothing can start it before that: while `readyAt` is empty the client makes NO start call at all (the
 *    normal poll is what notices the transcript landing). Once it has landed and the database's own dispatch has had a short grace, the client asks,
 *    spread by jitter, at most MAX_VOICE_ASKS times and only while the tab is on screen (metered-services rules 3 and 4); a tab that was hidden resumes
 *    on becoming visible, after a jittered wait. The server's lease, 3 minutes from the landing, is the bound.
 * Request count: a voice run whose dispatch works costs the client 0 start requests; a stranded one costs 2 per ask (the queued-run lookup and the
 * start), 6 at most, per tab that is on screen.
 */
export function useRestartStrandedRun(run: CanvasDraftRun | null, draftId: string | null, load: () => Promise<void>, visible: boolean): void {
  const queuedId = run?.state === 'queued' ? run.id : null;
  const voice = run?.inputKind === 'voice';
  const readyAt = run?.readyAt ? Date.parse(run.readyAt) : null;
  const queuedAt = run ? new Date(run.createdAt).getTime() : 0;
  const asks = useRef(new Map<string, Asks>());
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!queuedId || !draftId) return;
    if (!visible || (voice && readyAt === null)) return; // nobody is looking (any kind), or a voice run has nothing to start yet
    const mine = asks.current.get(queuedId) ?? { n: 0, last: 0, done: false, jitter: Math.random() };
    asks.current.set(queuedId, mine);
    if (mine.done || mine.n >= (voice ? MAX_VOICE_ASKS : 1)) return;
    const now = Date.now();
    let due: number;
    if (!voice) due = queuedAt + TYPED_START_GRACE_MS;
    else if (mine.n === 0) due = (readyAt as number) + VOICE_START_GRACE_MS + mine.jitter * VOICE_START_JITTER_MS;
    else due = mine.last + VOICE_START_PAUSE_MS * 2 ** (mine.n - 1) * (1 + mine.jitter * 0.5);
    const wait = due > now || !voice ? Math.max(0, due - now) : RESUME_WAIT_MS + mine.jitter * RESUME_JITTER_MS;
    let alive = true;
    const t = setTimeout(() => {
      if (mine.done) return;
      // Its start was refused (the notice says so, Try again is the way out) or the caller's own start is still going: never a second, silent start.
      if (startRefusalOf(queuedId) || startInFlight(queuedId)) { mine.done = true; return; }
      mine.n += 1;
      mine.last = Date.now();
      void startQueuedCanvasRun(draftId).then(
        (r) => {
          if (r.ok || !voice || !worthAskingAgain(r.code)) mine.done = true;
          return load();
        },
        () => { mine.done = !voice; },
      ).finally(() => { if (alive) setTick((k) => k + 1); });
    }, wait);
    return () => { alive = false; clearTimeout(t); };
  }, [queuedId, voice, readyAt, queuedAt, visible, draftId, load, tick]);
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
  const finishedRuns = useRef(new Set<string>());
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!rootId) return;
    try {
      const loaded = await readDraft(rootId, finishedRuns.current);
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
  const firstReadOut = !!rootId && (!read || read.root !== rootId);
  useEffect(() => {
    if (!rootId || !firstReadOut) return;
    const t = setTimeout(() => setRead((prev) => (prev?.root === rootId ? prev : { root: rootId, loaded: null, error: true })), FIRST_READ_MAX_MS);
    return () => clearTimeout(t);
  }, [rootId, firstReadOut]);
  const run = loaded?.run ?? null;
  const startRefusal = useRefusedStart(run, leaseLeftOf(run), visible, load);
  // A refused start keeps `running` true: the database still counts the queued run as busy, so Send and Publish stay blocked until Try again.
  // Only the words change ("Not updated", canvas-send-slot and the Publish spot).
  const running = runIsGoing(run);
  // Read until the run settles: past its lease it is still `queued`/`running` in the table until a state read makes the server fail it.
  // A refused run is not polled: nothing is about to change it. The server settles it by lease expiry; the next read is a user action or the usual load paths.
  const settling = isActiveState(run) && !startRefusal;

  useRestartStrandedRun(run, loaded?.draft.id ?? null, load, visible);

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
  // The visibility-return read covers a refused run too (it is visible and bounded): Send and Publish must not stay blocked for good.
  const wasRunning = useRef(false);
  wasRunning.current = isActiveState(run);
  useEffect(() => {
    const onChange = () => {
      const now = tabIsVisible();
      setVisible(now);
      if (now && wasRunning.current) void load();
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, [load]);
  useRunPoll(settling, visible, load, RUN_POLL_MS);

  const retry = useCallback(() => {
    setRead(null);
    void load();
  }, [load]);

  return { ...statusOf(rootId, read, loaded, { running, startRefusal, reload: load }), retry };
}

/** What the read amounts to for this root: nothing asked, still reading, the draft, or why there is none. */
function statusOf(
  rootId: string | null,
  read: { root: string; loaded: Loaded | null; error: boolean } | null,
  loaded: Loaded | null,
  live: { running: boolean; startRefusal: string | null; reload: () => Promise<void> },
): { status: CanvasThreadStatus; thread: CanvasThread | null } {
  if (!rootId) return { status: 'idle', thread: null };
  if (!read || read.root !== rootId) return { status: 'loading', thread: null };
  if (loaded && loaded.draft.threadRootId === rootId) return { status: 'ready', thread: { ...loaded, ...live } };
  return { status: read.error ? 'error' : 'none', thread: null };
}
