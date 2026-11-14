/**
 * @file room-capture-uploads.ts
 * @description The archive upload queue of a room capture: one chunk at a time, in order.
 *
 * INBOX-338: a failure that can clear by itself (no network, the bucket refusing the browser's origin, a server error, an expired
 * login) keeps the chunk and retries it with a growing wait (capped), so the audio arrives once the cause clears. Only a refusal
 * that will not change (another 4xx, a bad signature) is retried a few times and then dropped, said so (onDropped), so it never
 * blocks the chunks behind it. A chunk that keeps failing for TRANSIENT_GIVE_UP_MS is dropped too, the same way.
 * "Not reaching us" (onStuck) is one measure, not a failure count (review rounds 3-5): the age of the CURRENT capture's oldest
 * audio not yet received, counting a chunk still waiting and a chunk dropped since the last success alike, from when it was
 * queued (lost audio has not reached us). Raised above STUCK_AGE_MS, cleared only once caught up (at most STUCK_CLEAR_AGE_MS, or
 * nothing waiting and nothing lost), so a backlog near real-time rate does not flicker. It covers chunks that keep failing, a try
 * that hangs, uploads slower than real time, a new capture stuck behind an ended one's tail, chunks refused for good, and a head
 * given up while the next chunk is young. A quiet gap longer than STUCK_AGE_MS before the next chunk (a pause) forgets old losses.
 * Re-read after every try and every TICK_MS while the queue works; reported only when it changes. One failure that recovers
 * quickly, or one dropped chunk, is not shown (P1529 UAT F5).
 */
import { useCallback, useState } from 'react';
import { useExpiringFlag } from '@/lib/use-expiring-flag';
import { isHardStopError, type StoredCapture } from './room-capture-storage';

const UPLOAD_MAX_ATTEMPTS = 3;
/** The current capture's oldest unsent chunk is older than this: more than one 30 s chunk behind (INBOX-338). */
export const STUCK_AGE_MS = 45_000;
/** Once raised, cleared only when the oldest audio not yet received is this young again (caught up), so it does not flicker. */
export const STUCK_CLEAR_AGE_MS = 15_000;
/** How often the queue re-reads the measure while it works (a pending try, a backoff wait). Local only, no request. */
export const TICK_MS = 5_000;
/** The longest wait between two tries of a chunk whose failure can clear by itself. */
export const RETRY_CAP_MS = 30_000;
/** A chunk failing this long is dropped (said so), so a chunk that can never upload does not hold the queue for good. */
export const TRANSIENT_GIVE_UP_MS = 10 * 60_000;

export interface UploadJob {
  blob: Blob;
  isLast: boolean;
  attempts: number;
  /** The capture this chunk belongs to, bound when it is queued. End clears storedRef before
   *  the tap's stop flush hands over the tail after that, so reading storedRef at upload time
   *  dropped the last chunk — and a stale job could upload under the NEXT capture's record. */
  record: StoredCapture;
  /** Reserved once, on the first attempt, and reused by every retry. Reserving per attempt
   *  (the first version) turned one transient upload failure into a permanent gap in the chunk
   *  sequence, which the whole-recording pass reads as missing audio (external review). */
  chunkNumber?: number;
  /** When this chunk first failed (ms), for TRANSIENT_GIVE_UP_MS. */
  failingSince?: number;
  /** Failed tries of this chunk, any kind: sets the wait before the next (2 s, 4 s, 8 s ... RETRY_CAP_MS). */
  tries?: number;
  /** The capture this chunk came from (UploadQueueHandles.generation when queued); a move to Part 2 keeps it, an End bumps it. */
  generation?: number;
  /** When it was queued (ms), for STUCK_AGE_MS. */
  queuedAt?: number;
  /** Chunks shed just before this one: their numbers are reserved and left unused first, so the archive keeps the hole and the
   *  whole-recording pass knows audio is missing there (it times chunks by their numbers; review). */
  holesBefore?: number;
}

export interface UploadQueueHandles {
  uploadQueue: UploadJob[];
  uploading: boolean;
  /** The current capture (bumped by endUploadRun at a capture's End). Only its chunks count toward the notice. */
  generation?: number;
  /** When the oldest current-capture chunk dropped since the last success was queued (lost audio still counts as not received). */
  lostSince?: number | null;
  /** When the latest current-capture chunk was dropped, for forgetting losses after a quiet gap. */
  lastDropAt?: number | null;
  /** What onStuck last reported. */
  stuck?: boolean;
}

