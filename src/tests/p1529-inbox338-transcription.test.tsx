/**
 * INBOX-338 (P1529 test on TEST, 2026-11-13). (1) A recorder's first chunks were numbered but never uploaded (the bucket refused
 * the page's origin), each dropped about 6 s after its first failure, and nothing was shown. The queue now keeps a chunk whose
 * failure can clear by itself and retries it, and says "not reaching us" once the current capture's oldest audio not yet received
 * is older than STUCK_AGE_MS (see room-capture-uploads.ts's header).
 * (2) A round whose audio all transcribed empty gets its own next-version state, 'not_understood'.
 */
import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const ctxMock = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/app/contexts/room-capture-context', () => ({ useRoomCapture: () => ctxMock.value }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));

import {
  pumpUploadQueue as pumpTyped, endUploadRun, resumeUploads, defaultWhenVisible, isPermanentUploadError, isPermanentReserveError, queueUpload, useUploadNotices,
  STUCK_AGE_MS, TRANSIENT_GIVE_UP_MS, RETRY_CAP_MS, type UploadJob, type UploadIo, type UploadQueueHandles,
} from '@/app/contexts/room-capture-uploads';

/** The fake io below carries test-only handles (clock, mocks); the queue sees it as an UploadIo. */
const pumpUploadQueue = (h: UploadQueueHandles, io: object) => pumpTyped(h, io as UploadIo);
import type { StoredCapture } from '@/app/contexts/room-capture-storage';
import { useCaptureStatus } from '@/app/components/session/capture-status';
import { getMyNextVersionOffer, type NextVersionOffer } from '@/app/data/event-mastermind-service';
import { reserveRoomChunkNumber } from '@/app/data/transcribe-service';
import { taskFace, nextVersionWaiting, offerCanChange } from '@/app/prototypes/events/rounds/mastermind-round-helpers';

const T0 = 1_000_000;
const rec: StoredCapture = { userId: 'u1', roomId: 'room-1', roomCode: 'C-1', memberId: 'm-1', eventId: null, joinedAt: 'x', displayName: 'A' };
/** A chunk recorded at the start of the fake clock (queuedAt T0). */
const job = (): UploadJob => ({ blob: new Blob(['x']), isLast: false, attempts: 0, record: rec, queuedAt: T0 });
const room2 = (): UploadJob => ({ ...job(), record: { ...rec, roomId: 'room-2', roomCode: 'C-2' } });
const cors = () => new TypeError('Failed to fetch');   // what a refused origin (CORS) looks like to fetch
/** Was the notice raised at all. */
const raised = (io: { onStuck: ReturnType<typeof vi.fn> }) => io.onStuck.mock.calls.some((c) => c[0] === true);
const reports = (io: { onStuck: ReturnType<typeof vi.fn> }) => io.onStuck.mock.calls.map((c) => c[0] as boolean);

/** A fake clock: every sleep moves it forward, so a run of retries takes "minutes" in no time; `advance` is network time. */
function clockedIo(upload: ReturnType<typeof vi.fn>, random = () => 0.5) {
  let t = T0;
  const ticks: Array<() => void> = [];
  const io = {
    reserve: vi.fn().mockResolvedValue(7),
    upload,
    onHardStop: vi.fn(),
    onDropped: vi.fn(),
    onStuck: vi.fn(),
    currentRoomId: () => 'room-1',
    now: () => t,
    sleep: vi.fn(async (ms: number) => { t += ms; }),
    advance: (ms: number) => { t += ms; },
    /** The local re-read tick: captured, fired by hand. */
    every: vi.fn((_ms: number, fn: () => void) => { ticks.push(fn); return () => undefined; }),
    tick: () => ticks.at(-1)?.(),
    random,
  };
  return io;
}
/** Queues a chunk recorded now on the fake clock. */
const enqueue = (h: UploadQueueHandles, io: { now: () => number }, j: UploadJob = job()) => queueUpload(h, j, 10, vi.fn(), io.now);

