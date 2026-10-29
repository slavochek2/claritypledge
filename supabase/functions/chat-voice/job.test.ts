// Deno test: deno test --config supabase/functions/deno.json -A supabase/functions/chat-voice/
// P1576 Part B: the server-owned transcript job and the sweep that backs it up.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { canonicalWav } from '../_shared/gemini-transcribe.ts';
import { STORAGE_DELETE_TIMEOUT_MS } from './gcs.ts';
import { runTranscription, runSweep, SWEEP_BUDGET_MS, SWEEP_MAX_PURGE_FAILURES, TRANSCRIPT_MAX_CHARS, type JobDeps, type SweepDeps } from './job.ts';

const MSG = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

/** A complete canonical WAV (16 kHz mono 16-bit): 44-byte header declaring `declared` data bytes, `actual` of them present. */
function wavFile(seconds: number, opts: { declared?: number; sampleRate?: number } = {}): Uint8Array {
  const sampleRate = opts.sampleRate ?? 16000;
  const actual = Math.round(seconds * sampleRate * 2);
  const declared = opts.declared ?? actual;
  const b = new Uint8Array(44 + actual);
  const v = new DataView(b.buffer);
  const tag = (o: number, t: string) => [...t].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  tag(0, 'RIFF'); v.setUint32(4, 36 + declared, true); tag(8, 'WAVE');
  tag(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  tag(36, 'data'); v.setUint32(40, declared, true);
  return b;
}

function jobDeps(over: Partial<JobDeps> = {}) {
  const log = { finished: [] as Array<[string, { ok: boolean; text?: string; final?: boolean }]>, transcribed: 0, downloaded: [] as string[] };
  const deps: JobDeps = {
    claim: () => Promise.resolve('conv/up.wav'),
    download: (k) => { log.downloaded.push(k); return Promise.resolve(wavFile(2)); },
    transcribe: () => { log.transcribed++; return Promise.resolve('hello there'); },
    finish: (id, r) => { log.finished.push([id, r]); return Promise.resolve(); },
    ...over,
  };
  return { deps, log };
}

Deno.test('job: claim → download → one Gemini call → stored as done (control)', async () => {
  const { deps, log } = jobDeps();
  assertEquals(await runTranscription(MSG, deps), 'done');
  assertEquals(log.downloaded, ['conv/up.wav']);
  assertEquals(log.transcribed, 1);
  assertEquals(log.finished, [[MSG, { ok: true, text: 'hello there' }]]);
});

Deno.test('job: nothing to claim (deleted, already done, attempts used up, claimed by another run) does no work', async () => {
  const { deps, log } = jobDeps({ claim: () => Promise.resolve(null) });
  assertEquals(await runTranscription(MSG, deps), 'skipped');
  assertEquals(log.downloaded, []);
  assertEquals(log.transcribed, 0);
  assertEquals(log.finished, []);
});

Deno.test('job: a Gemini error is recorded as a failed attempt, never thrown to the runtime', async () => {
  const { deps, log } = jobDeps({ transcribe: () => Promise.reject(new Error('Gemini returned 503')) });
  assertEquals(await runTranscription(MSG, deps), 'failed');
  assertEquals(log.finished, [[MSG, { ok: false }]]);
});

Deno.test('job: audio already gone from storage is a failed attempt and Gemini is not called', async () => {
  const { deps, log } = jobDeps({ download: () => Promise.resolve(null) });
  assertEquals(await runTranscription(MSG, deps), 'failed');
  assertEquals(log.transcribed, 0);
  assertEquals(log.finished, [[MSG, { ok: false }]]);
});

Deno.test('job: a silent clip is a legitimate empty transcript, not a failure', async () => {
  const { deps, log } = jobDeps({ transcribe: () => Promise.resolve('') });
  assertEquals(await runTranscription(MSG, deps), 'done');
  assertEquals(log.finished, [[MSG, { ok: true, text: '' }]]);
});

Deno.test('job: a transcript longer than the column allows is cut, not rejected by the database', async () => {
  const { deps, log } = jobDeps({ transcribe: () => Promise.resolve('x'.repeat(TRANSCRIPT_MAX_CHARS + 500)) });
  await runTranscription(MSG, deps);
  assertEquals(log.finished[0][1].text?.length, TRANSCRIPT_MAX_CHARS);
});

Deno.test('job: a failure while storing the result does not escape', async () => {
  const { deps } = jobDeps({ finish: () => Promise.reject(new Error('db down')) });
  assertEquals(await runTranscription(MSG, deps), 'failed');
});

// ── the stored bytes are re-checked before Gemini sees them (the object could have changed since commit) ──

for (
  const [name, file] of [
    ['a file longer than its header declares (replaced after commit)', () => wavFile(2, { declared: 16000 })],
    ['a recording over the 2 minute limit', () => wavFile(121)],
    ['not a WAV at all', () => new Uint8Array(200).fill(7)],
    ['the wrong sample rate', () => wavFile(2, { sampleRate: 44100 })],
    ['an empty object', () => new Uint8Array(0)],
  ] as Array<[string, () => Uint8Array]>
) {
  Deno.test(`job: ${name} is never sent to Gemini and is failed for good`, async () => {
    const { deps, log } = jobDeps({ download: () => Promise.resolve(file()) });
    assertEquals(await runTranscription(MSG, deps), 'failed');
    assertEquals(log.transcribed, 0);
    // final: no more attempts, and the audio is taken down (the other person must not hear what was not validated)
    assertEquals(log.finished, [[MSG, { ok: false, final: true }]]);
  });
}

/** A header that hides its real layout: the first fmt chunk is 24 bytes, so offsets 36..43 sit inside it and
 *  READ as a data chunk header; the real data chunk starts at 44. A fixed-offset check passes this file. */
function disguisedWav(seconds: number): Uint8Array {
  const pcm = Math.round(seconds * 16000 * 2);
  const b = new Uint8Array(44 + pcm);
  const v = new DataView(b.buffer);
  const tag = (o: number, t: string) => [...t].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  tag(0, 'RIFF'); v.setUint32(4, 36 + pcm, true); tag(8, 'WAVE');
  tag(12, 'fmt '); v.setUint32(16, 24, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  tag(36, 'data'); v.setUint32(40, pcm, true); // inside the fmt chunk's extension area, looks like a data header
  return b;
}

Deno.test('job: a header whose fmt chunk hides a fake data header is refused (the layout must be the literal canonical one)', async () => {
  const { deps, log } = jobDeps({ download: () => Promise.resolve(disguisedWav(2)) });
  assertEquals(await runTranscription(MSG, deps), 'failed');
  assertEquals(log.transcribed, 0);
  assertEquals(log.finished, [[MSG, { ok: false, final: true }]]);
});

Deno.test('job: Gemini is sent a freshly built canonical file, not the stored object itself', async () => {
  const stored = wavFile(2);
  let sent: Uint8Array | null = null;
  const { deps } = jobDeps({
    download: () => Promise.resolve(stored),
    transcribe: (wav) => { sent = wav; return Promise.resolve('x'); },
  });
  await runTranscription(MSG, deps);
  assertEquals(sent === stored, false);
  assertEquals(sent, canonicalWav(stored));
});

Deno.test('job: exactly 120 s is transcribed (boundary control)', async () => {
  const { deps, log } = jobDeps({ download: () => Promise.resolve(wavFile(120)) });
  assertEquals(await runTranscription(MSG, deps), 'done');
  assertEquals(log.transcribed, 1);
});

// ── sweep ────────────────────────────────────────────────────────────────────

function sweepDeps(over: Partial<SweepDeps> = {}) {
  const log = { jobs: [] as string[], deleted: [] as string[], done: [] as string[][], limits: [] as number[] };
  const deps: SweepDeps = {
    failExhausted: () => Promise.resolve(2),
    retryCandidates: (n) => { log.limits.push(n); return Promise.resolve(['m1', 'm2']); },
    runJob: (id) => { log.jobs.push(id); return Promise.resolve('done'); },
    purgeBatch: (n) => { log.limits.push(n); return Promise.resolve(['a/1.wav', 'a/2.wav', 'a/3.wav']); },
    deleteObject: (p) => { log.deleted.push(p); return Promise.resolve(p === 'a/2.wav' ? 'missing' : 'deleted'); },
    purgeDone: (paths) => { log.done.push(paths); return Promise.resolve(); },
    purgeFailed: () => Promise.resolve(),
    ...over,
  };
  return { deps, log };
}

Deno.test('sweep: retries stuck transcripts, drains the purge queue, a missing object counts as done', async () => {
  const { deps, log } = sweepDeps();
  const out = await runSweep(deps);
  assertEquals(log.jobs, ['m1', 'm2']);
  assertEquals(log.deleted, ['a/1.wav', 'a/2.wav', 'a/3.wav']);
  assertEquals(log.done, [['a/1.wav'], ['a/2.wav'], ['a/3.wav']]); // one acknowledgement per object
  assertEquals(out, { failedExhausted: 2, retried: 2, purged: 3, purgeFailed: 0, budgetExhausted: false });
});

Deno.test('sweep: one object that will not delete stays queued; the rest are still removed', async () => {
  const { deps, log } = sweepDeps({
    deleteObject: (p) => (p === 'a/1.wav' ? Promise.reject(new Error('GCS 500')) : Promise.resolve('deleted')),
  });
  const out = await runSweep(deps);
  assertEquals(log.done, [['a/2.wav'], ['a/3.wav']]);
  assertEquals(out.purged, 2);
  assertEquals(out.purgeFailed, 1);
});

Deno.test('sweep: the purge pass runs BEFORE the retries (a stalled transcription cannot starve deletion)', async () => {
  const order: string[] = [];
  const { deps } = sweepDeps({
    deleteObject: (p) => { order.push(`purge:${p}`); return Promise.resolve('deleted'); },
    runJob: (id) => { order.push(`job:${id}`); return Promise.resolve('done'); },
  });
  await runSweep(deps);
  assertEquals(order.indexOf('purge:a/3.wav') < order.indexOf('job:m1'), true);
  assertEquals(order.filter((x) => x.startsWith('purge')).length, 3);
});

Deno.test('sweep: a retry that hangs for ever does not stop the purge having already happened', async () => {
  const { deps, log } = sweepDeps({ runJob: () => new Promise(() => {}) });
  const settled = await Promise.race([runSweep(deps).then(() => 'finished'), new Promise((r) => setTimeout(() => r('hung'), 50))]);
  assertEquals(settled, 'hung'); // the retry never returns...
  assertEquals(log.done, [['a/1.wav'], ['a/2.wav'], ['a/3.wav']]); // ...but the queue was already drained
});

Deno.test('sweep: bounded per tick', async () => {
  const { deps, log } = sweepDeps();
  await runSweep(deps);
  assertEquals(log.limits.every((n) => n > 0 && n <= 100), true);
});

Deno.test('sweep: a failing retry candidate query does not stop the purge drain', async () => {
  const { deps, log } = sweepDeps({ retryCandidates: () => Promise.reject(new Error('db')) });
  const out = await runSweep(deps);
  assertEquals(out.purged, 3);
  assertEquals(log.jobs, []);
});

// ── a sweep has a wall-clock budget; neither pass can starve the other ──────────────────────

/** A clock the fakes advance: each purge delete and each transcription job costs `step` ms. */
function budgetSweep(opts: { deleteMs?: number; jobMs?: number; budgetMs?: number; purgePaths?: string[]; candidates?: string[] }) {
  let t = 0;
  const events: string[] = [];
  const purgePaths = opts.purgePaths ?? ['a/1.wav', 'a/2.wav', 'a/3.wav', 'a/4.wav'];
  const deps: SweepDeps = {
    failExhausted: () => Promise.resolve(0),
    retryCandidates: () => Promise.resolve(opts.candidates ?? ['m1', 'm2', 'm3']),
    runJob: (id) => { events.push(`job:${id}`); t += opts.jobMs ?? 0; return Promise.resolve('done'); },
    purgeBatch: () => Promise.resolve(purgePaths),
    deleteObject: (p) => { events.push(`delete:${p}`); t += opts.deleteMs ?? 0; return Promise.resolve('deleted'); },
    purgeDone: (paths) => { events.push(`ack:${paths.join(',')}`); return Promise.resolve(); },
    purgeFailed: () => Promise.resolve(),
  };
  return { deps, events, run: () => runSweep(deps, { now: () => t, budgetMs: opts.budgetMs ?? 50_000 }) };
}

Deno.test('sweep: each deleted object is acknowledged straight away, not after the whole batch', async () => {
  const { events, run } = budgetSweep({});
  await run();
  const purge = events.filter((e) => e.startsWith('delete') || e.startsWith('ack'));
  assertEquals(purge.slice(0, 4), ['delete:a/1.wav', 'ack:a/1.wav', 'delete:a/2.wav', 'ack:a/2.wav']);
});

Deno.test('sweep: a run cut off mid-purge has already acknowledged what it deleted (the Codex probe: deleted=1, acked=0)', async () => {
  // the first delete eats the whole purge share; the run is then over budget
  const { events, run } = budgetSweep({ deleteMs: 60_000 });
  await run();
  assertEquals(events.filter((e) => e.startsWith('delete')).length, 1);
  assertEquals(events.includes('ack:a/1.wav'), true);
});

Deno.test('sweep: purge gets half the budget and then stops, so slow deletes cannot starve the retries', async () => {
  // 20 s per delete, 50 s budget => purge share 25 s: two deletes (0 s and 20 s start times), then stop
  const { events, run } = budgetSweep({ deleteMs: 20_000, jobMs: 5_000 });
  const out = await run();
  assertEquals(events.filter((e) => e.startsWith('delete')), ['delete:a/1.wav', 'delete:a/2.wav']);
  assertEquals(events.filter((e) => e.startsWith('job')).length >= 1, true);
  assertEquals(out.purged, 2);
  assertEquals(out.budgetExhausted, true);
});

Deno.test('sweep: the retries always get a turn, even when the purge pass overran the entire budget', async () => {
  const { events, run } = budgetSweep({ deleteMs: 500_000, jobMs: 1_000 });
  await run();
  assertEquals(events.filter((e) => e.startsWith('job')), ['job:m1']);
});

Deno.test('sweep: retries stop when the budget is spent (the first one is guaranteed, the rest are not)', async () => {
  const { events, run } = budgetSweep({ purgePaths: [], jobMs: 30_000, budgetMs: 50_000 });
  const out = await run();
  // t=0 m1 (ends 30 s), t=30 m2 (ends 60 s), then over budget: m3 is left for the next tick
  assertEquals(events.filter((e) => e.startsWith('job')), ['job:m1', 'job:m2']);
  assertEquals(out.retried, 2);
  assertEquals(out.budgetExhausted, true);
});

Deno.test('sweep: with time to spare nothing is skipped and the budget is not reported exhausted', async () => {
  const { events, run } = budgetSweep({ deleteMs: 10, jobMs: 10 });
  const out = await run();
  assertEquals(events.filter((e) => e.startsWith('delete')).length, 4);
  assertEquals(events.filter((e) => e.startsWith('job')).length, 3);
  assertEquals(out.budgetExhausted, false);
});

Deno.test('sweep: the default budget leaves room under the edge runtime limit', () => {
  assertEquals(SWEEP_BUDGET_MS, 50_000);
});

// ── the purge pass drains the queue, and a path that keeps failing backs off across sweeps ───────────

/**
 * A purge queue with the database's backoff: `purgeBatch` returns only entries that are due, oldest due time
 * first (chat_voice_purge_due); `purgeFailed` pushes an entry out by 2^attempts minutes, at most a day
 * (chat_voice_purge_failed). One shared clock `t` (ms) drives both the sweep budget and the due times.
 */
function backoffQueue(paths: string[], opts: { timingOut?: string[]; deleteMs?: number; timeoutMs?: number; budgetMs?: number } = {}) {
  const state = { t: 0 };
  const entries = paths.map((path, order) => ({ path, due: 0, order, attempts: 0 }));
  const timingOut = new Set(opts.timingOut ?? []);
  const log = { batches: 0, deleted: [] as string[], failed: [] as string[], jobs: [] as string[], attempted: [] as string[] };
  const deps: SweepDeps = {
    failExhausted: () => Promise.resolve(0),
    retryCandidates: () => Promise.resolve(['m1']),
    runJob: (id) => { log.jobs.push(id); return Promise.resolve('done'); },
    purgeBatch: (limit) => {
      log.batches++;
      return Promise.resolve(entries.filter((e) => e.due <= state.t).sort((a, b) => a.due - b.due || a.order - b.order).slice(0, limit).map((e) => e.path));
    },
    deleteObject: (p) => {
      log.attempted.push(p);
      if (timingOut.has(p)) { state.t += opts.timeoutMs ?? 10_000; return Promise.reject(new Error('timeout')); }
      state.t += opts.deleteMs ?? 0;
      log.deleted.push(p);
      return Promise.resolve('deleted');
    },
    purgeDone: (ps) => { for (const p of ps) entries.splice(entries.findIndex((e) => e.path === p), 1); return Promise.resolve(); },
    purgeFailed: (p) => {
      log.failed.push(p);
      const e = entries.find((x) => x.path === p)!;
      e.attempts++;
      e.due = state.t + Math.min(2 ** e.attempts, 1440) * 60_000;
      return Promise.resolve();
    },
  };
  return { deps, log, entries, state, run: () => runSweep(deps, { now: () => state.t, budgetMs: opts.budgetMs ?? 50_000 }) };
}
const many = (n: number) => Array.from({ length: n }, (_, i) => `c/u/${String(i).padStart(4, '0')}.wav`);

Deno.test('sweep: a purge queue longer than one batch is drained in the same run', async () => {
  const { log, entries, run } = backoffQueue(many(250));
  const out = await run();
  assertEquals(out.purged, 250);
  assertEquals(entries.length, 0);
  assertEquals(log.batches >= 3, true);
  assertEquals(out.budgetExhausted, false);
});

Deno.test('sweep: an empty queue costs one read', async () => {
  const { log, run } = backoffQueue([]);
  await run();
  assertEquals(log.batches, 1);
});

Deno.test('sweep: a failed delete is reported to the database (which schedules the retry), and the run goes on', async () => {
  const paths = many(5);
  const { log, entries, run } = backoffQueue(paths, { timingOut: [paths[0]], timeoutMs: 1 });
  const out = await run();
  assertEquals(log.failed, [paths[0]]);
  assertEquals(out.purged, 4);
  assertEquals(out.purgeFailed, 1);
  assertEquals(entries.map((e) => e.path), [paths[0]]); // still queued, but not due again for a while
});

Deno.test('sweep: the three-tick probe: a head path that always times out cannot starve the healthy path behind it', async () => {
  // head times out every time (10 s each); the healthy path sits behind it
  const head = 'c/u/head.wav';
  const healthy = 'c/u/healthy.wav';
  const { log, state, run } = backoffQueue([head, healthy], { timingOut: [head], timeoutMs: 30_000 });
  const ticks: string[][] = [];
  for (let tick = 0; tick < 3; tick++) {
    const before = log.attempted.length;
    await run();
    ticks.push(log.attempted.slice(before));
    state.t += 5 * 60_000; // the cron interval
  }
  assertEquals(log.deleted.includes(healthy), true, `attempts per tick: ${JSON.stringify(ticks)}`);
  // tick one: the head ate the purge share (30 s > 25 s), so it was backed off and not hammered again
  assertEquals(ticks[0], [head]);
  // tick two: the healthy path is due before the backed-off head, so it goes first
  assertEquals(ticks[1][0], healthy);
});

Deno.test('sweep: a failing path backs off further each time (2, 4, 8 ... minutes, at most a day)', async () => {
  const head = 'c/u/head.wav';
  const { entries, state, run } = backoffQueue([head], { timingOut: [head], timeoutMs: 1 });
  const waits: number[] = [];
  for (let i = 0; i < 14; i++) {
    state.t = Math.max(state.t, entries[0].due); // jump to the moment it is due
    const at = state.t;
    await run();
    waits.push(Math.round((entries[0].due - at) / 60_000));
  }
  assertEquals(waits.slice(0, 4), [2, 4, 8, 16]);
  assertEquals(Math.max(...waits), 1440);
  assertEquals(waits.every((w, i) => i === 0 || w >= waits[i - 1]), true);
});

Deno.test('sweep: if the failure cannot be recorded, the same path is not retried in a loop within the run', async () => {
  const paths = many(3);
  const { deps, log } = backoffQueue(paths, { timingOut: [paths[0]], timeoutMs: 1 });
  deps.purgeFailed = () => Promise.reject(new Error('db down')); // the backoff write itself fails
  await runSweep(deps, { now: () => 0, budgetMs: 50_000 });
  assertEquals(log.attempted.filter((p) => p === paths[0]).length, 1);
  assertEquals(log.deleted, [paths[1], paths[2]]);
});

Deno.test('sweep: a drain that outlasts its time share stops, leaves the rest queued, and the retries still run', async () => {
  const { entries, log, run } = backoffQueue(many(250), { deleteMs: 1_000 });
  const out = await run();
  assertEquals(out.budgetExhausted, true);
  assertEquals(out.purged >= 20 && out.purged <= 30, true, `purged ${out.purged}`);
  assertEquals(entries.length, 250 - out.purged);
  assertEquals(log.jobs, ['m1']);
});

Deno.test('sweep: the time share is checked BEFORE the next batch is read (no database read after it expired)', async () => {
  const { log, run } = backoffQueue(many(250), { deleteMs: 30_000 });
  const out = await run();
  assertEquals(log.batches, 1);
  assertEquals(out.budgetExhausted, true);
});

Deno.test('sweep: the purge pass gives up once too many objects have failed in one run', async () => {
  const paths = many(400);
  const { log, entries, run } = backoffQueue(paths, { timingOut: paths.slice(0, 120), timeoutMs: 1 });
  const out = await run();
  assertEquals(out.purgeFailed, SWEEP_MAX_PURGE_FAILURES);
  assertEquals(entries.length > 0, true);
  assertEquals(log.jobs, ['m1']);
  assertEquals(SWEEP_MAX_PURGE_FAILURES, 50);
});

Deno.test('a storage DELETE gives up well inside the purge share, so one stuck call cannot use it all', () => {
  assertEquals(STORAGE_DELETE_TIMEOUT_MS, 10_000);
  assertEquals(STORAGE_DELETE_TIMEOUT_MS < SWEEP_BUDGET_MS / 2, true);
});