export interface UploadIo {
  reserve: (roomId: string) => Promise<number>;
  upload: (roomCode: string, displayName: string, memberId: string, blob: Blob, chunkNumber: number, isLast: boolean) => Promise<void>;
  /** The CURRENT capture's room was refused (410/403). A refusal of an earlier room never reaches it. */
  onHardStop: () => void;
  onDropped: () => void;
  /** P1604 rule 8: the room the live capture is in now, or null when none. */
  currentRoomId: () => string | null;
  /** The seat's last chunk is done (uploaded, or dropped for good): nothing more will come from it. Lets the server start the clean pass early. */
  flushed?: (roomId: string) => void;
  /** INBOX-338: the current capture's audio is not reaching us (true) or is again (false); called only on a change. */
  onStuck?: (stuck: boolean) => void;
  /** Injected for tests; default setTimeout / Date.now / setInterval. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
  every?: (ms: number, fn: () => void) => () => void;
  /** Resolves when the tab is visible (at once if it is). Retries wait for it: a hidden tab makes no retry (metered-services rule 3). */
  whenVisible?: () => Promise<void>;
}

/**
 * A failed chunk-number reservation (an RPC) is permanent unless it looks like the network: a fetch failure, a timeout or a 5xx.
 * Its PostgREST error arrives as a bare message, so an RPC refusal would otherwise read as "can clear by itself" and hold the
 * queue for TRANSIENT_GIVE_UP_MS (external review).
 */
export function isPermanentReserveError(err: unknown): boolean {
  if (err instanceof TypeError || (err instanceof Error && err.name === 'RequestTimeoutError')) return false;
  const message = err instanceof Error ? err.message : String(err);
  // An expired login ("JWT expired") is refreshed by the client, so it can clear too (review).
  return !/fetch|network|load failed|timed out|timeout|\b5\d\d\b|jwt|expired|not authenticated|\b401\b/i.test(message);
}

/**
 * A refusal that will not change by trying again: an HTTP 4xx from the signer or the bucket other than 401 (an expired login is
 * refreshed), 408 and 429, or a signature mismatch. Everything else (no network, a refused origin, a timeout, a 5xx, an unknown
 * error) can clear by itself. 403/410 from the signer (this person may no longer record) is handled before this, as a hard stop.
 */
export function isPermanentUploadError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  if (/SignatureDoesNotMatch/.test(message)) return true;
  const m = /(?:signed URL|GCS upload failed): (4\d\d)\b/.exec(message);
  return !!m?.[1] && !['401', '408', '429'].includes(m[1]);
}

/** Elapsed time for queue ages and give-ups: monotonic, so a laptop sleep's clock change or a wall-clock step never fakes an age (review). */
const monotonicNow = (): number => performance.now();

/** The capture a chunk (or the queue) belongs to; chunks queued before generations existed count as the first. */
const genOf = (x: { generation?: number }): number => x.generation ?? 0;

/**
 * Queues a chunk. At `limit` the oldest WAITING chunk is shed (the in-flight head is kept) and said so, rather than grow without
 * bound. A seat's last chunk is shed only when every waiting chunk is one (it tells the server nothing more is coming, so the
 * server then waits its full bound); the queue never grows past `limit`.
 */
export function queueUpload(h: UploadQueueHandles, job: UploadJob, limit: number, onShed: () => void, now: () => number = monotonicNow): void {
  const notLast = h.uploadQueue.findIndex((j, i) => i > 0 && !j.isLast);
  const shed = notLast > 0 ? notLast : 1;
  let carry = 0;
  if (h.uploadQueue.length >= limit && h.uploadQueue.length > 1) {
    console.error('[room-capture] archive upload queue full — dropping the oldest pending chunk');
    onShed();
    const [gone] = h.uploadQueue.splice(shed, 1);
    // A hole is kept only in its own room's numbers (a 3-hour roll puts the next chunk in another room; review).
    carry = gone && gone.record.roomId === job.record.roomId ? 1 + (gone.holesBefore ?? 0) : 0;
    const after = h.uploadQueue[shed];
    if (after && gone && after.record.roomId === gone.record.roomId) { after.holesBefore = (after.holesBefore ?? 0) + 1 + (gone.holesBefore ?? 0); carry = 0; }
  }
  const t = now();
  forgetOldLosses(h, t);
  h.uploadQueue.push({ ...job, generation: genOf(h), queuedAt: t, ...(carry ? { holesBefore: carry } : {}) });
}