describe('INBOX-338 (1): the upload queue recovers by itself and says when audio is not reaching us', () => {
  it('a refused origin for over a minute: the chunk is kept, the bar is told, and the chunks upload once the cause clears', async () => {
    const clock = { now: () => 0 };
    const upload = vi.fn(async () => { if (clock.now() - T0 < 70_000) throw cors(); });   // the origin is allowed ~70 s in
    const io = clockedIo(upload);
    clock.now = io.now;
    const h = { uploadQueue: [job(), job()], uploading: false };
    await pumpUploadQueue(h, io);
    expect(io.onDropped, 'no chunk is lost to a failure that clears').not.toHaveBeenCalled();
    expect(h.uploadQueue).toHaveLength(0);
    expect(reports(io), 'on once its oldest chunk waited over 45 s, off once everything is sent').toEqual([true, false]);
    expect(io.reserve, 'the number is reserved once per chunk and kept across retries').toHaveBeenCalledTimes(2);
  });

  it('one failure that recovers quickly is not shown (P1529 UAT F5) and loses nothing', async () => {
    const upload = vi.fn().mockRejectedValueOnce(cors()).mockResolvedValue(undefined);
    const io = clockedIo(upload);
    await pumpUploadQueue({ uploadQueue: [job()], uploading: false }, io);
    expect(raised(io)).toBe(false);
    expect(io.onDropped).not.toHaveBeenCalled();
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it('a refusal that will not change (400) is tried 3 times, then dropped and said so, and the next chunk goes on', async () => {
    const upload = vi.fn()
      .mockRejectedValueOnce(new Error('GCS upload failed: 400 Bad Request'))
      .mockRejectedValueOnce(new Error('GCS upload failed: 400 Bad Request'))
      .mockRejectedValueOnce(new Error('GCS upload failed: 400 Bad Request'))
      .mockResolvedValue(undefined);
    const io = clockedIo(upload);
    const h = { uploadQueue: [job(), job()], uploading: false };
    await pumpUploadQueue(h, io);
    expect(io.onDropped).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(4);
    expect(h.uploadQueue).toHaveLength(0);
    expect(raised(io), 'one dropped chunk alone is not shown (F5)').toBe(false);
  });

  it('a chunk that keeps failing is dropped after TRANSIENT_GIVE_UP_MS, so it never holds the queue for good', async () => {
    const upload = vi.fn(async () => { throw cors(); });
    const io = clockedIo(upload);
    await pumpUploadQueue({ uploadQueue: [job()], uploading: false }, io);
    expect(io.onDropped).toHaveBeenCalledTimes(1);
    expect(io.now() - T0).toBeGreaterThanOrEqual(TRANSIENT_GIVE_UP_MS);
    expect(raised(io)).toBe(true);
    // the waits grow and stay capped (30 s, jittered up to 1.2x)
    expect(Math.max(...io.sleep.mock.calls.map((c) => c[0] as number))).toBeLessThanOrEqual(RETRY_CAP_MS * 1.2);
  });

  it('a hidden tab makes no retry (metered-services rule 3): a failed chunk waits until the tab is shown, then goes', async () => {
    const io = clockedIo(vi.fn().mockRejectedValueOnce(cors()).mockResolvedValue(undefined));
    let show: () => void = () => {};
    const whenVisible = vi.fn(() => new Promise<void>((r) => { show = r; }));
    const h: UploadQueueHandles = { uploadQueue: [job()], uploading: false };
    const run = pumpUploadQueue(h, { ...io, whenVisible });
    for (let k = 0; k < 6; k++) await Promise.resolve();
    expect(io.upload, 'the first try only, while hidden').toHaveBeenCalledTimes(1);
    expect(whenVisible).toHaveBeenCalledTimes(1);
    show();
    await run;
    expect(io.upload).toHaveBeenCalledTimes(2);
    expect(h.uploadQueue).toHaveLength(0);
  });

  it('time spent hidden does not count toward the 10-minute give-up: one failure on return does not drop the chunk', async () => {
    const io = clockedIo(vi.fn().mockRejectedValueOnce(cors()).mockRejectedValueOnce(cors()).mockResolvedValue(undefined));
    const whenVisible = vi.fn(async () => { io.advance(11 * 60_000); });   // hidden for 11 minutes after the first failure
    const h: UploadQueueHandles = { uploadQueue: [job()], uploading: false };
    await pumpUploadQueue(h, { ...io, whenVisible });
    expect(io.onDropped).not.toHaveBeenCalled();
    expect(io.upload).toHaveBeenCalledTimes(3);
  });

  it('the real visibility wait: at once when visible; when hidden, on the next visibilitychange to visible, and the listener is removed', async () => {
    const desc = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    try {
      let state = 'visible';
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
      await defaultWhenVisible();                                   // visible: resolves at once
      state = 'hidden';
      let done = false;
      const remove = vi.spyOn(document, 'removeEventListener');
      const p = defaultWhenVisible().then(() => { done = true; });
      document.dispatchEvent(new Event('visibilitychange'));       // still hidden
      await Promise.resolve();
      expect(done).toBe(false);
      state = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
      await p;
      expect(done).toBe(true);
      expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
      remove.mockRestore();
    } finally {
      if (desc) Object.defineProperty(document, 'visibilityState', desc); else delete (document as unknown as Record<string, unknown>).visibilityState;
    }
  });

  it('a throttled or frozen backoff timer in a background tab does not eat the give-up: only the intended wait counts', async () => {
    const io = clockedIo(vi.fn().mockRejectedValueOnce(cors()).mockRejectedValueOnce(cors()).mockResolvedValue(undefined));
    let first = true;
    io.sleep = vi.fn(async (ms: number) => { io.advance(ms + (first ? 11 * 60_000 : 0)); first = false; });   // 11 minutes late
    await pumpUploadQueue({ uploadQueue: [job()], uploading: false }, io);
    expect(io.onDropped).not.toHaveBeenCalled();
    expect(io.upload).toHaveBeenCalledTimes(3);
  });

  it('chunks shed from a full queue leave a hole in the archive numbers, so the whole-recording pass knows audio is missing there', async () => {
    const io = clockedIo(vi.fn().mockResolvedValue(undefined));
    let n = 0; io.reserve = vi.fn(async (_room: string, skip = 0) => { n += skip; return n++; });   // the server's counter
    const h: UploadQueueHandles = { uploadQueue: [], uploading: true };   // the head is in flight: nothing pumps while we queue
    for (let k = 0; k < 6; k++) queueUpload(h, job(), 4, vi.fn(), io.now);   // 6 chunks into a queue of 4: 2 shed
    expect(h.uploadQueue).toHaveLength(4);
    h.uploading = false;
    await pumpUploadQueue(h, io);
    const numbers = io.upload.mock.calls.map((c) => c[4] as number);
    expect(numbers, 'two numbers skipped where the two shed chunks were').toEqual([0, 3, 4, 5]);
    expect(io.reserve, 'one reservation per uploaded chunk, the holes included in it (metered-services rule 1)').toHaveBeenCalledTimes(4);
    expect(io.reserve.mock.calls.map((c) => c[1] ?? 0)).toEqual([0, 2, 0, 0]);
  });

  it('a hole is kept only in its own room: a Part 1 chunk shed next to Part 2\'s chunks reserves nothing in Part 2', () => {
    const h: UploadQueueHandles = { uploadQueue: [job(), job()], uploading: true };   // head + a Part 1 chunk
    queueUpload(h, room2(), 2, vi.fn(), () => T0);                                     // Part 2 starts: the Part 1 chunk is shed
    expect(h.uploadQueue).toHaveLength(2);
    expect(h.uploadQueue[1]!.record.roomId).toBe('room-2');
    expect(h.uploadQueue[1]!.holesBefore ?? 0).toBe(0);
  });

  it('a chunk dropped before it had its number passes its slot and its carried holes on, so the archive still shows the gap', async () => {
    const io = clockedIo(vi.fn().mockResolvedValue(undefined));
    let n = 0; let refuse = true;
    io.reserve = vi.fn(async (_room: string, skip = 0) => { if (refuse) throw new Error('member does not belong to this room'); n += skip; return n++; });
    const h: UploadQueueHandles = { uploadQueue: [{ ...job(), holesBefore: 1 }, job()], uploading: false };
    io.upload = vi.fn(async () => undefined);
    const realSleep = io.sleep;
    io.sleep = vi.fn(async (ms: number) => { await realSleep(ms); });
    // the first chunk's reservation is refused for good (dropped after 3 tries); then reservations work again
    io.onDropped.mockImplementation(() => { refuse = false; });
    await pumpUploadQueue(h, io);
    expect(io.onDropped).toHaveBeenCalledTimes(1);
    expect(io.upload.mock.calls.map((c) => c[4] as number), 'two numbers skipped: the carried hole and the dropped chunk').toEqual([2]);
  });

  it('a chunk dropped with nothing behind it keeps its slot for its room\'s next chunk (after a pause)', async () => {
    const io = clockedIo(vi.fn().mockResolvedValue(undefined));
    let n = 0; let refuse = true;
    io.reserve = vi.fn(async (_room: string, skip = 0) => { if (refuse) throw new Error('member does not belong to this room'); n += skip; return n++; });
    const h: UploadQueueHandles = { uploadQueue: [], uploading: false };
    enqueue(h, io);
    await pumpUploadQueue(h, io);                         // the lone chunk's reservation is refused for good: dropped
    expect(io.onDropped).toHaveBeenCalledTimes(1);
    refuse = false;
    await io.sleep(5 * 60_000);
    enqueue(h, io);                                        // resume: the room's next chunk
    await pumpUploadQueue(h, io);
    expect(io.upload.mock.calls.map((c) => c[4] as number), 'number 0 left unused for the dropped chunk').toEqual([1]);
  });

  it('a chunk shed with no chunk of its room behind it keeps its hole for that room\'s next chunk', () => {
    const h: UploadQueueHandles = { uploadQueue: [job(), job()], uploading: true };   // head + a room-1 chunk
    queueUpload(h, room2(), 2, vi.fn(), () => T0);                                     // room 2 arrives: the room-1 chunk is shed
    expect(h.pendingHoles).toEqual({ 'room-1': 1 });
    h.uploadQueue.length = 0;
    queueUpload(h, job(), 10, vi.fn(), () => T0);                                      // back in room 1
    expect(h.uploadQueue[0]!.holesBefore).toBe(1);
    expect(h.pendingHoles).toEqual({});
  });

  it('a chunk shed when it was the last one waiting hands its hole to the next chunk queued', () => {
    const h: UploadQueueHandles = { uploadQueue: [job(), job()], uploading: true };
    queueUpload(h, job(), 2, vi.fn(), () => T0);
    expect(h.uploadQueue).toHaveLength(2);
    expect(h.uploadQueue[1]!.holesBefore).toBe(1);
  });

  it('request volume (metered-services rule 4): at most 30 tries of a chunk in its 10 minutes, half the old 60 (3 per 30 s chunk)', async () => {
    const upload = vi.fn(async () => { throw cors(); });
    const io = clockedIo(upload, () => 0);   // the shortest waits (0.8x): the most tries
    await pumpUploadQueue({ uploadQueue: [job()], uploading: false }, io);
    expect(upload.mock.calls.length).toBeLessThanOrEqual(30);
    expect(upload.mock.calls.length).toBeGreaterThan(10);   // it really kept trying
  });

  it('the waits are jittered, so recorders failing together do not retry in step', async () => {
    const waitsWith = async (r: number) => {
      const io = clockedIo(vi.fn().mockRejectedValueOnce(cors()).mockResolvedValue(undefined), () => r);
      await pumpUploadQueue({ uploadQueue: [job()], uploading: false }, io);
      return io.sleep.mock.calls[0]![0] as number;
    };
    expect(await waitsWith(0)).toBe(1_600);
    expect(await waitsWith(1)).toBe(2_400);
  });

  it('a run of chunks each refused for good (one every 30 s, each dropped in ~6 s) is said at the second: all audio is lost', async () => {
    const io = clockedIo(vi.fn(async () => { throw new Error('GCS upload failed: 400 Bad Request'); }));
    const h: UploadQueueHandles = { uploadQueue: [], uploading: false };
    for (let c = 0; c < 3; c++) {
      enqueue(h, io);
      await pumpUploadQueue(h, io);
      if (c === 0) expect(raised(io), 'not at the first drop (F5)').toBe(false);
      await io.sleep(24_000);   // the next 30 s chunk arrives
    }
    expect(io.onDropped).toHaveBeenCalledTimes(3);
    expect(raised(io)).toBe(true);
  });

  it('a pause queues nothing, so nothing waits: a new chunk\'s one brief failure afterwards is not shown', async () => {
    const io = clockedIo(vi.fn(async () => { throw cors(); }));
    const h: UploadQueueHandles = { uploadQueue: [job()], uploading: false };
    await pumpUploadQueue(h, io);                       // a chunk given up after 10 minutes
    expect(raised(io)).toBe(true);
    await io.sleep(5 * 60_000);                         // paused for 5 minutes
    io.onStuck.mockClear();
    io.upload = vi.fn().mockRejectedValueOnce(cors()).mockResolvedValue(undefined);
    enqueue(h, io);
    await pumpUploadQueue(h, io);
    expect(raised(io)).toBe(false);
  });

  it('two chunks refused for good, then a pause: on resume the old losses are forgotten and nothing is shown', async () => {
    const io = clockedIo(vi.fn(async () => { throw new Error('GCS upload failed: 400 Bad Request'); }));
    const h: UploadQueueHandles = { uploadQueue: [], uploading: false };
    for (let c = 0; c < 3; c++) { enqueue(h, io); await pumpUploadQueue(h, io); await io.sleep(24_000); }
    expect(raised(io)).toBe(true);
    await io.sleep(5 * 60_000);                          // paused for 5 minutes; the cause clears meanwhile
    io.onStuck.mockClear();
    let atFirstTry: boolean[] = [];
    io.upload = vi.fn(async () => { atFirstTry = reports(io); });
    enqueue(h, io);                                      // resume: the first new chunk
    await pumpUploadQueue(h, io);
    expect(atFirstTry, 'already off before the first try of the resumed capture').toEqual([false]);
    expect(reports(io)).toEqual([false]);
  });

  it('Resume after a pause longer than 45 s since the last loss ends the notice at once; a recent loss or a waiting chunk keeps it', async () => {
    const io = clockedIo(vi.fn(async () => { throw new Error('GCS upload failed: 400 Bad Request'); }));
    const h: UploadQueueHandles = { uploadQueue: [], uploading: false };
    for (let c = 0; c < 3; c++) { enqueue(h, io); await pumpUploadQueue(h, io); if (c < 2) await io.sleep(24_000); }
    expect(raised(io)).toBe(true);
    io.onStuck.mockClear();
    resumeUploads(h, io.onStuck, io.now);                 // Resume 0 s after the last loss
    expect(reports(io), 'a loss seconds ago is still news').toEqual([]);
    await io.sleep(60_000);
    resumeUploads(h, io.onStuck, io.now);                 // Resume after a minute's pause
    expect(reports(io)).toEqual([false]);
    // a chunk of this capture still waiting is not forgotten
    const h2: UploadQueueHandles = { uploadQueue: [], uploading: false };
    const io2 = clockedIo(vi.fn());
    enqueue(h2, io2); h2.stuck = true; h2.lastDropAt = T0; h2.lostSince = T0;
    await io2.sleep(5 * 60_000);
    resumeUploads(h2, io2.onStuck, io2.now);
    expect(reports(io2)).toEqual([]);
  });

  it('uploads slower than real time with chunks arriving meanwhile do not flicker: on once behind, off only when caught up', async () => {
    const io = clockedIo(vi.fn());
    const h: UploadQueueHandles = { uploadQueue: [], uploading: false };
    let next = T0 + 30_000; let made = 0;
    const arrive = () => { while (made < 8 && next <= io.now()) { queueUpload(h, job(), 10, vi.fn(), () => next); next += 30_000; made += 1; } };
    io.upload = vi.fn(async () => {
      if (made >= 8) { io.advance(5_000); arrive(); return; }   // the link recovers: the backlog drains
      io.advance(50_000); arrive(); io.tick();                   // the local tick mid-upload
      io.advance(10_000); arrive();                              // each 30 s chunk takes 60 s
    });
    enqueue(h, io);
    await pumpUploadQueue(h, io);
    expect(io.onDropped).not.toHaveBeenCalled();
    expect(reports(io), 'one on, one off: no flicker while the backlog grows').toEqual([true, false]);
  });

  it('a head chunk given up after slow refusals while the next chunk is young keeps the notice on: no flicker at the drop', async () => {
    const io = clockedIo(vi.fn());
    const h: UploadQueueHandles = { uploadQueue: [], uploading: false };
    let added = false; let atDrop: boolean[] = [];
    io.onDropped.mockImplementation(() => { atDrop = reports(io); });
    io.upload = vi.fn(async () => {
      if (h.uploadQueue.length === 1 && added) return;            // the next chunk uploads
      io.advance(20_000); io.tick();                             // each refusal takes 20 s
      if (!added && io.now() - T0 >= 30_000) { queueUpload(h, job(), 10, vi.fn(), () => T0 + 30_000); added = true; }
      throw new Error('GCS upload failed: 400 Bad Request');
    });
    enqueue(h, io);
    await pumpUploadQueue(h, io);
    expect(atDrop, 'still on at the drop').toEqual([true]);
    expect(reports(io)).toEqual([true, false]);   // off only after the next chunk was received
  });

  it('a try that hangs: the local tick says it once the chunk waited over 45 s; its rejection keeps it on; the success clears it', async () => {
    let fail: (e: Error) => void = () => {};
    const io = clockedIo(vi.fn());
    io.upload = vi.fn().mockImplementationOnce(() => new Promise<void>((_r, rej) => { fail = rej; })).mockResolvedValue(undefined);
    const run = pumpUploadQueue({ uploadQueue: [job()], uploading: false }, io);
    await Promise.resolve(); await Promise.resolve();
    io.advance(40_000); io.tick();
    expect(raised(io), 'not yet: 40 s').toBe(false);
    io.advance(10_000); io.tick();
    expect(reports(io)).toEqual([true]);
    fail(new DOMException('signal timed out', 'TimeoutError'));
    await run;   // the retry succeeds
    expect(reports(io), 'the rejection never turned it off; the success did').toEqual([true, false]);
  });

  it('slow failures (each try runs 60 s to its abort, then fails) are said at the first failure and never flicker off', async () => {
    const io = clockedIo(vi.fn());
    io.upload = vi.fn(async () => { io.advance(60_000); throw new DOMException('signal timed out', 'TimeoutError'); });
    let firstRaise: number | null = null;
    io.onStuck.mockImplementation((stuck: boolean) => { if (stuck && firstRaise === null) firstRaise = io.now(); });
    const h: UploadQueueHandles = { uploadQueue: [job(), job()], uploading: false };
    await pumpUploadQueue(h, io);
    expect(firstRaise! - T0, 'at the first failure, 60 s in').toBe(60_000);
    expect(reports(io), 'on through 20 minutes of failures; both chunks lost, so it stays on').toEqual([true]);
    expect(io.onDropped).toHaveBeenCalledTimes(2);
  });

  it('uploads slower than real time (each 30 s chunk takes 45 s, all succeed) are said once the backlog is over 45 s old', async () => {
    const io = clockedIo(vi.fn());
    io.upload = vi.fn(async () => { io.advance(45_000); });
    const h: UploadQueueHandles = { uploadQueue: [], uploading: false };
    for (let k = 0; k < 6; k++) queueUpload(h, job(), 10, vi.fn(), () => T0 + 30_000 * k);   // recorded every 30 s
    await pumpUploadQueue(h, io);
    expect(io.onDropped).not.toHaveBeenCalled();
    expect(reports(io), 'on while behind, off when caught up').toEqual([true, false]);
  });

  it('a capture that ended: its tail is not counted, so the next capture\'s first blip is not shown', async () => {
    const io = clockedIo(vi.fn(async () => { throw cors(); }));
    const h: UploadQueueHandles = { uploadQueue: [], uploading: false };
    enqueue(h, io);
    await pumpUploadQueue(h, io);                         // capture 1 failed for 10 minutes
    expect(raised(io)).toBe(true);
    endUploadRun(h);                                       // End
    io.onStuck.mockClear();
    io.upload = vi.fn().mockRejectedValueOnce(cors()).mockResolvedValue(undefined);
    enqueue(h, io, room2());                               // the next capture, at once
    await pumpUploadQueue(h, io);
    expect(raised(io)).toBe(false);
  });

  it('an ended capture\'s tail failing on its own raises nothing: no capture of now is waiting', async () => {
    const io = clockedIo(vi.fn(async () => { throw cors(); }));
    const h: UploadQueueHandles = { uploadQueue: [], uploading: false };
    enqueue(h, io);
    endUploadRun(h);
    await pumpUploadQueue(h, io);                          // 10 minutes of the old tail failing
    expect(io.onDropped).toHaveBeenCalledTimes(1);
    expect(raised(io)).toBe(false);
  });

  it('an ended capture\'s chunks refused for good are not counted as drops of the next capture', async () => {
    const io = clockedIo(vi.fn(async () => { throw new Error('GCS upload failed: 400 Bad Request'); }));
    const h: UploadQueueHandles = { uploadQueue: [], uploading: false };
    enqueue(h, io); enqueue(h, io);
    endUploadRun(h);
    await pumpUploadQueue(h, io);
    expect(io.onDropped).toHaveBeenCalledTimes(2);
    expect(raised(io)).toBe(false);
  });

  it('a new capture whose chunks wait behind an ended capture\'s failing tail IS said: its audio is not reaching us', async () => {
    const io = clockedIo(vi.fn(async () => { throw cors(); }));
    const h: UploadQueueHandles = { uploadQueue: [], uploading: false };
    enqueue(h, io);                                        // capture 1's tail
    endUploadRun(h);                                       // End, then a new capture records at once
    enqueue(h, io, room2());
    await pumpUploadQueue(h, io);
    expect(raised(io)).toBe(true);
  });

  it('a move to Part 2 with Part 1\'s head still failing keeps the notice on: it is the same capture', async () => {
    const io = clockedIo(vi.fn(async () => { throw cors(); }));
    const h: UploadQueueHandles = { uploadQueue: [], uploading: false };
    enqueue(h, io);                                        // Part 1's chunk
    enqueue(h, io, room2());                               // Part 2's, waiting behind it
    await pumpUploadQueue(h, io);
    expect(reports(io), 'raised once, never switched off by the move').toEqual([true]);
  });

  it('a refusal of the current room (hard stop) ends the notice too', async () => {
    let n = 0;
    const upload = vi.fn(async () => { n += 1; throw n < 8 ? cors() : new Error('Failed to get signed URL: 410 This room has ended'); });
    const io = clockedIo(upload);
    await pumpUploadQueue({ uploadQueue: [job()], uploading: false }, io);
    expect(reports(io)).toEqual([true, false]);
    expect(io.onHardStop).toHaveBeenCalledTimes(1);
  });

  it('a refused chunk-number reservation (an RPC refusal) is dropped after 3 tries, not held for 10 minutes', async () => {
    const io = clockedIo(vi.fn().mockResolvedValue(undefined));
    io.reserve = vi.fn().mockRejectedValue(new Error('member does not belong to this room'));
    await pumpUploadQueue({ uploadQueue: [job()], uploading: false }, io);
    expect(io.reserve).toHaveBeenCalledTimes(3);
    expect(io.onDropped).toHaveBeenCalledTimes(1);
    expect(io.now() - T0).toBeLessThan(STUCK_AGE_MS);
  });

  it.each([
    ['no network', new TypeError('Failed to fetch'), false],
    ['supabase-js network message', new Error('TypeError: Failed to fetch'), false],
    ['the reservation deadline', Object.assign(new Error('reserving a chunk number timed out after 15000ms'), { name: 'RequestTimeoutError' }), false],
    ['a gateway 503', new Error('503 Service Unavailable'), false],
    ['an expired login (refreshed by the client)', new Error('JWT expired'), false],
    ['an RPC refusal', new Error('member does not belong to this room'), true],
  ])('reservation failure, %s: permanent=%s', (_label, err, expected) => {
    expect(isPermanentReserveError(err)).toBe(expected);
  });

  it('the notice comes only once a chunk waited over STUCK_AGE_MS, not at the first failure', async () => {
    const upload = vi.fn(async () => { throw cors(); });
    const io = clockedIo(upload);
    const seen: number[] = [];
    io.onStuck.mockImplementation((st: boolean) => { if (st) seen.push(io.now()); });
    await pumpUploadQueue({ uploadQueue: [job()], uploading: false }, io);
    expect(seen[0]! - T0).toBeGreaterThan(STUCK_AGE_MS);
  });

  it.each([
    ['Failed to fetch (refused origin, no network)', cors(), false],
    ['a timeout', new DOMException('signal timed out', 'TimeoutError'), false],
    ['GCS 503', new Error('GCS upload failed: 503 Service Unavailable'), false],
    ['GCS 429', new Error('GCS upload failed: 429 Too Many Requests'), false],
    ['signer 401 (login refreshed)', new Error('Failed to get signed URL: 401 Unauthorized — JWT expired'), false],
    ['signer 500', new Error('Failed to get signed URL: 500 Internal'), false],
    ['GCS 400', new Error('GCS upload failed: 400 Bad Request'), true],
    ['signature mismatch', new Error('GCS upload failed: 403 Forbidden — SignatureDoesNotMatch'), true],
  ])('%s: permanent=%s', (_label, err, expected) => {
    expect(isPermanentUploadError(err)).toBe(expected);
  });
});

describe('INBOX-338 (1): one reservation call with the holes in it', () => {
  it('skip > 0 calls reserve_room_chunk_number_after_gap once; skip 0 keeps the plain reservation', async () => {
    rpc.mockReset();
    rpc.mockResolvedValueOnce({ data: 7, error: null });
    expect(await reserveRoomChunkNumber('r1', 2)).toBe(7);
    expect(rpc).toHaveBeenCalledWith('reserve_room_chunk_number_after_gap', { p_room_id: 'r1', p_skip: 2 });
    rpc.mockResolvedValueOnce({ data: 8, error: null });
    expect(await reserveRoomChunkNumber('r1')).toBe(8);
    expect(rpc).toHaveBeenLastCalledWith('reserve_room_chunk_number', { p_room_id: 'r1' });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});

describe('INBOX-338 (1): the queue limit and the notices', () => {
  it('a full queue sheds the oldest WAITING chunk, keeps the in-flight head, and never sheds a seat\'s last chunk', () => {
    const named = (n: string, isLast = false): UploadJob => ({ ...job(), isLast, blob: new Blob([n]) });
    const h = { uploadQueue: [named('head'), named('last-of-part-1', true), named('a'), named('b')], uploading: true };
    const onShed = vi.fn();
    queueUpload(h, named('new'), 4, onShed);
    expect(onShed).toHaveBeenCalledTimes(1);
    expect(h.uploadQueue.map((j) => j.isLast)).toEqual([false, true, false, false]);
    expect(h.uploadQueue).toHaveLength(4);
    expect(h.uploadQueue[1]!.isLast, 'the last chunk stayed').toBe(true);
  });
  it('when every waiting chunk is a last one the oldest is shed anyway: the queue never grows past the limit', () => {
    const last = (): UploadJob => ({ ...job(), isLast: true });
    const h = { uploadQueue: [job(), last(), last(), last()], uploading: true };
    const onShed = vi.fn();
    queueUpload(h, job(), 4, onShed);
    expect(h.uploadQueue).toHaveLength(4);
    expect(onShed).toHaveBeenCalledTimes(1);
  });
  it('under the limit nothing is shed', () => {
    const h = { uploadQueue: [job()], uploading: true };
    const onShed = vi.fn();
    queueUpload(h, job(), 4, onShed);
    expect(onShed).not.toHaveBeenCalled();
    expect(h.uploadQueue).toHaveLength(2);
  });
  it('clearUploadNotices turns both notices off', () => {
    const { result } = renderHook(() => useUploadNotices());
    act(() => { result.current.markAudioLost(); result.current.setAudioStuck(true); });
    expect(result.current.audioLost && result.current.audioStuck).toBe(true);
    act(() => { result.current.clearUploadNotices(); });
    expect(result.current.audioLost).toBe(false);
    expect(result.current.audioStuck).toBe(false);
  });
});

const base = { phase: 'capturing', manualPaused: false, inputSilent: false, micLost: false, micSwitched: false, stopping: false, tapDown: false, audioLost: false, audioStuck: false };
const status = (over: Record<string, unknown>) => { ctxMock.value = { ...base, ...over }; return renderHook(() => useCaptureStatus()).result.current; };

describe('INBOX-338 (1): the recording bar line', () => {
  it('audio not reaching us is said, as a warning', () => {
    const s = status({ audioStuck: true });
    expect(s.kind).toBe('notReaching');
    expect(s.warn).toBe(true);
    expect(s.text).toBe("Your audio isn't reaching us");
  });
  it('a dead microphone, a stop and a pause keep their own lines ahead of it', () => {
    expect(status({ audioStuck: true, micLost: true }).kind).toBe('micLost');
    expect(status({ audioStuck: true, stopping: true }).kind).toBe('stopping');
    expect(status({ audioStuck: true, phase: 'paused', manualPaused: true }).kind).toBe('paused');
  });
  it('"No sound" (the person can act on it) comes before it; it comes before a stalled live line', () => {
    expect(status({ audioStuck: true, inputSilent: true }).kind).toBe('silent');
    expect(status({ audioStuck: true, phase: 'stalled' }).kind).toBe('notReaching');
    expect(status({ audioStuck: true, tapDown: true }).kind).toBe('notRecording');
  });
  it('a dropped chunk alone is still not shown (F5 stands)', () => {
    expect(status({ audioLost: true }).kind).toBe('running');
  });
});

describe('INBOX-338 (2): a round whose audio all transcribed empty', () => {
  it('the offer read keeps the new state (an unknown one would read as none)', async () => {
    rpc.mockResolvedValueOnce({ data: { state: 'not_understood', round_id: 'r1' }, error: null });
    const o = await getMyNextVersionOffer('e1');
    expect(o.state).toBe('not_understood');
    expect(o.roundId).toBe('r1');
  });
  it('an unknown future state reads as none, so a client older than a new state shows nothing rather than failing', async () => {
    rpc.mockResolvedValueOnce({ data: { state: 'some_later_state', round_id: 'r1' }, error: null });
    expect((await getMyNextVersionOffer('e1')).state).toBe('none');
  });
  it('is its own face, not waiting for anything and never polled', () => {
    const offer: NextVersionOffer = { state: 'not_understood', roundId: 'r1', draftId: null, revision: null, runId: null, autoPublish: false };
    expect(taskFace(offer)).toBe('not_understood');
    expect(nextVersionWaiting(taskFace(offer))).toBe(false);
    expect(offerCanChange(offer)).toBe(false);
  });
});
