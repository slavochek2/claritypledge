/**
 * P1576 Part B: the server-owned transcript job, and the sweep that backs it up.
 *
 * The client never transcribes a voice note, so closing the tab cannot strand one. After a commit
 * the handler runs `runTranscription` under EdgeRuntime.waitUntil; if the isolate dies first, the
 * cron-driven `runSweep` picks the message up again. The database owns the retry bound: `claim`
 * counts the attempt and refuses once three are used, so two overlapping runs cannot both spend one.
 *
 * Neither function logs audio or text. An error carries its message only.
 */
import { canonicalWav, transcribeWav } from '../_shared/gemini-transcribe.ts';
import { checkStoredClip, HEAD_BYTES } from './clip.ts';

export { transcribeWav };

/** chat_messages.transcript is CHECK (char_length <= 20000). */
export const TRANSCRIPT_MAX_CHARS = 20_000;

export interface JobDeps {
  /** Counts an attempt and returns the object key, or null when there is nothing to do. */
  claim: (messageId: string) => Promise<string | null>;
  /** The stored WAV, or null when the object no longer exists. */
  download: (objectKey: string) => Promise<Uint8Array | null>;
  transcribe: (wav: Uint8Array) => Promise<string>;
  /** `final` ends the message for good (no more attempts) and takes its audio down. */
  finish: (messageId: string, result: { ok: true; text: string } | { ok: false; final?: true }) => Promise<void>;
}

export type JobOutcome = 'done' | 'failed' | 'skipped';

const errMessage = (e: unknown) => (e instanceof Error ? e.message : 'unknown');

export async function runTranscription(messageId: string, deps: JobDeps): Promise<JobOutcome> {
  try {
    const objectKey = await deps.claim(messageId);
    if (!objectKey) return 'skipped';

    let text: string | null = null;
    try {
      const wav = await deps.download(objectKey);
      // Audio already gone (retention, delete) cannot be transcribed: a failed attempt, no Gemini call.
      if (wav) {
        // The object may differ from what commit validated (replaced, or never what its header said).
        // Judge the bytes about to be sent; a clip that fails is not retried and not left playable.
        const clip = checkStoredClip({ head: wav.subarray(0, HEAD_BYTES), size: wav.length });
        if (!clip.ok) {
          await deps.finish(messageId, { ok: false, final: true });
          return 'failed';
        }
        // Gemini gets a header built here plus the PCM, never the stored bytes as they are.
        const clean = canonicalWav(wav);
        if (!clean) {
          await deps.finish(messageId, { ok: false, final: true });
          return 'failed';
        }
        text = (await deps.transcribe(clean)).slice(0, TRANSCRIPT_MAX_CHARS);
      }
    } catch (e) {
      console.error('chat-voice transcription attempt failed', errMessage(e));
    }
    await deps.finish(messageId, text === null ? { ok: false } : { ok: true, text });
    return text === null ? 'failed' : 'done';
  } catch (e) {
    console.error('chat-voice transcription bookkeeping failed', errMessage(e));
    return 'failed';
  }
}

export interface SweepDeps {
  /** Marks messages whose attempts are used up and whose last try is stale as failed. */
  failExhausted: () => Promise<number>;
  retryCandidates: (limit: number) => Promise<string[]>;
  runJob: (messageId: string) => Promise<JobOutcome>;
  /** Queued paths that are DUE (a path that failed earlier is not due until its backoff has passed), at most `limit`, soonest due first. */
  purgeBatch: (limit: number) => Promise<string[]>;
  /** 'missing' (404) counts as done: the object is gone either way. Anything else throws. */
  deleteObject: (path: string) => Promise<'deleted' | 'missing'>;
  purgeDone: (paths: string[]) => Promise<void>;
  /** Records a failed delete: the database counts the attempt and schedules the next one (2^attempts minutes, at most a day). */
  purgeFailed: (path: string) => Promise<void>;
}

/** Bounded per tick: the cron runs every few minutes, so a backlog drains over several ticks. */
export const SWEEP_RETRY_LIMIT = 10;
export const SWEEP_PURGE_LIMIT = 100;
/**
 * Wall-clock budget of one sweep. Each external call has its own deadline (30 s storage, 60 s Gemini),
 * so a count limit alone does not bound the run: 100 stalled deletes would be 3,000 s. The budget is split
 * in half: purge may use the first half, retries get the rest, and the first retry is guaranteed even
 * when the purge pass overran everything. 50 s plus one 60 s Gemini call stays inside the runtime limit.
 */
export const SWEEP_BUDGET_MS = 50_000;
/** The purge pass stops once this many objects have failed to delete in one run: storage is struggling, and there is no point hammering it. */
export const SWEEP_MAX_PURGE_FAILURES = 50;

export interface SweepClock {
  now: () => number;
  budgetMs: number;
}

export async function runSweep(deps: SweepDeps, clock: SweepClock = { now: () => Date.now(), budgetMs: SWEEP_BUDGET_MS }) {
  const out = { failedExhausted: 0, retried: 0, purged: 0, purgeFailed: 0, budgetExhausted: false };
  const start = clock.now();
  const purgeUntil = start + clock.budgetMs / 2;
  const retryUntil = start + clock.budgetMs;

  try {
    out.failedExhausted = await deps.failExhausted();
  } catch (e) {
    console.error('chat-voice sweep: failExhausted failed', errMessage(e));
  }

  // Purge first: retries call Gemini, which can stall, and deletion must not wait behind it. But only for its
  // share of the budget, and each object is acknowledged the moment it is gone, so a run that is cut off
  // (or hits the share) has already recorded everything it did.
  // Drains in batches until nothing is due or the purge share of the budget is spent. A path whose delete
  // fails is reported to the database, which backs it off across sweeps (2^attempts minutes, at most a day),
  // so it stops being read as the head of the queue and cannot eat every tick's share. `failedHere` only
  // guards this run against a path that failed AND whose backoff write failed too.
  const failedHere = new Set<string>();
  try {
    drain: for (;;) {
      // the share is checked before the read, so no database call is made after it has expired
      if (clock.now() >= purgeUntil) {
        out.budgetExhausted = true;
        break;
      }
      const batch = await deps.purgeBatch(SWEEP_PURGE_LIMIT);
      const fresh = batch.filter((p) => !failedHere.has(p));
      if (fresh.length === 0) break;
      for (const path of fresh) {
        if (clock.now() >= purgeUntil) {
          out.budgetExhausted = true;
          break drain;
        }
        try {
          await deps.deleteObject(path);
          await deps.purgeDone([path]);
          out.purged++;
        } catch (e) {
          failedHere.add(path);
          out.purgeFailed++;
          console.error('chat-voice sweep: object delete failed', errMessage(e));
          await deps.purgeFailed(path).catch((err) => console.error('chat-voice sweep: backoff not recorded', errMessage(err)));
          if (failedHere.size >= SWEEP_MAX_PURGE_FAILURES) break drain;
        }
      }
      if (batch.length < SWEEP_PURGE_LIMIT) break; // a short read means nothing more is due
    }
  } catch (e) {
    console.error('chat-voice sweep: purge pass failed', errMessage(e));
  }

  try {
    for (const id of await deps.retryCandidates(SWEEP_RETRY_LIMIT)) {
      // the first retry always runs; later ones only while the budget lasts
      if (out.retried > 0 && clock.now() >= retryUntil) {
        out.budgetExhausted = true;
        break;
      }
      await deps.runJob(id);
      out.retried++;
    }
  } catch (e) {
    console.error('chat-voice sweep: retry pass failed', errMessage(e));
  }

  return out;
}