/** What the pump does after a failed try of the head chunk: go on with the next head, stop the queue, or wait and try again. */
type AfterFailure = { kind: 'next' } | { kind: 'stop' } | { kind: 'wait'; ms: number };

/** After a quiet gap (a pause) longer than STUCK_AGE_MS since the last loss, with nothing of this capture waiting, that loss is old news. */
function forgetOldLosses(h: UploadQueueHandles, t: number): void {
  if (!h.uploadQueue.some((j) => genOf(j) === genOf(h)) && h.lastDropAt != null && t - h.lastDropAt > STUCK_AGE_MS) h.lostSince = null;
}

/** A Resume after a pause: old losses are forgotten and the measure read at once, not 30 s later at the next chunk (review). */
export function resumeUploads(h: UploadQueueHandles, onStuck: ((stuck: boolean) => void) | undefined, now: () => number = monotonicNow): void {
  const t = now();
  forgetOldLosses(h, t);
  review(h, onStuck, t);
}

/** Re-reads "not reaching us" for the current capture and reports a change. */
function review(h: UploadQueueHandles, onStuck: ((stuck: boolean) => void) | undefined, t: number): void {
  const oldest = h.uploadQueue.find((j) => genOf(j) === genOf(h));
  const age = t - Math.min(h.lostSince ?? Infinity, oldest ? oldest.queuedAt ?? t : Infinity);
  const stuck = age > (h.stuck ? STUCK_CLEAR_AGE_MS : STUCK_AGE_MS);
  if (stuck === !!h.stuck) return;
  h.stuck = stuck;
  onStuck?.(stuck);
}

/** A capture ended: its queued tail keeps uploading but no longer counts; the next capture starts clear (its own UI is cleared). */
export function endUploadRun(h: UploadQueueHandles): void {
  h.generation = genOf(h) + 1;
  h.lostSince = null;
  h.lastDropAt = null;
  h.stuck = false;
}

/** A chunk dropped before it had its number: its own slot and any holes it carried go to the next waiting chunk of its room (review). */
function passHoles(h: UploadQueueHandles, job: UploadJob): void {
  const owed = (job.holesBefore ?? 0) + (job.chunkNumber === undefined ? 1 : 0);
  const next = h.uploadQueue.find((j) => j.record.roomId === job.record.roomId);
  if (owed > 0 && next) next.holesBefore = (next.holesBefore ?? 0) + owed;
}

/** A chunk left the queue: uploaded (ok) or dropped. Only the current capture's chunks move the drop count. */
function settled(h: UploadQueueHandles, io: UploadIo, job: UploadJob, ok: boolean, t: number): void {
  if (!ok) passHoles(h, job);
  if (genOf(job) === genOf(h) && ok) h.lostSince = null;
  if (genOf(job) === genOf(h) && !ok) { h.lostSince ??= job.queuedAt ?? t; h.lastDropAt = t; }
  review(h, io.onStuck, t);
}

/** A refusal of who may record (403/410). An EARLIER room's (Part 1, after the move to Part 2) drops that chunk only. */
function afterRefusal(h: UploadQueueHandles, io: UploadIo, job: UploadJob, err: unknown, t: number): AfterFailure {
  if (job.record.roomId !== io.currentRoomId()) {
    console.error('[room-capture] archive chunk of an earlier room was refused and dropped:', err);
    io.onDropped();
    h.uploadQueue.shift();
    settled(h, io, job, false, t);
    return { kind: 'next' };
  }
  h.uploadQueue.length = 0;
  h.lostSince = null;
  review(h, io.onStuck, t);
  io.onHardStop();
  return { kind: 'stop' };
}

function afterFailure(h: UploadQueueHandles, io: UploadIo, job: UploadJob, err: unknown, t: number, reserving: boolean): AfterFailure {
  if (isHardStopError(err)) return afterRefusal(h, io, job, err, t);
  job.failingSince ??= t;
  const permanent = reserving ? isPermanentReserveError(err) : isPermanentUploadError(err);
  if (permanent) job.attempts += 1;
  job.tries = (job.tries ?? 0) + 1;
  const giveUp = permanent ? job.attempts >= UPLOAD_MAX_ATTEMPTS : t - job.failingSince >= TRANSIENT_GIVE_UP_MS;
  // Jittered (0.8x to 1.2x) so recorders failing together do not retry in step (metered-services rule 4).
  if (!giveUp) {
    review(h, io.onStuck, t);
    return { kind: 'wait', ms: Math.round(Math.min(2_000 * 2 ** (job.tries - 1), RETRY_CAP_MS) * (0.8 + 0.4 * (io.random ?? Math.random)())) };
  }
  console.error('[room-capture] archive chunk dropped after retries:', err);
  io.onDropped();
  h.uploadQueue.shift();
  if (job.isLast) io.flushed?.(job.record.roomId);
  settled(h, io, job, false, t);
  return { kind: 'next' };
}

export function defaultWhenVisible(): Promise<void> {
  if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return Promise.resolve();
  return new Promise((resolve) => {
    const onChange = () => { if (document.visibilityState !== 'hidden') { document.removeEventListener('visibilitychange', onChange); resolve(); } };
    document.addEventListener('visibilitychange', onChange);
  });
}

function defaultEvery(ms: number, fn: () => void): () => void {
  const id = setInterval(fn, ms);
  return () => clearInterval(id);
}

/** Drains the queue; a second call while one is running returns at once. */
export async function pumpUploadQueue(h: UploadQueueHandles, io: UploadIo): Promise<void> {
  if (h.uploading) return;
  h.uploading = true;
  const sleep = io.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = io.now ?? monotonicNow;
  // While the queue works (a pending try that hangs, a backoff wait) the measure is re-read on a local tick.
  const stopTick = (io.every ?? defaultEvery)(TICK_MS, () => review(h, io.onStuck, now()));
  // Read at once: a resume after a pause ends an old notice before its first try, not after it.
  review(h, io.onStuck, now());
  try {
    for (let job = h.uploadQueue[0]; job; job = h.uploadQueue[0]) {
      const { record } = job;
      const reserving = job.chunkNumber === undefined;
      try {
        // Decision 6: the number is issued by the server, so a reload, a pause/resume or a
        // second visit can never overwrite an earlier chunk.
        while ((job.holesBefore ?? 0) > 0) { await io.reserve(record.roomId); job.holesBefore = (job.holesBefore ?? 1) - 1; }
        if (job.chunkNumber === undefined) job.chunkNumber = await io.reserve(record.roomId);
        await io.upload(record.roomCode, record.displayName, record.memberId, job.blob, job.chunkNumber, job.isLast);
        h.uploadQueue.shift();
        if (job.isLast) io.flushed?.(record.roomId);
        settled(h, io, job, true, now());
      } catch (err) {
        const next = afterFailure(h, io, job, err, now(), reserving && job.chunkNumber === undefined);
        if (next.kind === 'stop') return;
        // A chunk's first try goes out in a hidden tab (it is the recording itself); a retry waits until the tab is shown again.
        if (next.kind === 'wait') {
          const waitFrom = now();
          await sleep(next.ms);
          await (io.whenVisible ?? defaultWhenVisible)();
          // Only the intended wait counts toward the 10-minute give-up: time hidden, or a timer the browser froze or throttled in a
          // background tab, is not trying time (review).
          const extra = now() - waitFrom - next.ms;
          if (extra > 0 && job.failingSince !== undefined) job.failingSince += extra;
        }
      }
    }
    review(h, io.onStuck, now());
  } finally {
    stopTick();
    h.uploading = false;
  }
}

/**
 * The capture's two upload notices. `audioLost`: a chunk was dropped; news for a minute after the latest loss (not shown in the
 * bar, P1529 UAT F5). `audioStuck`: the current capture's audio is not reaching us (INBOX-338, see the file header); the queue
 * reports when it is again. `clearUploadNotices` turns both off (the capture ended).
 */
export function useUploadNotices() {
  const { on: audioLost, mark: markAudioLost, clear: clearLost } = useExpiringFlag(60_000);
  const [audioStuck, setAudioStuck] = useState(false);
  const clearUploadNotices = useCallback(() => { clearLost(); setAudioStuck(false); }, [clearLost]);
  return { audioLost, markAudioLost, audioStuck, setAudioStuck, clearUploadNotices };
}
